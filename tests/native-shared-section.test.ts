import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planNativeSharedSection, type NativeSharedSectionInput } from "../src/page-builder/native-shared-section";
import { planNativeSectionCopiesUpdate, readNativeSectionLinks, resolveNativeSectionLinks, sectionCore } from "../src/page-builder/native-section-links";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import { readSectionCatalog, readStaticSectionRecords, resolveStaticSection } from "../src/page-builder/static-sections";

// The real native starter (the published snapshot the editor serves, byte-identical to the
// static preview), saved section by section as new shared sections.
const starter = "public/native-static-starter/v6a9ca44/files/";
const read = (path: string) => readFileSync(`${starter}${path}.asset`, "utf8");
const page = read("index.html");
const styles = ["site.css", "tokens.css", "elements.css", "layout.css", "sections.css", "components.css", "utilities.css"].map((name) => `styles/${name}`);
const sources: Record<string, string> = { "index.html": page, ...Object.fromEntries(styles.map((path) => [path, read(path)])) };
const files = ["index.html", "about/index.html", ...styles, "images/favicon.svg"];

const rangeOf = (source: string, openTag: string) => {
  const start = source.indexOf(openTag);
  assert.ok(start >= 0 && source.indexOf(openTag, start + 1) < 0, openTag);
  const end = source.indexOf("</section>", start) + "</section>".length;
  return { start, end };
};
const base = (overrides: Partial<NativeSharedSectionInput> = {}): NativeSharedSectionInput => ({
  documentText: undefined, files, sources, pagePath: "index.html", pageSource: page,
  range: rangeOf(page, `<section class="section-hero">`), id: "hero", label: "Hero", rootClass: "section-hero", stylesheetPath: "styles/components.css",
  ...overrides,
});
const error = (value: unknown, pattern: RegExp) => {
  assert.ok(value && typeof value === "object" && "error" in value, `expected an error, got ${JSON.stringify(value)?.slice(0, 200)}`);
  assert.match((value as { error: string }).error, pattern);
};
const plan = (input: NativeSharedSectionInput) => {
  const result = planNativeSharedSection(input);
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  return result;
};
const jsonOf = (result: ReturnType<typeof plan>) =>
  result.operation.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? result.operation.creates!.find((item) => item.path === EDITOR_PAGE_BUILDER_PATH)!.content;

for (const [id, label, rootClass] of [["hero", "Hero", "section-hero"], ["feature", "Feature", "section-feature"], ["contact", "Contact", "section-contact"]]) {
  test(`saves the starter's ${label} as a new shared section in one operation`, () => {
    const range = rangeOf(page, `<section class="${rootClass}">`);
    const html = page.slice(range.start, range.end);
    const result = plan(base({ range, id, label, rootClass }));
    const op = result.operation;
    // Pins only the original state: JSON absent, master absent, the page, and the stylesheet with
    // the sheet that imports it into the page (the page links site.css, which imports components.css).
    assert.deepEqual([...op.expectedSources], [[EDITOR_PAGE_BUILDER_PATH, undefined], [`.editor/sections/${id}.html`, undefined], ["index.html", page], ["styles/site.css", sources["styles/site.css"]], ["styles/components.css", sources["styles/components.css"]]]);
    assert.deepEqual(result.expectedFiles, [...files].sort());
    // Writes only editor files: the page and every stylesheet stay byte for byte.
    assert.equal(op.edits.size, 0);
    assert.deepEqual(op.creates!.map((item) => item.path), [EDITOR_PAGE_BUILDER_PATH, `.editor/sections/${id}.html`]);
    const master = op.creates![1].content;
    assert.equal(master, html);
    assert.equal(master.slice(sectionCore(master).start, sectionCore(master).end), html);
    // The JSON holds the record with htmlPath and an empty seed, never the HTML or copied CSS.
    const json = jsonOf(result);
    assert.ok(!json.includes(html.slice(0, 40)) || json.includes(`"basis"`));
    const entry = readSectionCatalog(json)[id];
    assert.deepEqual(entry, { id, label, rootClass, css: "", stylesheetPath: "styles/components.css", htmlPath: `.editor/sections/${id}.html` });
    assert.equal(JSON.parse(json).reusableSections.version, 2);
    // The master is the HTML authority through the existing APIs.
    const masters = { files: [...files, EDITOR_PAGE_BUILDER_PATH, `.editor/sections/${id}.html`], sources: { [`.editor/sections/${id}.html`]: master } };
    assert.equal(resolveStaticSection(entry, masters).html, html);
    assert.equal(readStaticSectionRecords(json, masters)[id].html, html);
    // The link's basis is exactly the copy, and it resolves as unchanged on the page.
    const links = readNativeSectionLinks(json)["index.html"];
    assert.deepEqual(Object.keys(links), [result.key]);
    assert.equal(links[result.key].basis, html);
    const resolved = resolveNativeSectionLinks({ documentText: json, sources: { "index.html": page } });
    assert.ok(!("error" in resolved) && resolved.links.length === 1 && resolved.links[0].unchanged);
    // Updating copies from the unchanged master writes nothing.
    const update = planNativeSectionCopiesUpdate({ documentText: json, files: masters.files, sources: { "index.html": page }, record: readStaticSectionRecords(json, masters)[id], master: { path: `.editor/sections/${id}.html`, source: master } });
    assert.ok(!("error" in update) && !update.operation && update.updated.length === 0);
  });
}

