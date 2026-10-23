import { test } from "node:test";
import assert from "node:assert/strict";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { draftKey, type DraftScope, type SavedDraft } from "../src/drafts.ts";
import { createNativeSiteRuntime, type NativeSiteRuntimePorts } from "../src/native-site-runtime.ts";
import type { WorkspaceScope } from "../src/workspace-session.ts";
import { forEachAwait } from "./support/await-race.ts";
import type { PublishResult } from "../shared/types.ts";

const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const SHOWN = { kind: "github", ...SCOPE } satisfies WorkspaceScope;
const SHA = "a".repeat(40);
const SITE = { routes: { "/": "index.html" }, components: {} };

function draft(path: string, content: string, fields: Partial<SavedDraft> = {}): SavedDraft {
  return { ...SCOPE, version: 1, path, baseSha: SHA, original: "", content, updatedAt: 0, ...fields };
}

// A runtime over one scope's drafts, with what the ports were asked recorded.
function setup(drafts: SavedDraft[] = [], mounted: Record<string, string> = {}, overrides: Partial<NativeSiteRuntimePorts> = {}) {
  const calls: string[] = [];
  const held = new Map(drafts.map((entry) => [entry.path, entry]));
  let reads: Promise<{ texts: Map<string, string>; unreadable: [] }> | undefined;
  const clean = new CleanSourceCache(() => "o");
  const ports = {
    scope: () => SCOPE,
    shown: () => SHOWN,
    drafts: () => ({ get: (_scope: DraftScope, path: string) => held.get(path), list: () => [...held.values()] }),
    mounted: (path: string) => mounted[path],
    clean,
    textKey: () => "key",
    route: () => "/",
    openFile: () => undefined,
    pageStyles: () => [],
    find: async () => ({ sha: SHA }),
    readTexts: async (_repo: string, files: { path: string; sha: string }[]) => reads ?? { texts: new Map(files.map((file) => [file.path, `text of ${file.path}`])), unreadable: [] as [] },
    unreadable: () => { calls.push("unreadable"); },
    changed: () => { calls.push("changed"); },
    closed: () => { calls.push("closed"); },
    ...overrides,
  } satisfies NativeSiteRuntimePorts;
  const runtime = createNativeSiteRuntime(ports);
  return { runtime, calls, clean, hold: (read: typeof reads) => { reads = read; } };
}

test("a source is the mounted editor's, then the draft's, then GitHub's", () => {
  const { runtime } = setup([draft("about.html", "drafted about"), draft("open.html", "drafted open"), draft("gone.html", "kept", { deleted: true })], { "open.html": "typed" });
  for (const path of ["index.html", "about.html", "open.html", "gone.html"]) runtime.base.sources.set(path, `base ${path}`);
  assert.equal(runtime.source("index.html"), "base index.html");
  assert.equal(runtime.source("about.html"), "drafted about");
  assert.equal(runtime.source("open.html"), "typed");
  assert.equal(runtime.source("gone.html"), undefined);
  assert.equal(runtime.source("missing.html"), undefined);
});

test("the media text also reads an opaque draft's cached text and the wider index", () => {
  const { runtime, clean } = setup([draft("logo.svg", "", { opaque: true, sourceSha: "b".repeat(40) })]);
  assert.equal(runtime.textSource("logo.svg"), undefined);
  runtime.state.opaqueText.set(draftKey(SCOPE, "logo.svg"), { sha: "b".repeat(40), text: "<svg/>" });
  assert.equal(runtime.textSource("logo.svg"), "<svg/>");
  // Text cached for another blob is not this draft's.
  runtime.state.opaqueText.set(draftKey(SCOPE, "logo.svg"), { sha: "c".repeat(40), text: "<svg>old</svg>" });
  assert.equal(runtime.textSource("logo.svg"), undefined);
  clean.put("", "key", "notes.txt", "notes");
  assert.equal(runtime.textSource("notes.txt"), "notes");
  assert.equal(runtime.source("notes.txt"), undefined);
});

