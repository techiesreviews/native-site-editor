// Media's wiring: the images an Address suggests, files added from the
// computer and discarded uploads, the media text reads, the site's own
// origins, the media controller's ports and the controller itself, its usage
// check and the media batches. The host (src/main.ts) keeps the session, the
// site runtime, the editor and the preview, and hands them in as live ports.

import { batch, effect } from "@preact/signals-core";
import { MEDIA_RECORDS_PATH } from "../../shared/media-records-path";
import { NATIVE_CONFIG_PATH, nativeSitePrefix, nativeSiteSettings } from "../../shared/native-project";
import { siteAddress } from "../../shared/site-path-prefix";
import type { Repository, Snapshot, TreeEntry } from "../../shared/types";
import type { AppStore } from "../app-store";
import type { CleanSourceCache } from "../clean-source-cache";
import type * as sourceEditor from "../components/source-editor";
import { createNativePreview } from "../components/native-preview";
import type { AnnounceAs } from "../components/toast-rules";
import type { ToastAction } from "../components/toast";
import { draftKey, draftStore, type DraftScope } from "../drafts";
import type { createFinishedElsewhere } from "../finished-elsewhere";
import type { GuardedEdits, Stamp } from "../guarded-edit";
import type { createParkedSteps } from "../guarded-edit/parked";
import { nativeShownFiles } from "../native-boot";
import type { createNativeSiteRuntime } from "../native-site-runtime";
import { isImagePath } from "../native-structure";
import type { createMediaHistoryHome } from "../page-builder/media-history-home";
import { mediaOwnOrigins } from "../page-builder/media-origins";
import type { MediaWorkspaceBatch } from "../page-builder/media-workspace";
import type { RepositoryApi, RepositoryIndex } from "../repository-loading";
import { uploadBytes, uploadKey } from "../uploads";
import type { SessionStamp, WorkspaceSession } from "../workspace-session";
import { createMediaController, type MediaControllerPorts, type MediaPin } from "./media-controller";
import { pinMedia } from "./media-pin";
import type { createPageStructureController } from "./page-structure-controller";

export interface MediaHostPorts {
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  appStore: AppStore;
  workspaceSession: Pick<WorkspaceSession, "begin">;
  editorModule: typeof sourceEditor;
  mediaHistoryHome: ReturnType<typeof createMediaHistoryHome>;
  guardedEdits: Pick<GuardedEdits, "stamp">;
  parkedSteps: Pick<ReturnType<typeof createParkedSteps>, "park">;
  finishedWork: Pick<ReturnType<typeof createFinishedElsewhere>, "add">;
  pageStructureController: Pick<ReturnType<typeof createPageStructureController>, "renderEditBar" | "editOpenPage">;
  repositoryIndex: Pick<RepositoryIndex, "seed" | "entry" | "find">;
  versions: { readonly view?: unknown };
  cleanSources: Pick<CleanSourceCache, "put" | "peek">;
  api: RepositoryApi;
  /** Host state, read at call time. */
  readonly nativePreview: Pick<ReturnType<typeof createNativePreview>, "shownRoute" | "measureImage" | "selectAfterUpdate" | "flashInsert" | "selectionBox" | "imageLook" | "scrollBy" | "playMedia"> | undefined;
  readonly pagesController: { pageLabel(file: string): string | undefined; selectTab(tab: "media"): void; explorerTab(): string };
  readonly workspace: { readonly explorerDropdown?: { open(): void } };
  element: <T extends HTMLElement>(id: string) => T;
  lazyModule: <T>(load: () => Promise<T>) => () => Promise<T>;
  loadMediaWorkspace: Parameters<typeof import("../media-batch").applyMediaBatch>[0]["load"];
  loadMedia: MediaControllerPorts["load"];
  draftScope: () => DraftScope | undefined;
  currentLoad: () => number;
  stampOf: (epoch: number) => SessionStamp;
  setupScope: () => string;
  nativeTextIndexScopeKey: () => string;
  entryAt: (path: string) => TreeEntry | undefined;
  findEntry: (path: string) => Promise<TreeEntry | undefined>;
  readFile: (repo: string, sha: string) => Promise<string>;
  readBlob: MediaControllerPorts["readBlob"];
  listRepositoryFiles: (repo: Repository, snapshot: Snapshot) => Promise<string[]>;
  loadNativeAssets: (sources?: Record<string, string>) => Promise<unknown>;
  updateNativePreviewSources: () => void;
  afterFileChanges: () => void;
  openAfter: (path: string | undefined, keepExplorer?: boolean, quietStatus?: boolean) => Promise<void>;
  restoreFile: (path: string, at: SessionStamp, options?: { linkDefaultStyle?: boolean }) => Promise<unknown>;
  imagesSignature: () => string;
  announce: (text: string, as?: AnnounceAs) => void;
  undoAction: (path: string) => ToastAction | undefined;
  errorMessage: (error: unknown) => void;
}

