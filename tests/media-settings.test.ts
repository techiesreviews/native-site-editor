import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_RECORDS_PATH, parseMediaRecords, serializeMediaRecords, type MediaRecords } from "../shared/media-records";
import {
  MEDIA_ADDING_CHOICES, MEDIA_ADDING_DEFAULTS, mediaAddingIsDefault, mediaAddingSettings, readMediaAddingSettings,
  resetMediaAddingSettings, setMediaAddingSettings,
} from "../src/page-builder/media-settings";
import { createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { createFilesAdding } from "../src/page-builder/media-files-adding-runs";
import type { MediaImageQuality } from "../src/page-builder/media-optimise";

const empty = (): MediaRecords => parseMediaRecords(undefined);
/** What the next read of the site's file sees. */
const roundTrip = (records: MediaRecords) => parseMediaRecords(serializeMediaRecords(records));

test("defaults: Balanced for every kind and Keep original off; nothing is written for them", () => {
  assert.deepEqual(MEDIA_ADDING_DEFAULTS, { image: "balanced", video: "balanced", audio: "balanced", keepOriginal: false });
  assert.deepEqual(mediaAddingSettings(undefined), MEDIA_ADDING_DEFAULTS);
  assert.deepEqual(mediaAddingSettings({}), MEDIA_ADDING_DEFAULTS);
  assert.equal(mediaAddingIsDefault(mediaAddingSettings(undefined)), true);
  // Choosing a default is not a change: the file keeps no adding section.
  const records = setMediaAddingSettings(empty(), { image: "balanced", video: "balanced", audio: "balanced", keepOriginal: false });
  assert.equal("adding" in records, false);
  assert.equal("adding" in JSON.parse(serializeMediaRecords(records)), false);
});

test("the choices: AVIF is for images only, Speech for audio only, PDFs and downloads have none", () => {
  const values = (kind: keyof typeof MEDIA_ADDING_CHOICES) => MEDIA_ADDING_CHOICES[kind].map(([value]) => value);
  const labels = (kind: keyof typeof MEDIA_ADDING_CHOICES) => MEDIA_ADDING_CHOICES[kind].map(([, label]) => label);
  assert.deepEqual(values("image"), ["smaller", "balanced", "higher", "smallest"]);
  assert.deepEqual(labels("image"), ["Smaller files", "Balanced", "Higher quality", "Smallest files (slower)"]);
  assert.deepEqual(values("video"), ["smaller", "balanced", "higher"]);
  assert.deepEqual(values("audio"), ["balanced", "higher", "speech"]);
  assert.deepEqual(Object.keys(MEDIA_ADDING_CHOICES), ["image", "video", "audio"]);
  assert.throws(() => setMediaAddingSettings(empty(), { video: "smallest" as never }), /not an adding choice for video/);
  assert.throws(() => setMediaAddingSettings(empty(), { audio: "smaller" as never }), /not an adding choice for audio/);
  assert.throws(() => setMediaAddingSettings(empty(), { image: "speech" as never }), /not an adding choice for image/);
  assert.throws(() => setMediaAddingSettings(empty(), { keepOriginal: "yes" as never }), /keepOriginal/);
});

test("changed choices are remembered in the site's records and read back", () => {
  const records = roundTrip(setMediaAddingSettings(empty(), { image: "smaller", keepOriginal: true }));
  assert.deepEqual(records.adding, { image: "smaller", keepOriginal: true });
  assert.deepEqual(mediaAddingSettings(records.adding), { ...MEDIA_ADDING_DEFAULTS, image: "smaller", keepOriginal: true });
  assert.equal(mediaAddingIsDefault(mediaAddingSettings(records.adding)), false);
  // Back to its default, a choice leaves the file; with nothing left, so does the section.
  const back = roundTrip(setMediaAddingSettings(records, { keepOriginal: false }));
  assert.deepEqual(back.adding, { image: "smaller" });
  assert.equal("adding" in roundTrip(setMediaAddingSettings(back, { image: "balanced" })), false);
});

test("quality is kept apart per kind", () => {
  let records = setMediaAddingSettings(empty(), { image: "smallest" });
  records = setMediaAddingSettings(records, { audio: "speech" });
  records = setMediaAddingSettings(records, { video: "higher" });
  assert.deepEqual(mediaAddingSettings(roundTrip(records).adding), { image: "smallest", video: "higher", audio: "speech", keepOriginal: false });
  // Changing one kind leaves the others alone.
  records = setMediaAddingSettings(records, { image: "higher" });
  assert.deepEqual(mediaAddingSettings(records.adding), { image: "higher", video: "higher", audio: "speech", keepOriginal: false });
});

test("reset to defaults forgets every choice and keeps what another editor wrote", () => {
  const records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: {}, adding: { image: "smaller", audio: "speech", keepOriginal: true, future: 1 }, other: true }));
  const reset = roundTrip(resetMediaAddingSettings(records));
  assert.deepEqual(reset.adding, { future: 1 });
  assert.deepEqual(mediaAddingSettings(reset.adding), MEDIA_ADDING_DEFAULTS);
  assert.equal(reset.other, true);
  assert.equal("adding" in resetMediaAddingSettings(empty()), false);
  // A change keeps the unknown key too.
  assert.deepEqual(setMediaAddingSettings(records, { video: "smaller" }).adding, { image: "smaller", audio: "speech", keepOriginal: true, future: 1, video: "smaller" });
});

