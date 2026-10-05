import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  pagePartCore, planLinkPagePartCopies, planSavePagePart, planUnlinkPagePart, planUpdatePagePartCopies,
  readPagePartCatalog, readPagePartLinks, readPagePartMaster, resolvePagePartLinks, type PagePartPlan,
} from "../src/page-builder/native-page-parts";
import { planStaticCardConversion } from "../src/page-builder/native-static-grid-collection";
import { planNativeSharedSection } from "../src/page-builder/native-shared-section";
import { readNativeSectionLinks } from "../src/page-builder/native-section-links";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import { nativePageRoute } from "../shared/native-routes";

// The vendored native starter, all six routes, as the editor loads it.
const STARTER = "public/native-static-starter/v6a9ca44";
interface Site { files: string[]; sources: Record<string, string | undefined> }
function starter(): Site {
  const manifest = JSON.parse(readFileSync(`${STARTER}/manifest.json`, "utf8")) as { files: { path: string }[]; inline: { path: string; content: string }[] };
  const site: Site = { files: [], sources: {} };
  for (const { path } of manifest.files) { site.files.push(path); if (!path.endsWith(".png")) site.sources[path] = readFileSync(`${STARTER}/files/${path}.asset`, "utf8"); }
  for (const { path, content } of manifest.inline) { site.files.push(path); site.sources[path] = content; }
  return site;
}
const PAGES = ["index.html", "404.html", "about/index.html", "work/fern-and-kettle/index.html", "work/harbour-lane-pottery/index.html", "work/meadow-row-allotments/index.html"];
const SHEET = "styles/components.css";

/** The host's transaction: every pinned source and the graph must be current; then apply. */
function apply(site: Site, plan: PagePartPlan) {
  assert.deepEqual(plan.expectedFiles, [...site.files].sort(), "file graph is current");
  for (const [path, text] of plan.operation.expectedSources) assert.equal(site.sources[path], text, `${path} is current`);
  for (const [path, text] of plan.operation.edits) site.sources[path] = text;
  for (const { path, content } of plan.operation.creates ?? []) { assert.ok(!site.files.includes(path)); site.files.push(path); site.sources[path] = content; }
}
const stale = (site: Site, plan: PagePartPlan) => [...plan.operation.expectedSources].some(([path, text]) => site.sources[path] !== text);
function rangeOf(source: string, tag: string, from = 0) {
  const start = source.indexOf(`<${tag}`, from);
  assert.ok(start >= 0, tag);
  const name = tag.split(" ")[0];
  return { start, end: source.indexOf(`</${name}>`, start) + name.length + 3 };
}
const ok = <T extends object>(value: T | { error: string }): T => {
  assert.ok(!("error" in value), "error" in value ? value.error : "");
  return value as T;
};
const error = (value: unknown, pattern: RegExp) => {
  assert.ok(value && typeof value === "object" && "error" in value, `expected an error, got ${JSON.stringify(value)?.slice(0, 300)}`);
  assert.match((value as { error: string }).error, pattern);
};
const json = (site: Site) => site.sources[EDITOR_PAGE_BUILDER_PATH];

