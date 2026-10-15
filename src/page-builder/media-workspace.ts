import { onGithubPages } from "../../shared/github-pages";
import { sitePathPrefix } from "../../shared/site-path-prefix";
import { readMediaPrefix } from "./media-prefix";
import { NATIVE_CONFIG_PATH, nativeSiteSettings, nativeSitePrefix } from "../../shared/native-project";
import { mediaAddedTime, mediaKind } from "./media-library-filter";
import { OUTSIDE_MEDIA_REFUSED, parseOutlineId } from "../../shared/agent";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { locateNativeElementRange } from "../native-source-location";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import type { MediaOptimiseResult } from "./media-optimise";
import type { MediaPickerHost } from "./media-picker";
import { readSiteMediaRecords, createMediaCollection, addToMediaCollection, takeOutOfMediaCollection, renameMediaCollection, deleteMediaCollection } from "./media-collections";
import { pageUsesFile, strandsAgentWords, setMediaPlaceDecorative, confirmMediaDescription, descriptionPlaceEdits, mediaToCheck, placeWordsEdits, setMediaPlaceAgentText } from "./media-descriptions";
import { isMediaTextFile, mediaMentions } from "./media-mentions";
import { gitBlobSha, type UploadBytes, uploadImageType, uploadProblem } from "../uploads";
import type { DraftScope } from "../drafts";
import type { DraftAccess } from "../file-changes";
import { setMediaDescription, MEDIA_RECORDS_PATH, serializeMediaRecords, type MediaRecords, type OnlineVideoRecord, type MediaTrim } from "../../shared/media-records";
import { applyMediaMetadata, mediaMetadataView, type MediaMetadata } from "./media-metadata";
import { alwaysKeptFiles, mediaFamilies, mediaFamilyOf, familyMembers } from "./media-families";
import { mediaEscape } from "./media-markup";
import { writePlayerFiles } from "./player-markup";
import { planMediaRename, tidyMediaName, MediaNameTakenError } from "./media-rename";
import { mediaOriginalPath, mediaOriginalProblem } from "./media-originals";
import { mediaStorageName, mediaCopyName, chooseMediaPath } from "./media-storage";
import { mediaUsageIndex, rewriteMediaReferences } from "./media-references";
import type { MediaPlacement, MediaImportRequest, MediaLibraryItem } from "./media-picker";
import { resetMediaAddingSettings, setMediaAddingSettings } from "./media-settings";
import { planRestore, pruneRemoved, recentlyRemoved, recordRemoval, removedPaths, sweepRemovedCopies } from "./recently-removed";

/** Prepared mutations only. The host validates and commits this entire batch atomically. */
export interface MediaWorkspaceBatch {
  label: string;
  expectedPaths: string[];
  expectedSources: Map<string, string | undefined>;
  expectedAssets: Map<string, string | undefined>;
  edits: Map<string, string>;
  moves: { from: string; to: string }[];
  deletes: string[];
  restores: { path: string; sha: string }[];
  uploads: { path: string; blob: Blob }[];
  /** Explicit replacements of existing files; each requires a captured asset revision. */
  overwrites?: string[];
  /** Whether the batch is still wanted (a picker's Use not cancelled); checked again just before commit. */
  live?: () => boolean;
}
export interface MediaBatchTransaction<State> {
  assertLive(): void;
  paths(): string[];
  source(path: string): string | undefined;
  assetVersion(path: string): string | undefined;
  snapshot(batch: MediaWorkspaceBatch): Promise<State>;
  stage(batch: MediaWorkspaceBatch, state: State): Promise<void>;
  /** Synchronous draft/source/path mutation and one Undo registration. No awaits here. */
  commit(batch: MediaWorkspaceBatch, state: State): void;
  /** Restore the origin scope. Remove only newly owned, unreferenced upload bytes. */
  rollback(batch: MediaWorkspaceBatch, state: State): Promise<void>;
}

/** Guard again after every asynchronous preparation, immediately before synchronous commit. */
export async function applyMediaWorkspaceBatch<State>(batch: MediaWorkspaceBatch, host: MediaBatchTransaction<State>): Promise<void> {
  const guard = () => {
    host.assertLive();
    if (batch.live && !batch.live()) throw new Error("Cancelled before the change was saved. Nothing was placed.");
    if (JSON.stringify([...host.paths()].sort()) !== JSON.stringify([...batch.expectedPaths].sort())) throw new Error("Repository files changed while preparing image changes. Refresh and try again.");
    for (const [path, source] of batch.expectedSources) if (host.source(path) !== source) throw new Error(`${path} changed while preparing image changes. No image changes were applied.`);
    for (const [path, version] of batch.expectedAssets) if (host.assetVersion(path) !== version) throw new Error(`${path} changed while preparing image changes. No image changes were applied.`);
  };
  guard();
  const state = await host.snapshot(batch);
  try {
    guard();
    await host.stage(batch, state);
    guard();
    host.commit(batch, state);
  } catch (error) {
    await host.rollback(batch, state);
    throw error;
  }
}
export interface MediaWorkspaceContext {
  key: string; scope: DraftScope; drafts: DraftAccess; paths: string[]; items: MediaLibraryItem[];
  pages: string[]; components: Record<string, string>; origins?: string[];
  /** The repository's size in KiB (GitHub); absent for local folders. */
  repoSize?: number;
  /** Repository history to restore removed files from (GitHub); without it, Recently removed keeps a browser copy. */
  history: boolean;
  /** Browser copies for Recently removed, kept 30 days. */
  removedCopies?: UploadBytes;
  /** Clock for Recently removed dates (tests). */
  now?: () => number;
  assertLive(): void;
  read(path: string): Promise<string | undefined>;
  blob(path: string): Promise<Blob>;
  /** A blob's bytes from the repository's history by its SHA (Recently removed's pictures). */
  historyBlob?(sha: string, path: string): Promise<Blob>;
  /** Effective binary revision: branch SHA or draft SHA plus its change state. */
  assetVersion(path: string): string | undefined;
  applyBatch(batch: MediaWorkspaceBatch): Promise<void>;
  openPage(path: string): Promise<void>;
}

// The site's prefix as `prepare` captured it through the batch's reader (media-prefix.ts).
const batchPrefix = (batch: MediaWorkspaceBatch) => nativeSitePrefix(batch.expectedSources.get(NATIVE_CONFIG_PATH));

function wideUsage(paths: string[], text: Record<string, string>, ctx: MediaWorkspaceContext, prefix: string) {
  const site = { prefix, origins: ctx.origins ?? [] };
  const usage = mediaUsageIndex(paths, text, ctx.pages, ctx.components, site);
  for (const [path, mentions] of mediaMentions({ media: paths, sources: text, site })) for (const { file } of mentions) if (!usage[path].files.includes(file)) usage[path].files.push(file);
  return usage;
}

export interface MediaReplaceRequest {
  path: string;
  result: MediaOptimiseResult;
  original?: { blob: Blob; extension: string };
  keepOldAddress?: boolean;
  notice?: (text: string) => void;
  live?: () => boolean;
}

export interface MediaTrimRequest {
  source: string; trim: MediaTrim; previous?: string; result: MediaOptimiseResult;
  /** The source's revision (`assetVersion`) captured before its bytes were read for `result`. */
  sourceVersion: string | undefined;
  place: {
    path: string; source: string; stale?: string; live?: () => boolean;
    records?: { text: string | undefined };
    expectedSources?: Map<string, string | undefined>;
    apply(path: string, records: MediaRecords): { page: string; records?: MediaRecords };
  };
}

export interface MediaShareRequest {
  source: string; sourceVersion: string | undefined; result: MediaOptimiseResult;
  trim: MediaTrim; previous?: string; live?: () => boolean;
  expectedSources?: Map<string, string | undefined>;
  /** Each edited file carries the exact source the settings panel used. */
  edits(path: string): Map<string, { source: string | undefined; text: string }>;
}