test("the site's files are the branch's, less deletions, with new drafts", () => {
  const { runtime } = setup([draft("old.html", "", { deleted: true }), draft("new.html", "new", { baseSha: null }), draft("index.html", "edited")]);
  runtime.base.files = ["index.html", "old.html"];
  assert.deepEqual(runtime.files(), ["index.html", "new.html"]);
  assert.deepEqual(runtime.files(SCOPE, ["old.html", "about.html"]), ["about.html", "new.html"]);
  assert.deepEqual(runtime.newDraftPaths({}, SCOPE), ["new.html"]);
  assert.deepEqual(runtime.newDraftPaths({ kind: (path) => path.endsWith(".css") }, SCOPE), []);
  // No scope given: none, whatever the session shows.
  assert.deepEqual(runtime.newDraftPaths({}, undefined), []);
});

test("reset lets the whole site go and moves the load on", () => {
  const { runtime, calls } = setup();
  runtime.site = SITE;
  runtime.engaged = true;
  runtime.base.files = ["index.html"];
  runtime.base.sources.set("index.html", "home");
  runtime.state.componentStyles.set("site-card", "card.css");
  runtime.state.assets.set("logo.png", "data:");
  runtime.state.unreadable.set("big.css", "too big");
  runtime.state.textIndexed = true;
  const request = runtime.state.request;
  runtime.reset();
  assert.equal(runtime.site, undefined);
  assert.equal(runtime.engaged, false);
  assert.deepEqual(runtime.base.files, []);
  assert.equal(runtime.base.sources.size, 0);
  assert.equal(runtime.state.componentStyles.size + runtime.state.assets.size + runtime.state.unreadable.size, 0);
  assert.equal(runtime.state.textIndexed, false);
  assert.equal(runtime.state.request, request + 1);
  assert.deepEqual(calls, ["closed"]);
});

test("a save becomes GitHub's layer: saved texts and files in, removed ones out", () => {
  const { runtime, calls } = setup();
  runtime.site = SITE;
  runtime.engaged = true;
  runtime.base.files = ["index.html", "old.html", "kept.html"];
  runtime.base.sources.set("old.html", "old").set("kept.html", "kept");
  const result = { commit: "c", branch: "main", url: "", files: [], deleted: ["old.html"], unchanged: false } satisfies PublishResult;
  runtime.adoptSaved(SCOPE, result, [
    draft("index.html", "saved home"),
    draft("new.html", "new page", { baseSha: null }),
    draft("logo.png", "", { baseSha: null, opaque: true }),
    draft("old.html", "", { deleted: true }),
    // A deletion GitHub did not make stays.
    draft("kept.html", "", { deleted: true }),
  ]);
  assert.equal(runtime.base.sources.get("index.html"), "saved home");
  assert.equal(runtime.base.sources.get("new.html"), "new page");
  assert.equal(runtime.base.sources.has("logo.png"), false);
  assert.equal(runtime.base.sources.has("old.html"), false);
  assert.equal(runtime.base.sources.get("kept.html"), "kept");
  assert.deepEqual(runtime.base.files, ["index.html", "kept.html", "new.html", "logo.png"]);
  assert.deepEqual(calls, ["changed"]);
});

test("a save of another branch, or with no native site, leaves GitHub's layer", () => {
  const { runtime, calls } = setup();
  const result = { commit: "c", branch: "main", url: "", files: [], unchanged: false } satisfies PublishResult;
  runtime.adoptSaved(SCOPE, result, [draft("index.html", "saved")]);
  runtime.engaged = true;
  runtime.adoptSaved({ ...SCOPE, branch: "other" }, result, [draft("index.html", "saved")]);
  assert.equal(runtime.base.sources.size, 0);
  assert.deepEqual(calls, []);
});

test("a predicted read for the load on show is taken up, once", async () => {
  const { runtime, calls } = setup();
  const live = () => true;
  assert.equal(await runtime.readPredicted("o/site", ["styles/site.css"], live), true);
  assert.equal(runtime.base.sources.get("styles/site.css"), "text of styles/site.css");
  assert.equal(await runtime.readPredicted("o/site", ["styles/site.css"], live), false);
  assert.equal(runtime.state.shownRequests.size, 0);
  assert.deepEqual(calls, ["unreadable", "unreadable"]);
});

