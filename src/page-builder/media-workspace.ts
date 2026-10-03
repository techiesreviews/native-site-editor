import { MAX_UPLOAD_BYTES, uploadPath, uploadFileName, uploadImageType } from "../uploads";
import type { DraftScope } from "../drafts";
import type { DraftAccess } from "../file-changes";
import { MEDIA_METADATA_PATH, mergeMediaMetadata, parseMediaMetadata, type MediaMetadata } from "./media-metadata";
import { mediaVariantName } from "./media-markup";
import { mediaUsageIndex, rewriteMediaReferences } from "./media-references";
import type { MediaImportRequest, MediaLibraryItem, MediaPickerHost } from "./media-picker";

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
  pages: string[]; components: Record<string, string>;
  assertLive(): void;
  read(path: string): Promise<string | undefined>;
  blob(path: string): Promise<Blob>;
  /** Effective binary revision: branch SHA or draft SHA plus its change state. */
  assetVersion?(path: string): string | undefined;
  /** Required for mutations. Optional only while the editor host migrates its adapter. */
  applyBatch?(batch: MediaWorkspaceBatch): Promise<void>;
  // Legacy host members remain structurally compatible; this adapter never calls them.
  write(path: string, text: string): Promise<void>;
  changed(): void;
  rename(path: string, name: string): Promise<string>;
  remove(paths: string[]): Promise<void>;
  openPage(path: string): Promise<void>;
}

