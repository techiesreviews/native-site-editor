import type { Stamp } from "../guarded-edit";
import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";
import type { NativeSite, NativeTextEdit } from "../../shared/native-project";
import type { MediaWorkspaceContext, MediaWorkspaceBatch } from "../page-builder/media-workspace";
import type { MediaPickerOptions } from "../page-builder/media-picker";
type MediaLibraryView = ReturnType<typeof import("../page-builder/media-picker")["mountMediaLibrary"]>;
import { mediaExistingAlt, mediaImageMarkup, type MediaImage } from "../page-builder/media-markup";
import { locateNativeElementRange } from "../native-source-location";
import { isImagePath } from "../native-structure";
import { uploadImageType } from "../uploads";

export interface MediaWorkspaceSnapshot {
  repo: string;
  scope: DraftScope;
  identity: string;
  site?: NativeSite;
  nativePaths?: string[];
  drafts: DraftAccess & { list(scope: DraftScope): SavedDraft[] };
}
export interface MediaModule {
  openMediaPicker: (options: MediaPickerOptions) => Promise<void>;
  closeMediaPicker: () => void;
  mountMediaLibrary: (container: HTMLElement, options: MediaPickerOptions & { refreshKey?: () => string }) => MediaLibraryView;
}
export interface MediaControllerPorts {
  workspace(): MediaWorkspaceSnapshot | undefined;
  identity(): string;
  stamp(): Stamp;
  generation(): number;
  source(path: string, scope?: DraftScope): string | undefined;
  listPaths(workspace: MediaWorkspaceSnapshot): Promise<string[]>;
  findEntry(path: string): Promise<{ sha: string; size?: number } | undefined>;
  entry(path: string): { sha: string; size?: number } | undefined;
  readText(repo: string, sha: string): Promise<string>;
  rememberSource(path: string, source: string): void;
  uploadedBlob(scope: DraftScope, sha: string): Promise<Blob | undefined>;
  readBlob(repo: string, sha: string, path: string): Promise<Blob>;
  applyBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch): Promise<void>;
  openPage(path: string): Promise<void>;
  load(): Promise<MediaModule>;
  openFile(): string | undefined;
  viewingVersion(): boolean;
  restoreFile(path: string, generation: number): Promise<unknown>;
  change(path: string, source: string, edits: NativeTextEdit[], node: number[], message: string): boolean;
  /** DOM parser seam for source-only controller tests. Production uses the existing locator. */
  locateElement?: (source: string, node: number[]) => { tag: { name: string; start: number; end: number } } | undefined;
  galleryHost(): HTMLElement;
  galleryVisible(): boolean;
  imagesSelected(): boolean;
  gallerySignature(): string;
  observeBusy?(element: HTMLElement, changed: () => void): { disconnect(): void };
  announce(message: string): void;
  error(error: unknown): void;
}