/** Repository adapter; the panel never writes directly to drafts, bytes or source models. */
export function createMediaWorkspace(context: () => Promise<MediaWorkspaceContext>) {
  let session: MediaWorkspaceContext | undefined;
  const active = () => {
    if (!session) throw new Error("Open the image library first.");
    session.assertLive();
    return session;
  };
  const sources = async (ctx: MediaWorkspaceContext, paths = [...ctx.paths]) => {
    const out: Record<string, string> = {};
    const files = paths.filter(isMediaTextFile);
    for (let index = 0; index < files.length; index += 12) {
      const values = await Promise.all(files.slice(index, index + 12).map(async (path) => [path, await ctx.read(path)] as const));
      ctx.assertLive();
      for (const [path, value] of values) {
        if (value === undefined) throw new Error(`Could not read ${path}; image usage is incomplete. Refresh and try again.`);
        out[path] = value;
      }
    }
    return out;
  };
  const prepare = async (ctx: MediaWorkspaceContext, label: string, usage = false) => {
    const batch: MediaWorkspaceBatch = {
      label, expectedPaths: [...ctx.paths], expectedSources: new Map(), expectedAssets: new Map(),
      edits: new Map(), moves: [], deletes: [], restores: [], uploads: [],
    };
    for (const item of ctx.items) batch.expectedAssets.set(item.path, ctx.assetVersion(item.path));
    await readMediaPrefix(ctx, batch.expectedSources);
    const text = usage ? await sources(ctx, batch.expectedPaths) : {};
    // Media files (SVG is text too) are proved by their asset revision, which also covers
    // uploads and moves whose bytes the host holds no source for.
    const media = new Set(ctx.items.map((item) => item.path));
    for (const [path, value] of Object.entries(text)) if (!media.has(path)) {
      if (batch.expectedSources.has(path) && batch.expectedSources.get(path) !== value) throw new Error(`${path} changed while preparing image changes. Try again.`);
      batch.expectedSources.set(path, value);
    }
    const metadata = await ctx.read(MEDIA_RECORDS_PATH);
    ctx.assertLive();
    batch.expectedSources.set(MEDIA_RECORDS_PATH, metadata);
    // Files already back (a Restore outside Media) get their records again before any change is planned.
    const read = readSiteMediaRecords(metadata, ctx.items.map(item => item.path)), back = await currentBlobs(ctx, read);
    ctx.assertLive();
    const records = pruneRemoved(read, today(ctx), path => back.get(path));
    return { batch, text, metadata: records };
  };
  // Agent actions carry the revisions seen before loading the library through every later await.
  const expectedAssets = (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch, expected?: Map<string, string | undefined>) => {
    if (!expected) return;
    for (const [path, version] of expected) batch.expectedAssets.set(path, version);
    const live = batch.live;
    batch.live = () => (live?.() ?? true) && expected.size === ctx.paths.length
      && ctx.paths.every(path => expected.has(path) && expected.get(path) === ctx.assetVersion(path));
    if (!batch.live()) throw new Error("Media changed while preparing image changes. Try again.");
  };
  const assetGuard = (batch: MediaWorkspaceBatch, paths: string[]) => {
    for (const path of paths) {
      if (!batch.expectedPaths.includes(path)) throw new Error(`${path} is no longer in the image library.`);
      if (!batch.expectedAssets.has(path)) throw new Error(`${path} has no captured image revision. Refresh and try again.`);
    }
  };
  const commit = async (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch) => {
    ctx.assertLive();
    if (!batch.edits.size && !batch.moves.length && !batch.deletes.length && !batch.restores.length && !batch.uploads.length) return;
    await ctx.applyBatch(batch);
    // Refresh belongs to the transaction host, so no fallible second mutation follows it.
  };
  const today = (ctx: MediaWorkspaceContext) => new Date((ctx.now ?? Date.now)()).toISOString().slice(0, 10);
  /** When a file is added now (slice 103): Media lists the newest first. */
  const addedNow = (ctx: MediaWorkspaceContext) => new Date((ctx.now ?? Date.now)()).toISOString();
  /** The Git blob SHA of the present bytes of every path Recently removed names, to see which are back. */
  const currentBlobs = async (ctx: MediaWorkspaceContext, records: MediaRecords) => {
    const out = new Map<string, string>();
    for (const path of new Set(removedPaths(records))) {
      if (!ctx.paths.includes(path)) continue;
      const draft = ctx.drafts.get(ctx.scope, path);
      const sha = !draft ? ctx.assetVersion(path) : draft.opaque ? draft.sourceSha : await gitBlobSha(new TextEncoder().encode(draft.content));
      if (sha) out.set(path, sha);
    }
    return out;
  };
  const committedSha = (ctx: MediaWorkspaceContext, path: string) => {
    if (!ctx.paths.includes(path)) return undefined;
    const draft = ctx.drafts.get(ctx.scope, path);
    return draft ? draft.opaque && !draft.upload ? draft.sourceSha : undefined : ctx.assetVersion(path);
  };
  const removedRecords = async (ctx: MediaWorkspaceContext, records: MediaRecords, paths: string[]) => {
    const date = today(ctx);
    // `prepare` already gave files that are back their records; only expiry is left.
    let next = pruneRemoved(records, date);
    const remaining = new Set(paths);
    for (const path of [...paths].sort((a, b) => familyPaths(b, ctx.paths).length - familyPaths(a, ctx.paths).length)) {
      if (!remaining.has(path)) continue;
      const members = familyPaths(path, ctx.paths).filter(member => remaining.has(member));
      const family = [];
      for (const member of members) {
        const sha = ctx.history ? committedSha(ctx, member) : undefined;
        if (sha) family.push({ path: member, sha });
        else {
          if (!ctx.removedCopies) throw new Error("Recently removed browser storage is unavailable.");
          const draft = ctx.drafts.get(ctx.scope, member);
          const blob = draft && !draft.opaque ? new Blob([draft.content]) : await ctx.blob(member);
          ctx.assertLive();
          const browserKey = `removed:${date}:${await gitBlobSha(new Uint8Array(await blob.arrayBuffer()))}`;
          ctx.assertLive();
          await ctx.removedCopies.put(browserKey, blob);
          ctx.assertLive();
          family.push({ path: member, browserKey });
        }
        remaining.delete(member);
      }
      next = recordRemoval(next, { main: path, family, date });
    }
    return next;
  };
  const sweep = async (ctx: MediaWorkspaceContext) => {
    try {
      if (ctx.removedCopies) {
        await sweepRemovedCopies(ctx.removedCopies, today(ctx));
      }
    } catch { /* Expired browser bytes can wait until the next successful batch. */ }
  };
  const recordsEdit = (batch: MediaWorkspaceBatch, before: MediaRecords, records: MediaRecords) => {
    const next = serializeMediaRecords(records);
    if (next !== serializeMediaRecords(before)) batch.edits.set(MEDIA_RECORDS_PATH, next);
  };
  const rewriteInto = (batch: MediaWorkspaceBatch, text: Record<string, string>, from: string, to: string) => {
    for (const [path, source] of Object.entries(text)) {
      if (!/\.(?:html|css)$/i.test(path)) continue;
      const before = batch.edits.get(path) ?? source;
      const next = rewriteMediaReferences(path, before, from, to, batchPrefix(batch));
      if (next !== before) batch.edits.set(path, next);
    }
  };
  /** A metadata change, with the description rewritten into every place that uses it. */
  const metadataInto = (batch: MediaWorkspaceBatch, text: Record<string, string>, records: MediaRecords, changes: Record<string, Partial<MediaMetadata> | null>) => {
    const next = applyMediaMetadata(records, changes);
    for (const file of Object.keys(changes)) {
      const before = records.files[file], after = next.files[file];
      for (const [page, source] of Object.entries(text)) {
        const original = batch.edits.get(page) ?? source;
        const edited = descriptionPlaceEdits(records, file, page, original,
          { text: before?.description?.text ?? "", decorative: Boolean(before?.decorative) },
          { text: after?.description?.text ?? "", decorative: Boolean(after?.decorative) }, batchPrefix(batch));
        if (edited !== original) batch.edits.set(page, edited);
      }
    }
    return next;
  };
  /** A family rename: the moves, every reference and the records follow; a refusal throws before any change. */
  // The rename plan (media-rename.ts): the whole family, every mention in every text file, records,
  // and forwarding in `_redirects` (by default for Always keep files). A taken name suggests a free one.
  const renameInto = async (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch, text: Record<string, string>, records: MediaRecords, path: string, name: string, options?: { keepOldAddress?: boolean }) => {
    if (!name.trim() || /[\\/\u0000-\u001f]/.test(name)) throw new Error("Enter an image filename without a folder.");
    const extension = /\.[^./]+$/.exec(path)?.[0] ?? "";
    const typed = /\.[^./]+$/.exec(name)?.[0];
    if (typed && typed.toLowerCase() !== extension.toLowerCase()) throw new Error("Keep the image's file format when renaming it.");
    const to = path.slice(0, path.lastIndexOf("/") + 1) + tidyMediaName((typed ? name.slice(0, -typed.length) : name) + extension);
    if (to === path) return records;
    const redirects = await ctx.read("_redirects");
    ctx.assertLive();
    batch.expectedSources.set("_redirects", redirects);
    // Pages this batch already changed (details' description) are rewritten from their new text.
    const sources: Record<string, string | undefined> = { ...text, _redirects: redirects };
    for (const [file, source] of batch.edits) if (file !== MEDIA_RECORDS_PATH) sources[file] = source;
    const plan = planMediaRename({ from: path, to, paths: batch.expectedPaths, sources, records,
      site: { prefix: batchPrefix(batch), origins: ctx.origins ?? [], pages: ctx.pages, components: ctx.components },
      keepOldAddress: options?.keepOldAddress ?? familyPaths(path, ctx.paths).some(member => Boolean(records.files[member]?.alwaysKeep)) });
    if ("taken" in plan) throw new MediaNameTakenError(plan.taken, plan.suggestion);
    batch.moves.push(...plan.moves);
    for (const [file, source] of plan.edits) batch.edits.set(file, source);
    if (plan.redirects !== undefined) batch.edits.set("_redirects", plan.redirects);
    return plan.records;
  };
  const familyPaths = (path: string, paths: string[]) => {
    const family = mediaFamilyOf(path, paths);
    return family ? familyMembers(family) : [path];
  };
  const familyVersions = (ctx: MediaWorkspaceContext, paths: string[]) =>
    new Map(paths.map(path => [path, ctx.assetVersion(path)]));
  const importMedia = async (requests: MediaImportRequest[], place?: MediaPlacement) => {
    session?.assertLive();
    const ctx = await context();
    session?.assertLive();
    ctx.assertLive();
    const { batch, text, metadata } = await prepare(ctx, place?.label ?? (requests[0]?.onlineVideo ? `Add ${requests[0].onlineVideo.service === "youtube" ? "YouTube" : "Vimeo"} video` : "Add images"), requests.some((item) => item.replaceFrom));
    if (place?.expectedPaths) batch.expectedPaths = place.expectedPaths;
    for (const [path, version] of place?.expectedAssets ?? []) batch.expectedAssets.set(path, version);
    for (const [path, text] of place?.expectedSources ?? []) batch.expectedSources.set(path, text);
    const reserved = new Set(batch.expectedPaths);
    for (const upload of place?.uploads ?? []) {
      reserved.add(upload.path); batch.uploads.push(upload);
    }
    for (const file of place?.files ?? []) reserved.add(file.path);
    writePlayerFiles(batch, place?.files);
    const changes: Record<string, Partial<MediaMetadata>> = {};
    const previews: MediaRecords["files"] = {};
    const inherited: MediaRecords["files"] = {};
    const paths: string[] = [], joins = new Map<string, string[]>();
    // One addition shares one time, so files added together follow each other by name.
    const added = addedNow(ctx);
    for (const request of requests) {
      const { file, result, folder, replaceFrom } = request;
      if (folder.split("/").some((part) => part === "." || part === "..") || /[\\\u0000-\u001f]/.test(folder)) throw new Error("Choose a repository folder without . or .. segments.");
      const dir = folder.replace(/^\/+|\/+$/g, "");
      if (request.original && /^media\/originals(?:\/|$)/i.test(dir)) throw new Error(`${file.name}: Choose a website folder outside media/originals when keeping an original.`);
      const segments = dir.split("/");
      for (let index = 1; index <= segments.length; index++) {
        const parent = segments.slice(0, index).join("/");
        if (parent && reserved.has(parent)) throw new Error(`${parent} is a file, so it cannot contain uploaded files.`);
      }
      if (request.original && !/^[a-z0-9]+$/i.test(request.original.extension)) throw new Error("The original must use a supported file extension.");
      const first = result?.outputs[0];
      if (result && (!first || first.variantWidth)) throw new Error("No primary media file was encoded.");
      if (result?.outputs.some(output => !/^[a-z0-9]+$/i.test(output.extension) || output.extension !== first!.extension)) throw new Error("All responsive images must use the primary image format.");
      const outputs = result?.outputs ?? [{ blob: file, extension: "" }];
      for (const output of [...outputs, ...result?.still ? [result.still] : []]) {
        const problem = uploadProblem({ name: file.name, size: output.blob.size });
        if (problem) throw new Error(problem);
      }
      const widths = outputs.flatMap(output => output.variantWidth ? [output.variantWidth] : []);
      if (new Set(widths).size !== widths.length) throw new Error("Responsive image widths must be unique.");
      const encoded = mediaStorageName(file.name, first?.extension);
      const family = (primary: string) => outputs.map(output => output.variantWidth ? mediaCopyName(primary, output.variantWidth) : primary);
      const primary = chooseMediaPath({ folder: dir, name: encoded,
        copies: widths, original: request.original?.extension, still: result?.still?.extension, paths: reserved });
      ctx.assertLive();
      const familyPaths = family(primary);
      if (new Set(familyPaths).size !== familyPaths.length) throw new Error("Responsive image widths must be unique.");
      outputs.forEach((output, index) => {
        const path = familyPaths[index]; reserved.add(path); batch.uploads.push({ path, blob: output.blob });
      });
      if (result?.still) {
        // A video's still (slice 57) or a PDF's first page (slice 58), beside it with the same base.
        if (!(mediaKind(primary) === "video" || /\.pdf$/i.test(primary)) || result.still.extension !== "webp" || result.still.variantWidth) throw new Error("The still picture must be a WebP beside a video or PDF.");
        const path = primary.replace(/\.[^./]+$/, ".webp");
        reserved.add(path); batch.uploads.push({ path, blob: result.still.blob });
        previews[primary] = { still: path };
      }
      if (result?.fromGif) previews[primary] = { ...previews[primary], fromGif: true };
      // A new file's date; a lighter version (Optimise) keeps the date it inherits below.
      if (!replaceFrom) previews[primary] = { ...previews[primary], added };
      if (result?.duration && Number.isFinite(result.duration) && result.duration > 0 && /^(?:video|audio)$/.test(mediaKind(primary)))
        previews[primary] = { ...previews[primary], duration: result.duration };
      if (request.original) {
        const { blob, extension } = request.original;
        const problem = uploadProblem({ name: file.name, size: blob.size }) ??
          mediaOriginalProblem(new Uint8Array(await blob.arrayBuffer()), extension);
        ctx.assertLive();
        if (problem) throw new Error(`${file.name}: ${problem}`);
        for (const folder of ["media", "media/originals"]) if (reserved.has(folder)) throw new Error(`${folder} is a file, so it cannot contain originals.`);
        const path = mediaOriginalPath(primary, extension);
        reserved.add(path); batch.uploads.push({ path, blob });
      }
      if (request.metadata) changes[primary] = request.metadata;
      if (request.collection) joins.set(request.collection, [...joins.get(request.collection) ?? [], primary]);
      if (replaceFrom) {
        assetGuard(batch, [replaceFrom]);
        if (!request.expectedAssetVersion) throw new Error("The original image revision was not captured. Reopen its optimisation preview.");
        if (ctx.assetVersion(replaceFrom) !== request.expectedAssetVersion) throw new Error(`${replaceFrom} changed since its optimisation preview. Reopen the preview before adding copies.`);
        batch.expectedAssets.set(replaceFrom, request.expectedAssetVersion);
        if (metadata.files[replaceFrom]) inherited[primary] = structuredClone(metadata.files[replaceFrom]);
        // Preserve agent marks and unknown record fields, rather than the metadata view.
        delete changes[primary];
        rewriteInto(batch, text, replaceFrom, primary);
      }
      paths.push(primary);
    }
    // New files join the viewed collection in the same batch: one Undo step.
    let next = applyMediaMetadata({ ...metadata, files: { ...metadata.files, ...inherited } }, changes);
    if (requests.some(request => request.onlineVideo)) {
      const { upsertOnlineVideo } = await import("./online-video");
      ctx.assertLive();
      requests.forEach((request, index) => { if (request.onlineVideo) next = upsertOnlineVideo(next, { ...request.onlineVideo, still: paths[index], stillCopied: true }); });
    }
    for (const [path, record] of Object.entries(previews)) next.files[path] = { ...next.files[path], ...record };
    for (const [name, members] of joins) next = addToMediaCollection(next, name, members);
    if (place) {
      const source = await ctx.read(place.path);
      ctx.assertLive();
      if (source !== place.source) throw new Error(place.stale ?? `${place.path} changed while the file was being added. Nothing was added or placed.`);
      batch.expectedSources.set(place.path, place.source);
      // The records the placement was decided on: newer ones refuse, as a newer page does.
      if (place.records && batch.expectedSources.get(MEDIA_RECORDS_PATH) !== place.records.text) throw new Error(place.stale ?? `${MEDIA_RECORDS_PATH} changed while the file was being added. Nothing was added or placed.`);
      if (place.live) batch.live = place.live;
      // The placement sees the records as this addition leaves them, and may change them (a moved mark).
      const placed = place.apply(paths, requests, next);
      batch.edits.set(place.path, typeof placed === "string" ? placed : placed.page);
      if (typeof placed !== "string" && placed.records) next = placed.records;
    }
    recordsEdit(batch, metadata, next);
    await commit(ctx, batch);
    return paths;
  };
  const trimCopy = async ({ source, trim, previous, result, place, sourceVersion }: MediaTrimRequest) => {
    session?.assertLive();
    const ctx = await context();
    session?.assertLive(); ctx.assertLive();
    // The pixels were made from this revision: a newer original refuses, so provenance stays true.
    if (sourceVersion === undefined || ctx.assetVersion(source) !== sourceVersion) throw new Error(place.stale ?? `${source} changed while it was being trimmed. Nothing was saved.`);
    const versions = familyVersions(ctx, [source, ...previous ? familyPaths(previous, ctx.paths) : []]);
    versions.set(source, sourceVersion);
    const { batch, metadata } = await prepare(ctx, "Picture trimmed");
    for (const [path, text] of place.expectedSources ?? []) {
      if (batch.expectedSources.has(path) && batch.expectedSources.get(path) !== text) throw new Error(place.stale ?? "The site address changed. Try again.");
      batch.expectedSources.set(path, text);
    }
    for (const [member, version] of versions) batch.expectedAssets.set(member, version);
    assetGuard(batch, [source, ...previous ? [previous] : []]);
    const { isTrim, trimmedCopyPath, planTrimmedCopy } = await import("./trimmed-copies");
    ctx.assertLive();
    if (!isTrim(trim)) throw new Error("The picture has not been trimmed.");
    if (previous && (previous === source || !metadata.files[previous]?.trimmedFrom))
      throw new Error("Re-trimming must start from a trimmed copy.");
    const outputs = result.outputs, first = outputs[0];
    if (!first || first.variantWidth || outputs.filter(output => !output.variantWidth).length !== 1)
      throw new Error("Exactly one primary image must be encoded.");
    if (outputs.some(output => !/^[a-z0-9]+$/i.test(output.extension) || output.extension !== first.extension))
      throw new Error("All responsive images must use the primary image format.");
    const widths = outputs.flatMap(output => output.variantWidth ? [output.variantWidth] : []);
    if (new Set(widths).size !== widths.length || widths.some(width => !Number.isInteger(width) || width <= 0))
      throw new Error("Responsive image widths must be positive and unique.");
    for (const output of outputs) {
      const problem = uploadProblem({ name: source, size: output.blob.size });
      if (problem) throw new Error(problem);
    }
    for (const folder of ["media", "media/images"]) if (batch.expectedPaths.includes(folder))
      throw new Error(folder + " is a file, so it cannot contain uploaded files.");
    // Addresses on the Recently removed list stay taken, so a cached old trim can never reappear.
    const path = trimmedCopyPath({ source, extension: first.extension, copies: widths, previous,
      paths: [...batch.expectedPaths, ...metadata.removed?.flatMap(item => [item.path, ...item.family?.map(member => member.path) ?? []]) ?? []] });
    const page = await ctx.read(place.path);
    ctx.assertLive();
    const stale = place.stale ?? "The page or media records changed while trimming. Nothing was saved.";
    if (page !== place.source || place.records && place.records.text !== batch.expectedSources.get(MEDIA_RECORDS_PATH))
      throw new Error(stale);
    batch.expectedSources.set(place.path, place.source);
    batch.live = place.live;
    const provisional = planTrimmedCopy({ records: metadata, source, trim, path, previous, previousStillUsed: true, paths: batch.expectedPaths });
    const placed = place.apply(path, structuredClone(provisional.records));
    batch.edits.set(place.path, placed.page);
    let next = placed.records ?? provisional.records;
    if (JSON.stringify(next.files[source]) !== JSON.stringify(metadata.files[source]))
      throw new Error("Trimming must leave the original picture's record unchanged.");
    // A surviving previous copy belongs to its other places; its record stays untouched.
    if (previous && metadata.files[previous]) next = { ...next, files: { ...next.files, [previous]: metadata.files[previous] } };
    let previousStillUsed = true;
    if (previous) {
      const members = familyPaths(previous, batch.expectedPaths);
      const text: Record<string, string> = {};
      let complete = true;
      text[place.path] = placed.page;
      const files = batch.expectedPaths.filter(file => file !== MEDIA_RECORDS_PATH && file !== place.path && isMediaTextFile(file));
      for (let index = 0; index < files.length; index += 12) {
        const values = await Promise.all(files.slice(index, index + 12).map(async file => [file, await ctx.read(file).catch(() => undefined)] as const));
        ctx.assertLive();
        for (const [file, value] of values) {
          // Never remove when unsure: an unreadable file keeps the previous copy.
          if (value === undefined) { complete = false; continue; }
          text[file] = value;
          if (!batch.expectedAssets.has(file)) batch.expectedSources.set(file, value);
        }
      }
      const usage = wideUsage(members, text, ctx, batchPrefix(batch));
      previousStillUsed = !complete || members.some(member => usage[member].files.length > 0);
    }
    const plan = planTrimmedCopy({ records: metadata, source, trim, path, previous, previousStillUsed, paths: batch.expectedPaths });
    batch.deletes.push(...plan.removes);
    next = plan.removes.length ? await removedRecords(ctx, next, plan.removes) : next;
    next = { ...next, files: { ...next.files, [path]: { ...next.files[path], added: addedNow(ctx) } } };
    recordsEdit(batch, metadata, next);
    for (const output of outputs) batch.uploads.push({
      path: output.variantWidth ? mediaCopyName(path, output.variantWidth) : path, blob: output.blob,
    });
    await commit(ctx, batch);
    if (plan.removes.length) await sweep(ctx);
    return path;
  };
  const replace = async (request: MediaReplaceRequest, agent = false, ports: { encode?: typeof import("./media-optimise").optimiseMedia } = {}) => {
    const ctx = active();
    if (!ctx.items.some(item => item.path === request.path)) throw new Error("Choose an image Media file to replace.");
    // Capture every binary proof before the first read, including trims discovered in records later.
    const versions = familyVersions(ctx, ctx.paths);
    const { batch, metadata, text } = await prepare(ctx, agent ? "Agent replaced picture everywhere" : "Replace everywhere", true);
    batch.live = request.live;
    const { replacementFamilies, replacementImageSize, planMediaReplace } = await import("./replace-everywhere");
    ctx.assertLive();
    const affected = replacementFamilies(request.path, batch.expectedPaths, metadata);
    const members = [...affected.family, ...affected.trims.flatMap(affected.members)];
    for (const member of members) batch.expectedAssets.set(member, versions.get(member));
    assetGuard(batch, members);
    const { gifIsAnimated, pngIsAnimated, webpIsAnimated } = await import("./media-image-bytes");
    ctx.assertLive();
    const bytes = new Uint8Array(await (await ctx.blob(request.path)).arrayBuffer());
    ctx.assertLive();
    if (gifIsAnimated(bytes) || pngIsAnimated(bytes) || webpIsAnimated(bytes)) throw new Error("Animated pictures cannot be replaced with a prepared still picture.");
    const redirects = await ctx.read("_redirects");
    ctx.assertLive();
    // The plan and the trims' usage scan both read `text`: a `_redirects` changed since then refuses.
    if (batch.expectedSources.has("_redirects") ? batch.expectedSources.get("_redirects") !== redirects : redirects !== undefined)
      throw new Error("_redirects changed while preparing image changes. No image changes were applied.");
    batch.expectedSources.set("_redirects", redirects);
    const config = await ctx.read(NATIVE_CONFIG_PATH);
    ctx.assertLive();
    if (batch.expectedSources.has(NATIVE_CONFIG_PATH) && batch.expectedSources.get(NATIVE_CONFIG_PATH) !== config)
      throw new Error("Site settings changed while preparing image changes. Nothing was replaced.");
    batch.expectedSources.set(NATIVE_CONFIG_PATH, config);
    const siteUrl = nativeSiteSettings(config).url;
    const { mediaOwnOrigins } = await import("./media-origins");
    ctx.assertLive();
    const dimensions = new Map<string, { width: number; height: number }>();
    for (const trim of affected.trims) {
      const size = replacementImageSize(new Uint8Array(await (await ctx.blob(trim)).arrayBuffer()));
      ctx.assertLive();
      if (size) dimensions.set(trim, size);
    }
    // A provisional pure plan validates names and outputs before hashing or preserving browser bytes.
    const input = { request, paths: batch.expectedPaths, sources: { ...text, _redirects: redirects }, records: metadata,
      dimensions, siteUrl, site: { prefix: sitePathPrefix(siteUrl), origins: [...ctx.origins ?? [], ...mediaOwnOrigins(siteUrl)], pages: ctx.pages, components: ctx.components } };
    let provisional = planMediaReplace({ ...input, versions: new Map() });
    let sharing: { blob: Blob } | undefined;
    if (provisional.sharingNeeded) {
      const { encodeSharingJpeg } = await import("./sharing-jpeg");
      const encode = ports.encode ?? (await import("./media-optimise")).optimiseMedia;
      ctx.assertLive();
      const main = request.result.outputs[0];
      const original = request.original;
      const guard = () => {
        ctx.assertLive();
        if (request.live?.() === false) throw new Error("Cancelled. Nothing was replaced.");
      };
      sharing = await encodeSharingJpeg({ blob: original?.blob ?? main.blob,
        source: original ? "original." + original.extension : provisional.main,
        width: main.width!, height: main.height!, maxWidth: main.width! <= 10000 ? main.width! : null, encode, guard,
        error: "The sharing picture could not be prepared as a JPEG at the new picture's size. Nothing was replaced." });
      provisional = planMediaReplace({ ...input, sharing, versions: new Map() });
    }
    const hashes = new Map<string, string>();
    for (const upload of provisional.uploads) {
      if (request.original && upload.blob === request.original.blob) {
        const problem = mediaOriginalProblem(new Uint8Array(await upload.blob.arrayBuffer()), request.original.extension);
        ctx.assertLive();
        if (problem) throw new Error(problem);
      }
      hashes.set(upload.path, (await gitBlobSha(new Uint8Array(await upload.blob.arrayBuffer()))).slice(0, 8));
      ctx.assertLive();
    }
    const plan = planMediaReplace({ ...input, sharing, versions: hashes });
    for (const [file, source] of plan.edits) batch.edits.set(file, source);
    const edited = { ...text, ...Object.fromEntries(plan.edits) };
    const removed = [...plan.family];
    for (const trim of plan.trims) {
      const usage = wideUsage(trim.members, edited, ctx, batchPrefix(batch));
      if (!trim.kept && !trim.members.some(member => usage[member].files.length)) {
        removed.push(...trim.members); batch.deletes.push(...trim.members);
      }
    }
    let next = await removedRecords(ctx, metadata, removed);
    // Removal owns the old records. Copy the new family's records back from the independent plan.
    next = { ...next, files: { ...next.files } };
    for (const upload of plan.uploads) if (plan.records.files[upload.path]) next.files[upload.path] = plan.records.files[upload.path];
    for (const trim of plan.trims) if (next.files[trim.main]) next.files[trim.main] = plan.records.files[trim.main];
    // The new picture is dated now, so it leads Media like a new file.
    next.files[plan.main] = { ...next.files[plan.main], added: addedNow(ctx) };
    recordsEdit(batch, metadata, next);
    batch.uploads.push(...plan.uploads);
    batch.deletes.push(...plan.deletes);
    batch.overwrites = plan.uploads.filter(upload => batch.expectedPaths.includes(upload.path)).map(upload => upload.path);
    for (const upload of plan.uploads) if (!batch.expectedAssets.has(upload.path)) batch.expectedAssets.set(upload.path, versions.get(upload.path));
    await commit(ctx, batch);
    for (const note of plan.notes) request.notice?.(note);
    if (plan.artDirected.length) request.notice?.("The new picture is now used on all screens.");
    await sweep(ctx);
    return plan.main;
  };
  const share = async (request: MediaShareRequest) => {
    const ctx = await context();
    ctx.assertLive();
    const { source, sourceVersion, trim, result, previous } = request;
    if (sourceVersion === undefined || ctx.assetVersion(source) !== sourceVersion)
      throw new Error("The original picture changed meanwhile. Nothing was saved.");
    const versions = familyVersions(ctx, [source, ...previous ? familyPaths(previous, ctx.paths) : []]);
    const { batch, metadata } = await prepare(ctx, "Social image set");
    for (const [path, version] of versions) batch.expectedAssets.set(path, version);
    batch.expectedAssets.set(source, sourceVersion);
    assetGuard(batch, [source]);
    for (const [file, expected] of request.expectedSources ?? []) {
      const current = await ctx.read(file);
      ctx.assertLive();
      if (current !== expected) throw new Error("The repository or source changed meanwhile. Nothing was saved.");
      batch.expectedSources.set(file, expected);
    }
    const { socialCopyPath } = await import("./social-image");
    const { validTrim } = await import("./trim-geometry");
    ctx.assertLive();
    validTrim(trim);
    if (previous && (previous === source || !metadata.files[previous]?.sharing))
      throw new Error("The previous image must be a sharing copy.");
    const output = result.outputs[0];
    if (result.outputs.length !== 1 || !output || output.variantWidth || output.extension !== "jpg" || output.blob.type !== "image/jpeg" || result.original)
      throw new Error("A sharing copy must be one JPEG image.");
    const problem = uploadProblem({ name: source, size: output.blob.size });
    if (problem) throw new Error(problem);
    for (const folder of ["media", "media/images"]) if (batch.expectedPaths.includes(folder))
      throw new Error(folder + " is a file, so it cannot contain uploaded files.");
    const path = socialCopyPath({ source, paths: batch.expectedPaths, records: metadata, previous });
    batch.live = request.live;
    for (const [file, edit] of request.edits(path)) {
      const current = await ctx.read(file);
      ctx.assertLive();
      if (current !== edit.source) throw new Error("The repository or source changed meanwhile. Reopen settings and try again.");
      batch.expectedSources.set(file, edit.source);
      batch.edits.set(file, edit.text);
    }
    let next: MediaRecords = { ...metadata, files: { ...metadata.files,
      [path]: { sharing: true, trimmedFrom: { source, trim: structuredClone(trim) } } } };
    let removes: string[] = [];
    if (previous && !metadata.files[previous]?.alwaysKeep && !mediaFamilies(ctx.paths).some(family => family.sharing === previous)) {
      const members = familyPaths(previous, batch.expectedPaths), text: Record<string, string> = {};
      let complete = true;
      const files = batch.expectedPaths.filter(file => file !== MEDIA_RECORDS_PATH && isMediaTextFile(file));
      for (let index = 0; index < files.length; index += 12) {
        const values = await Promise.all(files.slice(index, index + 12).map(async file => [file, await ctx.read(file).catch(() => undefined)] as const));
        ctx.assertLive();
        for (const [file, value] of values) {
          if (value === undefined) { complete = false; continue; }
          text[file] = batch.edits.get(file) ?? value;
          if (!batch.expectedAssets.has(file) && !batch.expectedSources.has(file)) batch.expectedSources.set(file, value);
        }
      }
      for (const [file, value] of batch.edits) if (file !== MEDIA_RECORDS_PATH) text[file] = value;
      const usage = wideUsage(members, text, ctx, batchPrefix(batch));
      if (complete && !members.some(member => usage[member].files.length || metadata.files[member]?.alwaysKeep)) {
        batch.deletes.push(...members);
        removes = members;
        next = await removedRecords(ctx, next, members);
      }
    }
    recordsEdit(batch, metadata, next);
    batch.uploads.push({ path, blob: output.blob });
    await commit(ctx, batch);
    if (removes.length) await sweep(ctx);
    return path;
  };
  return {
    async describe(file: string, change: { text?: string; decorative?: boolean; page?: string; element?: string }) {
      const ctx = active(), words = change.text?.trim();
      if ((change.text !== undefined) === (change.decorative !== undefined)) throw new Error("Give exactly one of text or decorative.");
      if (words === "") throw new Error("Use decorative: true for a picture that adds nothing to the page.");
      if (!ctx.items.some(item => item.path === file)) throw new Error(OUTSIDE_MEDIA_REFUSED);
      const { batch, metadata, text } = await prepare(ctx, words !== undefined ? `Agent described ${file.split("/").pop()}` : `Agent ${change.decorative ? "marked" : "unmarked"} ${file.split("/").pop()} Decorative`, true);
      let next: MediaRecords;
      if (!change.page) {
        next = metadataInto(batch, text, metadata, { [file]: words !== undefined ? { alt: words, decorative: false } : { decorative: change.decorative } });
        if (words !== undefined) next = setMediaDescription(next, file, words, true);
        // An agent's Decorative toggle must not silently approve previously written words.
        else if (metadata.files[file]?.description?.byAgent) next = { ...next, files: { ...next.files, [file]: { ...next.files[file], description: metadata.files[file].description } } };
      } else {
        const page = change.page, source = text[page];
        if (source === undefined || !pageUsesFile(source, page, file, batchPrefix(batch))) throw new Error(`${file} is not used on ${page}.`);
        const node = change.element === undefined ? undefined : parseOutlineId(change.element);
        if (change.element !== undefined && !node) throw new Error("Give an image element id.");
        const range = node && locateNativeElementRange(source, node);
        const images = startTags(source).filter(tag => tag.name === "img" && mediaResolvePath(decodeHtmlEntities(startTagAttribute(source, tag, "src")?.value ?? "", true), page, undefined, batchPrefix(batch)) === file);
        if (node && (!range || range.tag.name !== "img" || !images.some(tag => tag.start === range.tag.start))) throw new Error("That element is not an image showing this file.");
        // One by-agent mark per file on a page: other words for one of its images would leave
        // the agent's unchecked words on another image unmarked, so that is refused.
        if (range && words !== undefined && strandsAgentWords(source, file, page, range.tag.start, metadata.files[file]?.places?.[page]?.agentText, words, batchPrefix(batch)))
          throw new Error(`Another image of ${file} on ${page} still shows unchecked agent words. Describe the place without element to give every use the same words, or ask the user to check them in To check first.`);
        let edited = source;
        if (words !== undefined || change.decorative) {
          for (const tag of images.filter(tag => !range || tag.start === range.tag.start).reverse()) {
            const alt = startTagAttribute(source, tag, "alt");
            edited = edited.slice(0, alt?.start ?? tag.nameEnd) + ` alt="${mediaEscape(words ?? "")}"` + edited.slice(alt?.end ?? tag.nameEnd);
          }
        }
        next = words !== undefined ? setMediaPlaceAgentText(setMediaPlaceDecorative(metadata, file, page, false), file, page, words)
          : setMediaPlaceDecorative(metadata, file, page, change.decorative!);
        const agentText = metadata.files[file]?.places?.[page]?.agentText;
        if (words === undefined && agentText) next = setMediaPlaceAgentText(next, file, page, agentText);
        if (edited !== source) batch.edits.set(page, edited);
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    begin() { session = undefined; },
    async load() {
      if (session) session.assertLive();
      session = await context();
      const ctx = active();
      const text = await sources(ctx);
      const read = readSiteMediaRecords(await ctx.read(MEDIA_RECORDS_PATH), ctx.items.map(item => item.path)); ctx.assertLive();
      const back = await currentBlobs(ctx, read); ctx.assertLive();
      const records = pruneRemoved(read, today(ctx), path => back.get(path));
      const removed = recentlyRemoved(records, today(ctx), path => back.get(path));
      const metadata = mediaMetadataView(records);
      // YouTube and Vimeo videos (slice 68), with the pages that show them; their code loads only when there are any.
      const online = records.onlineVideos?.length ? (await import("./online-video")).mediaOnlineVideos(records, text, ctx.paths) : undefined;
      const expected = new Map<string, string | undefined>();
      const prefix = await readMediaPrefix(ctx, expected);
      ctx.assertLive();
      const githubPages = onGithubPages(nativeSiteSettings(expected.get(NATIVE_CONFIG_PATH)).url, ctx.paths.includes("CNAME"));
      ctx.assertLive();
      return { key: ctx.key, prefix, githubPages, ...online ? { onlineVideos: online } : {}, removed, collections: [...records.collections], items: ctx.items.map((item) => ({ ...item, date: mediaAddedTime(records.files[item.path]) ?? item.date, version: ctx.assetVersion(item.path) })), metadata, usage: wideUsage(ctx.items.map((item) => item.path), text, ctx, prefix),
        // Folded over every path: a kept original the library does not list still marks its main.
        keep: [...alwaysKeptFiles(ctx.paths, new Set(Object.keys(records.files).filter(path => records.files[path].alwaysKeep)))],
        toCheck: mediaToCheck(records, ctx.items.map(item => item.path), text, prefix),
        ...records.adding ? { adding: records.adding } : {}, ...ctx.repoSize === undefined ? {} : { repoSize: ctx.repoSize } };
    },
    async blob(path) { return active().blob(path); },
    async metadata(changes, agent = false, expected?: Map<string, string | undefined>) {
      const ctx = active();
      const { batch, metadata, text } = await prepare(ctx, agent ? "Agent added Always keep" : "Edit image metadata", true);
      expectedAssets(ctx, batch, expected);
      recordsEdit(batch, metadata, metadataInto(batch, text, metadata, changes));
      await commit(ctx, batch);
    },
    async details(path, changes, name, options) {
      // File details' Save: its fields and its rename succeed whole, fail whole and undo as one step.
      const ctx = active();
      const versions = name === undefined ? undefined : familyVersions(ctx, familyPaths(path, ctx.paths));
      const { batch, metadata, text } = await prepare(ctx, name === undefined ? "Edit file details" : "Edit file details and rename", true);
      let next = metadataInto(batch, text, metadata, { [path]: changes });
      if (name !== undefined) {
        for (const [member, version] of versions!) batch.expectedAssets.set(member, version);
        assetGuard(batch, [...versions!.keys()]);
        next = await renameInto(ctx, batch, text, next, path, name, options);
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    async collections(change) {
      const ctx = active();
      const labels = { new: "New collection", add: "Add to collection", "take-out": "Take out of collection", rename: "Rename collection", delete: "Delete collection" };
      const { batch, metadata } = await prepare(ctx, labels[change.kind]);
      if ("paths" in change && change.paths?.some(path => !ctx.items.some(item => item.path === path))) throw new Error("Some files are no longer in the media library.");
      let next: MediaRecords;
      switch (change.kind) {
        case "new": next = createMediaCollection(metadata, change.name, change.paths); break;
        case "add": next = addToMediaCollection(metadata, change.name, change.paths); break;
        case "take-out": next = takeOutOfMediaCollection(metadata, change.name, change.paths); break;
        case "rename": next = renameMediaCollection(metadata, change.from, change.to); break;
        case "delete": next = deleteMediaCollection(metadata, change.name); break;
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    import: importMedia,
    async improveGifsAndPlayers(request: import("./improve-gifs-players").ImproveGifsPlayersRequest, ports?: import("./improve-gifs-players").ImproveGifsPlayersPorts) {
      const ctx = await context();
      ctx.assertLive();
      const module = await import("./improve-gifs-players");
      ctx.assertLive();
      return module.improveGifsAndPlayers(ctx, request, ports);
    },
    async onlineVideo(record: OnlineVideoRecord, place?: MediaPlacement) {
      session?.assertLive();
      const ctx = await context(); session?.assertLive(); ctx.assertLive();
      const { batch, metadata } = await prepare(ctx, place?.label ?? `Add ${record.service === "youtube" ? "YouTube" : "Vimeo"} video`);
      const { upsertOnlineVideo } = await import("./online-video"); ctx.assertLive();
      let next = upsertOnlineVideo(metadata, record);
      if (place) {
        const source = await ctx.read(place.path); ctx.assertLive();
        if (source !== place.source || (place.records && batch.expectedSources.get(MEDIA_RECORDS_PATH) !== place.records.text)) throw new Error("The page or media records changed. Nothing was added.");
        batch.expectedSources.set(place.path, source); batch.live = place.live;
        if (place.expectedPaths) batch.expectedPaths = place.expectedPaths;
        for (const [path, version] of place.expectedAssets ?? []) batch.expectedAssets.set(path, version);
        // Component templates the place went through: newer ones refuse, as for files (slice 63).
        for (const [path, text] of place.expectedSources ?? []) batch.expectedSources.set(path, text);
        batch.uploads.push(...place.uploads ?? []);
        writePlayerFiles(batch, place.files);
        const placed = place.apply([], [], next);
        batch.edits.set(place.path, typeof placed === "string" ? placed : placed.page);
        if (typeof placed !== "string" && placed.records) next = placed.records;
      }
      recordsEdit(batch, metadata, next); await commit(ctx, batch);
    },
    async onlineVideoStill(key: import("./online-video").OnlineVideoKey, still: import("./online-video").OnlineVideoStill) {
      const ctx = active();
      const { batch, metadata, text } = await prepare(ctx, "Change video picture", true);
      assetGuard(batch, [still.path]);
      const { findOnlineVideo, setOnlineVideoStill, swapOnlineVideoStillInPage } = await import("./online-video"); ctx.assertLive();
      if (!findOnlineVideo(metadata, key)) throw new Error("This video is no longer in Media.");
      // Every HTML file, component templates included, as renames do: the change applies everywhere.
      for (const [path, source] of Object.entries(text)) {
        if (!/\.html$/i.test(path)) continue;
        const next = swapOnlineVideoStillInPage(source, key, still, batchPrefix(batch));
        if (next !== source) batch.edits.set(path, next);
      }
      recordsEdit(batch, metadata, setOnlineVideoStill(metadata, key, still.path)); await commit(ctx, batch);
    },
    async onlineVideoServiceBar(key: import("./online-video").OnlineVideoKey, enabled: boolean) {
      const ctx = active();
      const { batch, metadata, text } = await prepare(ctx, "Change video controls", true);
      const { findOnlineVideo, upsertOnlineVideo, setOnlineVideoServiceBarInPage } = await import("./online-video"); ctx.assertLive();
      const record = findOnlineVideo(metadata, key);
      if (!record) throw new Error("This video is no longer in Media.");
      // Every HTML file, component templates included, as renames do: the change applies everywhere.
      for (const [path, source] of Object.entries(text)) {
        if (!/\.html$/i.test(path)) continue;
        const next = setOnlineVideoServiceBarInPage(source, key, enabled);
        if (next !== source) batch.edits.set(path, next);
      }
      // Undefined, not deleted: upsertOnlineVideo merges over the old record, and undefined is not saved.
      const next: OnlineVideoRecord = { ...record, serviceBar: enabled ? true : undefined };
      recordsEdit(batch, metadata, upsertOnlineVideo(metadata, next)); await commit(ctx, batch);
    },
    async removeOnlineVideo(key: import("./online-video").OnlineVideoKey) {
      const ctx = active();
      const { batch, metadata } = await prepare(ctx, "Remove online video");
      const { findOnlineVideo, removeOnlineVideo } = await import("./online-video"); ctx.assertLive();
      const record = findOnlineVideo(metadata, key);
      if (!record) return;
      let next = removeOnlineVideo(metadata, key);
      // Only the picture copied from the service leaves with the video; Lex's own chosen image stays.
      if (record.stillCopied && record.still && batch.expectedPaths.includes(record.still)) {
        const paths = familyPaths(record.still, batch.expectedPaths); assetGuard(batch, paths);
        next = await removedRecords(ctx, next, paths); ctx.assertLive();
        next = { ...next, removed: next.removed?.map((entry, index, entries) => index === entries.length - 1 ? { ...entry, onlineVideo: record } : entry) };
        batch.deletes.push(...paths);
      }
      recordsEdit(batch, metadata, next); await commit(ctx, batch); await sweep(ctx);
    },
    async adding(change, agent = false) {
      // Adding settings live in the site's records, so they travel with the site and undo like any change.
      const ctx = active();
      const { batch, metadata } = await prepare(ctx, agent ? change === "reset" ? "Agent reset adding settings" : "Agent changed adding settings" : change === "reset" ? "Reset adding settings" : "Change adding settings");
      recordsEdit(batch, metadata, change === "reset" ? resetMediaAddingSettings(metadata) : setMediaAddingSettings(metadata, change));
      await commit(ctx, batch);
    },
    trim: trimCopy,
    replace,
    async improve(request: import("./improve-heavy").ImproveRequest, ports?: import("./improve-heavy").ImprovePorts) {
      const ctx = active();
      const { improveHeavy } = await import("./improve-heavy");
      ctx.assertLive();
      return improveHeavy(ctx, request, ports);
    },
    share,
    async improveImages() { return (await import("./improve-images-run")).improveImagesSession(context); },
    async rename(path, name, options) {
      const ctx = active();
      const versions = familyVersions(ctx, familyPaths(path, ctx.paths));
      const { batch, text, metadata } = await prepare(ctx, "Rename image", true);
      for (const [member, version] of versions) batch.expectedAssets.set(member, version);
      assetGuard(batch, [...versions.keys()]);
      recordsEdit(batch, metadata, await renameInto(ctx, batch, text, metadata, path, name, options));
      await commit(ctx, batch);
    },
    async check({ file, page, subtitles, text: seen }, text) {
      // To check: a row that is gone (checked elsewhere) or holds other words than Lex saw refuses.
      const ctx = active();
      const words = text?.trim();
      const { batch, text: sources, metadata } = await prepare(ctx, subtitles ? "Subtitles checked" : "Description checked", true);
      const row = mediaToCheck(metadata, [file], sources, batchPrefix(batch)).find(entry => entry.page === page && entry.subtitles === subtitles);
      if (!row || row.text !== seen) throw new Error("These words changed meanwhile. Look at To check again.");
      if (words === "") throw new Error(subtitles ? "Write the subtitles, or press OK to keep them." : "Write the description, or press OK to keep these words.");
      const edit = words !== undefined && words !== row.text.trim();
      if (edit) batch.label = subtitles ? "Edit subtitles" : "Edit description";
      let next: MediaRecords;
      if (subtitles) {
        // Lex's text replaces the agent's file (checked as WebVTT); either way the mark goes.
        const { subtitlesByAgent: _, ...record } = metadata.files[file];
        next = { ...metadata, files: { ...metadata.files, [file]: record } };
        if (edit) {
          const { readSubtitles } = await import("./video-details"); ctx.assertLive();
          const read = readSubtitles(subtitles, words!);
          if ("problem" in read) throw new Error(read.problem);
          assetGuard(batch, [subtitles]); batch.overwrites = [subtitles];
          batch.uploads.push({ path: subtitles, blob: new Blob([read.vtt], { type: "text/vtt" }) });
        }
      } else if (page === undefined) {
        // Lex's words go through the usual description change: places using it follow, the mark goes.
        next = edit ? metadataInto(batch, sources, metadata, { [file]: { alt: words } }) : confirmMediaDescription(metadata, file);
      } else {
        // A place's own words: the page's alt and the record's mark change in one step.
        next = setMediaPlaceAgentText(metadata, file, page, undefined);
        if (edit) {
          const edited = placeWordsEdits(sources[page], file, page, row.text, words, batchPrefix(batch));
          if (edited !== sources[page]) batch.edits.set(page, edited);
        }
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    async still(video: string, still: { blob: Blob } | { path: string }) {
      // A video's still (slice 66): a moment saved beside it, or a picture in Media; every placed copy shows it.
      const ctx = active();
      if (mediaKind(video) !== "video") throw new Error("Only a video has a still picture.");
      const { batch, metadata, text } = await prepare(ctx, "Change still picture", true);
      const { setPosterInPage, stillPathFor } = await import("./video-details"); ctx.assertLive();
      assetGuard(batch, [video]);
      let path: string;
      if ("blob" in still) {
        path = stillPathFor(video);
        if (still.blob.type !== "image/webp") throw new Error("This browser could not make the still picture. Choose a picture from Media instead.");
        const problem = uploadProblem({ name: path.split("/").pop()!, size: still.blob.size });
        if (problem) throw new Error(problem);
        if (batch.expectedPaths.includes(path)) {
          // Only the video's own still is replaced, never another picture that has its name.
          if (mediaFamilyOf(video, batch.expectedPaths)?.still !== path) throw new Error(`${path.split("/").pop()} is another picture, so the moment could not be saved beside the video.`);
          assetGuard(batch, [path]); batch.overwrites = [path];
        } else if (mediaFamilyOf(video, [...batch.expectedPaths, path])?.still !== path) {
          // Another file with the video's name (a PDF) would make the new picture nobody's still.
          throw new Error(`Another file is named like ${video.split("/").pop()}, so its still picture could not join it. Rename one of them first.`);
        }
        batch.uploads.push({ path, blob: still.blob });
      } else {
        path = still.path;
        assetGuard(batch, [path]);
        if (mediaKind(path) !== "image") throw new Error("Choose a picture for the still.");
      }
      const site = { prefix: batchPrefix(batch), origins: ctx.origins ?? [] };
      for (const [page, source] of Object.entries(text)) {
        if (!/\.html$/i.test(page)) continue;
        const next = setPosterInPage(source, page, video, path, site, batchPrefix(batch));
        if (next !== source) batch.edits.set(page, next);
      }
      recordsEdit(batch, metadata, { ...metadata, files: { ...metadata.files, [video]: { ...metadata.files[video], still: path } } });
      await commit(ctx, batch);
    },
    async subtitles(media: string, file: { name: string; text: string } | null, agent = false) {
      if (agent && !file) throw new Error("Agents cannot remove subtitles.");
      // Subtitles (slice 66): WebVTT beside the file (its family), a track on every placed copy; or taken off.
      const ctx = active(), kind = mediaKind(media);
      if (kind !== "video" && kind !== "audio") throw new Error("Only a video or audio file has subtitles.");
      const { batch, metadata, text } = await prepare(ctx, file ? "Add subtitles" : "Remove subtitles", true);
      const rules = await import("./video-details"); ctx.assertLive();
      assetGuard(batch, [media]);
      const { subtitles: before, subtitlesByAgent: _, ...record } = metadata.files[media] ?? {};
      const family = mediaFamilyOf(media, batch.expectedPaths)?.subtitles ?? [];
      const current = before && batch.expectedPaths.includes(before) ? before : family.find(path => /\.vtt$/i.test(path));
      const site = { prefix: batchPrefix(batch), origins: ctx.origins ?? [] };
      const pages = (edit: (source: string, page: string) => string) => {
        for (const [page, source] of Object.entries(text)) {
          if (!/\.html$/i.test(page)) continue;
          const original = batch.edits.get(page) ?? source, next = edit(original, page);
          if (next !== original) batch.edits.set(page, next);
        }
      };
      let next: MediaRecords;
      if (file) {
        const read = rules.readSubtitles(file.name, file.text);
        if ("problem" in read) throw new Error(read.problem);
        const path = rules.subtitlesPathFor(media);
        if (batch.expectedPaths.includes(path)) {
          if (!family.includes(path)) throw new Error(`${path.split("/").pop()} belongs to another file, so the subtitles could not be saved beside this one.`);
          assetGuard(batch, [path]); batch.overwrites = [path]; batch.label = "Replace subtitles";
        } else if (!mediaFamilyOf(media, [...batch.expectedPaths, path])?.subtitles.includes(path)) {
          // A video and an audio file with one name: new subtitles would be neither file's, so none are made.
          throw new Error(`Another file is named like ${media.split("/").pop()}, so subtitles could not join it. Rename one of them first.`);
        }
        batch.uploads.push({ path, blob: new Blob([read.vtt], { type: "text/vtt" }) });
        // Subtitles the file had under another name stop showing; that file stays.
        if (current && current !== path) pages((source, page) => rules.removeTrackInPage(source, page, current, site, batchPrefix(batch)));
        pages((source, page) => rules.addTrackInPage(source, page, media, path, site, batchPrefix(batch)));
        next = { ...metadata, files: { ...metadata.files, [media]: { ...record, subtitles: path, ...agent ? { subtitlesByAgent: true } : {} } } };
      } else {
        if (!current) return;
        assetGuard(batch, [current]); batch.deletes.push(current);
        pages((source, page) => rules.removeTrackInPage(source, page, current, site, batchPrefix(batch)));
        next = { ...metadata, files: { ...metadata.files, [media]: record } };
        if (!Object.keys(record).length) delete next.files[media];
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    async remove(paths, unusedOnly = false, agent = false, expected?: Map<string, string | undefined>) {
      const ctx = active();
      const rules = agent ? await import("./agent-media-removal") : undefined;
      ctx.assertLive();
      if (agent && paths.some(path => !ctx.items.some(item => item.path === path))) throw new Error(OUTSIDE_MEDIA_REFUSED);
      const unique = rules ? rules.agentRemovalPaths(paths, ctx.paths) : [...new Set(paths.flatMap(path => familyPaths(path, ctx.paths)))];
      const versions = familyVersions(ctx, unique);
      const { batch, text, metadata } = await prepare(ctx, agent ? `Agent removed ${unique.length} files` : "Delete images", true);
      for (const [member, version] of versions) batch.expectedAssets.set(member, version);
      expectedAssets(ctx, batch, expected);
      assetGuard(batch, unique);
      if (rules) {
        const online = rules.agentOnlineStillRemovalProblem(unique, ctx.paths, metadata);
        if (online) throw new Error(online);
        const kept = rules.agentKeptRemovalProblem(unique, ctx.paths, metadata);
        if (kept) throw new Error(kept);
        const usage = wideUsage(unique, text, ctx, batchPrefix(batch));
        const used = unique.filter(path => usage[path].files.length || usage[path].pages.length);
        if (used.length) throw new Error("These files are still used; swap them out of every mention first: " +
          used.map(path => `${path}: ${[...new Set([...usage[path].pages, ...usage[path].files])].join(", ")}`).join("; "));
      }
      if (unusedOnly) {
        const usage = wideUsage(unique, text, ctx, batchPrefix(batch));
        if (unique.some((path) => usage[path].files.length)) throw new Error("Some selected images are now referenced. Refresh the library before deleting unused images.");
        // Clean up never removes a family with an Always keep member, even one marked during a recheck.
        const kept = unique.find(path => metadata.files[path]?.alwaysKeep);
        if (kept) throw new Error(`${kept.split("/").pop()} is marked Always keep now, so Clean up leaves it.`);
      }
      batch.deletes.push(...unique);
      recordsEdit(batch, metadata, await removedRecords(ctx, metadata, unique));
      await commit(ctx, batch);
      await sweep(ctx);
    },
    async restore(entries: { path: string; id: string }[], agent = false, expected?: Map<string, string | undefined>) {
      const ctx = active();
      const { batch, metadata } = await prepare(ctx, agent ? "Agent restored media files" : entries.length === 1 ? `Restore ${entries[0].path.split("/").pop()}` : "Restore files");
      expectedAssets(ctx, batch, expected);
      const date = today(ctx), paths = [...batch.expectedPaths];
      let next = pruneRemoved(metadata, date);
      for (const entry of entries) {
        const plan = planRestore(next, entry, paths, date);
        next = plan.records;
        for (const member of plan.members) {
          paths.push(member.path);
          batch.expectedAssets.set(member.path, ctx.assetVersion(member.path));
          if (member.sha) batch.restores.push({ path: member.path, sha: member.sha });
          else {
            const blob = await ctx.removedCopies?.get(member.browserKey!);
            ctx.assertLive();
            if (!blob) throw new Error(`${member.path.split("/").pop()} was kept in this browser only and its copy is gone (browser data cleared or another browser). It cannot be restored.`);
            batch.uploads.push({ path: member.path, blob });
          }
        }
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
      await sweep(ctx);
    },
    async removedBlob({ path, id }) {
      // A removed file's picture for Recently removed: its history blob, or this browser's copy.
      const ctx = active();
      const blob = id.startsWith("removed:") ? await ctx.removedCopies?.get(id) : await ctx.historyBlob?.(id, path);
      ctx.assertLive();
      if (!blob) throw new Error(`${path} has no picture to show.`);
      const type = uploadImageType(path);
      return type && blob.type !== type ? new Blob([blob], { type }) : blob;
    },
    async openPage(path) { await active().openPage(path); },
  } satisfies MediaPickerHost & { improve(request: import("./improve-heavy").ImproveRequest, ports?: import("./improve-heavy").ImprovePorts): Promise<import("./improve-heavy").ImproveResult>; improveGifsAndPlayers(request: import("./improve-gifs-players").ImproveGifsPlayersRequest, ports?: import("./improve-gifs-players").ImproveGifsPlayersPorts): Promise<import("./improve-gifs-players").ImproveGifsPlayersResult>; onlineVideo(record: OnlineVideoRecord, place?: MediaPlacement): Promise<void>; onlineVideoStill(key: import("./online-video").OnlineVideoKey, still: import("./online-video").OnlineVideoStill): Promise<void>; onlineVideoServiceBar(key: import("./online-video").OnlineVideoKey, enabled: boolean): Promise<void>; removeOnlineVideo(key: import("./online-video").OnlineVideoKey): Promise<void>; share(request: MediaShareRequest): Promise<string>; replace(request: MediaReplaceRequest, agent?: boolean, ports?: { encode?: typeof import("./media-optimise").optimiseMedia }): Promise<string>; trim(request: MediaTrimRequest): Promise<string>; describe(file: string, change: { text?: string; decorative?: boolean; page?: string; element?: string }): Promise<void> };
}