/** Repository adapter; the panel never writes directly to drafts, bytes or source models. */
export function createMediaWorkspace(context: () => Promise<MediaWorkspaceContext>): MediaPickerHost {
  let session: MediaWorkspaceContext | undefined;
  const active = () => {
    if (!session) throw new Error("Open the image library first.");
    session.assertLive();
    return session;
  };
  const sources = async (ctx: MediaWorkspaceContext, paths = [...ctx.paths]) => {
    const out: Record<string, string> = {};
    const files = paths.filter((path) => /\.(?:html|css)$/i.test(path) && !path.startsWith("node_modules/"));
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
    if (!ctx.applyBatch) throw new Error("Atomic image changes are unavailable. Refresh the editor and try again.");
    const batch: MediaWorkspaceBatch = {
      label, expectedPaths: [...ctx.paths], expectedSources: new Map(), expectedAssets: new Map(),
      edits: new Map(), moves: [], deletes: [], uploads: [],
    };
    if (ctx.assetVersion) for (const item of ctx.items) batch.expectedAssets.set(item.path, ctx.assetVersion(item.path));
    const text = usage ? await sources(ctx, batch.expectedPaths) : {};
    for (const [path, value] of Object.entries(text)) batch.expectedSources.set(path, value);
    const metadata = await ctx.read(MEDIA_METADATA_PATH);
    ctx.assertLive();
    batch.expectedSources.set(MEDIA_METADATA_PATH, metadata);
    parseMediaMetadata(metadata);
    return { batch, text, metadata };
  };
  const assetGuard = (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch, paths: string[]) => {
    if (!ctx.assetVersion) throw new Error("Image revision checks are unavailable. Refresh the editor and try again.");
    for (const path of paths) {
      if (!batch.expectedPaths.includes(path)) throw new Error(`${path} is no longer in the image library.`);
      if (!batch.expectedAssets.has(path)) throw new Error(`${path} has no captured image revision. Refresh and try again.`);
    }
  };
  const commit = async (ctx: MediaWorkspaceContext, batch: MediaWorkspaceBatch) => {
    ctx.assertLive();
    if (!batch.edits.size && !batch.moves.length && !batch.deletes.length && !batch.uploads.length) return;
    await ctx.applyBatch!(batch);
    // Refresh belongs to the transaction host, so no fallible second mutation follows it.
  };
  const metadataEdit = (batch: MediaWorkspaceBatch, source: string | undefined, changes: Record<string, Partial<MediaMetadata> | null>) => {
    if (!Object.keys(changes).length) return;
    const next = mergeMediaMetadata(source, changes);
    if (next !== source) batch.edits.set(MEDIA_METADATA_PATH, next);
  };
  const rewriteInto = (batch: MediaWorkspaceBatch, text: Record<string, string>, from: string, to: string) => {
    for (const [path, source] of Object.entries(text)) {
      const before = batch.edits.get(path) ?? source;
      const next = rewriteMediaReferences(path, before, from, to);
      if (next !== before) batch.edits.set(path, next);
    }
  };
  const importMedia = async (requests: MediaImportRequest[]) => {
    const ctx = active();
    const { batch, text, metadata } = await prepare(ctx, "Add images", requests.some((item) => item.replaceFrom));
    const reserved = new Set(batch.expectedPaths);
    const changes: Record<string, Partial<MediaMetadata>> = {};
    const paths: string[] = [];
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
      if (replaceFrom) {
        assetGuard(ctx, batch, [replaceFrom]);
        rewriteInto(batch, text, replaceFrom, primary);
      }
      paths.push(primary);
    }
    metadataEdit(batch, metadata, changes);
    await commit(ctx, batch);
    return paths;
  };
  return {
    begin() { session = undefined; },
    async load() {
      if (session) session.assertLive();
      session = await context();
      const ctx = active();
      const text = await sources(ctx);
      const metadata = parseMediaMetadata(await ctx.read(MEDIA_METADATA_PATH)); ctx.assertLive();
      return { key: ctx.key, items: ctx.items, metadata, usage: mediaUsageIndex(ctx.items.map((item) => item.path), text, ctx.pages, ctx.components) };
    },
    async blob(path) { return active().blob(path); },
    async metadata(changes) {
      const ctx = active();
      const { batch, metadata } = await prepare(ctx, "Edit image metadata");
      metadataEdit(batch, metadata, changes);
      await commit(ctx, batch);
    },
    import: importMedia,
    async upload(file, result, folder) { return (await importMedia([{ file, result, folder }]))[0]; },
    async rename(path, name) {
      const ctx = active();
      const { batch, text, metadata } = await prepare(ctx, "Rename image", true);
      assetGuard(ctx, batch, [path]);
      if (!name.trim() || /[\\/\u0000-\u001f]/.test(name)) throw new Error("Enter an image filename without a folder.");
      const filename = uploadFileName(name);
      if (!uploadImageType(filename) || uploadImageType(filename) !== uploadImageType(path)) throw new Error("Keep the image's file format when renaming it.");
      const to = path.slice(0, path.lastIndexOf("/") + 1) + filename;
      if (to === path) return;
      if (batch.expectedPaths.includes(to)) throw new Error(`${to} already exists. Choose another filename.`);
      batch.moves.push({ from: path, to });
      rewriteInto(batch, text, path, to);
      const before = parseMediaMetadata(metadata)[path];
      if (before) {
        const moved = JSON.parse(metadata!);
        Object.defineProperty(moved, to, { value: moved[path], enumerable: true, configurable: true, writable: true });
        delete moved[path];
        batch.edits.set(MEDIA_METADATA_PATH, mergeMediaMetadata(JSON.stringify(moved), {}));
      }
      await commit(ctx, batch);
    },
    async remove(paths, unusedOnly = false) {
      const ctx = active();
      const { batch, text, metadata } = await prepare(ctx, "Delete images", true);
      const unique = [...new Set(paths)];
      assetGuard(ctx, batch, unique);
      if (unusedOnly) {
        const usage = mediaUsageIndex(unique, text, ctx.pages, ctx.components);
        if (unique.some((path) => usage[path].files.length)) throw new Error("Some selected images are now referenced. Refresh the library before deleting unused images.");
      }
      batch.deletes.push(...unique);
      metadataEdit(batch, metadata, Object.fromEntries(unique.map((path) => [path, null])));
      await commit(ctx, batch);
    },
    async rewrite(from, to) {
      const ctx = active();
      const { batch, text } = await prepare(ctx, "Update image references", true);
      rewriteInto(batch, text, from, to);
      await commit(ctx, batch);
    },
    async openPage(path) { await active().openPage(path); },
  };
}