/** Starter state with a real collection, a section link and unknown keys already in the JSON. */
function prepared(): Site {
  const site = starter();
  const routes: Record<string, string> = {};
  for (const path of site.files) { const url = nativePageRoute(path); if (url) routes[url] = path; }
  const name = JSON.parse(site.sources[".editor/config.json"]!).site.name;
  const converted = ok(planStaticCardConversion({ sources: site.sources as Record<string, string>, files: site.files, routes, identity: { name }, path: "index.html", start: site.sources["index.html"]!.indexOf(`<div class="cards">`), folders: ["/work/"], token: "grid1" }));
  for (const [path, text] of converted.texts) { if (!site.files.includes(path)) site.files.push(path); site.sources[path] = text; }
  const home = site.sources["index.html"]!;
  const hero = ok(planNativeSharedSection({ documentText: json(site), files: site.files, sources: site.sources, pagePath: "index.html", pageSource: home, range: rangeOf(home, `section class="section-hero"`), id: "hero", label: "Hero", rootClass: "section-hero", stylesheetPath: SHEET }));
  apply(site, { operation: hero.operation, expectedFiles: hero.expectedFiles });
  const document = JSON.parse(json(site)!);
  document.futureTop = { kept: [1, { deep: true }] };
  document.pages["about/index.html"] = { ...(document.pages["about/index.html"] ?? {}), unknownField: "kept", pageParts: { foreign: { kind: "other", note: "opaque" } } };
  site.sources[EDITOR_PAGE_BUILDER_PATH] = JSON.stringify(document, null, 2) + "\n";
  return site;
}