/** Owns media UI sessions; source receipts, upload staging and Undo stay on the host. */
export function createMediaController(ports: MediaControllerPorts) {
  let loaded: MediaModule | undefined;
  const load = async () => loaded = await ports.load();

  async function workspaceContext(): Promise<MediaWorkspaceContext> {
    const workspace = ports.workspace();
    if (!workspace) throw new Error("Choose a repository before opening Images.");
    const { repo, scope, drafts, site } = workspace;
    const stamp = ports.stamp();
    const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Images and open it again."); };
    const branchPaths = workspace.nativePaths ?? await ports.listPaths(workspace);
    assertLive();
    const gone = new Set(drafts.list(scope).filter((draft) => draft.deleted).map((draft) => draft.path));
    const paths = [...new Set([...branchPaths, ...drafts.list(scope).filter((draft) => !draft.deleted).map((draft) => draft.path)])].filter((path) => !gone.has(path));
    const read = async (path: string) => {
      assertLive();
      const held = ports.source(path, scope);
      if (held !== undefined) return held;
      if (drafts.get(scope, path)?.deleted) return undefined;
      const entry = await ports.findEntry(path); assertLive();
      if (!entry) return undefined;
      const text = await ports.readText(repo, entry.sha); assertLive();
      ports.rememberSource(path, text); return text;
    };
    return {
      key: `${scope.account}:${scope.repoId}`, scope, drafts, paths,
      items: paths.filter(isImagePath).map((path) => {
        const draft = drafts.get(scope, path), entry = ports.entry(path);
        return { path, size: draft?.upload?.size ?? entry?.size, date: draft?.updatedAt, draft: Boolean(draft) };
      }),
      pages: site ? Object.values(site.routes) : paths.filter((path) => /(?:^|\/)index\.html$/i.test(path) && !path.startsWith("components/")),
      components: site?.components ?? {}, assertLive, read,
      blob: async (path) => {
        assertLive();
        const draft = drafts.get(scope, path);
        if (draft?.deleted) throw new Error(`${path} is deleted.`);
        if (draft?.upload && draft.sourceSha) {
          const blob = await ports.uploadedBlob(scope, draft.sourceSha); assertLive();
          if (!blob) throw new Error(`${path} is missing from this browser's storage. Upload it again.`);
          return blob;
        }
        const entry = draft?.sourceSha ? { sha: draft.sourceSha } : await ports.findEntry(path); assertLive();
        if (!entry) throw new Error(`${path} is unavailable.`);
        const blob = await ports.readBlob(repo, entry.sha, path); assertLive();
        const type = uploadImageType(path);
        return type && blob.type !== type ? new Blob([blob], { type }) : blob;
      },
      assetVersion: (path) => {
        assertLive();
        const record = drafts.get(scope, path);
        return record ? JSON.stringify(record) : ports.entry(path)?.sha;
      },
      applyBatch: async (batch) => { assertLive(); await ports.applyBatch(scope, stamp, batch); },
      write: async () => { throw new Error("Use the atomic image transaction."); },
      changed: () => {},
      rename: async () => { throw new Error("Use the atomic image transaction."); },
      remove: async () => { throw new Error("Use the atomic image transaction."); },
      openPage: async (path) => { assertLive(); await ports.openPage(path); },
    };
  }

  async function chooseImage(target: { path: string; node: number[]; width?: number }, files?: File[]) {
    const stamp = ports.stamp(), epoch = ports.generation();
    const source = ports.source(target.path);
    const locate = ports.locateElement ?? locateNativeElementRange;
    const initial = source === undefined ? undefined : locate(source, target.node);
    if (!initial || initial.tag.name !== "img" || ports.viewingVersion()) return;
    const expected = source!.slice(initial.tag.start, initial.tag.end);
    const initialAlt = mediaExistingAlt(expected);
    const { openMediaPicker } = await load();
    if (!stamp.holds() || ports.source(target.path) !== source) return;
    await openMediaPicker({ files, accept: "image/*", initialAlt, onPick: async (image: MediaImage) => {
      if (!stamp.holds()) throw new Error("The repository changed. Choose an image again.");
      if (ports.openFile() !== target.path) await ports.restoreFile(target.path, epoch);
      const latest = ports.source(target.path);
      const range = latest === undefined ? undefined : locate(latest, target.node);
      if (!stamp.holds() || latest !== source || !range || range.tag.name !== "img" || latest!.slice(range.tag.start, range.tag.end) !== expected) throw new Error("This image changed while the picker was open. Select it again.");
      const markup = mediaImageMarkup(image, expected, target.width, initialAlt !== undefined && image.alt === initialAlt);
      if (!ports.change(target.path, latest!, [{ start: range.tag.start, end: range.tag.end, text: markup }], target.node, "Image replaced")) throw new Error("The image could not be replaced.");
    } }).catch((error: unknown) => ports.error(error));
  }

  let gallery: MediaLibraryView | undefined;
  let galleryScope = "", signature = "", refreshNeeded = false, opening = 0;
  let observer: { disconnect(): void } | undefined;
  function disposeGallery() {
    opening++;
    observer?.disconnect(); observer = undefined;
    gallery?.dispose(); gallery = undefined;
    galleryScope = ""; signature = ""; refreshNeeded = false;
  }
  async function ensureGallery() {
    if (!ports.workspace()?.site) return;
    const scope = ports.identity();
    if (gallery && galleryScope === scope) { requestGalleryRefresh(); return; }
    disposeGallery();
    const attempt = ++opening;
    galleryScope = scope; signature = ports.gallerySignature();
    const { mountMediaLibrary } = await load();
    if (attempt !== opening || scope !== ports.identity() || !ports.imagesSelected()) return;
    gallery = mountMediaLibrary(ports.galleryHost(), { refreshKey: () => ports.gallerySignature() });
  }
  function requestGalleryRefresh() {
    if (!gallery) return;
    if (galleryScope !== ports.identity()) { disposeGallery(); return; }
    if (!ports.galleryVisible()) { refreshNeeded = true; return; }
    const next = ports.gallerySignature();
    if (next === signature) { if (refreshNeeded) queueMicrotask(flushGalleryRefresh); return; }
    signature = next; refreshNeeded = true;
    queueMicrotask(flushGalleryRefresh);
  }
  function flushGalleryRefresh() {
    const view = gallery;
    if (!view || !refreshNeeded || !ports.galleryVisible()) return;
    if (galleryScope !== ports.identity()) { disposeGallery(); return; }
    if (view.element.getAttribute("aria-busy") === "true") {
      if (!observer) {
        const changed = () => {
          if (view.element.getAttribute("aria-busy") === "true") return;
          observer?.disconnect(); observer = undefined;
          if (gallery === view) flushGalleryRefresh();
        };
        if (ports.observeBusy) observer = ports.observeBusy(view.element, changed);
        else {
          const watching = new MutationObserver(changed);
          watching.observe(view.element, { attributes: true, attributeFilter: ["aria-busy"] });
          observer = watching;
        }
      }
      return;
    }
    refreshNeeded = false;
    if (view.refreshedKey === ports.gallerySignature()) return;
    void view.refresh();
  }
  return { workspaceContext, chooseImage, ensureGallery, requestGalleryRefresh, disposeGallery,
    closePicker: () => loaded?.closeMediaPicker(), galleryVisible: () => ports.galleryVisible() };
}
