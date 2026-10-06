import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nativeBootExtras, nativeShownFiles, usedComponentTags, withSiteIndexed, type SiteIndexGate } from "../src/native-boot.ts";
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
