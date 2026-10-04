import assert from "node:assert/strict";
import { test } from "node:test";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import {
  deleteNativeSectionLink, planNativeSectionCopiesUpdate, planNativeSectionLink, readNativeSectionLinks,
  registerInsertedNativeSection, renameNativeSectionLinksPage, resolveNativeSectionLinks,
} from "../src/page-builder/native-section-links";
import type { StaticSectionRecord } from "../src/page-builder/static-sections";

const oldHtml = `<section class="hero"><h2>Hello</h2></section>`;
const newHtml = `<section class="hero"><h2>Hello, world</h2><p>New line</p></section>`;
const record = (html: string): StaticSectionRecord => ({ id: "hero", label: "Hero", rootClass: "hero", html, css: "", stylesheetPath: "styles/sections.css" });
const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body><main>${body}</main></body></html>`;
const range = (source: string, html: string, from = 0) => { const start = source.indexOf(html, from); return { start, end: start + html.length }; };
// An editor JSON with an unknown top-level key, an unknown page key and a foreign sections entry.
const baseJson = JSON.stringify({ version: 1, pages: { "index.html": { title: "kept", sections: { foreign: { kind: "other", note: "keep me" } } } }, collections: {}, future: { x: 1 } }, null, 2) + "\n";

function link(documentText: string | undefined, path: string, source: string, at: { start: number; end: number }, html = oldHtml, files?: string[]) {
  const plan = planNativeSectionLink({ documentText, files, pagePath: path, pageSource: source, range: at, record: record(html) });
  assert.ok(!("error" in plan), "error" in plan ? plan.error : "");
  return { plan, text: plan.operation.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? plan.operation.creates![0].content };
}

test("linking writes only editor JSON, pins the exact inputs and keeps unknown JSON", () => {
  const home = page(`<p>Café &amp; “quotes” 😀</p>${oldHtml}`);
  const { plan, text } = link(baseJson, "index.html", home, range(home, oldHtml));
  assert.deepEqual([...plan.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual([...plan.operation.expectedSources], [[EDITOR_PAGE_BUILDER_PATH, baseJson], ["index.html", home]]);
  const json = JSON.parse(text);
  assert.deepEqual(json.future, { x: 1 });
  assert.equal(json.pages["index.html"].title, "kept");
  assert.deepEqual(json.pages["index.html"].sections.foreign, { kind: "other", note: "keep me" });
  const links = readNativeSectionLinks(text);
  assert.equal(links["index.html"]["hero-1"].basis, oldHtml);
  // Offsets after Unicode and entities resolve to the exact bytes.
  const resolved = resolveNativeSectionLinks({ documentText: text, sources: { "index.html": home } });
  assert.ok(!("error" in resolved));
  assert.equal(home.slice(resolved.links[0].start, resolved.links[0].end), oldHtml);
  assert.equal(resolved.links[0].unchanged, true);
  // The same section twice is refused; so are a non-section, a nested range and unsafe keys.
  assert.match((planNativeSectionLink({ documentText: text, pagePath: "index.html", pageSource: home, range: range(home, oldHtml), record: record(oldHtml) }) as { error: string }).error, /already linked/);
  assert.ok("error" in planNativeSectionLink({ documentText: baseJson, pagePath: "index.html", pageSource: home, range: range(home, "<h2>Hello</h2>"), record: record(oldHtml) }));
  assert.ok("error" in planNativeSectionLink({ documentText: baseJson, pagePath: "index.html", pageSource: home, range: range(home, oldHtml), record: record(oldHtml), key: "__proto__" }));
  assert.ok("error" in planNativeSectionLink({ documentText: baseJson, pagePath: "styles/a.css", pageSource: home, range: range(home, oldHtml), record: record(oldHtml) }));
});

test("a missing editor JSON is created only when the file graph proves it absent", () => {
  const home = page(oldHtml);
  assert.ok("error" in planNativeSectionLink({ documentText: undefined, pagePath: "index.html", pageSource: home, range: range(home, oldHtml), record: record(oldHtml) }));
  assert.ok("error" in planNativeSectionLink({ documentText: undefined, files: ["index.html", EDITOR_PAGE_BUILDER_PATH], pagePath: "index.html", pageSource: home, range: range(home, oldHtml), record: record(oldHtml) }));
  const { plan } = link(undefined, "index.html", home, range(home, oldHtml), oldHtml, ["index.html"]);
  assert.equal(plan.operation.creates?.[0].path, EDITOR_PAGE_BUILDER_PATH);
  assert.deepEqual(plan.expectedFiles, ["index.html"]);
});

test("two sections with the same opening tag cannot be linked or resolved; no path guess", () => {
  const twice = page(oldHtml + oldHtml);
  const first = range(twice, oldHtml);
  assert.match((planNativeSectionLink({ documentText: baseJson, pagePath: "index.html", pageSource: twice, range: first, record: record(oldHtml) }) as { error: string }).error, /cannot be told apart/);
  // Linked while unique, then duplicated on the page: resolution refuses.
  const once = page(oldHtml);
  const { text } = link(baseJson, "index.html", once, range(once, oldHtml));
  assert.match((resolveNativeSectionLinks({ documentText: text, sources: { "index.html": twice } }) as { error: string }).error, /missing or ambiguous/);
  // Moved (other content before it): still found by its locator.
  const moved = page(`<section class="intro"><p>x</p></section>${oldHtml}`);
  assert.ok(!("error" in resolveNativeSectionLinks({ documentText: text, sources: { "index.html": moved } })));
  // Gone, or its page not loaded: refused.
  assert.ok("error" in resolveNativeSectionLinks({ documentText: text, sources: { "index.html": page("<p>none</p>") } }));
  assert.ok("error" in resolveNativeSectionLinks({ documentText: text, sources: {} }));
});

test("overlapping or duplicate links and malformed recognised entries refuse", () => {
  const nested = page(`<section id="outer"><section id="inner"><p>x</p></section></section>`);
  const json = (sections: object) => JSON.stringify({ version: 1, pages: { "index.html": { sections } }, collections: {} });
  const target = (id: string, opening: string) => ({ authoredId: id, path: [0], tag: "section", openingTagFingerprint: opening });
  const outer = { kind: "native-section", recordId: "hero", basis: oldHtml, target: target("outer", `<section id="outer">`) };
  const inner = { kind: "native-section", recordId: "hero", basis: oldHtml, target: target("inner", `<section id="inner">`) };
  assert.match((resolveNativeSectionLinks({ documentText: json({ a: outer, b: inner }), sources: { "index.html": nested } }) as { error: string }).error, /overlap/);
  assert.match((resolveNativeSectionLinks({ documentText: json({ a: outer, b: { ...outer } }), sources: { "index.html": nested } }) as { error: string }).error, /same section/);
  assert.throws(() => readNativeSectionLinks(json({ a: { ...outer, basis: "<div></div>" } })));
  assert.throws(() => readNativeSectionLinks(json({ a: { ...outer, recordId: "" } })));
  // An entry without the native kind is not ours and is ignored.
  assert.deepEqual(readNativeSectionLinks(json({ a: { recordId: "", whatever: true } })), {});
});

test("an update rewrites only unchanged copies across pages, in one operation, and never a customised one", () => {
  const home = page(`<p>é</p>${oldHtml}`);
  const about = page(`<section class="hero" id="about-hero"><h2>Hello</h2></section>`);
  const aboutCopy = `<section class="hero" id="about-hero"><h2>Hello</h2></section>`;
  let { text } = link(baseJson, "index.html", home, range(home, oldHtml));
  ({ text } = link(text, "about/index.html", about, range(about, aboutCopy)));
  // The about copy differs from the record (its id) from the start: customised.
  const customised = about.replace("Hello", "Hello there");
  const sources = { "index.html": home, "about/index.html": customised };
  const files = ["index.html", "about/index.html", EDITOR_PAGE_BUILDER_PATH];
  const plan = planNativeSectionCopiesUpdate({ documentText: text, files, sources, record: record(newHtml) });
  assert.ok(!("error" in plan), "error" in plan ? plan.error : "");
  assert.deepEqual(plan.updated, [{ page: "index.html", key: "hero-1" }]);
  assert.deepEqual(plan.diverged, [{ page: "about/index.html", key: "hero-1" }]);
  const op = plan.operation!;
  assert.equal(op.edits.get("index.html"), page(`<p>é</p>${newHtml}`));
  assert.equal(op.edits.has("about/index.html"), false);
  // Every input byte is pinned: both pages and the JSON.
  assert.deepEqual(Object.fromEntries(op.expectedSources), { [EDITOR_PAGE_BUILDER_PATH]: text, "index.html": home, "about/index.html": customised });
  assert.deepEqual(plan.expectedFiles, [...files].sort());
  const after = op.edits.get(EDITOR_PAGE_BUILDER_PATH)!;
  const links = readNativeSectionLinks(after);
  assert.equal(links["index.html"]["hero-1"].basis, newHtml);
  assert.equal(links["about/index.html"]["hero-1"].basis, oldHtml);
  assert.deepEqual(JSON.parse(after).future, { x: 1 });
  assert.deepEqual(JSON.parse(after).pages["index.html"].sections.foreign, { kind: "other", note: "keep me" });
  // The updated page resolves again with the new links.
  const again = resolveNativeSectionLinks({ documentText: after, sources: { "index.html": op.edits.get("index.html")!, "about/index.html": customised } });
  assert.ok(!("error" in again));
  // Nothing unchanged: a report and no operation.
  const none = planNativeSectionCopiesUpdate({ documentText: text, sources: { "index.html": page(`<p>é</p><section class="hero"><h2>Mine</h2></section>`), "about/index.html": customised }, record: record(newHtml) });
  assert.ok(!("error" in none));
  assert.equal(none.operation, undefined);
});

test("one unresolvable link anywhere refuses the whole update", () => {
  const home = page(oldHtml);
  const about = page(`<section class="hero" id="a"><h2>Hello</h2></section>`);
  let { text } = link(baseJson, "index.html", home, range(home, oldHtml));
  ({ text } = link(text, "about/index.html", about, range(about, `<section class="hero" id="a"><h2>Hello</h2></section>`)));
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: text, sources: { "index.html": home }, record: record(newHtml) }));
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: text, sources: { "index.html": home, "about/index.html": page("<p>gone</p>") }, record: record(newHtml) }));
  assert.ok("error" in planNativeSectionCopiesUpdate({ documentText: text, files: ["index.html", EDITOR_PAGE_BUILDER_PATH], sources: { "index.html": home, "about/index.html": about }, record: record(newHtml) }));
});

test("an updated copy whose new id collides with the page, or that becomes ambiguous, refuses", () => {
  const withId = `<section class="hero"><h2 id="title">Hello</h2></section>`;
  const home = page(`<p id="title">elsewhere</p>${oldHtml}`);
  const { text } = link(baseJson, "index.html", home, range(home, oldHtml));
  assert.match((planNativeSectionCopiesUpdate({ documentText: text, sources: { "index.html": home }, record: record(withId) }) as { error: string }).error, /more than once/);
  // Another section on the page already has the new opening tag: the copy could not be found again.
  const other = page(`<section class="hero new"><p>x</p></section>${oldHtml}`);
  const linked = link(baseJson, "index.html", other, range(other, oldHtml)).text;
  assert.match((planNativeSectionCopiesUpdate({ documentText: linked, sources: { "index.html": other }, record: record(`<section class="hero new"><p>y</p></section>`) }) as { error: string }).error, /ambiguous/);
});

test("a just-inserted copy registers in the insert's JSON; it must equal the record", () => {
  const home = page(oldHtml);
  const done = registerInsertedNativeSection({ documentText: baseJson, pagePath: "index.html", pageSourceAfter: home, range: range(home, oldHtml), record: record(oldHtml) });
  assert.ok(!("error" in done));
  assert.equal(readNativeSectionLinks(done.documentText)["index.html"]["hero-1"].recordId, "hero");
  const changed = page(`<section class="hero"><h2>Edited</h2></section>`);
  assert.ok("error" in registerInsertedNativeSection({ documentText: baseJson, pagePath: "index.html", pageSourceAfter: changed, range: range(changed, `<section class="hero"><h2>Edited</h2></section>`), record: record(oldHtml) }));
});

test("rename and delete touch only native links and keep foreign entries", () => {
  const home = page(oldHtml);
  const { text } = link(baseJson, "index.html", home, range(home, oldHtml));
  const renamed = renameNativeSectionLinksPage(text, "index.html", "home/index.html");
  assert.equal(typeof renamed, "string");
  const json = JSON.parse(renamed as string);
  assert.deepEqual(Object.keys(json.pages["home/index.html"].sections), ["hero-1"]);
  assert.deepEqual(json.pages["index.html"].sections, { foreign: { kind: "other", note: "keep me" } });
  assert.ok(typeof renameNativeSectionLinksPage(text, "index.html", "__proto__") === "object");
  const removed = deleteNativeSectionLink(text, "index.html", "hero-1");
  assert.deepEqual(JSON.parse(removed as string).pages["index.html"].sections, { foreign: { kind: "other", note: "keep me" } });
  assert.ok(typeof deleteNativeSectionLink(text, "index.html", "foreign") === "object");
});

// Records the catalogue accepts but whose HTML is not exactly one section from
// first to last byte: linking, registering or updating with them is refused
// before any JSON is written, so the links stay readable.
test("records with padding or a trailing comment are refused before writing a link", async () => {
  const { readStaticSectionRecords } = await import("../src/page-builder/static-sections");
  for (const html of [`\n${oldHtml}\n`, `  ${oldHtml}`, `${oldHtml}<!-- note -->`]) {
    const catalogue = JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { hero: record(html) } } });
    const accepted = readStaticSectionRecords(catalogue).hero;
    assert.equal(accepted.html, html, "the catalogue accepts this record");
    const home = page(oldHtml);
    const linked = planNativeSectionLink({ documentText: baseJson, pagePath: "index.html", pageSource: home, range: range(home, oldHtml), record: accepted });
    assert.ok("error" in linked, JSON.stringify(html));
    const inserted = page(html);
    const at = range(inserted, oldHtml);
    assert.ok("error" in registerInsertedNativeSection({ documentText: baseJson, pagePath: "index.html", pageSourceAfter: inserted, range: at, record: accepted }));
    // An update to such a record writes nothing either.
    const ok = link(baseJson, "index.html", home, range(home, oldHtml)).text;
    const update = planNativeSectionCopiesUpdate({ documentText: ok, sources: { "index.html": home }, record: accepted });
    assert.ok("error" in update);
  }
});

test("register needs the page in the file graph; a copy later wrapped in a component is refused", () => {
  const home = page(oldHtml);
  assert.ok("error" in registerInsertedNativeSection({ documentText: baseJson, files: [EDITOR_PAGE_BUILDER_PATH], pagePath: "index.html", pageSourceAfter: home, range: range(home, oldHtml), record: record(oldHtml) }));
  const { text } = link(baseJson, "index.html", home, range(home, oldHtml));
  for (const wrapper of ["site-card", "template", "svg"]) {
    const wrapped = page(`<${wrapper}>${oldHtml}</${wrapper}>`);
    assert.ok("error" in resolveNativeSectionLinks({ documentText: text, sources: { "index.html": wrapped } }), wrapper);
  }
});

test("an update that would replace or contain a collection's element is refused before any write", () => {
  const listed = `<section class="hero"><h2>Hello</h2><ul id="list" data-each="/work/" data-limit="3"><template><li></li></template></ul></section>`;
  const home = page(listed);
  const linked = link(baseJson, "index.html", home, range(home, listed), listed).text;
  const json = JSON.parse(linked);
  json.collections.work = {
    pagePath: "index.html", target: { authoredId: "list", path: [1, 0, 0, 1], tag: "ul", openingTagFingerprint: `<ul id="list">` },
    folders: ["/work/"], sort: "", filter: "", limit: 3, template: "<li></li>", fields: [], overrides: {},
  };
  const withCollection = JSON.stringify(json);
  const plan = planNativeSectionCopiesUpdate({ documentText: withCollection, sources: { "index.html": home }, record: record(newHtml) });
  assert.match((plan as { error: string }).error, /Collection work on index\.html is inside or around a copy/);
  // The same page with the collection outside the copy updates normally.
  const apart = page(`${oldHtml}<ul id="list" data-each="/work/" data-limit="3"><template><li></li></template></ul>`);
  const apartLinked = JSON.parse(link(baseJson, "index.html", apart, range(apart, oldHtml)).text);
  apartLinked.collections.work = { ...json.collections.work, target: { ...json.collections.work.target, path: [1, 0, 1] } };
  const ok = planNativeSectionCopiesUpdate({ documentText: JSON.stringify(apartLinked), sources: { "index.html": apart }, record: record(newHtml) });
  assert.ok(!("error" in ok), "error" in ok ? ok.error : "");
  assert.ok(ok.operation);
});

// A collection outside the copy, without an id, is found by its opening tag. New record HTML
// carrying the same opening tag would make it ambiguous after the update: refused before writing.
test("an update that would make an outside collection ambiguous is refused", () => {
  const list = `<ul class="list" data-each="/work/" data-limit="3"><template><li></li></template></ul>`;
  const home = page(`${oldHtml}${list}`);
  const linked = JSON.parse(link(baseJson, "index.html", home, range(home, oldHtml)).text);
  linked.collections.work = {
    pagePath: "index.html", target: { path: [1, 0, 1], tag: "ul", openingTagFingerprint: `<ul class="list">` },
    folders: ["/work/"], sort: "", filter: "", limit: 3, template: "<li></li>", fields: [], overrides: {},
  };
  const documentText = JSON.stringify(linked);
  const clashing = `<section class="hero"><h2>Hello</h2><ul class="list"><li>x</li></ul></section>`;
  const plan = planNativeSectionCopiesUpdate({ documentText, sources: { "index.html": home }, record: record(clashing) });
  assert.match((plan as { error: string }).error, /After the update, index\.html: .*ambiguous/);
  // The same collection with record HTML that does not clash updates, and the collection stays put.
  const fine = planNativeSectionCopiesUpdate({ documentText, sources: { "index.html": home }, record: record(newHtml) });
  assert.ok(!("error" in fine), "error" in fine ? fine.error : "");
  assert.equal(fine.operation!.edits.get("index.html"), page(`${newHtml}${list}`));
});