test("an existing JSON is edited once; unknown keys, pages and records stay", () => {
  const existing = JSON.stringify({
    version: 1, future: { kept: [1, 2] },
    pages: { "index.html": { title: "kept", sections: { other: { kind: "something-else", x: 1 } } }, "about/index.html": { y: true } },
    collections: {},
    reusableSections: { version: 1, extra: "kept", records: { intro: { id: "intro", label: "Intro", rootClass: "intro", html: `<section class="intro"><h2>Hi</h2></section>`, css: "", stylesheetPath: "styles/components.css", custom: 1 } } },
  }, null, 2) + "\n";
  const result = plan(base({ documentText: existing, files: [...files, EDITOR_PAGE_BUILDER_PATH] }));
  assert.deepEqual([...result.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(result.operation.creates!.map((item) => item.path), [".editor/sections/hero.html"]);
  assert.equal(result.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), existing);
  const before = JSON.parse(existing), after = JSON.parse(jsonOf(result));
  assert.deepEqual(after.future, before.future);
  assert.equal(Object.hasOwn(after, "collections"), false);
  assert.deepEqual(after.pages["about/index.html"], before.pages["about/index.html"]);
  assert.equal(after.pages["index.html"].title, "kept");
  assert.deepEqual(after.pages["index.html"].sections.other, before.pages["index.html"].sections.other);
  assert.equal(after.reusableSections.extra, "kept");
  assert.deepEqual(after.reusableSections.records.intro, before.reusableSections.records.intro);
  assert.equal(after.reusableSections.records.hero.html, undefined);
});

test("the final plan pins the original JSON, not intermediate text", () => {
  const existing = JSON.stringify({ version: 1, pages: {}, collections: {} }, null, 2) + "\n";
  const result = plan(base({ documentText: existing, files: [...files, EDITOR_PAGE_BUILDER_PATH] }));
  const pinned = result.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH);
  assert.equal(pinned, existing);
  assert.ok(!pinned!.includes("reusableSections"));
  assert.equal(result.operation.expectedSources.size, 5);
});

test("refuses collisions and implicit overwrites", () => {
  const json = jsonOf(plan(base()));
  const graph = [...files, EDITOR_PAGE_BUILDER_PATH, ".editor/sections/hero.html"];
  // Same id again.
  error(planNativeSharedSection(base({ documentText: json, files: graph, range: rangeOf(page, `<section class="section-feature">`), rootClass: "section-feature" })), /already exists/);
  // A master path taken in another case.
  error(planNativeSharedSection(base({ files: [...files, ".editor/sections/Hero.html"] })), /already exists/);
  // A rootClass another record uses.
  error(planNativeSharedSection(base({ documentText: json, files: graph, id: "hero2" })), /already|linked/);
  // An unread JSON, or one the graph does not prove absent.
  error(planNativeSharedSection(base({ files: [...files, EDITOR_PAGE_BUILDER_PATH] })), /Load/);
  error(planNativeSharedSection(base({ documentText: "{}" })), /Load/);
});

