import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nativeBootExtras, nativeBootStyleExtras, nativeShownFiles, readSiteTexts, unreadableAsText, unreadableNeededFile, usedComponentTags, withSiteIndexed, type SiteIndexGate } from "../src/native-boot.ts";
import type { NativeSite } from "../shared/native-project.ts";

const site: NativeSite = {
  routes: { "/": "index.html", "/about/": "about/index.html" },
  components: {
    "site-header": "components/site-header/site-header.html",
    "site-nav": "components/site-nav/site-nav.html",
    "site-footer": "components/site-footer/site-footer.html",
  },
};
const files: Record<string, string> = {
  "index.html": `<!doctype html><html><head><link rel="stylesheet" href="/styles/site.css"></head><body><site-header></site-header><main><h1>Home</h1></main></body></html>`,
  "about/index.html": `<!doctype html><html><head><link rel="stylesheet" href="../styles/about.css"></head><body><site-footer></site-footer></body></html>`,
  "components/site-header/site-header.html": `<header><SITE-NAV></SITE-NAV></header>`,
  "components/site-header/site-header.css": `header { display: flex; }`,
  "components/site-nav/site-nav.html": `<nav></nav>`,
  "components/site-footer/site-footer.html": `<footer></footer>`,
  "styles/site.css": `@import "tokens.css"; body { margin: 0; }`,
  "styles/tokens.css": `@import url("./colors.css"); :root { --gap: 1rem; }`,
  "styles/colors.css": `:root { --ink: black; }`,
  "styles/about.css": `.about { color: red; }`,
};
const isFile = (path: string) => Object.hasOwn(files, path);

test("component tags are the site's, in any letter case, and plain elements are not", () => {
  assert.deepEqual(usedComponentTags(`<site-header></site-header><Site-Nav></Site-Nav><other-thing></other-thing><div></div>`, site), ["site-header", "site-nav"]);
});

test("the first level is the page; each read source names the next level", () => {
  const read = new Map<string, string>();
  const step = () => [...nativeShownFiles(site, ["index.html"], (path) => read.get(path), isFile).files].sort();
  assert.deepEqual(step(), ["index.html"]);
  read.set("index.html", files["index.html"]);
  // The page's stylesheet, the component it uses and that component's stylesheet.
  assert.deepEqual(step(), ["components/site-header/site-header.css", "components/site-header/site-header.html", "index.html", "styles/site.css"]);
  for (const path of ["styles/site.css", "components/site-header/site-header.html", "components/site-header/site-header.css"]) read.set(path, files[path]);
  // The nested component and the stylesheet's import.
  assert.deepEqual(step(), ["components/site-header/site-header.css", "components/site-header/site-header.html", "components/site-nav/site-nav.html", "index.html", "styles/site.css", "styles/tokens.css"]);
  for (const path of ["styles/tokens.css", "components/site-nav/site-nav.html"]) read.set(path, files[path]);
  assert.ok(step().includes("styles/colors.css"));
  read.set("styles/colors.css", files["styles/colors.css"]);
  const all = step();
  // Never another page, its stylesheet or a component no page here uses.
  for (const path of ["about/index.html", "styles/about.css", "components/site-footer/site-footer.html"]) assert.ok(!all.includes(path), path);
});

test("component stylesheets that exist are named by tag; the others are missing", () => {
  const shown = nativeShownFiles(site, ["index.html"], (path) => files[path], isFile);
  assert.deepEqual([...shown.componentCss], [["site-header", "components/site-header/site-header.css"]]);
  assert.deepEqual([...shown.missingComponentCss].sort(), ["site-nav"]);
});

test("every component template and its stylesheet come with the page when they are small", () => {
  const paths = [...Object.keys(files), ".editor/private.css"];
  const size = (path: string) => (isFile(path) ? files[path].length : undefined);
  const extras = nativeBootExtras(site, paths, size);
  assert.deepEqual(extras.sort(), [
    "components/site-footer/site-footer.html", "components/site-header/site-header.css", "components/site-header/site-header.html",
    "components/site-nav/site-nav.html",
  ]);
  // Too large together, or a size not known: nothing extra.
  assert.deepEqual(nativeBootExtras(site, paths, size, 50), []);
  assert.deepEqual(nativeBootExtras({ ...site, components: { ...site.components, "new-thing": "components/new-thing/new-thing.html" } }, paths, size), []);
});