test("reset empties every per-site field and keeps the ones it leaves on purpose", () => {
  const { runtime } = setup();
  const { state } = runtime;
  state.opaqueText.set("k", { sha: SHA, text: "t" });
  state.componentStyles.set("site-card", "card.css");
  state.missingComponentStyles.add("site-gone");
  state.componentStyleRequests.add("site-card");
  state.styleFiles.add("site.css");
  state.missingStyleFiles.add("gone.css");
  state.styleFileRequests.add("site.css");
  state.unreadable.set("big.css", "too big");
  state.shownRequests.set("index.html", {});
  state.textIndexing = Promise.resolve(true);
  state.textIndexed = true;
  state.releaseTextIndex = () => {};
  state.assets.set("logo.png", "data:");
  state.missingAssets.add("gone.png");
  state.assetRequests.set("logo.png", 1);
  // Kept across a reset: a load's paint bookkeeping, the asset request counter, drafted-asset marks and the project's warnings.
  const waiter = { request: 1, run: () => {} };
  state.paintedRequest = 1;
  state.paintedPaths = ["index.html"];
  state.paintWaiters = [waiter];
  state.assetRequestId = 3;
  state.draftAssets.add("upload.png");
  state.projectWarnings = ["warned"];
  state.textIndexScope = "scope";
  const request = state.request;
  runtime.reset();
  const emptied = { opaqueText: state.opaqueText, componentStyles: state.componentStyles, missingComponentStyles: state.missingComponentStyles,
    componentStyleRequests: state.componentStyleRequests, styleFiles: state.styleFiles, missingStyleFiles: state.missingStyleFiles,
    styleFileRequests: state.styleFileRequests, unreadable: state.unreadable, shownRequests: state.shownRequests, assets: state.assets,
    missingAssets: state.missingAssets, assetRequests: state.assetRequests };
  for (const [name, held] of Object.entries(emptied)) assert.equal(held.size, 0, name);
  assert.equal(state.textIndexing, undefined);
  assert.equal(state.textIndexed, false);
  assert.equal(state.releaseTextIndex, undefined);
  assert.equal(state.request, request + 1);
  assert.deepEqual({ paintedRequest: state.paintedRequest, paintedPaths: state.paintedPaths, paintWaiters: state.paintWaiters, assetRequestId: state.assetRequestId,
    draftAssets: [...state.draftAssets], projectWarnings: state.projectWarnings, textIndexScope: state.textIndexScope },
  { paintedRequest: 1, paintedPaths: ["index.html"], paintWaiters: [waiter], assetRequestId: 3, draftAssets: ["upload.png"], projectWarnings: ["warned"], textIndexScope: "scope" });
  // Every field is classified above: one added later must be too.
  const classified = [...Object.keys(emptied), "textIndexing", "textIndexed", "releaseTextIndex", "request", "paintedRequest", "paintedPaths", "paintWaiters", "assetRequestId", "draftAssets", "projectWarnings", "textIndexScope"];
  assert.deepEqual(Object.keys(state).sort(), classified.sort());
});

test("a new load moves the load on and clears what the last one read, not the site's files", () => {
  const { runtime } = setup();
  runtime.base.files = ["index.html"];
  runtime.base.sources.set("index.html", "home");
  runtime.state.componentStyles.set("site-card", "card.css");
  runtime.state.shownRequests.set("index.html", {});
  runtime.state.assets.set("logo.png", "data:");
  runtime.state.unreadable.set("big.css", "too big");
  runtime.state.textIndexed = true;
  const request = runtime.state.request;
  assert.equal(runtime.begin(), request + 1);
  assert.equal(runtime.state.request, request + 1);
  assert.equal(runtime.state.textIndexed, false);
  runtime.clearReads();
  assert.equal(runtime.base.sources.size + runtime.state.componentStyles.size + runtime.state.shownRequests.size + runtime.state.assets.size, 0);
  assert.deepEqual(runtime.base.files, ["index.html"]);
  // Unreadable files are forgotten by the host, which tells the preview.
  assert.equal(runtime.state.unreadable.size, 1);
});

