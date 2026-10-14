import { OUTSIDE_MEDIA_REFUSED, parseOutlineId } from "../../shared/agent";
import { startTags, startTagAttribute } from "../../shared/html-source";
import { locateNativeElementRange } from "../native-source-location";
import { mediaResolvePath } from "./media-references";
import { decodeHtmlEntities } from "./html-entities";
import type { MediaPickerHost } from "./media-picker";
import { readSiteMediaRecords, createMediaCollection, addToMediaCollection, takeOutOfMediaCollection, renameMediaCollection, deleteMediaCollection } from "./media-collections";
import { pageUsesFile, setMediaPlaceDecorative, confirmMediaDescription, descriptionPlaceEdits, mediaToCheck, placeWordsEdits, setMediaPlaceAgentText } from "./media-descriptions";
import { isMediaTextFile, mediaMentions } from "./media-mentions";
import { MAX_UPLOAD_BYTES, uploadPath, uploadFileName, uploadImageType } from "../uploads";
import type { DraftScope } from "../drafts";
import type { DraftAccess } from "../file-changes";
import { setMediaDescription, MEDIA_RECORDS_PATH, serializeMediaRecords, renameMediaRecord, removeMediaRecords, type MediaRecords } from "../../shared/media-records";
import { applyMediaMetadata, mediaMetadataView, type MediaMetadata } from "./media-metadata";
import { alwaysKeptFiles, mediaFamilyOf, renamedFamily } from "./media-families";
import { mediaEscape, mediaVariantName } from "./media-markup";
import { mediaUsageIndex, rewriteMediaReferences } from "./media-references";
import type { MediaImportRequest, MediaLibraryItem } from "./media-picker";

/** Prepared mutations only. The host validates and commits this entire batch atomically. */
export interface MediaWorkspaceBatch {
  label: string;
  expectedPaths: string[];
  expectedSources: Map<string, string | undefined>;
  expectedAssets: Map<string, string | undefined>;
  edits: Map<string, string>;
  moves: { from: string; to: string }[];
  deletes: string[];
  uploads: { path: string; blob: Blob }[];
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
  assertLive(): void;
  read(path: string): Promise<string | undefined>;
  blob(path: string): Promise<Blob>;
  /** Effective binary revision: branch SHA or draft SHA plus its change state. */
  assetVersion(path: string): string | undefined;
  applyBatch(batch: MediaWorkspaceBatch): Promise<void>;
  openPage(path: string): Promise<void>;
}