test("the site's own stylesheets come with the page when they are small; never a component's, a dot-folder's or node_modules'", () => {
  const paths = [...Object.keys(files), ".editor/private.css", ".github/x.css", "node_modules/pkg/a.css", "styles/extra.css"];
  const sizes: Record<string, number> = { ".editor/private.css": 10, ".github/x.css": 10, "node_modules/pkg/a.css": 10, "styles/extra.css": 100 };
  const size = (path: string) => (isFile(path) ? files[path].length : sizes[path]);
  const expected = paths.filter((path) => path.endsWith(".css") && !path.startsWith(".") && !path.startsWith("node_modules") && !path.startsWith("components/"));
  assert.ok(expected.includes("styles/extra.css") && expected.length > 1);
  assert.deepEqual(nativeBootStyleExtras(site, paths, size).sort(), expected.sort());
  // Over the cap together, or a size not known: nothing.
  const total = expected.reduce((sum, path) => sum + size(path)!, 0);
  assert.deepEqual(nativeBootStyleExtras(site, paths, size, total - 1), []);
  assert.deepEqual(nativeBootStyleExtras(site, paths, size, total).sort(), expected.sort());
  assert.deepEqual(nativeBootStyleExtras(site, [...paths, "styles/unknown.css"], size), []);
});

// A text index the test drives: `key` is the open repository, `done` whether it read the whole site.
function fakeGate(state: { key: string; done: boolean }, settle: () => Promise<boolean>, ensure: () => Promise<string | undefined> = async () => undefined): SiteIndexGate & { ensured: number } {
  const gate = {
    ensured: 0,
    key: () => state.key,
    indexed: () => state.done,
    settled: settle,
    ensure: () => { gate.ensured++; return ensure(); },
  };
  return gate;
}

test("the agent context is built only from a complete index", async () => {
  const state = { key: "repo-a", done: false };
  const built: string[] = [];
  const gate = fakeGate(state, async () => { state.done = true; return true; });
  assert.equal(await withSiteIndexed(gate, async () => { built.push(state.key); return state.done; }), true);
  assert.deepEqual(built, ["repo-a"]);
  assert.equal(gate.ensured, 0);
});

test("an index that failed is read again once, and a second failure is refused, never built", async () => {
  const state = { key: "repo-a", done: false };
  let builds = 0;
  const retried = fakeGate(state, async () => false, async () => { state.done = true; return undefined; });
  await withSiteIndexed(retried, async () => { builds++; });
  assert.equal(retried.ensured, 1);
  assert.equal(builds, 1);
  state.done = false;
  const failing = fakeGate(state, async () => false, async () => "The site's links could not be fully read.");
  await assert.rejects(withSiteIndexed(failing, async () => { builds++; }), /could not be fully read/);
  assert.equal(builds, 1);
});

test("a repository switched while the index is awaited waits for the new one's index", async () => {
  const state = { key: "repo-a", done: false };
  const built: string[] = [];
  let settles = 0;
  const gate = fakeGate(state, async () => {
    settles++;
    // The first wait ends with another repository open, its index not read yet.
    if (settles === 1) { state.key = "repo-b"; return true; }
    state.done = true;
    return true;
  });
  await withSiteIndexed(gate, async () => { built.push(`${state.key}:${state.done}`); });
  assert.deepEqual(built, ["repo-b:true"]);
  assert.equal(settles, 2);
});

test("a context built while the repository changed is built again, and given up after repeated changes", async () => {
  const state = { key: "repo-a", done: true };
  let builds = 0;
  const gate = fakeGate(state, async () => true);
  const value = await withSiteIndexed(gate, async () => { builds++; if (builds === 1) state.key = "repo-b"; return state.key; });
  assert.equal(value, "repo-b");
  assert.equal(builds, 2);
  await assert.rejects(withSiteIndexed(gate, async () => { state.key += "!"; }), /changed meanwhile/);
});

// The text index's read (and the boot's): GitHub refuses a whole batch when
// one file in it is not UTF-8 text (415) or over the text limit (413).
class Refused extends Error { constructor(public status: number, message: string) { super(message); } }
function fakeBatches(texts: Record<string, string>, refuse: Record<string, Refused>) {
  const asked: string[][] = [];
  const read = async (shas: string[]) => {
    asked.push([...shas]);
    const bad = shas.find((sha) => refuse[sha]);
    if (bad) throw refuse[bad];
    return Object.fromEntries(shas.map((sha) => [sha, texts[sha]]));
  };
  return { asked, read };
}