export function createMediaHost(ports: MediaHostPorts) {
  // Images an image's Address suggests: the branch's and the drafted ones, not deleted ones.
  function nativeImagePaths() {
    const scope = ports.draftScope();
    const drafts = scope ? draftStore().list(scope) : [];
    const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
    return [...new Set([
      ...(ports.appStore.snapshot.value?.tree ?? []).filter((entry) => entry.type === "blob" && isImagePath(entry.path)).map((entry) => entry.path),
      ...ports.runtime.newDraftPaths({ kind: isImagePath }, scope),
    ])].filter((path) => !gone.has(path)).sort();
  }

  // Files from the computer as new-file drafts in `folder` (src/uploads.ts), never over something
  // that is there, with the shared adding progress at the foot of Files; resolves to the paths added.
  // They land in the drop's repository and branch even once another is shown (ticket 23).
  async function uploadFilesTo(folder: string, files: File[]): Promise<string[]> {
    const pin = mediaPorts.pin?.();
    if (!pin || !files.length) return [];
    try {
      const { addFilesTo } = await import("../page-builder/media-files-adding");
      return await addFilesTo(ports.element("explorer-files"), folder, files, { error: ports.errorMessage,
        // Finished on a workspace not shown, nothing is said: the menu counts it there (ticket 27, Lex: no toasts).
        announce: text => { if (pin.here()) ports.announce(text); }, context: () => mediaController.workspaceContext(undefined, pin),
        // Pictures not added yet go to Media's Optimise sheet, still bound for this folder (on show only).
        review: ports.element("explorer-tabs").hidden ? undefined : (images, into, reasons) => {
          if (!pin.here()) return;
          ports.workspace.explorerDropdown?.open(); ports.pagesController.selectTab("media");
          void mediaController.reviewInGallery(images, into, reasons).catch(ports.errorMessage);
        } }).then((paths) => { if (!pin.here()) ports.finishedWork.add(pin.scope, "added", { count: paths.length }); return paths; });
    } catch (error) { ports.errorMessage(error); return []; }
  }

  // An upload and its per-file records leave together, through the lazy media rules.
  async function discardUpload(path: string) {
    const scope = ports.draftScope(), since = ports.guardedEdits.stamp();
    if (!scope || !draftStore().get(scope, path)?.upload) return;
    const draft = draftStore().get(scope, path), records = draftStore().get(scope, ".editor/media.json");
    const { discardUploadDraft } = await import("../page-builder/media-upload-discard");
    if (!since.holds() || draftStore().get(scope, path) !== draft || draftStore().get(scope, ".editor/media.json") !== records) return;
    try {
      let discarded = false;
      batch(() => { discarded = discardUploadDraft(draftStore(), scope, path); });
      if (discarded) { ports.afterFileChanges(); ports.announce(`Discarded ${path}.`); }
    } catch (error) { ports.errorMessage(error); }
  }

  async function readMediaText(path: string) {
    const key = ports.nativeTextIndexScopeKey(), repo = ports.appStore.repository.value;
    const held = ports.runtime.textSource(path);
    if (held !== undefined) return held;
    if (!repo || !key) return undefined;
    const scope = ports.draftScope(), draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft?.deleted) return undefined;
    // An uploaded or moved file (an SVG, say) holds no text in its draft: read its bytes.
    if (scope && draft?.opaque && draft.sourceSha) {
      const text = draft.upload ? await (await uploadBytes().get(uploadKey(scope, draft.sourceSha)))?.text() : await ports.readFile(repo.full_name, draft.sourceSha);
      if (key !== ports.nativeTextIndexScopeKey() || draftStore().get(scope, path) !== draft) return undefined;
      if (text !== undefined) ports.runtime.state.opaqueText.set(draftKey(scope, path), { sha: draft.sourceSha, text });
      return text;
    }
    const entry = await ports.findEntry(path);
    if (key !== ports.nativeTextIndexScopeKey() || !entry) return undefined;
    const source = await ports.readFile(repo.full_name, entry.sha);
    if (key !== ports.nativeTextIndexScopeKey()) return undefined;
    ports.cleanSources.put("", key, path, source);
    return source;
  }
  function mediaOrigins() {
    return mediaOwnOrigins(nativeSiteSettings(ports.runtime.textSource(NATIVE_CONFIG_PATH)).url, ports.runtime.textSource("CNAME"));
  }

  // Background pages of workspaces not shown (src/background-page.ts), made with the first.
  let backgroundPages: ReturnType<typeof import("../background-page").createBackgroundPages<import("../background-page").BackgroundFrame>> | undefined;
  // Media context and UI lifecycle use live getters; binary/Undo writes stay here.
  const mediaPorts: MediaControllerPorts = {
    measureImage: (path, node, image, slot, style) => ports.nativePreview && ports.runtime.site?.routes[ports.nativePreview.shownRoute() ?? ""] === path
      ? ports.nativePreview.measureImage({ path, node, slot, style, ...(image.width && image.height ? { image: { width: image.width, height: image.height } } : {}) }) : Promise.resolve(undefined),
    finishedAway: (scope) => ports.finishedWork.add(scope, "media"),
    // Work whose workspace is not shown measures in a background page of its site and page (ticket 27).
    measureAway: async (pin, path, node, image, slot, style) => {
      const site = pin.site, module = await import("../background-page");
      if (!site) return undefined;
      backgroundPages ??= module.createBackgroundPages();
      // This work's own texts: a page shared with other work is drawn from them as it measures.
      const own = { site, page: path, files: () => new Set(pin.files()),
        text: async (file: string) => pin.source(file) ?? await pin.find(file).then((entry) => entry && ports.readFile(pin.repo, entry.sha)),
        shown: (source: (file: string) => string | undefined, isFile: (file: string) => boolean) => nativeShownFiles(site, [path], source, isFile, nativeSitePrefix(pin.source(NATIVE_CONFIG_PATH))) };
      return backgroundPages.use(module.backgroundKey(pin.scope, path), () => module.openBackgroundFrame(own, (host) => createNativePreview(host)),
        (frame) => frame.measure({ path, node, slot, style, ...(image.width && image.height ? { image: { width: image.width, height: image.height } } : {}) }, own));
    },
    origins: mediaOrigins,
    usage: {
      key: () => ports.runtime.state.textIndexScope === ports.nativeTextIndexScopeKey() ? ports.nativeTextIndexScopeKey() : "", files: () => ports.runtime.files(),
      pages: () => Object.values(ports.runtime.site?.routes ?? {}), components: () => ports.runtime.site?.components ?? {},
      source: path => ports.runtime.textSource(path), read: readMediaText,
      url: () => nativeSiteSettings(ports.runtime.textSource(NATIVE_CONFIG_PATH)).url,
      settled: () => ports.runtime.state.textIndexing ?? Promise.resolve(), changed: () => {},
    },
    cleanUp: { place: () => ports.setupScope() },
    // Improve images opens each page so its pictures are measured; the canvas draws it a moment later (at most 5 s).
    showPage: async path => {
      if (ports.appStore.openFile.value !== path) await ports.openAfter(path, true, true);
      for (let wait = 0; wait < 50 && ports.runtime.site?.routes[ports.nativePreview?.shownRoute() ?? ""] !== path; wait++) await new Promise(done => setTimeout(done, 100));
    },
    workspace: () => {
      const repo = ports.appStore.repository.value, scope = ports.draftScope();
      if (!repo || !scope || !ports.appStore.snapshot.value) return undefined;
      return { repo: repo.full_name, repoSize: repo.size, scope, identity: mediaIdentity(), site: ports.runtime.site,
        nativePaths: ports.runtime.site ? ports.runtime.files(scope) : undefined, drafts: draftStore() };
    },
    // The workspace shown, for work to finish in (ticket 23): the editor's reads while it is on show,
    // then its snapshot's, the branch texts read so far and its drafts.
    pin: () => pinMedia({ shown: () => { const repo = ports.appStore.repository.value, scope = ports.draftScope(), snapshot = ports.appStore.snapshot.value; return repo && scope && snapshot && { repo, scope, snapshot, site: ports.runtime.site }; },
      begin: () => ports.workspaceSession.begin(), base: () => ({ files: ports.runtime.base.files, texts: ports.runtime.base.sources, key: ports.nativeTextIndexScopeKey() }), identity: mediaIdentity, drafts: draftStore,
      live: { entry: ports.entryAt, find: ports.findEntry, source: (path, scope) => ports.runtime.textSource(path, scope), files: scope => ports.runtime.files(scope), remember: (path, text) => mediaPorts.rememberSource(path, text) },
      // Seeded first: a switch clears the index, and the pinned snapshot's files must read the same before and after (ticket 27).
      entry: (repo, snapshot, path) => { ports.repositoryIndex.seed(repo, snapshot); return ports.repositoryIndex.entry(repo, snapshot, path); }, find: (repo, snapshot, path) => ports.repositoryIndex.find(ports.api, repo, snapshot, path),
      files: (scope, base) => ports.runtime.files(scope, base), list: ports.listRepositoryFiles, peek: (repo, revision, path) => ports.cleanSources.peek(repo, revision, path) }),
    identity: mediaIdentity,
    stamp: () => ports.guardedEdits.stamp("repository"),
    generation: ports.currentLoad,
    selected: (path, node) => ports.appStore.selection.value?.path === path && ports.appStore.selection.value.node?.join(".") === node.join("."),
    source: (path, scope) => ports.runtime.textSource(path, scope),
    listPaths: async () => { const repo = ports.appStore.repository.value, snapshot = ports.appStore.snapshot.value; if (!repo || !snapshot) throw new Error("Choose a repository before opening Media."); return ports.listRepositoryFiles(repo, snapshot); },
    findEntry: ports.findEntry,
    entry: ports.entryAt,
    readText: ports.readFile,
    rememberSource: (path, source) => {
      // Native preview sources stay separate from the wider text index; without a site nothing keeps either current.
      if (!ports.runtime.site) return;
      if (/\.(?:html|css)$/i.test(path) || path === MEDIA_RECORDS_PATH) ports.runtime.base.sources.set(path, source);
      else ports.cleanSources.put("", ports.nativeTextIndexScopeKey(), path, source);
    },
    uploadedBlob: (scope, sha) => uploadBytes().get(uploadKey(scope, sha)),
    readBlob: ports.readBlob,
    applyBatch: applyMediaBatch,
    refreshDescriptions: () => { if (ports.appStore.selection.value) ports.pageStructureController.renderEditBar(ports.appStore.selection.value); },
    placeLabel: (file) => ports.pagesController.pageLabel(file),
    select: (path, node) => { ports.nativePreview?.selectAfterUpdate({ path, node }); ports.nativePreview?.flashInsert({ path, node }); },
    imagePopup: {
      image: () => ports.nativePreview?.selectionBox(),
      bar: () => document.querySelector<HTMLElement>(".edit-bar"),
      frame: () => ports.element("main").querySelector(".native-preview-frame")?.getBoundingClientRect(),
      look: (target, look) => ports.nativePreview?.imageLook(target, look),
      scroll: dy => ports.nativePreview?.scrollBy(dy),
      // Read as the canvas reads its images, so the page can show a replacement too.
      picture: async path => {
        if (!ports.runtime.state.assets.has(path)) await ports.loadNativeAssets({ [ports.appStore.openFile.value ?? "index.html"]: `<img src="${siteAddress(path, ports.runtime.prefix()).replace(/&/g, "&amp;")}">` });
        return ports.runtime.state.assets.get(path);
      },
    },
    mediaPlay: {
      send: (id, request, blob) => ports.nativePreview?.playMedia(id, request, blob),
      box: () => ports.nativePreview?.selectionBox() ?? undefined,
      frame: () => ports.element("main").querySelector(".native-preview-frame")?.getBoundingClientRect(),
      watch: (listener) => ports.appStore.selection.subscribe(listener),
    },
    openPage: (...args) => ports.openAfter(...args),
    load: ports.loadMedia,
    openFile: () => ports.appStore.openFile.value,
    viewingVersion: () => Boolean(ports.versions.view),
    restoreFile: (path, epoch) => ports.restoreFile(path, ports.stampOf(epoch), { linkDefaultStyle: false }),
    change: (...args) => ports.pageStructureController.editOpenPage(...args),
    galleryHost: () => { const host = ports.element("explorer-media"); host.querySelector(":scope > .sidebar-hint")?.remove(); return host; },
    galleryVisible: () => !ports.element("explorer-media").hidden && ports.element("explorer").matches(":popover-open"),
    mediaSelected: () => ports.pagesController.explorerTab() === "media",
    gallerySignature: ports.imagesSignature,
    announce: ports.announce,
    undoAction: ports.undoAction,
    error: ports.errorMessage,
  };
  const mediaController = createMediaController(mediaPorts, ports.lazyModule(() => import("./media-actions")));
  // Typing changes drafts often; the usage check waits for a pause.
  let mediaUsageTimer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    ports.appStore.repository.value; ports.appStore.snapshot.value; ports.appStore.drafts.revision.value;
    mediaController.invalidateUsage();
    clearTimeout(mediaUsageTimer);
    mediaUsageTimer = setTimeout(() => mediaController.refreshUsage(), 400);
  });
  function mediaIdentity() { return `${ports.currentLoad()}:${ports.setupScope()}`; }

  // Undo goes to the page open as the step commits; a pinned batch finishes where it started (src/media-batch.ts).
  const loadMediaBatch = ports.lazyModule(() => import("../media-batch"));
  async function applyMediaBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin?: MediaPin, asked?: string) {
    const opened = asked ?? ports.appStore.openFile.value, module = await loadMediaBatch();
    return module.applyMediaBatch({
      appStore: ports.appStore, editor: ports.editorModule, mediaHistoryHome: ports.mediaHistoryHome, site: () => ports.runtime.site, load: ports.loadMediaWorkspace, stamp: () => ports.guardedEdits.stamp("repository"),
      listRepositoryFiles: ports.listRepositoryFiles, nativeFiles: scope => ports.runtime.files(scope), draftStore, bytes: uploadBytes, mediaTextSource: (path, scope) => ports.runtime.textSource(path, scope), entryAt: ports.entryAt, findEntry: ports.findEntry, announce: ports.announce, park: step => ports.parkedSteps.park(step),
      refresh: () => { ports.afterFileChanges(); ports.updateNativePreviewSources(); if (ports.appStore.selection.value) ports.pageStructureController.renderEditBar(ports.appStore.selection.value); },
    }, scope, stamp, batch, pin, opened);
  }

  return { mediaPorts, mediaController, nativeImagePaths, uploadFilesTo, discardUpload, readMediaText, mediaOrigins };
}
