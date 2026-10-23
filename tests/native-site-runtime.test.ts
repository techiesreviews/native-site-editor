import { test } from "node:test";
import assert from "node:assert/strict";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { draftKey, type DraftScope, type SavedDraft } from "../src/drafts.ts";
import { createNativeSiteRuntime, type NativeSiteRuntimePorts } from "../src/native-site-runtime.ts";
import type { WorkspaceScope } from "../src/workspace-session.ts";
import type { PublishResult } from "../shared/types.ts";

const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const SHOWN = { kind: "github", ...SCOPE } satisfies WorkspaceScope;
const SHA = "a".repeat(40);
const SITE = { routes: { "/": "index.html" }, components: {} };

function draft(path: string, content: string, fields: Partial<SavedDraft> = {}): SavedDraft {
  return { ...SCOPE, version: 1, path, baseSha: SHA, original: "", content, updatedAt: 0, ...fields };
}

// A runtime over one scope's drafts, with what the ports were asked recorded.
function setup(drafts: SavedDraft[] = [], mounted: Record<string, string> = {}) {
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
  clean.put("", "key", "notes.txt", "notes");
  assert.equal(runtime.textSource("notes.txt"), "notes");
  assert.equal(runtime.source("notes.txt"), undefined);
});

test("the site's files are the branch's, less deletions, with new drafts", () => {
  const { runtime } = setup([draft("old.html", "", { deleted: true }), draft("new.html", "new", { baseSha: null }), draft("index.html", "edited")]);
  runtime.base.files = ["index.html", "old.html"];
  assert.deepEqual(runtime.files(), ["index.html", "new.html"]);
  assert.deepEqual(runtime.files(SCOPE, ["old.html", "about.html"]), ["about.html", "new.html"]);
  assert.deepEqual(runtime.newDraftPaths(), ["new.html"]);
  assert.deepEqual(runtime.newDraftPaths({ kind: (path) => path.endsWith(".css") }), []);
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

test("a predicted read that lands after the site was let go writes nothing", async () => {
  const { runtime, hold } = setup();
  let land!: (value: { texts: Map<string, string>; unreadable: [] }) => void;
  hold(new Promise((resolve) => { land = resolve; }));
  const request = runtime.state.request;
  const reading = runtime.readPredicted("o/site", ["styles/site.css"], () => runtime.state.request === request);
  assert.equal(runtime.state.shownRequests.has("styles/site.css"), true);
  // Its files are found and their texts asked for; the next load starts, then the old branch's text arrives.
  await new Promise((resolve) => setTimeout(resolve, 0));
  runtime.reset();
  land({ texts: new Map([["styles/site.css", "old branch"]]), unreadable: [] });
  assert.equal(await reading, false);
  assert.equal(runtime.base.sources.has("styles/site.css"), false);
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