test("the text index skips a file GitHub cannot give as text and reads the rest", async () => {
  const files = ["index.html", "about/index.html", "styles/site.css", "styles/latin1.css", "styles/tokens.css"].map((path, index) => ({ path, sha: `sha${index}` }));
  const texts = Object.fromEntries(files.map((file) => [file.sha, `text of ${file.path}`]));
  const { asked, read } = fakeBatches(texts, { sha3: new Refused(415, "This file is not UTF-8 text.") });
  const result = await readSiteTexts(files, read);
  assert.deepEqual([...result.texts.keys()].sort(), ["about/index.html", "index.html", "styles/site.css", "styles/tokens.css"]);
  assert.equal(result.texts.get("styles/site.css"), "text of styles/site.css");
  assert.deepEqual(result.unreadable, [{ path: "styles/latin1.css", message: "This file is not UTF-8 text." }]);
  // Halved until the refused file is alone: a few batches, not one read per file.
  assert.ok(asked.length < files.length + 2, `${asked.length} reads`);
  assert.ok(asked.some((shas) => shas.length === 1 && shas[0] === "sha3"));
});

test("the text index reads files that share a blob once, and skips every path of a refused one", async () => {
  const files = [{ path: "a.css", sha: "same" }, { path: "b.css", sha: "same" }, { path: "c.css", sha: "big" }, { path: "d.css", sha: "ok" }];
  const { read } = fakeBatches({ same: "x", ok: "y" }, { big: new Refused(413, "Text files open up to 1 MB.") });
  const result = await readSiteTexts(files, read);
  assert.deepEqual(Object.fromEntries(result.texts), { "a.css": "x", "b.css": "x", "d.css": "y" });
  assert.deepEqual(result.unreadable.map((file) => file.path), ["c.css"]);
});

test("any other failed read still fails the text index", async () => {
  const files = [{ path: "a.css", sha: "a" }, { path: "b.css", sha: "b" }];
  const { read } = fakeBatches({ a: "x" }, { b: new Refused(500, "GitHub did not answer.") });
  await assert.rejects(readSiteTexts(files, read), /GitHub did not answer/);
  await assert.rejects(readSiteTexts(files, async () => { throw new Error("Failed to fetch"); }), /Failed to fetch/);
  assert.equal(unreadableAsText(new Refused(415, "Binary file. Text preview is unavailable.")), true);
  assert.equal(unreadableAsText(new Refused(401, "Sign in again.")), false);
  assert.equal(unreadableAsText(new Error("Could not read this file.")), false);
});

test("nothing to read asks for nothing", async () => {
  const { asked, read } = fakeBatches({}, {});
  assert.deepEqual(await readSiteTexts([], read), { texts: new Map(), unreadable: [] });
  assert.deepEqual(asked, []);
});

test("a page or template on show that cannot be read as text, and has no source, is named with why; a stylesheet never is", () => {
  const why = "This file is not UTF-8 text.";
  const read = (skip: string) => (path: string) => path === skip ? undefined : files[path];
  const shown = (skip: string) => nativeShownFiles(site, ["about/index.html"], read(skip), isFile).files;
  const unreadable = (path: string) => new Map([[path, why]]);
  const none = () => false;
  assert.equal(unreadableNeededFile(shown("about/index.html"), none, unreadable("about/index.html")), `about/index.html: ${why}`);
  // A template the page uses, found once the page is read.
  const footer = "components/site-footer/site-footer.html";
  assert.equal(unreadableNeededFile(shown(footer), none, unreadable(footer)), `${footer}: ${why}`);
  // One the page does not use, a stylesheet it links, or one with a source here (a draft) is not.
  assert.equal(unreadableNeededFile(shown(""), none, unreadable("components/site-header/site-header.html")), undefined);
  assert.equal(unreadableNeededFile(shown("styles/about.css"), none, unreadable("styles/about.css")), undefined);
  assert.equal(unreadableNeededFile(shown(footer), (path) => path === footer, unreadable(footer)), undefined);
  assert.equal(unreadableNeededFile(shown(""), none, new Map()), undefined);
});