test("each site reads its own choices; an unreadable file gives the defaults, a changed repository still refuses", async () => {
  const sites = new Map([
    ["one", serializeMediaRecords(setMediaAddingSettings(empty(), { image: "smaller" }))],
    ["two", serializeMediaRecords(setMediaAddingSettings(empty(), { image: "higher", keepOriginal: true }))],
    ["broken", "{"],
  ]);
  const reader = (site: string) => async (path: string) => path === MEDIA_RECORDS_PATH ? sites.get(site) : undefined;
  assert.equal((await readMediaAddingSettings(reader("one"))).image, "smaller");
  assert.deepEqual(await readMediaAddingSettings(reader("two")), { ...MEDIA_ADDING_DEFAULTS, image: "higher", keepOriginal: true });
  assert.deepEqual(await readMediaAddingSettings(reader("none")), MEDIA_ADDING_DEFAULTS);
  assert.deepEqual(await readMediaAddingSettings(reader("broken")), MEDIA_ADDING_DEFAULTS);
  await assert.rejects(readMediaAddingSettings(async () => { throw new Error("The repository changed."); }), /repository changed/);
});

function site(initial?: string) {
  const text = new Map<string, string>(initial === undefined ? [] : [[MEDIA_RECORDS_PATH, initial]]);
  const batches: MediaWorkspaceBatch[] = [];
  const context: MediaWorkspaceContext = {
    key: "owner/repo:main", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
    drafts: { get() { return undefined; }, save() { throw new Error("Legacy draft mutation"); }, remove() { throw new Error("Legacy draft mutation"); } },
    paths: [...text.keys()], items: [], pages: [], components: {}, repoSize: 512_000,
    assertLive() {}, async read(path) { return text.get(path); }, async blob() { return new Blob(); },
    assetVersion() { return undefined; }, async openPage() {},
    async applyBatch(batch) { batches.push(batch); for (const [path, value] of batch.edits) text.set(path, value); },
  };
  const workspace = createMediaWorkspace(async () => context);
  return { workspace, text, batches };
}

test("the workspace saves a change or a reset as one step and loads the choices with the repository size", async () => {
  const { workspace, text, batches } = site('{"images/a.png":{"alt":"A","tags":["hero"]}}');
  assert.equal((await workspace.load()).adding, undefined);
  await workspace.adding({ image: "smaller" });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].label, "Change adding settings");
  assert.deepEqual([...batches[0].edits.keys()], [MEDIA_RECORDS_PATH]);
  assert.equal(batches[0].expectedSources.get(MEDIA_RECORDS_PATH), '{"images/a.png":{"alt":"A","tags":["hero"]}}');
  const records = parseMediaRecords(text.get(MEDIA_RECORDS_PATH));
  assert.deepEqual(records.adding, { image: "smaller" });
  assert.equal(records.files["images/a.png"].description?.text, "A");
  const library = await workspace.load();
  assert.deepEqual(library.adding, { image: "smaller" });
  assert.equal(library.repoSize, 512_000);
  // The same choice again changes nothing, so no empty Undo step.
  await workspace.adding({ image: "smaller" });
  assert.equal(batches.length, 1);
  await workspace.adding("reset");
  assert.equal(batches.length, 2);
  assert.equal(batches[1].label, "Reset adding settings");
  assert.equal(parseMediaRecords(text.get(MEDIA_RECORDS_PATH)).adding, undefined);
  assert.equal((await workspace.load()).adding, undefined);
});

test("Files adding reads the site's image quality once per addition and prepares every file with it", async () => {
  const reads: string[] = [], used: (MediaImageQuality | undefined)[] = [];
  const runs = createFilesAdding({
    prepare: async (file, _key, folder, _signal, quality) => { used.push(quality); return { request: { file, folder } }; },
    settings: async ctx => { reads.push(ctx.key); return { image: "smaller", keepOriginal: false }; },
    save: async (_ctx, _context, requests) => requests.map(request => `${request.folder}/${request.file.name}`),
    paint: () => {},
  });
  const ctx = { key: "repo", assertLive() {} } as MediaWorkspaceContext;
  const added = await runs.start("media", [new File(["a"], "a.jpg"), new File(["b"], "b.jpg")], {
    context: async () => ctx, live: () => true, announce: () => {}, error: error => { throw error; },
  });
  assert.deepEqual(added, ["media/a.jpg", "media/b.jpg"]);
  assert.deepEqual(reads, ["repo"]);
  assert.deepEqual(used, ["smaller", "smaller"]);
});


test("agent adding changes and resets keep their own labels; unchanged settings create no batch", async () => {
  const { workspace, batches } = site();
  await workspace.load();
  await workspace.adding({ image: "balanced", keepOriginal: false }, true);
  await workspace.adding("reset", true);
  assert.equal(batches.length, 0);
  await workspace.adding({ image: "smaller" }, true);
  assert.equal(batches[0].label, "Agent changed adding settings");
  await workspace.adding({ image: "smaller" }, true);
  assert.equal(batches.length, 1);
  await workspace.adding("reset", true);
  assert.equal(batches[1].label, "Agent reset adding settings");
});
