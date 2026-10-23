// A background site (ticket 34, src/background-site.ts): the workspace an agent's page or file command
// arrived in, as the editor's controllers see it while another is shown. Its steps land as that
// workspace's drafts with their Undo parked for their own page; shown again before a step is written,
// the step stops and writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backgroundSite, type BackgroundSitePorts } from "../src/background-site";
import { createGuardedEdits, type PlanResult, type Reads } from "../src/guarded-edit";
import { createLazyFileOperationsController } from "../src/controllers/file-operation-checks";
import type { ParkedStep } from "../src/guarded-edit/parked";
import type { MediaPin } from "../src/controllers/media-controller";
import type { DraftScope, SavedDraft } from "../src/drafts";
import type { TreeEntry } from "../shared/types";
import { forEachAwait, type AwaitRace } from "./support/await-race";

const PAGE = "<main><h1>Home</h1></main>";
const scope: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const site = { routes: { "/": "index.html", "/about/": "about/index.html" }, components: {} };
const branch: Record<string, string> = { "index.html": PAGE, "about/index.html": "<main><h1>About</h1></main>", "robots.txt": "User-agent: *" };

function fixture(race?: AwaitRace) {
  let shown = false, visits = 0;
  const records = new Map<string, SavedDraft>(), parked: ParkedStep[] = [], forgotten: string[] = [];
  const store = {
    error: null, get: (_scope: DraftScope, path: string) => records.get(path), list: () => [...records.values()],
    save: (draft: SavedDraft) => { records.set(draft.path, draft); return true; }, remove: (_scope: DraftScope, path: string) => { records.delete(path); return true; },
  };
  const entry = (path: string): TreeEntry | undefined => Object.hasOwn(branch, path) ? { path, sha: `sha-${path}`, mode: "100644", type: "blob" } : undefined;
  const find = async (path: string) => entry(path);
  const pin = {
    repo: "lex/site", scope, identity: "1", site, drafts: store, here: () => shown, entry,
    find: race ? race.port("find", find) : find,
    source: (path: string) => { const draft = records.get(path); return draft ? draft.deleted ? undefined : draft.content : branch[path]; },
    files: () => [...new Set([...Object.keys(branch), ...records.keys()])].filter(path => !records.get(path)?.deleted),
    list: async () => Object.keys(branch), remember: () => {},
  } satisfies MediaPin;
  // eslint-disable-next-line no-restricted-syntax -- the background site reads only these members of the editor's live ports here.
  const ports = {
    pages: {}, files: { readFile: async (_repo: string, sha: string) => branch[sha.slice(4)], readFiles: async () => ({}), draftStore: () => store }, components: () => ({}), actions: () => ({}),
    store: () => store, forget: (_scope: DraftScope, path: string) => { forgotten.push(path); },
    prepareSources: () => ({ isCurrent: () => true, apply: () => true, undo: () => true, redo: () => true }),
    park: (step: ParkedStep) => { parked.push(step); }, visits: () => visits, factories: { createLazyFileOperationsController },
  } as unknown as BackgroundSitePorts;
  const bg = backgroundSite(pin, ports, "index.html");
  return { bg, edits: createGuardedEdits(bg.workspace), records, parked, forgotten, show: () => { shown = true; visits++; }, showAndLeave: () => { visits++; } };
}
const insertH2 = (r: Reads): PlanResult => ({ edits: new Map([["index.html", r.source("index.html")!.replace("</main>", "<h2>Agent</h2></main>")]]), done: "Heading added.", undone: "Undid adding the Heading." });

test("a background site reads its own workspace and has nothing mounted, opened or shown", () => {
  const { bg } = fixture();
  assert.equal(bg.home, "index.html");
  assert.equal(bg.workspace.draftScope(), scope);
  assert.equal(bg.workspace.source("index.html"), PAGE);
  assert.equal(bg.workspace.exists("about"), true, "a folder something is in");
  assert.equal(bg.workspace.exists("missing.html"), false);
  assert.equal(bg.workspace.openFile(), undefined);
  assert.equal(bg.workspace.mounted("index.html"), false);
  assert.equal(bg.workspace.recordHistory("index.html", () => true, () => true, () => {}), false);
});

test("a step in a background site lands as its drafts, its Undo parked for its page", async () => {
  const f = fixture();
  assert.deepEqual(await f.edits.run(insertH2, { finish: true, anchor: f.bg.home }), { ok: true, status: "applied" });
  assert.equal(f.records.get("index.html")?.content, "<main><h1>Home</h1><h2>Agent</h2></main>");
  assert.equal(f.records.get("index.html")?.baseSha, "sha-index.html");
  assert.deepEqual(f.parked.map(step => [step.page, step.beforeSources.get("index.html")]), [["index.html", PAGE]]);
  assert.deepEqual(f.forgotten, ["index.html"], "a model kept for it reads its drafts again");
});

test("a page moved in a background site lands at its new place, with its file read from the branch", async () => {
  const f = fixture();
  const move = (r: Reads): PlanResult => { r.source("about/index.html"); r.exists("team/index.html"); return { moves: [{ from: "about/index.html", to: "team/index.html" }], done: "Moved.", undone: "Moved back." }; };
  assert.deepEqual(await f.edits.run(move, { finish: true, anchor: "about/index.html" }), { ok: true, status: "applied" });
  assert.equal(f.records.get("about/index.html")?.deleted, true);
  assert.equal(f.records.get("team/index.html")?.content, branch["about/index.html"]);
  assert.deepEqual(f.parked.map(step => [step.page, step.home]), [["team/index.html", "about/index.html"]]);
});

// Async writers: its workspace shown again at any wait before the step is written stops it (the
// scope it held moved), so the editor runs it on show; nothing is written around the editor.
test("its workspace shown again at any wait of a step writes nothing", async () => {
  const count = await forEachAwait(race => {
    const f = fixture(race);
    return { f, done: f.edits.run(insertH2, { finish: true, anchor: f.bg.home }).then(outcome => { (f as { outcome?: unknown }).outcome = outcome; }) };
  }, run => { run.f.show(); }, run => {
    assert.equal((run.f as { outcome?: { ok: boolean } }).outcome?.ok, false);
    assert.equal(run.f.records.size, 0);
    assert.deepEqual(run.f.parked, []);
  });
  assert.ok(count >= 1);
});

// Shown and left again between two waits (its loads moved, `generation`): the step still stops.
test("its workspace shown and left again at any wait of a step writes nothing", async () => {
  await forEachAwait(race => {
    const f = fixture(race);
    return { f, done: f.edits.run(insertH2, { finish: true, anchor: f.bg.home }).then(outcome => { (f as { outcome?: unknown }).outcome = outcome; }) };
  }, run => { run.f.showAndLeave(); }, run => {
    assert.equal((run.f as { outcome?: { ok: boolean } }).outcome?.ok, false);
    assert.equal(run.f.records.size, 0);
    assert.deepEqual(run.f.parked, []);
  });
});