test("a predicted read left from an earlier load never unmarks the next load's read of the same path", async () => {
  const { runtime, hold } = setup();
  let landA!: (value: { texts: Map<string, string>; unreadable: [] }) => void, landB!: typeof landA;
  hold(new Promise((resolve) => { landA = resolve; }));
  const requestA = runtime.state.request;
  const readingA = runtime.readPredicted("o/site", ["styles/site.css"], () => runtime.state.request === requestA);
  await new Promise((resolve) => setTimeout(resolve, 0));
  runtime.reset();
  hold(new Promise((resolve) => { landB = resolve; }));
  const requestB = runtime.state.request;
  const readingB = runtime.readPredicted("o/site", ["styles/site.css"], () => runtime.state.request === requestB);
  await new Promise((resolve) => setTimeout(resolve, 0));
  landA({ texts: new Map([["styles/site.css", "old branch"]]), unreadable: [] });
  assert.equal(await readingA, false);
  assert.equal(runtime.state.shownRequests.has("styles/site.css"), true);
  landB({ texts: new Map([["styles/site.css", "new branch"]]), unreadable: [] });
  assert.equal(await readingB, true);
  assert.equal(runtime.state.shownRequests.has("styles/site.css"), false);
  assert.equal(runtime.base.sources.get("styles/site.css"), "new branch");
});

test("the shown paths are the page on show's, its components, the open file and its page styles", () => {
  const site = { routes: { "/": "index.html", "/about": "about/index.html" }, components: { "site-card": "components/site-card.html" } };
  const { runtime } = setup([], {}, { route: () => "/about", openFile: () => "styles/theme.css", pageStyles: () => ["styles/site.css"] });
  assert.deepEqual([...runtime.shownPaths()], []);
  runtime.site = site;
  runtime.base.files = ["index.html", "about/index.html", "components/site-card.html", "styles/site.css", "styles/theme.css"];
  runtime.base.sources.set("index.html", "<h1>Home</h1>").set("about/index.html", "<site-card></site-card>").set("components/site-card.html", "<p>Card</p>");
  const shown = runtime.shownPaths();
  for (const path of ["about/index.html", "components/site-card.html", "styles/site.css", "styles/theme.css"]) assert.equal(shown.has(path), true, path);
  assert.equal(shown.has("index.html"), false);
});

test("the site's sources read through a plan's reader when one is given", () => {
  const { runtime } = setup([draft("index.html", "drafted")], { "index.html": "typed" });
  runtime.base.sources.set("index.html", "base").set("components/site-card.html", "base card");
  const site = { routes: { "/": "index.html" }, components: { "site-card": "components/site-card.html" } };
  assert.deepEqual(runtime.sources(site, (path) => `r:${path}`), { "index.html": "r:index.html", "components/site-card.html": "r:components/site-card.html" });
  assert.deepEqual(runtime.sources(site), { "index.html": "typed", "components/site-card.html": "base card" });
  assert.deepEqual(runtime.sources(), {});
});

test("a save while the project is native but its site is not loaded becomes GitHub's layer without a preview update", () => {
  const { runtime, calls } = setup();
  runtime.engaged = true;
  const result = { commit: "c", branch: "main", url: "", files: [], unchanged: false } satisfies PublishResult;
  runtime.adoptSaved(SCOPE, result, [draft("index.html", "saved")]);
  assert.equal(runtime.base.sources.get("index.html"), "saved");
  assert.deepEqual(runtime.base.files, ["index.html"]);
  assert.deepEqual(calls, []);
});

test("reset lets the state go before the views that show the site close", () => {
  const seen: unknown[] = [];
  const { runtime } = setup([], {}, { closed: () => { seen.push({ site: runtime.site, engaged: runtime.engaged, files: runtime.base.files.length, sources: runtime.base.sources.size, request: runtime.state.request, assets: runtime.state.assets.size, unreadable: runtime.state.unreadable.size, opaqueText: runtime.state.opaqueText.size, textIndexing: runtime.state.textIndexing }); } });
  runtime.site = SITE;
  runtime.engaged = true;
  runtime.base.files = ["index.html"];
  runtime.base.sources.set("index.html", "home");
  runtime.state.assets.set("logo.png", "data:");
  runtime.state.unreadable.set("big.css", "too big");
  runtime.state.opaqueText.set("k", { sha: SHA, text: "t" });
  runtime.state.textIndexing = Promise.resolve(true);
  const request = runtime.state.request;
  runtime.reset();
  assert.deepEqual(seen, [{ site: undefined, engaged: false, files: 0, sources: 0, request: request + 1, assets: 0, unreadable: 0, opaqueText: 0, textIndexing: undefined }]);
});