test("header and footer: save, link on all six routes, edit the master and update copies in one plan each", () => {
  const site = prepared();
  const original = { ...site.sources };
  const before = JSON.parse(json(site)!);

  // Save the 404 page's header (no aria-current) and the home page's footer.
  const notFound = site.sources["404.html"]!;
  const header = ok(planSavePagePart({ documentText: json(site), files: site.files, sources: site.sources, pagePath: "404.html", pageSource: notFound, range: rangeOf(notFound, "header"), id: "site-header", label: "Site header", rootClass: "site-header", stylesheetPath: SHEET }));
  // Only the JSON and the master are written; pins: JSON, master absent, page, link/import chain.
  assert.deepEqual([...header.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual(header.operation.creates!.map((item) => item.path), [".editor/page-parts/site-header.html"]);
  assert.equal(header.operation.creates![0].content, notFound.slice(rangeOf(notFound, "header").start, rangeOf(notFound, "header").end));
  assert.deepEqual([...header.operation.expectedSources.keys()], [EDITOR_PAGE_BUILDER_PATH, ".editor/page-parts/site-header.html", "404.html", "styles/site.css", SHEET]);
  assert.equal(header.operation.expectedSources.get(".editor/page-parts/site-header.html"), undefined);
  apply(site, header);
  const home = site.sources["index.html"]!;
  const footer = ok(planSavePagePart({ documentText: json(site), files: site.files, sources: site.sources, pagePath: "index.html", pageSource: home, range: rangeOf(home, "footer"), id: "site-footer", label: "Site footer", rootClass: "site-footer", stylesheetPath: SHEET }));
  apply(site, footer);
  assert.deepEqual(Object.keys(readPagePartCatalog(json(site))), ["site-footer", "site-header"].sort());
  assert.deepEqual(readPagePartCatalog(json(site))["site-header"], { id: "site-header", label: "Site header", rootTag: "header", rootClass: "site-header", htmlPath: ".editor/page-parts/site-header.html", stylesheetPath: SHEET });

  // Link the other five copies of each in one plan.
  const copies = (tag: string, skip: string) => PAGES.filter((page) => page !== skip).map((pagePath) => ({ pagePath, range: rangeOf(site.sources[pagePath]!, tag) }));
  const headerLinks = ok(planLinkPagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header", copies: copies("header", "404.html") }));
  assert.deepEqual(headerLinks.operation.creates, []);
  assert.deepEqual([...headerLinks.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  // Home and About mark their own nav link (aria-current): customised from the start.
  assert.deepEqual(headerLinks.keys.filter((item) => !item.unchanged).map((item) => item.page).sort(), ["about/index.html", "index.html"]);
  apply(site, headerLinks);
  const footerLinks = ok(planLinkPagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-footer", copies: copies("footer", "index.html") }));
  assert.deepEqual(footerLinks.keys.filter((item) => !item.unchanged).map((item) => item.page), ["about/index.html"]);
  apply(site, footerLinks);
  const resolved = ok(resolvePagePartLinks({ documentText: json(site), sources: site.sources }));
  assert.equal(resolved.links.length, 12);
  // Pages and CSS are still the starter's bytes after save and link.
  for (const path of site.files) if (path.endsWith(".html") && !path.startsWith(".editor/") || path.endsWith(".css")) assert.equal(site.sources[path], original[path], path);

  // Edit the masters, then update copies.
  const headerMaster = site.sources[".editor/page-parts/site-header.html"]!;
  site.sources[".editor/page-parts/site-header.html"] = headerMaster.replace(`<a href="/about/">About</a>`, `<a href="/about/">About</a>\n      <a href="/about/#contact">Contact</a>`);
  const update = ok(planUpdatePagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header" }));
  assert.deepEqual(update.updated.map((item) => item.page).sort(), ["404.html", "work/fern-and-kettle/index.html", "work/harbour-lane-pottery/index.html", "work/meadow-row-allotments/index.html"]);
  assert.deepEqual(update.skipped.map((item) => item.page).sort(), ["about/index.html", "index.html"]);
  // Writes pages and the JSON only; pins the JSON, master and every page with page part links.
  assert.ok([...update.operation!.edits.keys()].every((path) => path === EDITOR_PAGE_BUILDER_PATH || PAGES.includes(path)));
  assert.equal(update.operation!.creates!.length, 0);
  assert.deepEqual([...update.operation!.expectedSources.keys()].sort(), [EDITOR_PAGE_BUILDER_PATH, ".editor/page-parts/site-header.html", ...PAGES].sort());
  const beforeUpdate = { ...site.sources };
  apply(site, update as PagePartPlan);
  const newHeader = site.sources[".editor/page-parts/site-header.html"]!;
  for (const page of PAGES) {
    const was = beforeUpdate[page]!, now = site.sources[page]!;
    const range = rangeOf(was, "header"), next = rangeOf(now, "header");
    // Outside the header every byte is kept.
    assert.equal(now.slice(0, next.start), was.slice(0, range.start), page);
    assert.equal(now.slice(next.end), was.slice(range.end), page);
    assert.equal(now.slice(next.start, next.end), update.updated.some((item) => item.page === page) ? newHeader : was.slice(range.start, range.end), page);
  }
  // Links moved their basis; the skipped ones kept theirs; everything still resolves.
  const linksAfter = readPagePartLinks(json(site));
  for (const item of update.updated) assert.equal(linksAfter[item.page][item.key].basis, newHeader);
  const customised = ok(resolvePagePartLinks({ documentText: json(site), sources: site.sources })).links.filter((link) => !link.unchanged);
  assert.deepEqual(customised.map((link) => `${link.page} ${link.link.recordId}`).sort(), ["about/index.html site-footer", "about/index.html site-header", "index.html site-header"]);

  // Footer: one customised copy (About) is skipped.
  site.sources[".editor/page-parts/site-footer.html"] = site.sources[".editor/page-parts/site-footer.html"]!.replace("Designed and built by hand.", "Designed and built by hand in Frome.");
  const footerUpdate = ok(planUpdatePagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-footer" }));
  assert.equal(footerUpdate.updated.length, 5);
  assert.deepEqual(footerUpdate.skipped.map((item) => item.page), ["about/index.html"]);
  const aboutBefore = site.sources["about/index.html"];
  apply(site, footerUpdate as PagePartPlan);
  assert.ok(!site.sources["about/index.html"]!.includes("in Frome.") && site.sources["about/index.html"]!.includes("<a href=\"/about/#contact\">Contact</a>") === aboutBefore!.includes("<a href=\"/about/#contact\">Contact</a>"));
  for (const page of PAGES.filter((page) => page !== "about/index.html")) assert.ok(site.sources[page]!.includes("Designed and built by hand in Frome."), page);

  // CSS never changed; nothing editor-only reached the published pages.
  for (const path of site.files) if (path.endsWith(".css")) assert.equal(site.sources[path], original[path], path);
  for (const page of PAGES) assert.doesNotMatch(site.sources[page]!, /data-native|page-part|\.editor/);

  // Unknown JSON, the real collection and the section link are kept.
  const after = JSON.parse(json(site)!);
  assert.deepEqual(after.futureTop, before.futureTop);
  assert.deepEqual(after.collections, before.collections);
  assert.deepEqual(after.reusableSections, before.reusableSections);
  assert.deepEqual(after.pages["index.html"].sections, before.pages["index.html"].sections);
  assert.equal(after.pages["about/index.html"].unknownField, "kept");
  assert.deepEqual(after.pages["about/index.html"].pageParts.foreign, { kind: "other", note: "opaque" });
  assert.equal(Object.keys(readNativeSectionLinks(json(site))["index.html"]).length, 1);

  // Nothing to do when the master equals every unchanged copy.
  const again = ok(planUpdatePagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header" }));
  assert.equal(again.operation, undefined);
  assert.equal(again.updated.length, 0);

  // Unlink: JSON only.
  const key = Object.keys(readPagePartLinks(json(site))["about/index.html"]).find((item) => item.startsWith("site-footer"))!;
  const unlink = ok(planUnlinkPagePart({ documentText: json(site)!, files: site.files, pagePath: "about/index.html", key }));
  assert.deepEqual([...unlink.operation.edits.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  assert.deepEqual([...unlink.operation.expectedSources.keys()], [EDITOR_PAGE_BUILDER_PATH]);
  apply(site, unlink);
  assert.equal(readPagePartLinks(json(site))["about/index.html"][key], undefined);
  assert.deepEqual(JSON.parse(json(site)!).pages["about/index.html"].pageParts.foreign, { kind: "other", note: "opaque" });
});

function savedHeader() {
  const site = prepared();
  const page = site.sources["404.html"]!;
  apply(site, ok(planSavePagePart({ documentText: json(site), files: site.files, sources: site.sources, pagePath: "404.html", pageSource: page, range: rangeOf(page, "header"), id: "site-header", label: "Site header", rootClass: "site-header", stylesheetPath: SHEET })));
  return site;
}
const saveInput = (site: Site, page: string, overrides: Record<string, unknown> = {}) => ({
  documentText: json(site), files: site.files, sources: site.sources, pagePath: page, pageSource: site.sources[page]!,
  range: rangeOf(site.sources[page]!, "header"), id: "site-header", label: "Site header", rootClass: "site-header", stylesheetPath: SHEET, ...overrides,
});

test("stale plans are caught by the pins", () => {
  const site = prepared();
  const plan = ok(planSavePagePart(saveInput(site, "404.html")));
  for (const path of ["404.html", "styles/site.css", SHEET, EDITOR_PAGE_BUILDER_PATH]) assert.ok(stale({ ...site, sources: { ...site.sources, [path]: site.sources[path] + " " } }, plan), path);
  assert.ok(stale({ ...site, sources: { ...site.sources, ".editor/page-parts/site-header.html": "<header></header>" } }, plan));
  // An unrelated stylesheet isn't pinned.
  assert.ok(!stale({ ...site, sources: { ...site.sources, "styles/tokens.css": "" } }, plan));
  // A changed page is refused at planning time too.
  error(planSavePagePart({ ...saveInput(site, "404.html"), pageSource: site.sources["404.html"] + " " }), /changed/);
  error(planSavePagePart({ ...saveInput(site, "404.html"), documentText: undefined }), /Load/);
});

test("refuses collisions: id, master path case, rootClass, and an already linked copy", () => {
  const site = savedHeader();
  error(planSavePagePart(saveInput(site, "index.html")), /already exists/);
  error(planSavePagePart(saveInput(site, "index.html", { id: "header2" })), /already uses site-header|already linked/);
  const fresh = prepared();
  error(planSavePagePart(saveInput(fresh, "404.html", { files: [...fresh.files, ".editor/page-parts/Site-Header.html"] })), /already exists/);
  error(planSavePagePart(saveInput(fresh, "index.html", { range: rangeOf(fresh.sources["index.html"]!, `section class="section-hero"`), rootClass: "section-hero", id: "x" })), /<header> or <footer>/);
  // Linking the same copy twice.
  const link = (copies: { pagePath: string; range: { start: number; end: number } }[]) => planLinkPagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header", copies });
  error(link([{ pagePath: "404.html", range: rangeOf(site.sources["404.html"]!, "header") }]), /already linked/);
  const about = { pagePath: "about/index.html", range: rangeOf(site.sources["about/index.html"]!, "header") };
  error(link([about, about]), /already linked/);
  // A footer can't be linked to a header part.
  error(link([{ pagePath: "about/index.html", range: rangeOf(site.sources["about/index.html"]!, "footer") }]), /is a header/);
  error(planLinkPagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "nope", copies: [about] }), /no longer exists/);
});

test("refuses unsafe, foreign, malformed and ambiguous markup without changing it", () => {
  const site = prepared();
  const variant = (from: string, to: string, page = "404.html") => {
    const source = site.sources[page]!.replace(from, to);
    assert.notEqual(source, site.sources[page]);
    return { ...saveInput(site, page), pageSource: source, sources: { ...site.sources, [page]: source }, range: rangeOf(source, "header") };
  };
  error(planSavePagePart(variant(`<a class="brand" href="/">`, `<a class="brand" href="/" onclick="go()">`)), /Event handler/);
  error(planSavePagePart(variant(`</nav>`, `</nav><script>x()</script>`)), /<script>/);
  error(planSavePagePart(variant(`</nav>`, `</nav><svg></svg>`)), /<svg>/);
  error(planSavePagePart(variant(`</nav>`, `</nav><x-menu></x-menu>`)), /custom elements/);
  error(planSavePagePart(variant(`</nav>`, `</nav><template><p>t</p></template>`)), /<template>/);
  error(planSavePagePart(variant(`<a class="brand" href="/">`, `<a class="brand" href="javascript:go()">`)), /javascript:/);
  const dup = variant(`<nav aria-label="Main">`, `<nav aria-label="Main" id="n"><span id="n"></span>`);
  error(planSavePagePart(dup), /duplicate ids/);
  error(planSavePagePart(variant(`<header class="site-header">`, `<header class="site-header" class="x">`)), /Duplicate attributes/);
  error(planSavePagePart(variant(`<header class="site-header">`, `<header class="site-header" data-native-empty>`)), /editor attribute/);
  // A header inside a custom element or template.
  const wrapped = variant(`<header class="site-header">`, `<x-wrap><header class="site-header">`);
  const wrappedSource = wrapped.pageSource.replace("</header>", "</header></x-wrap>");
  error(planSavePagePart({ ...wrapped, pageSource: wrappedSource, sources: { ...site.sources, "404.html": wrappedSource }, range: rangeOf(wrappedSource, "header") }), /component, template or foreign/);
  // Partial range.
  const page = site.sources["404.html"]!, range = rangeOf(page, "header");
  error(planSavePagePart({ ...saveInput(site, "404.html"), range: { start: range.start + 1, end: range.end } }), /^Select a header or footer on the page\.$/);
  // A class the root doesn't have, or that another element uses.
  error(planSavePagePart(saveInput(site, "404.html", { rootClass: "brand" })), /must already have the class/);
  // Two identical headers with no id can't be told apart.
  const twice = page.replace("</header>", `</header>\n  ${page.slice(range.start, range.end)}`);
  error(planSavePagePart({ ...saveInput(site, "404.html"), pageSource: twice, sources: { ...site.sources, "404.html": twice }, range: rangeOf(twice, "header") }), /also uses|told apart/);
});

test("refuses a stylesheet that is unloaded, missing or not applied to the page", () => {
  const site = prepared();
  const { [SHEET]: _, ...unloaded } = site.sources;
  error(planSavePagePart({ ...saveInput(site, "404.html"), sources: unloaded }), /Load styles\/components.css/);
  error(planSavePagePart(saveInput(site, "404.html", { stylesheetPath: "styles/missing.css" })), /missing/);
  const dropped = site.sources["styles/site.css"]!.replace(/@import url\("components.css"\) layer\(components\);\n/, "");
  error(planSavePagePart({ ...saveInput(site, "404.html"), sources: { ...site.sources, "styles/site.css": dropped } }), /does not use/);
});

test("update refuses an unloaded linked page, a missing master, a master comment outside its root and broken links", () => {
  const site = savedHeader();
  const about = site.sources["about/index.html"]!;
  apply(site, ok(planLinkPagePartCopies({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header", copies: [{ pagePath: "about/index.html", range: rangeOf(about, "header") }] })));
  const master = ".editor/page-parts/site-header.html";
  const input = () => ({ documentText: json(site)!, files: site.files, sources: site.sources, recordId: "site-header" });
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, "about/index.html": undefined } }), /Load about\/index.html/);
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, [master]: undefined } }), /Load \.editor\/page-parts\/site-header\.html/);
  error(planUpdatePagePartCopies({ ...input(), files: site.files.filter((path) => path !== master) }), /missing/);
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, [master]: `<!-- note -->\n${site.sources[master]}` } }), /comment outside/);
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, [master]: `<section class="site-header"></section>` } }), /header> or <footer/);
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, [master]: site.sources[master]!.replace("<nav", "<nav onclick=\"x()\"") } }), /Event handler/);
  // A linked copy that can no longer be found refuses the whole update.
  const moved = about.replace(`<header class="site-header">`, `<header class="site-header wide">`);
  error(planUpdatePagePartCopies({ ...input(), sources: { ...site.sources, "about/index.html": moved } }), /Relink/);
  // Malformed recognised link data refuses.
  const document = JSON.parse(json(site)!);
  const key = Object.keys(document.pages["about/index.html"].pageParts).find((item) => item.startsWith("site-header"))!;
  document.pages["about/index.html"].pageParts[key].basis = "<div></div>";
  error(planUpdatePagePartCopies({ ...input(), documentText: JSON.stringify(document) }), /basis must be exactly one header/);
  assert.throws(() => readPagePartCatalog(JSON.stringify({ ...JSON.parse(json(site)!), reusablePageParts: { version: 1, records: { "site-header": { ...readPagePartCatalog(json(site))["site-header"], htmlPath: ".editor/page-parts/other.html" } } } })), /master must be/);
});

test("the master is read as the HTML authority", () => {
  const site = savedHeader();
  const record = readPagePartCatalog(json(site))["site-header"];
  const master = readPagePartMaster(record, site as { files: string[]; sources: Record<string, string | undefined> });
  const core = pagePartCore(master);
  assert.equal(core.rootTag, "header");
  assert.equal(JSON.parse(json(site)!).reusablePageParts.records["site-header"].html, undefined);
});

test("a header inside a linked section overlaps it and is refused", () => {
  const site = prepared();
  const home = site.sources["index.html"]!;
  const inner = `<header class="hero-head"><h2>Inside</h2></header>`;
  const source = home.replace(`<section class="section-hero">`, `<section class="section-hero">\n      ${inner}`);
  // The section link no longer matches its basis but still resolves by its opening tag.
  const start = source.indexOf(inner);
  error(planSavePagePart({ documentText: json(site), files: site.files, sources: { ...site.sources, "index.html": source }, pagePath: "index.html", pageSource: source,
    range: { start, end: start + inner.length }, id: "hero-head", label: "Hero head", rootClass: "hero-head", stylesheetPath: SHEET }), /overlaps section link/);
});
