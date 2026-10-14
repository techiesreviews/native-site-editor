import type { MediaUsageCheckPorts } from "./media-usage-controller";
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
  mountMediaLibrary: (container: HTMLElement, options: MediaPickerOptions & { refreshKey?: () => string; cleanUp?: import("../page-builder/media-picker").MediaCleanUpMount }) => MediaLibraryView;
}
export interface MediaControllerPorts {
  usage?: MediaUsageCheckPorts;
  /** The clean-up count: where it is remembered (repository and branch) and the controls that show it. */
  cleanUp?: { place(): string; marks(): HTMLElement[] };
  origins?(): string[];
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
  mediaSelected(): boolean;
  gallerySignature(): string;
  observeBusy?(element: HTMLElement, changed: () => void): { disconnect(): void };
  refreshDescriptions(): void;
  announce(message: string): void;
  error(error: unknown): void;
}

/** Owns media UI sessions; source receipts, upload staging and Undo stay on the host. */
export function createMediaController(ports: MediaControllerPorts) {
  let usage: ReturnType<typeof import("./media-usage-controller")["createMediaUsageController"]> | undefined;
  let usageLoading: Promise<void> | undefined;
  const usageListeners = new Set<(records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void>();
  // Clean up's count rides in the usage chunk: no clean-up code runs at boot.
  let cleanUp: ReturnType<typeof import("./media-clean-up-controller")["createMediaCleanUpController"]> | undefined;
  let cleanUpView: typeof import("../page-builder/media-clean-up-view") | undefined;
  let panel: { slot: HTMLElement; open: boolean; closed: () => void } | undefined;
  function drawCleanUp() {
    if (!cleanUp || !cleanUpView || !ports.cleanUp) return;
    const state = cleanUp.state();
    cleanUpView.drawMediaCount(ports.cleanUp.marks(), state.badge);
    const live = panel;
    if (live?.slot.isConnected) cleanUpView.drawCleanUpPanel(live.slot, state, live.open, {
      dismiss: () => cleanUp?.dismiss(),
      close: () => { live.open = false; drawCleanUp(); live.closed(); },
    });
  }
  // More's Clean up item: its label carries the count; the panel opens above the grid.
  function mountCleanUp(slot: HTMLElement, closed: () => void) {
    const live = panel = { slot, open: false as boolean, closed };
    return {
      item: () => cleanUp?.item() ?? { label: "Clean up", disabled: "Still checking which files are used." },
      open: () => { live.open = true; drawCleanUp(); },
    };
  }
  function refreshUsage() {
    const check = ports.usage;
    if (!check) return;
    if (usage) { usage.refresh(); return; }
    const key = check.key();
    if (!key) return;
    // Even the scanner's chunk waits for the deferred text index and first paint.
    void check.settled().then(() => {
      if (key !== check.key()) return;
      const marks = ports.cleanUp;
      usageLoading ??= Promise.all([import("./media-usage-controller"),
        marks && import("./media-clean-up-controller"), marks && import("../page-builder/media-clean-up-view"),
      ]).then(([{ createMediaUsageController }, cleanUpModule, view]) => {
        if (marks && cleanUpModule && view) {
          cleanUpView = view;
          cleanUp = cleanUpModule.createMediaCleanUpController({ ...check, place: () => marks.place(), storage: () => localStorage, changed: drawCleanUp });
        }
        usage = createMediaUsageController({ ...check, changed: records => {
          check.changed(records);
          void cleanUp?.update(records);
          for (const listener of usageListeners) listener(records);
        } });
        usage.refresh();
      }).catch(error => { usageLoading = undefined; ports.error(error); });
    }).catch(error => ports.error(error));
  }
  let loaded: MediaModule | undefined;
  const load = async () => loaded = await ports.load();

  async function workspaceContext(include: (path: string) => boolean = isImagePath): Promise<MediaWorkspaceContext> {
    const workspace = ports.workspace();
    if (!workspace) throw new Error("Choose a repository before opening Media.");
    const { repo, scope, drafts, site } = workspace;
    const stamp = ports.stamp();
    const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Media and open it again."); };
    const branchPaths = workspace.nativePaths ?? await ports.listPaths(workspace);
    assertLive();
    const gone = new Set(drafts.list(scope).filter((draft) => draft.deleted).map((draft) => draft.path));
    const paths = [...new Set([...branchPaths, ...drafts.list(scope).filter((draft) => !draft.deleted).map((draft) => draft.path)])].filter((path) => !gone.has(path));
    const read = async (path: string) => {
      assertLive();
      const held = ports.source(path, scope);
      if (held !== undefined) return held;
      const draft = drafts.get(scope, path);
      if (draft?.deleted) return undefined;
      // An uploaded or moved file (an SVG, say) holds no text in its draft: read its bytes.
      if (draft?.opaque && draft.sourceSha) {
        const text = draft.upload ? await (await ports.uploadedBlob(scope, draft.sourceSha))?.text() : await ports.readText(repo, draft.sourceSha);
        assertLive(); return text;
      }
      const entry = await ports.findEntry(path); assertLive();
      if (!entry) return undefined;
      const text = await ports.readText(repo, entry.sha); assertLive();
      ports.rememberSource(path, text); return text;
    };
    for (const path of [".editor/config.json", "CNAME"]) if (paths.includes(path)) await read(path);
    assertLive();
    return {
      key: `${scope.account}:${scope.repoId}`, scope, drafts, paths,
      items: paths.filter(include).map((path) => {
        const draft = drafts.get(scope, path), entry = ports.entry(path);
        return { path, size: draft?.upload?.size ?? entry?.size, date: draft?.updatedAt, draft: Boolean(draft) };
      }),
      pages: site ? Object.values(site.routes) : paths.filter((path) => /(?:^|\/)index\.html$/i.test(path) && !path.startsWith("components/")),
      components: site?.components ?? {}, get origins() { return ports.origins?.() ?? []; }, assertLive, read,
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
      openPage: async (path) => { assertLive(); await ports.openPage(path); },
    };
  }

  // Keep record parsing and description rules in the lazy media chunk.
  let descriptions: typeof import("../page-builder/media-descriptions") | undefined;
  let recordIO: typeof import("../../shared/media-records") | undefined;
  let recordsScope = "";
  let warming: Promise<void> | undefined;
  async function warmDescriptions() {
    const identity = ports.identity(), stamp = ports.stamp();
    const [rules, io, references, entities, ctx] = await Promise.all([
      import("../page-builder/media-descriptions"), import("../../shared/media-records"),
      import("../page-builder/media-references"), import("../page-builder/html-entities"), workspaceContext(),
    ]);
    if (!stamp.holds() || identity !== ports.identity()) return;
    const source = await ctx.read(io.MEDIA_RECORDS_PATH);
    ctx.assertLive();
    if (!stamp.holds() || identity !== ports.identity()) return;
    io.parseMediaRecords(source);
    resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page);
    decodeAlt = value => entities.decodeHtmlEntities(value, true);
    descriptions = rules; recordIO = io; recordsScope = identity;
    ports.refreshDescriptions();
  }
  function placeState(page: string, src: string, alt: string | undefined) {
    if (!descriptions || !recordIO || recordsScope !== ports.identity()) {
      if (!warming) warming = warmDescriptions().catch(() => {}).finally(() => { warming = undefined; });
      return undefined;
    }
    try {
      const records = recordIO.parseMediaRecords(ports.source(recordIO.MEDIA_RECORDS_PATH));
      const file = resolveFile(page, src);
      return file ? { ...descriptions.placeDescriptionState(records, file, page, alt === undefined ? undefined : decodeAlt(alt)), fileDecorative: Boolean(records.files[file]?.decorative) } : undefined;
    } catch { return undefined; }
  }
  // Resolve through the same URL rules used by media references, loaded with the rules.
  let decodeAlt = (value: string) => value;
  let resolveFile = (_page: string, _src: string): string | undefined => undefined;
  async function changePlace(page: string, node: number[], decorative: boolean) {
    const stamp = ports.stamp(), source = ports.source(page);
    if (source === undefined || ports.viewingVersion() || ports.openFile() !== page) return;
    // The batch records Undo on the open page, so that page must still be the one marked.
    const current = () => stamp.holds() && !ports.viewingVersion() && ports.openFile() === page && ports.source(page) === source;
    try {
      const [rules, io, references, html, entities, ctx, collections] = await Promise.all([
        import("../page-builder/media-descriptions"), import("../../shared/media-records"),
        import("../page-builder/media-references"), import("../../shared/html-source"),
        import("../page-builder/html-entities"), workspaceContext(), import("../page-builder/media-collections"),
      ]);
      if (!current()) throw new Error("This image changed. Select it again.");
      const metadata = await ctx.read(io.MEDIA_RECORDS_PATH);
      ctx.assertLive();
      if (!current()) throw new Error("This image changed. Select it again.");
      const records = collections.readSiteMediaRecords(metadata, ctx.items.map(item => item.path));
      const range = (ports.locateElement ?? locateNativeElementRange)(source, node);
      if (!range || range.tag.name !== "img") return;
      const tag = html.startTags(source).find(tag => tag.start === range.tag.start);
      if (!tag) return;
      const src = html.startTagAttribute(source, tag, "src");
      const file = src && references.mediaResolvePath(entities.decodeHtmlEntities(src.value, true), page);
      if (!file) throw new Error("Choose an image stored in this repository before marking it Decorative.");
      const next = rules.setMediaPlaceDecorative(records, file, page, decorative);
      const edits = new Map<string, string>();
      if (next !== records) edits.set(io.MEDIA_RECORDS_PATH, io.serializeMediaRecords(next));
      if (decorative) {
        const alt = html.startTagAttribute(source, tag, "alt");
        const updated = source.slice(0, alt?.start ?? tag.nameEnd) + ' alt=""' + source.slice(alt?.end ?? tag.nameEnd);
        if (updated !== source) edits.set(page, updated);
      }
      if (!edits.size) return;
      await ctx.applyBatch({ label: "Change Decorative image",
        expectedPaths: ctx.paths, expectedSources: new Map([[page, source], [io.MEDIA_RECORDS_PATH, metadata]]),
        expectedAssets: new Map(), edits, moves: [], deletes: [], uploads: [] });
      ctx.assertLive();
      decodeAlt = value => entities.decodeHtmlEntities(value, true);
      descriptions = rules; recordIO = io;
      recordsScope = ports.identity();
      resolveFile = (page, src) => references.mediaResolvePath(entities.decodeHtmlEntities(src, true), page);
      ports.refreshDescriptions();
    } catch (error) { ports.error(error); }
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
    if (attempt !== opening || scope !== ports.identity() || !ports.mediaSelected()) return;
    gallery = mountMediaLibrary(ports.galleryHost(), { refreshKey: () => ports.gallerySignature(),
      cleanUp: ports.cleanUp && mountCleanUp });
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
  return { refreshUsage, invalidateUsage: () => { usage?.invalidate(); cleanUp?.invalidate(); }, usageRecords: () => usage?.usageRecords(),
    onUsageChange: (listener: (records: ReturnType<NonNullable<typeof usage>["usageRecords"]>) => void) => {
      usageListeners.add(listener); return () => { usageListeners.delete(listener); };
    },
    workspaceContext, chooseImage, placeState, changePlace, ensureGallery, requestGalleryRefresh, disposeGallery,
    closePicker: () => loaded?.closeMediaPicker(), galleryVisible: () => ports.galleryVisible() };
}