function wideUsage(paths: string[], text: Record<string, string>, ctx: MediaWorkspaceContext) {
  const site = { origins: ctx.origins ?? [] };
  const usage = mediaUsageIndex(paths, text, ctx.pages, ctx.components, site);
  for (const [path, mentions] of mediaMentions({ media: paths, sources: text, site })) for (const { file } of mentions) if (!usage[path].files.includes(file)) usage[path].files.push(file);
  return usage;
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
      edits: new Map(), moves: [], deletes: [], uploads: [],
    };
    for (const item of ctx.items) batch.expectedAssets.set(item.path, ctx.assetVersion(item.path));
    const text = usage ? await sources(ctx, batch.expectedPaths) : {};
    // Media files (SVG is text too) are proved by their asset revision, which also covers
    // uploads and moves whose bytes the host holds no source for.
    const media = new Set(ctx.items.map((item) => item.path));
    for (const [path, value] of Object.entries(text)) if (!media.has(path)) batch.expectedSources.set(path, value);
    const metadata = await ctx.read(MEDIA_RECORDS_PATH);
    ctx.assertLive();
    batch.expectedSources.set(MEDIA_RECORDS_PATH, metadata);
    return { batch, text, metadata: readSiteMediaRecords(metadata, ctx.items.map(item => item.path)) };
  };
  const assetGuard = (batch: MediaWorkspaceBatch, paths: string[]) => {
    for (const path of paths) {
      if (!batch.expectedPaths.includes(path)) throw new Error(`${path} is no longer in the image library.`);
      if (!batch.expectedAssets.has(path)) throw new Error(`${path} has no captured image revision. Refresh and try again.`);
    }
  };
  const commit = async (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch) => {
    ctx.assertLive();
    if (!batch.edits.size && !batch.moves.length && !batch.deletes.length && !batch.uploads.length) return;
    await ctx.applyBatch(batch);
    // Refresh belongs to the transaction host, so no fallible second mutation follows it.
  };
  const recordsEdit = (batch: MediaWorkspaceBatch, before: MediaRecords, records: MediaRecords) => {
    const next = serializeMediaRecords(records);
    if (next !== serializeMediaRecords(before)) batch.edits.set(MEDIA_RECORDS_PATH, next);
  };
  const rewriteInto = (batch: MediaWorkspaceBatch, text: Record<string, string>, from: string, to: string) => {
    for (const [path, source] of Object.entries(text)) {
      if (!/\.(?:html|css)$/i.test(path)) continue;
      const before = batch.edits.get(path) ?? source;
      const next = rewriteMediaReferences(path, before, from, to);
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
          { text: after?.description?.text ?? "", decorative: Boolean(after?.decorative) });
        if (edited !== original) batch.edits.set(page, edited);
      }
    }
    return next;
  };
  /** A family rename: the moves, every reference and the records follow; a refusal throws before any change. */
  const renameInto = (batch: MediaWorkspaceBatch, text: Record<string, string>, records: MediaRecords, path: string, name: string) => {
    const family = mediaFamilyOf(path, batch.expectedPaths);
    if (!name.trim() || /[\\/\u0000-\u001f]/.test(name)) throw new Error("Enter an image filename without a folder.");
    const filename = uploadFileName(name);
    if (!uploadImageType(filename) || uploadImageType(filename) !== uploadImageType(path)) throw new Error("Keep the image's file format when renaming it.");
    const to = path.slice(0, path.lastIndexOf("/") + 1) + filename;
    if (to === path) return records;
    const moves = family ? renamedFamily(family, to) : [{ from: path, to }];
    for (const move of moves) {
      if (move.from !== move.to && batch.expectedPaths.includes(move.to)) throw new Error(`${move.to} already exists. Choose another filename.`);
    }
    batch.moves.push(...moves.filter(move => move.from !== move.to));
    for (const move of moves) rewriteInto(batch, text, move.from, move.to);
    // Every member's record follows its file, in the same batch as the moves.
    return moves.reduce((next, move) => move.from === move.to ? next : renameMediaRecord(next, move.from, move.to), records);
  };
  const familyPaths = (path: string, paths: string[]) => {
    const family = mediaFamilyOf(path, paths);
    return family ? [path, ...family.copies.map(copy => copy.path), ...family.originals] : [path];
  };
  const familyVersions = (ctx: MediaWorkspaceContext, paths: string[]) =>
    new Map(paths.map(path => [path, ctx.assetVersion(path)]));
  const importMedia = async (requests: MediaImportRequest[]) => {
    const ctx = active();
    const { batch, text, metadata } = await prepare(ctx, "Add images", requests.some((item) => item.replaceFrom));
    const reserved = new Set(batch.expectedPaths);
    const changes: Record<string, Partial<MediaMetadata>> = {};
    const paths: string[] = [], joins = new Map<string, string[]>();
    for (const request of requests) {
      const { file, result, folder, replaceFrom } = request;
      if (folder.split("/").some((part) => part === "." || part === "..") || /[\\\u0000-\u001f]/.test(folder)) throw new Error("Choose a repository folder without . or .. segments.");
      const first = result.outputs[0];
      if (!first || first.variantWidth) throw new Error("No primary image was encoded.");
      if (result.outputs.some((output) => !/^[a-z0-9]+$/i.test(output.extension) || output.extension !== first.extension)) throw new Error("All responsive images must use the primary image format.");
      if (result.outputs.some((output) => output.blob.size > MAX_UPLOAD_BYTES)) throw new Error("An encoded image exceeds the 20 MB upload limit.");
      const stem = uploadFileName(file.name).replace(/\.[^.]+$/, "");
      const family = (primary: string) => result.outputs.map((output) => output.variantWidth ? mediaVariantName(primary, output.variantWidth) : primary);
      const primary = await uploadPath(folder, `${stem}.${first.extension}`, (path) => family(path).some((candidate) => reserved.has(candidate)));
      ctx.assertLive();
      const familyPaths = family(primary);
      if (new Set(familyPaths).size !== familyPaths.length) throw new Error("Responsive image widths must be unique.");
      result.outputs.forEach((output, index) => {
        const path = familyPaths[index]; reserved.add(path); batch.uploads.push({ path, blob: output.blob });
      });
      if (request.metadata) changes[primary] = request.metadata;
      if (request.collection) joins.set(request.collection, [...joins.get(request.collection) ?? [], primary]);
      if (replaceFrom) {
        assetGuard(batch, [replaceFrom]);
        if (!request.expectedAssetVersion) throw new Error("The original image revision was not captured. Reopen its optimisation preview.");
        if (ctx.assetVersion(replaceFrom) !== request.expectedAssetVersion) throw new Error(`${replaceFrom} changed since its optimisation preview. Reopen the preview before adding copies.`);
        batch.expectedAssets.set(replaceFrom, request.expectedAssetVersion);
        rewriteInto(batch, text, replaceFrom, primary);
      }
      paths.push(primary);
    }
    // New files join the viewed collection in the same batch: one Undo step.
    let next = applyMediaMetadata(metadata, changes);
    for (const [name, members] of joins) next = addToMediaCollection(next, name, members);
    recordsEdit(batch, metadata, next);
    await commit(ctx, batch);
    return paths;
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
        if (source === undefined || !pageUsesFile(source, page, file)) throw new Error(`${file} is not used on ${page}.`);
        const node = change.element === undefined ? undefined : parseOutlineId(change.element);
        if (change.element !== undefined && !node) throw new Error("Give an image element id.");
        const range = node && locateNativeElementRange(source, node);
        const images = startTags(source).filter(tag => tag.name === "img" && mediaResolvePath(decodeHtmlEntities(startTagAttribute(source, tag, "src")?.value ?? "", true), page) === file);
        if (node && (!range || range.tag.name !== "img" || !images.some(tag => tag.start === range.tag.start))) throw new Error("That element is not an image showing this file.");
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
      const records = readSiteMediaRecords(await ctx.read(MEDIA_RECORDS_PATH), ctx.items.map(item => item.path)); ctx.assertLive();
      const metadata = mediaMetadataView(records);
      return { key: ctx.key, collections: [...records.collections], items: ctx.items.map((item) => ({ ...item, version: ctx.assetVersion(item.path) })), metadata, usage: wideUsage(ctx.items.map((item) => item.path), text, ctx),
        // Folded over every path: a kept original the library does not list still marks its main.
        keep: [...alwaysKeptFiles(ctx.paths, new Set(Object.keys(records.files).filter(path => records.files[path].alwaysKeep)))],
        toCheck: mediaToCheck(records, ctx.items.map(item => item.path), text) };
    },
    async blob(path) { return active().blob(path); },
    async metadata(changes) {
      const ctx = active();
      const { batch, metadata, text } = await prepare(ctx, "Edit image metadata", true);
      recordsEdit(batch, metadata, metadataInto(batch, text, metadata, changes));
      await commit(ctx, batch);
    },
    async details(path, changes, name) {
      // File details' Save: its fields and its rename succeed whole, fail whole and undo as one step.
      const ctx = active();
      const versions = name === undefined ? undefined : familyVersions(ctx, familyPaths(path, ctx.paths));
      const { batch, metadata, text } = await prepare(ctx, name === undefined ? "Edit file details" : "Edit file details and rename", true);
      let next = metadataInto(batch, text, metadata, { [path]: changes });
      if (name !== undefined) {
        for (const [member, version] of versions!) batch.expectedAssets.set(member, version);
        assetGuard(batch, [...versions!.keys()]);
        next = renameInto(batch, text, next, path, name);
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
    async rename(path, name) {
      const ctx = active();
      const versions = familyVersions(ctx, familyPaths(path, ctx.paths));
      const { batch, text, metadata } = await prepare(ctx, "Rename image", true);
      for (const [member, version] of versions) batch.expectedAssets.set(member, version);
      assetGuard(batch, [...versions.keys()]);
      recordsEdit(batch, metadata, renameInto(batch, text, metadata, path, name));
      await commit(ctx, batch);
    },
    async check({ file, page, text: seen }, text) {
      // To check: a row that is gone (checked elsewhere) or holds other words than Lex saw refuses.
      const ctx = active();
      const words = text?.trim();
      const { batch, text: sources, metadata } = await prepare(ctx, "Description checked", true);
      const row = mediaToCheck(metadata, [file], sources).find(entry => entry.page === page);
      if (!row || row.text !== seen) throw new Error("These words changed meanwhile. Look at To check again.");
      if (words === "") throw new Error("Write the description, or press OK to keep these words.");
      const edit = words !== undefined && words !== row.text;
      if (edit) batch.label = "Edit description";
      let next: MediaRecords;
      if (page === undefined) {
        // Lex's words go through the usual description change: places using it follow, the mark goes.
        next = edit ? metadataInto(batch, sources, metadata, { [file]: { alt: words } }) : confirmMediaDescription(metadata, file);
      } else {
        // A place's own words: the page's alt and the record's mark change in one step.
        next = setMediaPlaceAgentText(metadata, file, page, undefined);
        if (edit) {
          const edited = placeWordsEdits(sources[page], file, page, row.text, words);
          if (edited !== sources[page]) batch.edits.set(page, edited);
        }
      }
      recordsEdit(batch, metadata, next);
      await commit(ctx, batch);
    },
    async remove(paths, unusedOnly = false) {
      const ctx = active();
      const unique = [...new Set(paths.flatMap(path => familyPaths(path, ctx.paths)))];
      const versions = familyVersions(ctx, unique);
      const { batch, text, metadata } = await prepare(ctx, "Delete images", true);
      for (const [member, version] of versions) batch.expectedAssets.set(member, version);
      assetGuard(batch, unique);
      if (unusedOnly) {
        const usage = wideUsage(unique, text, ctx);
        if (unique.some((path) => usage[path].files.length)) throw new Error("Some selected images are now referenced. Refresh the library before deleting unused images.");
      }
      batch.deletes.push(...unique);
      recordsEdit(batch, metadata, removeMediaRecords(metadata, unique));
      await commit(ctx, batch);
    },
    async openPage(path) { await active().openPage(path); },
  } satisfies MediaPickerHost & { describe(file: string, change: { text?: string; decorative?: boolean; page?: string; element?: string }): Promise<void> };
}
