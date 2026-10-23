import { test } from "node:test";
import assert from "node:assert/strict";
import { createFilesAdding, type FilesAddingDeps, type FilesAddingHost } from "../src/page-builder/media-files-adding-runs";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { forEachAwait, type AwaitRace } from "./support/await-race";

// Ticket 23: a drop holds the context of the repository it was made in (src/main.ts uploadFilesTo
// pins it); a switch at any wait stops nothing, and every save goes there, never to the one shown.
const contextOf = (repo: string) => ({
  key: `${repo}/main`, scope: { account: "a", repoId: repo === "old" ? 1 : 2, repo: `a/${repo}`, branch: "main" },
  drafts: { get: () => undefined, save: () => true, remove: () => true },
  paths: [], items: [], pages: [], components: {}, history: false, assertLive: () => {},
  read: async () => undefined, blob: async () => new Blob(), assetVersion: () => undefined,
  applyBatch: async () => {}, openPage: async () => {},
}) satisfies MediaWorkspaceContext;

function scenario(race: AwaitRace) {
  const state = { shown: "old", saves: [] as string[][], savedInto: [] as string[], announced: [] as string[], errors: [] as string[] };
  const pinned = contextOf("old");
  const deps = {
    settings: race.port("settings", async () => ({ image: "balanced" as const, keepOriginal: false })),
    prepare: race.port("prepare", async (file, _key, folder) => ({ request: { file, folder } })),
    // This port commits synchronously, then returns its receipt asynchronously, like an atomic save.
    save: race.port("save", async (context, _context, requests) => {
      const paths = requests.map(request => `${request.folder}/${request.file.name}`);
      state.saves.push(paths);
      state.savedInto.push(context.key);
      return paths;
    }),
    paint() {},
  } satisfies FilesAddingDeps;
  const host = {
    context: race.port("context", async () => pinned),
    announce: text => { state.announced.push(text); },
    error: (error: unknown) => { state.errors.push((error as Error).message); },
  } satisfies FilesAddingHost;
  const runs = createFilesAdding(deps);
  const done = runs.start("docs", [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")], host).then(paths => {
    assert.deepEqual(paths, ["docs/a.pdf", "docs/b.pdf"]);
  });
  return { state, runs, done };
}

test("Files adding switched at any async port saves into the repository it was dropped in", async () => {
  const count = await forEachAwait(scenario, run => { run.state.shown = "new"; }, run => {
    assert.deepEqual(run.state.saves, [["docs/a.pdf", "docs/b.pdf"]]);
    assert.deepEqual(run.state.savedInto, ["old/main"]);
    assert.deepEqual(run.state.errors, []);
  });
  assert.equal(count, 5); // context, settings, two prepares, save.
});

test("Files adding switched at any async port finishes its summary: every file added, said once", async () => {
  await forEachAwait(scenario, run => { run.state.shown = "new"; }, run => {
    assert.deepEqual(run.state.announced, ["Added docs/a.pdf, docs/b.pdf."]);
    assert.ok(run.runs.entries().every(entry => entry.state === "added"));
  });
});

test("a save that fails after a switch keeps its files for Retry with the reason", async () => {
  let release!: (error: Error) => void, saving!: () => void;
  const saveStarted = new Promise<void>(resolve => { saving = resolve; });
  const announced: string[] = [], errors: string[] = [];
  const runs = createFilesAdding({
    prepare: async (file, _key, folder) => ({ request: { file, folder } }),
    save: () => new Promise((_resolve, reject) => { release = reject; saving(); }),
    paint() {},
  });
  const done = runs.start("docs", [new File(["a"], "a.pdf")], {
    context: async () => contextOf("old"),
    announce: text => { announced.push(text); }, error: error => { errors.push((error as Error).message); },
  });
  await saveStarted;
  release(new Error("images/a.pdf already exists."));
  assert.deepEqual(await done, []);
  assert.deepEqual(announced, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(runs.entries().map(entry => `${entry.state}:${entry.error}`), ["failed:images/a.pdf already exists."]);
});
