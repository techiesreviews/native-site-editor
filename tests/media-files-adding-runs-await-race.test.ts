import { test } from "node:test";
import assert from "node:assert/strict";
import { createFilesAdding, type FilesAddingDeps, type FilesAddingHost } from "../src/page-builder/media-files-adding-runs";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { forEachAwait, type AwaitRace } from "./support/await-race";

function scenario(race: AwaitRace) {
  const state = { live: true, saves: [] as string[][], staleWrites: [] as string[], errors: [] as string[] };
  const changed = "The repository or branch changed while adding files. Nothing was added.";
  const assertLive = () => { if (!state.live) throw new Error(changed); };
  const ctx = {
    key: "old/main", scope: { account: "a", repoId: 1, repo: "a/old", branch: "main" },
    drafts: { get: () => undefined, save: () => true, remove: () => true },
    paths: [], items: [], pages: [], components: {}, history: false, assertLive,
    read: async () => undefined, blob: async () => new Blob(), assetVersion: () => undefined,
    applyBatch: async () => {}, openPage: async () => {},
  } satisfies MediaWorkspaceContext;
  const deps = {
    settings: race.port("settings", async () => ({ image: "balanced" as const, keepOriginal: false })),
    prepare: race.port("prepare", async (file, _key, folder) => ({ request: { file, folder } })),
    // This port commits synchronously, then returns its receipt asynchronously, like an atomic save.
    save: race.port("save", async (context, _context, requests) => {
      if (!state.live) state.staleWrites.push("save");
      context.assertLive();
      const paths = requests.map(request => `${request.folder}/${request.file.name}`);
      state.saves.push(paths);
      return paths;
    }),
    paint() {},
  } satisfies FilesAddingDeps;
  const host = {
    context: race.port("context", async () => { assertLive(); return ctx; }),
    live: () => state.live,
    announce: () => { if (!state.live) state.staleWrites.push("announce added files"); },
    error: (error: unknown) => { state.errors.push((error as Error).message); },
  } satisfies FilesAddingHost;
  const runs = createFilesAdding(deps);
  const done = runs.start("docs", [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")], host).then(paths => {
    if (state.live) {
      assert.deepEqual(paths, ["docs/a.pdf", "docs/b.pdf"]);
      assert.deepEqual(state.saves, [["docs/a.pdf", "docs/b.pdf"]]);
      assert.deepEqual(state.errors, []);
    }
  });
  return { state, runs, done };
}

test("Files adding never saves to the old repository when switched at any async port", async () => {
  const count = await forEachAwait(scenario, run => { run.state.live = false; }, run => {
    assert.ok(!run.state.staleWrites.includes("save"));
    // A save already committed before suspension may survive; no later save may start.
    if (run.state.errors.length) assert.deepEqual(run.state.saves, []);
  });
  assert.equal(count, 5); // context, settings, two prepares, save.
});

test("Files adding does not publish an old repository's completed summary", async () => {
  await forEachAwait(scenario, run => { run.state.live = false; }, run => {
    assert.deepEqual(run.state.staleWrites, []);
    assert.ok(run.runs.entries().every(entry => entry.state !== "added"));
  });
});

test("a save that fails after a switch reports its reason once and marks nothing added", async () => {
  let live = true, release!: (error: Error) => void, saving!: () => void;
  const saveStarted = new Promise<void>(resolve => { saving = resolve; });
  const announced: string[] = [], errors: string[] = [];
  const ctx = {
    key: "old/main", scope: { account: "a", repoId: 1, repo: "a/old", branch: "main" },
    drafts: { get: () => undefined, save: () => true, remove: () => true },
    paths: [], items: [], pages: [], components: {}, history: false, assertLive: () => {},
    read: async () => undefined, blob: async () => new Blob(), assetVersion: () => undefined,
    applyBatch: async () => {}, openPage: async () => {},
  } satisfies MediaWorkspaceContext;
  const runs = createFilesAdding({
    prepare: async (file, _key, folder) => ({ request: { file, folder } }),
    save: () => new Promise((_resolve, reject) => { release = reject; saving(); }),
    paint() {},
  });
  const done = runs.start("docs", [new File(["a"], "a.pdf")], {
    context: async () => ctx, live: () => live,
    announce: text => { announced.push(text); }, error: error => { errors.push((error as Error).message); },
  });
  await saveStarted;
  live = false;
  release(new Error("The repository changed while adding files. Nothing was added."));
  assert.deepEqual(await done, []);
  assert.deepEqual(announced, []);
  assert.deepEqual(errors, ["The repository changed while adding files. Nothing was added."]);
  assert.deepEqual(runs.additions(), []);
});
