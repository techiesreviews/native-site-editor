// A background site (ticket 34, src/background-site.ts): the workspace an agent's page or file command
// arrived in, as the editor's controllers see it while another is shown. Its steps land as that
// workspace's drafts with their Undo parked for their own page; shown again before a step is written,
// the step stops and writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backgroundSite } from "../src/background-site";
import { backgroundSitePorts } from "./fakes/background-site-ports";
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
const branch: Record<string, string> = { "index.html": PAGE, "about/index.html": "<html><head><title>About us</title></head><body><main><h1>About</h1><img src=\"https://pinned.example/images/a.png\"></main></body></html>",
  "robots.txt": "User-agent: *", ".editor/config.json": JSON.stringify({ site: { url: "https://pinned.example" } }), "images/a.png": "png" };

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
  const ports = backgroundSitePorts({ store, readFile: async (_repo, sha) => branch[sha.slice(4)], park: step => { parked.push(step); }, visits: () => visits,
    forget: (_scope, path) => { forgotten.push(path); },
    // The editor's live ports read the site shown: another site's address and titles.
    pages: { routeInfo: () => ({ title: "Shown site" }), titles: () => ({}) },
    files: { origins: () => ["https://shown.example"], parentOf: path => path.slice(0, Math.max(0, path.lastIndexOf("/"))) } });
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
    const run: { f: typeof f; outcome?: { ok: boolean }; done: Promise<void> } = { f, done: Promise.resolve() };
    run.done = f.edits.run(insertH2, { finish: true, anchor: f.bg.home }).then(outcome => { run.outcome = outcome; });
    return run;
  }, run => { run.f.show(); }, run => {
    assert.equal(run.outcome?.ok, false);
    assert.equal(run.f.records.size, 0);
    assert.deepEqual(run.f.parked, []);
  });
  assert.ok(count >= 1);
});

// Shown and left again between two waits (its loads moved, `generation`): the step still stops.
test("its workspace shown and left again at any wait of a step writes nothing", async () => {
  await forEachAwait(race => {
    const f = fixture(race);
    const run: { f: typeof f; outcome?: { ok: boolean }; done: Promise<void> } = { f, done: Promise.resolve() };
    run.done = f.edits.run(insertH2, { finish: true, anchor: f.bg.home }).then(outcome => { run.outcome = outcome; });
    return run;
  }, run => { run.f.showAndLeave(); }, run => {
    assert.equal(run.outcome?.ok, false);
    assert.equal(run.f.records.size, 0);
    assert.deepEqual(run.f.parked, []);
  });
});

// Its own site, not the one shown: its address for a picture's full-URL links, its pages' titles.
test("a background site reads its own site's address and page titles, not the site shown", async () => {
  const { bg } = fixture();
  assert.deepEqual(bg.files.origins?.(), ["https://pinned.example"]);
  assert.deepEqual(bg.pages.routeInfo("/about/", site), { title: "About us" });
  assert.equal(bg.pages.titles(site)["/about/"], "About us");
});

test("delete_file in a background site refuses a picture its own pages link by their site's full address", async () => {
  const f = fixture();
  const files = createLazyFileOperationsController({ ...f.bg.files, edits: f.edits,
    confirmDialog: () => ({ ask: async () => true, choose: async question => ({ value: question.actions.at(-1)?.value, option: false }) }) }, () => import("../src/controllers/file-operations-controller"));
  const refused = await files.deleteFileTarget({ path: "images/a.png", name: "a.png", folder: false }, undefined, true);
  assert.match(String(refused), /images\/a\.png is used by about\/index\.html/);
  assert.equal(f.records.size, 0);
});