test("a predicted read let go at any of its awaits asks GitHub for nothing more, writes nothing and leaves no path marked", async () => {
  const points = await forEachAwait((race) => {
    const asked: string[] = [];
    const { runtime } = setup([], {}, {
      find: race.port("find", async () => ({ sha: SHA })),
      readTexts: race.port("readTexts", async (_repo: string, files: { path: string; sha: string }[]) => {
        asked.push(...files.map((file) => file.path));
        return { texts: new Map(files.map((file) => [file.path, "old branch"])), unreadable: [] };
      }),
    });
    const request = runtime.state.request;
    return { runtime, asked, askedBefore: -1, done: runtime.readPredicted("o/site", ["styles/site.css"], () => runtime.state.request === request) };
  }, (run) => { run.askedBefore = run.asked.length; run.runtime.reset(); }, async ({ runtime, done, asked, askedBefore }) => {
    assert.equal(await done, false);
    assert.equal(asked.length, askedBefore);
    assert.equal(runtime.base.sources.has("styles/site.css"), false);
    assert.equal(runtime.state.shownRequests.size, 0);
  });
  assert.equal(points, 2);
});
test("a predicted read GitHub fails is left unread, quietly", async () => {
  for (const failing of ["find", "readTexts"] as const) {
    const { runtime, calls } = setup([], {}, failing === "find"
      ? { find: async () => { throw new Error("x"); } }
      : { readTexts: async () => { throw new Error("x"); } });
    runtime.base.sources.set("index.html", "home");
    assert.equal(await runtime.readPredicted("o/site", ["styles/site.css"], () => true), false, failing);
    assert.equal(runtime.state.shownRequests.size, 0, failing);
    assert.deepEqual([...runtime.base.sources.keys()], ["index.html"], failing);
    assert.deepEqual(calls, [], failing);
  }
});

test("a text draft of a file hides the wider index: a deletion has none, an edit is the draft's", () => {
  const { runtime, clean } = setup([draft("notes.txt", "kept", { deleted: true }), draft("data.json", "{\"drafted\":true}")]);
  clean.put("", "key", "notes.txt", "indexed notes");
  clean.put("", "key", "data.json", "{}");
  assert.equal(runtime.textSource("notes.txt"), undefined);
  assert.equal(runtime.textSource("data.json"), "{\"drafted\":true}");
});

test("a predicted read hands the files GitHub cannot give as text to the preview and writes none of them", async () => {
  const handed: unknown[] = [];
  const unreadable = [{ path: "styles/site.css", message: "binary" }];
  const { runtime } = setup([], {}, {
    readTexts: async () => ({ texts: new Map<string, string>(), unreadable }),
    unreadable: (files) => { handed.push(files); },
  });
  assert.equal(await runtime.readPredicted("o/site", ["styles/site.css"], () => true), false);
  assert.deepEqual(handed, [unreadable]);
  assert.equal(runtime.base.sources.has("styles/site.css"), false);
});

test("a save of an edited opaque file keeps its old text and lists it once", () => {
  const { runtime } = setup();
  runtime.site = SITE;
  runtime.engaged = true;
  runtime.base.files = ["index.html", "logo.svg"];
  runtime.base.sources.set("logo.svg", "<svg/>");
  const result = { commit: "c", branch: "main", url: "", files: [], unchanged: false } satisfies PublishResult;
  runtime.adoptSaved(SCOPE, result, [draft("logo.svg", "", { opaque: true })]);
  assert.equal(runtime.base.sources.get("logo.svg"), "<svg/>");
  assert.deepEqual(runtime.base.files, ["index.html", "logo.svg"]);
});