test("refuses stale or wrong page bytes and ranges", () => {
  error(planNativeSharedSection(base({ pageSource: page + " " })), /page changed/);
  error(planNativeSharedSection(base({ sources: { ...sources, "index.html": undefined } as never })), /page changed/);
  error(planNativeSharedSection(base({ pagePath: "missing/index.html" })), /page of this site/);
  error(planNativeSharedSection(base({ pagePath: "styles/site.css" })), /page of this site/);
  const hero = rangeOf(page, `<section class="section-hero">`);
  error(planNativeSharedSection(base({ range: { start: hero.start + 1, end: hero.end } })), /section|selection/i);
  error(planNativeSharedSection(base({ range: { start: hero.start, end: page.length + 1 } })), /Select a section/);
});

test("refuses header, footer and other non-section roots", () => {
  for (const tag of ["header", "footer"]) {
    const start = page.indexOf(`<${tag} class="site-${tag}">`);
    const end = page.indexOf(`</${tag}>`, start) + `</${tag}>`.length;
    error(planNativeSharedSection(base({ range: { start, end }, id: tag, rootClass: `site-${tag}` })), /section/);
  }
});

test("refuses a class the section doesn't have, or that another element also uses", () => {
  error(planNativeSharedSection(base({ rootClass: "lead" })), /rootClass/);
  error(planNativeSharedSection(base({ rootClass: "absent-class" })), /rootClass/);
  const twice = page.replace(`<section class="section-contact">`, `<section class="section-contact section-hero">`);
  error(planNativeSharedSection(base({ pageSource: twice, sources: { ...sources, "index.html": twice }, range: rangeOf(twice, `<section class="section-hero">`) })), /also uses/);
});

test("refuses a stylesheet that is missing, unloaded, unsafe or not applied to the page", () => {
  error(planNativeSharedSection(base({ stylesheetPath: "styles/new.css" })), /existing stylesheet/);
  const { ["styles/components.css"]: _, ...unloaded } = sources;
  error(planNativeSharedSection(base({ sources: unloaded })), /Load styles\/components.css/);
  error(planNativeSharedSection(base({ files: [...files, "styles/unused.css"], sources: { ...sources, "styles/unused.css": "" }, stylesheetPath: "styles/unused.css" })), /does not use/);
  // An import through an unloaded sheet does not count.
  const { ["styles/site.css"]: __, ...noSite } = sources;
  error(planNativeSharedSection(base({ sources: noSite })), /does not use/);
  error(planNativeSharedSection(base({ files: [...files, "../x.css"], sources: { ...sources, "../x.css": "" }, stylesheetPath: "../x.css" })), /does not use|stylesheet/);
});

test("refuses dangerous or unsupported markup through the existing validators", () => {
  const cases: [string, RegExp][] = [
    [`<section class="s"><script>x()</script></section>`, /scripts/],
    [`<section class="s"><svg></svg></section>`, /foreign/],
    [`<section class="s"><x-card></x-card></section>`, /custom/],
    [`<section class="s"><template><p>t</p></template></section>`, /templates/],
    [`<section class="s"><p id="a"></p><p id="a"></p></section>`, /duplicate authored ids/],
    [`<section class="s" class="t"><p>x</p></section>`, /Duplicate/],
  ];
  for (const [section, pattern] of cases) {
    const source = page.replace(`</main>`, `${section}\n</main>`);
    const start = source.indexOf(section);
    error(planNativeSharedSection(base({ pageSource: source, sources: { ...sources, "index.html": source }, range: { start, end: start + section.length }, id: "s", rootClass: "s" })), pattern);
  }
  // A section inside a custom element cannot be linked.
  const nested = page.replace(`</main>`, `<x-wrap><section class="s"><p>x</p></section></x-wrap>\n</main>`);
  const start = nested.indexOf(`<section class="s">`);
  error(planNativeSharedSection(base({ pageSource: nested, sources: { ...sources, "index.html": nested }, range: { start, end: nested.indexOf("</section>", start) + 10 }, id: "s", rootClass: "s" })), /components|templates/);
});

