import { MEDIA_RECORDS_PATH, parseMediaRecords, removeMediaRecords, serializeMediaRecords, setPictureLeftAsIs, type MediaRecords, type PictureLeftAsIs } from "../../shared/media-records";
import { startTags } from "../../shared/html-source";
import { improveImagesPlan, type ImproveImagesPlan, type ImproveImagesRow } from "./improve-images";
import { improveHeavy, type ImprovePorts } from "./improve-heavy";
import { improveGifsAndPlayers, type ConvertedGif, type ImproveGifsPlayersPorts, type PreparedOnlineVideo } from "./improve-gifs-players";
import { bringInOutsidePictures, type BringInOutsidePicturesInput, type OutsidePictureRead } from "./outside-pictures";
import { isMediaTextFile, mediaMentions } from "./media-mentions";
import type { MediaMeasured } from "./media-markup";
import { readPage } from "../native-source-location";
import { createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "./media-workspace";

type Facts = Parameters<typeof improveImagesPlan>[0]["files"];
/** Picture sizes the screen read from the bytes (the listing only knows file sizes). */
export type KnownSizes = Readonly<Record<string, { width?: number; height?: number }>>;
export type Measure = (file: string, node: number[], size: { width?: number; height?: number }) => Promise<MediaMeasured | undefined>;
/** Run-wide memory: an outside picture is read and brought in once, a GIF converted once, a player's still copied once. */
export interface ImproveRunMaps {
  brought: Map<string, string>; reads: Map<string, Promise<OutsidePictureRead>>;
  converted: Map<string, ConvertedGif>; videos: Map<string, PreparedOnlineVideo>;
}
export const runMaps = (): ImproveRunMaps => ({ brought: new Map(), reads: new Map(), converted: new Map(), videos: new Map() });
export interface LeftPicture { key: string; address: string; reason: string; note?: string }
/** One finished row: what its single save changed, so its own Undo can put it back later, in any order. */
export interface RowOutcome {
  file: string; label: string; changed: boolean;
  /** [path, text before, text after] of every text file the save changed. */
  texts: [string, string | undefined, string][];
  /** Files the save added (lighter files, copies, brought-in pictures, looping videos, the player). */
  added: string[];
  left: LeftPicture[]; notes: string[];
}
export interface ImproveRowRequest {
  row: string; known: KnownSizes; maps: ImproveRunMaps; signal: AbortSignal;
  /** Lex's own copies for pictures whose website is gone or does not allow it, by picture key. */
  own?: Map<string, File>;
  measure?: Measure; siteUrl?: string; fetch?: typeof fetch;
}

/** Test seams: the engines' encoders and page readers. */
export interface ImproveRowPorts { heavy?: ImprovePorts; gifs?: ImproveGifsPlayersPorts; prepare?: BringInOutsidePicturesInput["prepare"]; probe?: BringInOutsidePicturesInput["probe"] }
const cancelled = () => new DOMException("Improve images cancelled.", "AbortError");
const facts = (ctx: MediaWorkspaceContext, known: KnownSizes): Facts =>
  Object.fromEntries(ctx.items.map(item => [item.path, { size: item.size, ...known[item.path] }]));

async function readSources(ctx: MediaWorkspaceContext) {
  const sources: Record<string, string | undefined> = {};
  const files = [...new Set([...ctx.paths.filter(isMediaTextFile), MEDIA_RECORDS_PATH])];
  for (let index = 0; index < files.length; index += 12) {
    const read = await Promise.all(files.slice(index, index + 12).map(async path => [path, await ctx.read(path)] as const));
    ctx.assertLive();
    for (const [path, text] of read) sources[path] = text;
  }
  return sources;
}

async function readPlan(ctx: MediaWorkspaceContext, files: Facts) {
  const sources = await readSources(ctx);
  const records = parseMediaRecords(sources[MEDIA_RECORDS_PATH]);
  const plan = improveImagesPlan({ sources, pages: ctx.pages, components: ctx.components, files, records, site: { origins: ctx.origins ?? [] } });
  return { plan, sources, records };
}

/** A workspace over `real` whose saves are collected instead of made: the three engines run one
 * after another on what the earlier ones prepared, and the row is saved once (one Undo step). */
export function stagingContext(real: MediaWorkspaceContext) {
  const edits = new Map<string, string>(), added = new Map<string, Blob>(), versions = new Map<string, string>();
  const expectedSources = new Map<string, string | undefined>(), expectedAssets = new Map<string, string | undefined>();
  const lives: (() => boolean)[] = [];
  const staged = (path: string) => edits.has(path) || added.has(path);
  const ctx: MediaWorkspaceContext = {
    ...real,
    get paths() { return [...real.paths, ...added.keys()]; },
    get items() { return [...real.items, ...[...added].filter(([path]) => path.startsWith("media/")).map(([path, blob]) => ({ path, size: blob.size, draft: true }))]; },
    read: async path => edits.has(path) ? edits.get(path) : added.has(path) ? added.get(path)!.text() : real.read(path),
    blob: async path => added.get(path) ?? real.blob(path),
    assetVersion: path => versions.get(path) ?? real.assetVersion(path),
    async applyBatch(batch) {
      real.assertLive();
      if (batch.live && !batch.live()) throw cancelled();
      if (batch.moves.length || batch.deletes.length || batch.restores.length || batch.overwrites?.length) throw new Error("Improve images only adds files and changes pages.");
      // Proofs of what the real site held: later steps read the staged text, so only first sightings count.
      for (const [path, text] of batch.expectedSources) if (!staged(path) && !expectedSources.has(path)) expectedSources.set(path, text);
      for (const [path, version] of batch.expectedAssets) if (!staged(path) && !expectedAssets.has(path)) expectedAssets.set(path, version);
      for (const [path, text] of batch.edits) {
        if (added.has(path)) { added.set(path, new Blob([text], { type: added.get(path)!.type })); continue; }
        if (!edits.has(path) && !expectedSources.has(path)) { expectedSources.set(path, await real.read(path)); real.assertLive(); }
        edits.set(path, text);
      }
      for (const upload of batch.uploads) {
        if (real.paths.includes(upload.path) || added.has(upload.path)) throw new Error(`${upload.path} already exists.`);
        added.set(upload.path, upload.blob); versions.set(upload.path, `staged:${versions.size}`);
      }
      if (batch.live) lives.push(batch.live);
    },
  };
  return {
    ctx, edited: (path: string) => edits.has(path),
    changed: () => edits.size > 0 || added.size > 0,
    batch: (label: string): MediaWorkspaceBatch => ({
      label, expectedPaths: [...real.paths], expectedSources: new Map(expectedSources), expectedAssets: new Map(expectedAssets),
      edits: new Map(edits), moves: [], deletes: [], restores: [], uploads: [...added].map(([path, blob]) => ({ path, blob })),
      live: () => lives.every(live => live()),
    }),
    outcome: (): Pick<RowOutcome, "texts" | "added"> => ({
      texts: [...edits].map(([path, text]) => [path, expectedSources.get(path), text]), added: [...added.keys()],
    }),
  };
}

/** The same elements in the same order: node paths measured on the shown page still point at them. */
const sameShape = (a: string, b: string) => {
  const names = (text: string) => startTags(text).map(tag => tag.name).join(" ");
  return a === b || names(a) === names(b);
};
function nodeAt(source: string, start: number): number[] | undefined {
  const tree = readPage(source);
  const element = tree.elements().find(element => tree.range(element)?.tag.start === start);
  return element ? tree.path(element) : undefined;
}

/** One row: outside pictures, then heavy files and size details, then GIFs and players, each on
 * what the step before prepared; saved as one change labelled with the row. */
export async function improveRow(real: MediaWorkspaceContext, request: ImproveRowRequest, ports: ImproveRowPorts = {}): Promise<RowOutcome> {
  const live = () => !request.signal.aborted;
  const guard = () => { real.assertLive(); if (!live()) throw cancelled(); };
  const stage = stagingContext(real);
  const files = () => facts(stage.ctx, request.known);
  const { plan, sources, records } = await readPlan(stage.ctx, files());
  guard();
  const row = plan.rows.find(item => item.file === request.row);
  const outcome: RowOutcome = { file: request.row, label: row?.label ?? request.row, changed: false, texts: [], added: [], left: [], notes: [] };
  if (!row) return outcome;
  const wants = (...changes: string[]) => row.pictures.some(p => p.ticked && p.changes.some(change => changes.includes(change)));
  const original = sources[row.file] ?? "";
  // The shown page was painted from the saved text: measure only while the row's elements keep their places.
  const measure: Measure | undefined = request.measure && (async (file, node, size) => {
    const now = await stage.ctx.read(file);
    return now !== undefined && sameShape(original, now) ? request.measure!(file, node, size) : undefined;
  });
  const maps = { brought: new Map(request.maps.brought), converted: new Map(request.maps.converted), videos: new Map(request.maps.videos) };
  if (wants("bring-in")) {
    const result = await bringInOutsidePictures({
      row, source: original, records, paths: stage.ctx.paths, workspace: createMediaWorkspace(async () => stage.ctx),
      assertLive: () => stage.ctx.assertLive(), live, brought: maps.brought, cache: request.maps.reads, own: request.own,
      by: "lex", siteUrl: request.siteUrl, signal: request.signal, fetch: request.fetch, prepare: ports.prepare, probe: ports.probe,
      measure: measure && (async (picture, size) => { const node = nodeAt(original, picture.tag.start); return node && measure(row.file, node, size); }),
    });
    outcome.left.push(...result.left); outcome.notes.push(...result.notes);
    guard();
  }
  if (wants("lighten", "copies", "size", "sizes", "loading")) {
    const result = await improveHeavy(stage.ctx, { row: row.file, files: files(), measure, live, signal: request.signal, siteUrl: request.siteUrl }, ports.heavy);
    outcome.notes.push(...result.notes);
    guard();
  }
  if (wants("loop", "first-frame", "player")) {
    const result = await improveGifsAndPlayers(stage.ctx, { row: row.file, files: files(), by: "lex", fetch: request.fetch, siteUrl: request.siteUrl,
      converted: maps.converted, videos: maps.videos, live, signal: request.signal }, ports.gifs);
    outcome.left.push(...result.left); outcome.notes.push(...result.notes);
    guard();
  }
  if (!stage.changed()) return outcome;
  await real.applyBatch(stage.batch(`Improve images: ${row.label}`));
  // Saved: what this row brought in and converted is now the run's to reuse.
  for (const key of ["brought", "converted", "videos"] as const) for (const [k, v] of maps[key]) (request.maps[key] as Map<string, unknown>).set(k, v);
  return { ...outcome, changed: true, ...stage.outcome() };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const plain = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
/** Puts back what one change made, field by field: a field changed again since keeps its newer value. */
export function revertJson(before: Json | undefined, after: Json | undefined, now: Json | undefined): Json | undefined {
  if (same(now, after)) return before;
  if (!plain(before) || !plain(after) || !plain(now)) return now;
  const out: Record<string, Json> = {};
  for (const key of new Set([...Object.keys(now), ...Object.keys(before), ...Object.keys(after)])) {
    const value = revertJson(before[key], after[key], now[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Undo for rows of a run, in any order: their pages go back to the text before, records field by
 * field, and the files they added go once nothing mentions them. One change (Undo all: one too).
 * `kept`: files an earlier Undo kept because a row not undone still used them; they are checked
 * again. Returns the files kept this time, for the next Undo. */
export async function undoRows(real: MediaWorkspaceContext, outcomes: readonly RowOutcome[], kept: readonly string[] = []): Promise<string[]> {
  const texts = new Map<string, string | undefined>();
  const batch: MediaWorkspaceBatch = { label: outcomes.length === 1 ? `Undo Improve images: ${outcomes[0].label}` : "Undo Improve images",
    expectedPaths: [...real.paths], expectedSources: new Map(), expectedAssets: new Map(), edits: new Map(), moves: [], deletes: [], restores: [], uploads: [] };
  const current = async (path: string) => {
    if (!texts.has(path)) { const text = await real.read(path); real.assertLive(); texts.set(path, text); batch.expectedSources.set(path, text); }
    return texts.get(path);
  };
  for (const outcome of [...outcomes].reverse()) for (const [path, before, after] of outcome.texts) {
    const now = await current(path);
    if (path === MEDIA_RECORDS_PATH) {
      const parse = (text: string | undefined) => JSON.parse(serializeMediaRecords(parseMediaRecords(text))) as Json;
      texts.set(path, serializeMediaRecords(revertJson(parse(before), parse(after), parse(now)) as unknown as MediaRecords));
    } else if (now === after) texts.set(path, before);
    else throw new Error(`${path} was edited after Improve images changed it. Undo it there with Ctrl+Z, or edit it by hand.`);
  }
  const sources = await readSources(real);
  for (const [path, text] of texts) sources[path] = text;
  const added = [...new Set([...outcomes.flatMap(outcome => outcome.added), ...kept])].filter(path => real.paths.includes(path));
  const mentioned = mediaMentions({ media: added, sources, site: { origins: real.origins ?? [] } });
  batch.deletes = added.filter(path => !mentioned.get(path)?.some(mention => mention.file !== path));
  for (const path of batch.deletes) batch.expectedAssets.set(path, real.assetVersion(path));
  if (batch.deletes.length && real.paths.includes(MEDIA_RECORDS_PATH)) await current(MEDIA_RECORDS_PATH);
  if (texts.has(MEDIA_RECORDS_PATH)) {
    // An added file a later row still uses keeps its record; removed ones lose theirs.
    const now = parseMediaRecords(batch.expectedSources.get(MEDIA_RECORDS_PATH)), next = parseMediaRecords(texts.get(MEDIA_RECORDS_PATH));
    for (const path of added) if (!batch.deletes.includes(path) && now.files[path]) next.files[path] = now.files[path];
    texts.set(MEDIA_RECORDS_PATH, serializeMediaRecords(removeMediaRecords(next, batch.deletes)));
  }
  for (const [path, text] of texts) if (text !== undefined && text !== batch.expectedSources.get(path)) batch.edits.set(path, text);
  if (batch.edits.size || batch.deletes.length) await real.applyBatch(batch);
  return added.filter(path => !batch.deletes.includes(path));
}

/** What the Improve images screen asks of the workspace; each call reads the site afresh. */
export function improveImagesSession(context: () => Promise<MediaWorkspaceContext>) {
  return {
    async plan(known: KnownSizes): Promise<ImproveImagesPlan> {
      const ctx = await context();
      return (await readPlan(ctx, facts(ctx, known))).plan;
    },
    async row(request: ImproveRowRequest) { return improveRow(await context(), request); },
    async undo(outcomes: readonly RowOutcome[], kept?: readonly string[]) { return undoRows(await context(), outcomes, kept); },
    /** Untick (left as is) or tick a picture again; remembered in the site's records. */
    async leftAsIs(item: PictureLeftAsIs, on: boolean) {
      const ctx = await context();
      const text = await ctx.read(MEDIA_RECORDS_PATH);
      ctx.assertLive();
      // Ticking again also lifts an "everywhere" entry: the picture is improved here as Lex asked.
      const records = parseMediaRecords(text);
      const next = on ? setPictureLeftAsIs(records, item, true) : setPictureLeftAsIs(setPictureLeftAsIs(records, item, false), { picture: item.picture }, false);
      if (next === records) return;
      await ctx.applyBatch({ label: on ? "Leave a picture as it is" : "Improve a picture again", expectedPaths: [...ctx.paths],
        expectedSources: new Map([[MEDIA_RECORDS_PATH, text]]), expectedAssets: new Map(),
        edits: new Map([[MEDIA_RECORDS_PATH, serializeMediaRecords(next)]]), moves: [], deletes: [], restores: [], uploads: [] });
    },
  };
}
export type ImproveImagesSession = ReturnType<typeof improveImagesSession>;
export type { ImproveImagesPlan, ImproveImagesRow };