test("refuses invalid ids and labels; image URLs and markup stay exact", () => {
  error(planNativeSharedSection(base({ id: "Hero" })), /identity/);
  error(planNativeSharedSection(base({ id: "__proto__" })), /identity|id/);
  error(planNativeSharedSection(base({ label: " " })), /identity/);
  const section = `<section class="pic"><img src="../images/a b.png" alt="A &amp; B"><p>x</p></section>`;
  const source = page.replace(`</main>`, `${section}\n</main>`);
  const start = source.indexOf(section);
  const result = plan(base({ pageSource: source, sources: { ...sources, "index.html": source }, range: { start, end: start + section.length }, id: "pic", rootClass: "pic" }));
  assert.equal(result.operation.creates![1].content, section);
});

// The host's apply guard: every expected source must still hold the bytes the plan pinned.
const stillCurrent = (expected: Map<string, string | undefined>, current: Record<string, string | undefined>) =>
  [...expected].every(([path, text]) => (Object.hasOwn(current, path) ? current[path] : undefined) === text);

test("the import chain that proves the stylesheet applies is pinned", () => {
  const result = plan(base());
  assert.ok(stillCurrent(result.operation.expectedSources, sources));
  // site.css drops its import of components.css after planning: the plan is stale, though components.css is unchanged.
  const dropped = sources["styles/site.css"].replace(/@import url\("components.css"\) layer\(components\);\n/, "");
  assert.notEqual(dropped, sources["styles/site.css"]);
  assert.ok(!stillCurrent(result.operation.expectedSources, { ...sources, "styles/site.css": dropped }));
  // Planned on that state, it is refused outright.
  error(planNativeSharedSection(base({ sources: { ...sources, "styles/site.css": dropped } })), /does not use/);
  // Unrelated sheets are not pinned, and no stylesheet or .editor style file is written.
  assert.ok(!result.operation.expectedSources.has("styles/tokens.css"));
  assert.ok(![...result.operation.edits.keys(), ...result.operation.creates!.map((item) => item.path)].some((path) => path.endsWith(".css")));
  // A sheet in the chain must be in the graph.
  error(planNativeSharedSection(base({ files: files.filter((path) => path !== "styles/site.css") })), /not in the site's file list/);
});

test("a range that isn't an element says to select a section", () => {
  const hero = rangeOf(page, `<section class="section-hero">`);
  error(planNativeSharedSection(base({ range: { start: hero.start + 1, end: hero.end } })), /^Select a section on the page\.$/);
});

test("unknown keys and other pages are kept; only the record and its link are added", () => {
  const manifest = JSON.parse(readFileSync("public/native-static-starter/v6a9ca44/manifest.json", "utf8")) as { files: { path: string }[]; inline: { path: string; content: string }[] };
  const all: Record<string, string> = {};
  const graph: string[] = [];
  for (const { path } of manifest.files) { graph.push(path); if (!path.endsWith(".png")) all[path] = read(path); }
  for (const { path, content } of manifest.inline) { graph.push(path); all[path] = content; }
  const home = all["index.html"];
  const json = JSON.parse(JSON.stringify({ version: 1, pages: {} }));
  json.futureTop = { kept: [1, { deep: true }] };
  json.pages["about/index.html"] = { unknownField: "kept" };
  (json.pages["index.html"] ??= {}).unknownPageField = 7;
  const documentText = JSON.stringify(json, null, 2) + "\n";
  const current = { ...all, "index.html": home, [EDITOR_PAGE_BUILDER_PATH]: documentText };
  const files2 = graph.includes(EDITOR_PAGE_BUILDER_PATH) ? graph : [...graph, EDITOR_PAGE_BUILDER_PATH];
  const result = plan(base({ documentText, files: files2, sources: current, pageSource: home, range: rangeOf(home, `<section class="section-hero">`) }));
  const after = JSON.parse(jsonOf(result));
  // Everything but reusableSections and the new link is deep-equal.
  const { reusableSections, ...restAfter } = after;
  const expected = structuredClone(json);
  expected.pages["index.html"].sections = { ...(expected.pages["index.html"].sections ?? {}), [result.key]: after.pages["index.html"].sections[result.key] };
  assert.deepEqual(restAfter, expected);
  assert.deepEqual(Object.keys(reusableSections.records), ["hero"]);
  assert.equal(after.pages["index.html"].sections[result.key].kind, "native-section");
  assert.equal(result.operation.expectedSources.get(EDITOR_PAGE_BUILDER_PATH), documentText);
  assert.equal(result.operation.expectedSources.get("index.html"), home);
});
