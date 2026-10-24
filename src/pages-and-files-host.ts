// Pages & files: the Files and Pages trees and the explorer's tabs, the Pages
// controller's wiring and Create, the Files row actions and operations,
// resync after file changes, Undo of file changes and the save/publish
// wiring. The host (src/main.ts) keeps the session, the site runtime, the
// editor and the preview, and hands them in as live ports.

import type { Directory, Repository, TreeEntry } from "../shared/types";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, NATIVE_REDIRECTS_PATH, nativePageMovedUrl, nativeSiteSettings, type NativeSite } from "../shared/native-project";
import { nativePageRoute } from "../shared/native-routes";
import { isNewDraft, newDraftPaths } from "../shared/site-overlay";
import { fileInTheWay, parentProblem } from "../shared/site-rules";
import type { AppStore } from "./app-store";
import type { createCreateDialog, CreateKind, CreateRequest } from "./components/create-dialog";
import type { createConfirmDialog } from "./components/confirm-dialog";
import type { mountDropdown } from "./components/dropdown";
import type { createFileRowActions, FileRowTarget } from "./components/file-row-actions";
import type { createPagePicker } from "./components/page-picker";
import type { createPagesTree } from "./components/pages-tree";
import { refuse } from "./components/refusal-note";
import type { MenuItem } from "./components/row-menu";
import type { mountSiteActions } from "./components/site-actions";
import type * as sourceEditor from "./components/source-editor";
import type { AnnounceAs } from "./components/toast-rules";
import type { createCardsController } from "./controllers/cards-controller";
import type { createLazyFileOperationsController } from "./controllers/file-operation-checks";
import type { createFilesTreeController } from "./controllers/files-tree-controller";
import type { createLinkedStylesController } from "./controllers/linked-styles-controller";
import type { createMediaController } from "./controllers/media-controller";
import type { createPagesController } from "./controllers/pages-controller";
import { createPagesState, explorerTabNames, NATIVE_HOME_UNREAD, type ExplorerTab, type PagesPorts, pageOnBranchHere } from "./controllers/pages-state";
import type { PreviewSelectionController } from "./controllers/preview-selection-controller";
import { createSavePublishController } from "./controllers/save-publish-controller";
import type { createSourcePaneController } from "./controllers/source-pane-controller";
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { duplicateFile, listChanges, restoreFile as restoreDraftFile, type FileChange } from "./file-changes";
import type { createFinishedElsewhere } from "./finished-elsewhere";
import type { GuardedEdits, Reads } from "./guarded-edit";
import { setIcon } from "./icons";
import { newFilePath, newFolderPath, renamedPath, type Checked } from "./native-create";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import { isRenamableMedia, mediaFileName } from "./page-builder/media-names";
import type { RepositoryIndex } from "./repository-loading";
import { button, node } from "./ui/dom";
import { pickFiles, sweepUploads, uploadBytes } from "./uploads";
import type { createWorkspaceBoot } from "./workspace-boot";
import { holdsDraftScope, type SessionStamp, type WorkspaceSession } from "./workspace-session";

type FilePorts = Parameters<typeof createLazyFileOperationsController>[0];

export interface PagesAndFilesPorts {
  app: HTMLElement;
  /** Host state, read at call time. */
  readonly explorerDropdown: ReturnType<typeof mountDropdown> | undefined;
  readonly files: HTMLElement;
  readonly pageStructure: { refreshMeta(): void } | undefined;
  readonly siteActions: Pick<ReturnType<typeof mountSiteActions>, "track"> | undefined;
  /** Written only: rendering the Pages tree consumes queued title work. */
  pendingNativePageTitles: undefined;
  fileGeneration: number;
  appStore: AppStore;
  runtime: Pick<ReturnType<typeof createNativeSiteRuntime>, "site" | "base" | "state" | "engaged" | "files" | "source" | "newDraftPaths" | "adoptSaved">;
  workspaceSession: Pick<WorkspaceSession, "begin" | "current">;
  editorModule: Pick<typeof sourceEditor, "isMounted" | "refreshDrafts" | "forgetDraftModel" | "dropDraft" | "clearHistory">;
  guardedEdits: Pick<GuardedEdits, "run" | "stamp" | "peek">;
  mediaController: Pick<ReturnType<typeof createMediaController>, "requestGalleryRefresh" | "disposeGallery" | "ensureGallery" | "galleryVisible">;
  cardsController: Pick<ReturnType<typeof createCardsController>, "cardOffer" | "cardsLinkingTo" | "createWithCard">;
  linkedStyles: Pick<ReturnType<typeof createLinkedStylesController>, "secondaryPath" | "unlink" | "openComponentLinkedStyle" | "openDefaultLinkedStyle">;
  versions: { history: { refresh(): void } };
  previewSelection: Pick<PreviewSelectionController, "recordIntent">;
  repositoryIndex: Pick<RepositoryIndex, "seed">;
  finishedWork: Pick<ReturnType<typeof createFinishedElsewhere>, "add">;
  element: <T extends HTMLElement>(id: string) => T;
  lazyModule: <T>(load: () => Promise<T>) => () => Promise<T>;
  loadConfirmDialog: () => Promise<typeof import("./components/confirm-dialog")>;
  api: <T>(action: string, params?: Record<string, string>) => Promise<T>;
  status: (message: string) => void;
  clearError: () => void;
  errorMessage: (error: unknown) => void;
  announce: (text: string, as?: AnnounceAs) => void;
  currentLoad: () => number;
  stampOf: (epoch: number) => SessionStamp;
  draftScope: () => DraftScope | undefined;
  entryAt: (path: string) => TreeEntry | undefined;
  findEntry: FilePorts["findEntry"];
  readFile: FilePorts["readFile"];
  readFiles: FilePorts["readFiles"];
  readMediaText: NonNullable<FilePorts["readMediaText"]>;
  mediaOrigins: NonNullable<FilePorts["origins"]>;
  ensureNativeTextIndex: () => Promise<string | undefined>;
  nativeRouteForPath: (path: string | undefined) => string | undefined;
  nativeRouteInfo: PagesPorts["routeInfo"];
  nativeTitles: PagesPorts["titles"];
  nativeNavigationTarget: (pagePath: string | undefined, r?: Reads) => ReturnType<PagesPorts["navigationTarget"]>;
  writeNativePageMeta: PagesPorts["writeMeta"];
  refreshNativeRoutes: () => void;
  forgetDraftedAssets: () => void;
  loadNativeComponentStyles: (tags: string[]) => Promise<void>;
  updateAgentContext: () => void;
  updateCurrentPageLabel: () => void;
  updateNativePreviewSources: () => void;
  updatePreview: () => void;
  setCurrentPage: (path?: string) => void;
  showDirectory: (directory: Directory) => void;
  openNewDraft: (draft: SavedDraft, options?: { keepExplorer?: boolean }) => Promise<void>;
  discardUpload: (path: string) => Promise<void>;
  uploadFilesTo: (folder: string, files: File[]) => Promise<unknown>;
  nativeFallbackPage: (path: string) => string | undefined;
  nativeModeActive: () => boolean;
  nativeComponentTagForPath: (path: string) => string | undefined;
  startNativeTextIndex: (repo: Repository, site: NativeSite, scope: DraftScope | undefined, at: SessionStamp, request: number) => void;
  restoreFile: ReturnType<typeof createWorkspaceBoot>["restoreFile"];
  loadSnapshot: ReturnType<typeof createWorkspaceBoot>["loadSnapshot"];
  openEntry: ReturnType<typeof createSourcePaneController>["openEntry"];
  openNativePageSettings: (path: string) => Promise<void>;
  openNativeNavigation: (path: string) => Promise<void>;
  flushPendingNativePageTitles: () => void;
}

// The drafts as the tree shows them: each path's change (A, M, R, D), the
// deletions by path, and the new paths (new and renamed files).
interface TreeState {
  changes: Map<string, FileChange>;
  deleted: Map<string, SavedDraft>;
  drafted: string[];
}

// What a creation in the Files tab writes: new files (drafts with no base
// blob), and what to show after. Planned as the name is typed, so the dialog says the result
// live. Pages are made in the Pages tab (`pageActions!.createNew`), where the URL is
// the site's; a file or folder here is only ever what was typed.
interface Creation {
  files: { path: string; content: string }[];
  /** The file to open after; else the folder to show in the tree. */
  open?: string;
  folder?: string;
  summary: string;
  done: string;
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export function createPagesAndFilesHost(ports: PagesAndFilesPorts) {
  let pageActions: ReturnType<typeof createPagesController> | undefined;
  const loadPagesActions = ports.lazyModule(async () => {
    const [module] = await Promise.all([import("./controllers/pages-controller"), loadFileOps()]);
    pageActions = module.createPagesController(pagePorts(), pagesController);
    return module;
  });

  const loadExplorerModules = ports.lazyModule(async () => {
    const [create, actions, confirm, picker, tree] = await Promise.all([
      import("./components/create-dialog"), import("./components/file-row-actions"), ports.loadConfirmDialog(),
      import("./components/page-picker"), import("./controllers/files-tree-controller"), loadPagesActions(), loadFileOps(),
    ]);
    return { ...create, ...actions, ...confirm, ...picker, ...tree };
  });

  function treeState(scope = ports.draftScope()): TreeState {
    const drafts = scope ? draftStore().list(scope) : [];
    const changes = listChanges(drafts);
    return {
      changes: new Map(changes.map((change) => [change.path, change])),
      deleted: new Map(drafts.filter((draft) => draft.deleted).map((draft) => [draft.path, draft])),
      drafted: newDraftPaths(drafts),
    };
  }
  let filesTree: ReturnType<typeof createFilesTreeController> | undefined;
  // Folder listings by tree SHA (content-addressed, so never stale) for path checks before the tree loads.
  const spareListings = new Map<string, Directory["entries"]>();
  // Files is on show: its tab, or the only panel of a repository with no site (its tab state stays "pages").
  const filesShown = () => !!ports.explorerDropdown?.isOpen() && (pagesController.explorerTab() === "files" || !ports.element("explorer-files").hidden);
  const filesTreeController = {
    refresh: () => filesTree ? filesTree.refresh() : ports.mediaController.requestGalleryRefresh(), render: () => filesTree?.render(), reset: () => { spareListings.clear(); filesTree?.reset(); },
    shown: () => filesTree?.shown(), row: (path: string) => filesTree?.row(path),
    openFolder: (path: string) => filesTree?.openFolder(path), listings: () => filesTree?.listings() ?? spareListings, visible: filesShown,
  };
  let explorerMount: Promise<void> | undefined;
  function ensureExplorer() {
    if (filesTree) return ensurePagesTree();
    if (explorerMount) return explorerMount;
    const host = ports.element("explorer");
    const pending = loadExplorerModules().then(async ({ createCreateDialog, createFileRowActions, createConfirmDialog, createPagePicker, createFilesTreeController }) => {
      if (!host.isConnected || host !== document.getElementById("explorer")) return;
      createDialog = createCreateDialog({
        plan: (request) => {
          const planned = planCreation(request);
          return planned.ok ? { ok: true, summary: planned.value.summary } : planned;
        },
        create: createFromRequest,
      });
      ports.element("explorer").append(createDialog.root);
      confirmDialog ??= createConfirmDialog();
      ports.element("explorer").append(confirmDialog.root);
      pagePicker = createPagePicker();
      ports.element("explorer").append(pagePicker.root);
      fileActions = createFileRowActions({
        host: ports.element("explorer-files"),
        items: fileRowItems,
        checkRename: (target, name) => renameProblem(target, name),
        rename: renameFileTarget,
        remove: (target) => void fileOps!.deleteFileTarget(target),
        dropProblem: (source, folder) => dropProblem(source, folder),
        drop: (source, folder) => void dropFileTarget(source, folder),
        dropFiles: (files, folder) => void ports.uploadFilesTo(folder, files),
        announce: ports.announce,
      });
      fileActions.attachRoot(ports.files);
      fileActions.attachRoot(ports.element("explorer-files").querySelector<HTMLElement>(".files-heading")!);
      filesTree = createFilesTreeController({
        ui: { node, button, setIcon },
        snapshot: () => ports.appStore.snapshot.value, repo: () => ports.appStore.repository.value,
        openFile: () => ports.appStore.openFile.value, epoch: ports.currentLoad, root: () => ports.files,
        state: treeState, scope: ports.draftScope, draft: (scope, path) => draftStore().get(scope, path),
        load: input => ports.api<Directory>("tree", input), images: () => ports.mediaController.requestGalleryRefresh(),
        clearError: ports.clearError, error: ports.errorMessage, status: ports.status, announce: ports.announce, refuse, intent: (path) => ports.previewSelection.recordIntent(path),
        openDraft: ports.openNewDraft, openEntry: (entry, path, epoch) => ports.openEntry(entry, path, ports.stampOf(epoch)), restore: target => fileOps!.restoreFileTarget(target),
        create: openCreate, actions: () => fileActions,
        visible: filesShown,
        count: (total) => {
          // The commit the tree shows, in full (set on the hidden #revision before each draw).
          const count = ports.element("files-count"), commit = ports.element("revision").title;
          // A number beside the heading, as Pages shows its page count; the tooltip says it in words.
          count.textContent = total === undefined ? "" : String(total);
          count.title = [total === undefined ? "" : `${total} ${total === 1 ? "file" : "files"}`, /^[0-9a-f]{40}$/.test(commit) ? `Version ${commit}` : ""].filter(Boolean).join("\n");
        },
      });
      filesTreeController.render();
      if (filesTreeController.visible()) filesTreeController.shown();
      await ensurePagesTree();
    }).finally(() => { if (explorerMount === pending) explorerMount = undefined; });
    explorerMount = pending;
    return pending;
  }

  // The explorer's Pages | Media | Files tabs: tab state and tree rendering
  // live in the Pages controller; the host mounts the DOM and paints the tabs.
  let pagesTree: ReturnType<typeof createPagesTree> | undefined;
  const loadPagesTree = ports.lazyModule(async () => (await Promise.all([import("./components/pages-tree"), loadPagesActions()]))[0]);
  let pagesTreeMount: Promise<void> | undefined;
  function ensurePagesTree() {
    if (pagesTree) return Promise.resolve();
    if (pagesTreeMount) return pagesTreeMount;
    const host = ports.element("explorer-pages");
    const pending = loadPagesTree().then(({ createPagesTree }) => {
      if (!host.isConnected || host !== document.getElementById("explorer-pages")) return;
      pagesTree = createPagesTree({
        open: (file) => {
          // The open page chosen again shows in the preview, which a link may have taken elsewhere.
          if (file === ports.appStore.openFile.value && ports.editorModule?.isMounted(file)) { ports.explorerDropdown?.close(); ports.updatePreview(); }
          else void ports.restoreFile(file, ports.workspaceSession.begin());
        },
        plan: (request) => {
          const planned = pageActions!.planNew(request);
          return planned.ok ? { ok: true, value: { route: planned.value.route, file: planned.value.file, note: planned.value.note } } : planned;
        },
        create: (request) => pageActions!.createNew(request),
        announce: ports.announce,
        onInteractionEnd: ports.flushPendingNativePageTitles,
        retitle: (file, title) => pageActions!.retitle(file, title),
        changed: (file) => Boolean(treeState().changes.get(file)),
        discard: (file) => void savePublish.discardFile(file),
        duplicate: (file) => void pageActions!.duplicate(file),
        remove: (target) => void pageActions!.remove(target),
        createPage: (route) => void pageActions!.createFolderPage(route),
        pageSettings: (path) => { ports.element("explorer-toggle").focus(); void ports.openNativePageSettings(path); },
        navigation: (path) => { ports.element("explorer-toggle").focus(); void ports.openNativeNavigation(path); },
        canAddToNavigation: () => Boolean(ports.nativeNavigationTarget(ports.runtime.site?.routes["/"])),
        planUrl: (target, value) => (target.file ? pageActions!.urlPlan(target.file, value) : { ok: false, error: "This row has no page." }),
        changeUrl: (target, value, keep) => (target.file ? pageActions!.changeUrl(target.file, value, keep) : Promise.resolve("This row has no page.")),
        moveTo: (target) => void pageActions!.moveTo(target),
        dropProblem: (source, parent) => pageActions!.dropProblem(source, parent),
        drop: (source, parent) => void pageActions!.confirmMove(source, parent),
        cardOffer: ports.cardsController.cardOffer,
      });
      ports.element("explorer-pages").replaceChildren(pagesTree.root);

      if (ports.explorerDropdown?.isOpen()) pagesController.renderTree();
    }).finally(() => { if (pagesTreeMount === pending) pagesTreeMount = undefined; });
    pagesTreeMount = pending;
    return pending;
  }

  function mountExplorerTabs() {
    const explorer = ports.element("explorer");
    explorer.addEventListener("toggle", () => {
      // Closing a popover queues its toggle; session expiry may detach it before dispatch.
      if (!explorer.isConnected) return;
      if (ports.mediaController.galleryVisible() && pagesController.explorerTab() === "media") void ensureExplorer().then(() => ports.mediaController.ensureGallery()).catch(ports.errorMessage);
    });
    const tabs = { pages: ports.element<HTMLButtonElement>("explorer-tab-pages"), media: ports.element<HTMLButtonElement>("explorer-tab-media"), files: ports.element<HTMLButtonElement>("explorer-tab-files") };
    for (const [name, tab] of Object.entries(tabs) as [ExplorerTab, HTMLButtonElement][]) {
      tab.addEventListener("click", () => pagesController.selectTab(name));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = explorerTabNames.indexOf(name);
        const next = event.key === "Home" ? "pages" : event.key === "End" ? "files" : explorerTabNames[(index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3];
        pagesController.selectTab(next);
        tabs[next].focus();
      });
    }
  }

  function paintExplorerTabs(tab: ExplorerTab, native: boolean) {
    ports.element("explorer-tabs").hidden = !native;
    ports.element("site-settings-toggle").hidden = !native;
    for (const name of explorerTabNames) {
      const button = ports.element(`explorer-tab-${name}`);
      const panel = ports.element(`explorer-${name}`);
      button.setAttribute("aria-selected", String(tab === name));
      button.tabIndex = tab === name ? 0 : -1;
      panel.hidden = tab !== name;
      if (name === "files" && tab === name && ports.explorerDropdown?.isOpen()) filesTreeController.shown();
      // Without tabs the files are the whole explorer, not a tab's panel.
      if (native) panel.setAttribute("role", "tabpanel");
      else panel.removeAttribute("role");
    }
  }

  // Whether the repository path (a file, or a folder something is in) is
  // there, on the branch or drafted.
  function nativePathExists(path: string) {
    return ports.runtime.files().some((file) => file === path || file.startsWith(`${path}/`));
  }

  // The whole site read for the repository open now: an error message, or nothing.
  async function nativeSiteReadForCreate() {
    const at = ports.workspaceSession.begin();
    const problem = await ports.ensureNativeTextIndex();
    if (problem) return problem;
    if (!at.holds() || !ports.runtime.site) return "The repository changed meanwhile. Try again.";
    return pagesController.homeTemplate() === undefined ? NATIVE_HOME_UNREAD : undefined;
  }

  // Pages whose URL changes keep their own address: the canonical link and
  // og:url of each (`file`, at `moved` after the move) follow it from `from`
  // to `to`, written into `edits` (by the path after the move) on top of the
  // link updates there.
  function withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[], r: Reads) {
    const siteUrl = nativeSiteSettings(r.source(NATIVE_CONFIG_PATH)).url;
    for (const page of pages) {
      const path = page.moved ?? page.file;
      const text = edits.get(path) ?? r.source(page.file);
      if (text === undefined) continue;
      const next = nativePageMovedUrl(text, page.from, page.to, siteUrl);
      if (next !== text) edits.set(path, next);
    }
  }

  // Pages policy belongs to the controller; guarded writes remain host transactions.
  const pagePorts = (): Parameters<typeof createPagesController>[0] => ({
    edits: ports.guardedEdits,
    site: () => ports.runtime.site,
    routeForPath: ports.nativeRouteForPath,
    source: path => ports.runtime.source(path),
    files: () => ports.runtime.files(),
    baseFiles: () => ports.runtime.base.files,
    drafts: () => { const scope = ports.draftScope(); return scope ? draftStore().list(scope) : []; },
    hasDraftScope: () => Boolean(ports.draftScope()),
    routeInfo: ports.nativeRouteInfo,
    titles: ports.nativeTitles,
    siteUrl: () => nativeSiteSettings(ports.runtime.source(NATIVE_CONFIG_PATH)).url,
    writeMeta: (file, field, value, flush) => ports.writeNativePageMeta(file, field, value, flush),
    ensureIndex: ports.ensureNativeTextIndex,
    readRedirects: readNativeRedirects,
    withMovedPageUrls,
    pageLinks: (...args) => fileOps!.pageLinks(...args),
    cardsLinkingTo: ports.cardsController.cardsLinkingTo,
    confirmation: () => confirmDialog,
    picker: () => pagePicker,
    refreshMeta: () => ports.pageStructure?.refreshMeta(),
    refreshLabel: ports.updateCurrentPageLabel,
    tree: () => pagesTree,
    pagesHidden: () => Boolean(ports.element("explorer-pages").hidden),
    openFile: () => ports.appStore.openFile.value,
    clearPendingTitles: () => { ports.pendingNativePageTitles = undefined; },
    tabsMounted: () => Boolean(document.getElementById("explorer-tabs")),
    paintTabs: paintExplorerTabs,
    resetExplorer: () => { pagesTree?.reset(); ports.mediaController.disposeGallery(); },
    showMedia: () => { if (ports.explorerDropdown?.isOpen()) void ensureExplorer().then(() => ports.mediaController.ensureGallery()).catch(ports.errorMessage); },
    siteReadForCreate: nativeSiteReadForCreate,
    createWithCard: ports.cardsController.createWithCard,
    navigationTarget: ports.nativeNavigationTarget,
    restoreDeleted: file => undoFileChanges({ restore: [file] }),
    announce: ports.announce,
    refuse,
    error: ports.errorMessage,
  });
  const pagesController = createPagesState(pagePorts());

  // Shared file operations use the same pure source/draft policy as Pages.
  function onBranchHere(path: string) {
    const scope = ports.draftScope();
    return pageOnBranchHere(path, ports.runtime.base.files, scope ? draftStore().list(scope) : []);
  }
  // `_redirects` as it is now: its draft, or the branch's file.
  async function readNativeRedirects(): Promise<string | undefined> {
    const repo = ports.appStore.repository.value, at = ports.workspaceSession.begin();
    const scope = ports.draftScope();
    const draft = scope ? draftStore().get(scope, NATIVE_REDIRECTS_PATH) : undefined;
    if (draft) return draft.deleted ? undefined : draft.content;
    if (!ports.runtime.base.files.includes(NATIVE_REDIRECTS_PATH) || !ports.appStore.repository.value) return undefined;
    const entry = await ports.findEntry(NATIVE_REDIRECTS_PATH);
    if (!at.holds() || !repo) throw new Error("The repository changed while reading redirects.");
    const text = entry ? await ports.readFile(repo.full_name, entry.sha) : undefined;
    if (!at.holds()) throw new Error("The repository changed while reading redirects.");
    if (text !== undefined) ports.runtime.base.sources.set(NATIVE_REDIRECTS_PATH, text);
    return text;
  }

  // A branch file's blob and text, for a draft of an edit to it.
  async function branchText(path: string): Promise<{ sha: string; text: string } | undefined> {
    if (!ports.appStore.repository.value) return undefined;
    const entry = await ports.findEntry(path);
    if (!entry) return undefined;
    const text = ports.runtime.base.sources.get(path) ?? await ports.readFile(ports.appStore.repository.value.full_name, entry.sha);
    return { sha: entry.sha, text };
  }

  // New page files discarded (Discard changes, an undo): routes are found
  // again and the trees drawn.
  function discardedNewPages(_paths: string[]) {
    if (!ports.runtime.site) return;
    ports.refreshNativeRoutes();
    filesTreeController.render();
    ports.updateAgentContext();
  }

  let createDialog: ReturnType<typeof createCreateDialog> | undefined;

  function planCreation({ kind, folder, name }: CreateRequest): Checked<Creation> {
    const scope = ports.draftScope();
    if (!scope || !ports.appStore.snapshot.value) return { ok: false, error: "Open a repository first." };
    const drafted = ports.runtime.newDraftPaths({}, scope);
    const inFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);
    // A folder is there when the branch has it or a file is (drafted) in it.
    const folderExists = (folder: string) =>
      ports.entryAt(folder)?.type === "tree" || ports.runtime.base.files.some((path) => inFolder(path, folder)) || drafted.some((path) => inFolder(path, folder));
    // What stands in the way of a new file at `path`, as far as is known here;
    // without the whole-commit tree, GitHub is asked on confirm.
    const problem = (path: string) => {
      if (draftStore().get(scope, path)?.deleted) return `${path} is deleted in your changes. Restore it instead.`;
      if (draftStore().get(scope, path)) return `${path} already has a draft in this browser.`;
      if (folderExists(path)) return `There is a folder ${path} already.`;
      if (ports.entryAt(path) || ports.runtime.base.files.includes(path)) return `${path} already exists.`;
      return parentProblem(path, (parent) => ports.entryAt(parent)?.type === "blob" || Boolean(draftStore().get(scope, parent)));
    };
    const routes = ports.runtime.site?.routes ?? {};
    const routeTaken = (route: string) => (Object.hasOwn(routes, route) ? `The URL ${route} already has a page, ${routes[route]}.` : undefined);
    const fail = (error: string): Checked<Creation> => ({ ok: false, error });

    if (kind === "file") {
      const path = newFilePath(folder, name);
      if (!path.ok) return path;
      const blocked = problem(path.value);
      if (blocked) return fail(blocked);
      const route = ports.runtime.site ? nativePageRoute(path.value) : undefined;
      if (route && routeTaken(route)) return fail(routeTaken(route)!);
      const page = route ? `, the page at ${route}` : "";
      return { ok: true, value: {
        files: [{ path: path.value, content: "" }], open: path.value,
        summary: `Creates the empty file ${path.value}${page}.`,
        done: `Created ${path.value}${page}.`,
      } };
    }

    const path = newFolderPath(folder, name);
    if (!path.ok) return path;
    if (folderExists(path.value) || ports.entryAt(path.value)) return fail(`${path.value} already exists.`);
    const keep = `${path.value}/.gitkeep`;
    const blocked = problem(keep);
    if (blocked) return fail(blocked);
    const pagesHint = ports.runtime.site && !path.value.startsWith("components/") ? " To add pages and subpages, use the Pages tab." : "";
    return { ok: true, value: {
      files: [{ path: keep, content: "" }], folder: path.value,
      summary: `Creates ${keep}: git stores no empty folders, so the folder holds this empty file until it has others.${pagesHint}`,
      done: `Created the folder ${path.value}.`,
    } };
  }

  // Whether the branch has `path`, or a file where a folder of it would go,
  // asked of GitHub a folder at a time; only needed without the whole-commit
  // tree, which the plan already checked. Its own walk, not parentProblem: each folder's listing is awaited.
  async function branchPathProblem(path: string) {
    if (!ports.appStore.snapshot.value || ports.appStore.snapshot.value.tree || !ports.appStore.repository.value) return undefined;
    let entries = ports.appStore.snapshot.value.entries;
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index++) {
      const entry = entries.find((entry) => entry.path === parts[index]);
      if (!entry) return undefined;
      const at = parts.slice(0, index + 1).join("/");
      if (index === parts.length - 1) return `${at} already exists on GitHub.`;
      if (entry.type !== "tree") return fileInTheWay(at);
      let listing = filesTreeController.listings().get(entry.sha);
      if (!listing) {
        listing = (await ports.api<Directory>("tree", { repo: ports.appStore.repository.value.full_name, sha: entry.sha })).entries;
        filesTreeController.listings().set(entry.sha, listing);
      }
      entries = listing;
    }
    return undefined;
  }

  // Carries out a creation: the new files as drafts, the routes found again, the tree drawn with the new files, and the new file
  // opened (a new folder shown). Resolves to an error message when it could not.
  async function createFromRequest(request: CreateRequest): Promise<string | undefined> {
    const planned = planCreation(request);
    if (!planned.ok) return planned.error;
    const creation = planned.value;
    const scope = ports.draftScope()!;
    const at = ports.workspaceSession.begin();
    try {
      for (const file of creation.files) {
        const problem = await branchPathProblem(file.path);
        if (!at.holds()) return "The repository changed meanwhile. Try again.";
        if (problem) return problem;
      }
    } catch (error) {
      return error instanceof Error ? error.message : "GitHub could not be asked whether the path is free.";
    }
    for (const file of creation.files)
      draftStore().save({ ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: Date.now() });
    const failure = draftStore().error;
    if (failure) return failure;
    ports.editorModule?.refreshDrafts();
    ports.versions.history.refresh();
    if (ports.runtime.site) ports.refreshNativeRoutes();
    ports.updateAgentContext();
    if (resyncNativeSite()) return undefined;
    if (creation.folder) {
      // The new folder shows open in the tree, with the dialog's focus returned to it.
      const parts = creation.folder.split("/");
      parts.forEach((_, index) => filesTreeController.openFolder(parts.slice(0, index + 1).join("/")));
      filesTreeController.render();
      const row = [...ports.files.querySelectorAll<HTMLElement>(".file-row")].find((row) => row.dataset.path === creation.folder);
      if (row) createDialog?.returnFocusTo(row);
    } else filesTreeController.render();
    const opened = creation.open ? draftStore().get(scope, creation.open) : undefined;
    if (opened) await ports.openNewDraft(opened);
    // Written as the user's own announcement, so a load finishing later keeps it.
    ports.element("status").textContent = creation.done;
    return undefined;
  }

  // The "+" on a folder: a new file or folder in it.
  function openCreate(folder: string, opener: HTMLElement) {
    if (!ports.appStore.snapshot.value) return;
    const since = ports.guardedEdits.stamp("repository");
    void ensureExplorer().then(() => { if (since.holds()) createDialog?.open({ in: folder, kinds: ["file", "folder"], first: "file", opener }); }).catch(ports.errorMessage);
  }

  // ---- Deleting, renaming, moving and duplicating files. ----
  //
  // Each is a pending change in the browser drafts (src/file-changes.ts),
  // saved with Publish in one commit. In a native site, pages and
  // components are found again from the files after each, and a page whose
  // URL changes has the links to it updated in the same operation. Undo
  // right after (the open file's editor), Restore on a deletion
  // and Move back on a rename take the whole operation back.
  let fileActions: ReturnType<typeof createFileRowActions> | undefined;
  let confirmDialog: ReturnType<typeof createConfirmDialog> | undefined;
  let discardDialog: ReturnType<typeof createConfirmDialog> | undefined;
  let pagePicker: ReturnType<typeof createPagePicker> | undefined;

  // The actions of a Files row.
  function fileRowItems(target: FileRowTarget): MenuItem[] {
    if (target.gone) return [{ label: "Restore", run: () => void fileOps!.restoreFileTarget(target) }];
    const items: MenuItem[] = [];
    if (target.folder)
      items.push(
        { label: "New file…", run: () => openCreateKind(target.path, "file") },
        { label: "New folder…", run: () => openCreateKind(target.path, "folder") },
        { label: "Upload files…", run: () => void pickFiles().then((picked) => ports.uploadFilesTo(target.path, picked)) },
      );
    items.push({ label: "Rename", shortcut: "F2", run: () => fileActions?.rename(ports.files, target.path) });
    if (!target.folder) items.push({ label: "Duplicate", run: () => void fileOps!.duplicateFileTarget(target) });
    const change = treeState().changes.get(target.path);
    if (change?.kind === "R" && change.from) items.push({ label: `Move back to ${change.from}`, run: () => undoFileChanges({ moveBack: [target.path] }) });
    if (change && !target.folder) items.push({ label: "Discard changes", run: () => void savePublish.discardFile(target.path) });
    items.push(
      { label: "Delete", shortcut: "Delete", run: () => void fileOps!.deleteFileTarget(target) },
      { label: "Copy path", run: () => void copyFilePath(target.path) },
    );
    return items;
  }

  // New file… and New folder… from a folder's menu: the + dialog, that kind chosen.
  function openCreateKind(folder: string, kind: CreateKind) {
    if (!ports.appStore.snapshot.value) return;
    const opener = filesTreeController.row(folder) ?? ports.element<HTMLButtonElement>("new-at-root");
    createDialog?.open({ in: folder, kinds: ["file", "folder"], first: kind, opener });
  }

  async function copyFilePath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      ports.announce(`Copied ${path}`);
    } catch {
      refuse(`The path could not be copied: ${path}`);
    }
  }

  // What is at `path` now: a file or a folder with something in it (on the
  // branch and not deleted, or drafted), or a deletion in the drafts (a file,
  // or a folder only deletions are in).
  function pathNow(path: string, state = treeState()): "file" | "folder" | "deleted" | undefined {
    if (state.deleted.has(path)) return "deleted";
    if (state.drafted.includes(path)) return "file";
    const entry = ports.entryAt(path);
    if (entry?.type === "blob" || entry?.type === "commit" || ports.runtime.base.files.includes(path)) return "file";
    const prefix = `${path}/`;
    if (state.drafted.some((file) => file.startsWith(prefix))) return "folder";
    const inside = ports.appStore.snapshot.value?.tree
      ? ports.appStore.snapshot.value.tree.filter((item) => item.type !== "tree" && item.path.startsWith(prefix)).map((item) => item.path)
      : ports.runtime.base.files.filter((file) => file.startsWith(prefix));
    if (inside.some((file) => !state.deleted.has(file))) return "folder";
    if (inside.length) return "deleted";
    return entry?.type === "tree" ? "folder" : undefined;
  }

  const filePorts = (): Parameters<typeof createLazyFileOperationsController>[0] => ({
    edits: ports.guardedEdits, draftScope: ports.draftScope,
    engaged: () => ports.runtime.engaged, repository: () => ports.appStore.repository.value,
    parentOf, treeState, pathNow, branchFilesUnder, findEntry: ports.findEntry, draftStore,
    baseSource: path => ports.runtime.base.sources.get(path), readFiles: ports.readFiles, readFile: ports.readFile,
    nativeFiles: scope => ports.runtime.files(scope),
    ensureNativeTextIndex: ports.ensureNativeTextIndex, branchPathProblem,
    readMediaText: ports.readMediaText, origins: ports.mediaOrigins,
    onBranchHere, withMovedPageUrls, readNativeRedirects, confirmDialog: () => confirmDialog,
    undoFileChanges,
    duplicateFile: (scope, file, to) => duplicateFile(draftStore(), scope, file, to),
    afterFileChanges, announce: ports.announce, refuse, errorMessage: ports.errorMessage, requestAnimationFrame: callback => { requestAnimationFrame(callback); },
    openFolder: path => filesTreeController.openFolder(path), fileRow: path => filesTreeController.row(path), renderFileTree: () => filesTreeController.render(),
    filesTabOpen: () => filesTreeController.visible(),
  });
  // Files checks and actions load with the explorer, Pages actions or an agent's file command.
  let fileOps: ReturnType<typeof createLazyFileOperationsController> | undefined;
  const loadFileOps = ports.lazyModule(async () => {
    const module = await import("./controllers/file-operation-checks");
    fileOps ??= module.createLazyFileOperationsController(filePorts(), ports.lazyModule(() => import("./controllers/file-operations-controller")));
    return module;
  });

  // A media file's new name is tidied by the media rules (any language, its own format); a folder typed before it is checked as usual.
  function renameTarget(target: FileRowTarget, name: string): Checked<string> {
    const parent = parentOf(target.path), at = name.lastIndexOf("/"), file = name.slice(at + 1);
    if (target.folder || !isRenamableMedia(target.path) || !file.trim()) return renamedPath(parent, name, target.folder ? "folder" : "file");
    const folder = at < 0 ? { ok: true as const, value: parent } : renamedPath(parent, name.slice(0, at), "folder");
    return folder.ok ? { ok: true, value: `${folder.value ? `${folder.value}/` : ""}${mediaFileName(target.path, file)}` } : folder;
  }

  function renameProblem(target: FileRowTarget, name: string) {
    const to = renameTarget(target, name);
    return to.ok ? fileOps!.fileMoveProblem(target, to.value, "rename") : to.error;
  }

  function dropProblem(source: FileRowTarget, folder: string) {
    if (source.gone) return "A deleted file cannot move.";
    if (parentOf(source.path) === folder) return "It is already there.";
    if (source.folder && (folder === source.path || folder.startsWith(`${source.path}/`))) return "A folder cannot go inside itself.";
    return fileOps!.moveProblem(source, folder ? `${folder}/${source.name}` : source.name, "move");
  }

  // Every file on the branch under `folder`, with full paths.
  async function branchFilesUnder(folder: string): Promise<TreeEntry[]> {
    if (!ports.appStore.snapshot.value || !ports.appStore.repository.value) return [];
    if (ports.appStore.snapshot.value.tree) return ports.appStore.snapshot.value.tree.filter((entry) => entry.type !== "tree" && entry.path.startsWith(`${folder}/`));
    let entries = ports.appStore.snapshot.value.entries;
    let entry: TreeEntry | undefined;
    for (const part of folder.split("/")) {
      entry = entries.find((item) => item.path === part);
      if (!entry || entry.type !== "tree") return [];
      entries = (await ports.api<Directory>("tree", { repo: ports.appStore.repository.value.full_name, sha: entry.sha })).entries;
    }
    if (!entry) return [];
    const listed = await ports.api<Directory>("tree", { repo: ports.appStore.repository.value.full_name, sha: entry.sha, recursive: "1" });
    return listed.entries.filter((item) => item.type !== "tree").map((item) => ({ ...item, path: `${folder}/${item.path}` }));
  }

  // Closes what shows the files among `paths` (the editor, the style pane) and
  // forgets the models kept for them. Returns the open file when it is one.
  function releaseFiles(paths: Set<string>) {
    const scope = ports.draftScope();
    const open = ports.appStore.openFile.value && paths.has(ports.appStore.openFile.value) ? ports.appStore.openFile.value : undefined;
    if (open) {
      ports.fileGeneration++;
      ports.setCurrentPage();
    }
    const pane = ports.linkedStyles.secondaryPath();
    if (pane && paths.has(pane)) ports.linkedStyles.unlink();
    if (scope) for (const path of paths) ports.editorModule?.forgetDraftModel(scope, path);
    return open;
  }

  // After files changed: the drafts' listings, routes, both trees and the agent.
  // The native site switches on or off with the home page: a root index.html
  // written as a draft (by the user, Start your site or an agent) makes the
  // repository a native site, and discarding it, with none on GitHub, makes
  // it a site-less repository again (Start your site). Done by opening the
  // project again, as the drafts are kept. True while that is pending.
  let nativeResyncing = false;
  // Pending while the project is opened again, so an agent's write waits for the updated context.
  let nativeResyncDone: Promise<void> | undefined;
  function resyncNativeSite(): boolean {
    if (nativeResyncing) return true;
    const scope = ports.draftScope();
    if (!scope || !ports.appStore.snapshot.value) return false;
    const home = draftStore().get(scope, NATIVE_HOME_PAGE);
    const drafted = isNewDraft(home);
    const committed = ports.appStore.snapshot.value.entries.some((entry) => entry.path === NATIVE_HOME_PAGE && entry.type === "blob");
    const wanted = committed || drafted;
    if (wanted === ports.runtime.engaged) return false;
    nativeResyncing = true;
    nativeResyncDone = new Promise<void>((resolve) => {
      queueMicrotask(() => {
        // Nothing is reopened when the home page went away; else the open file is.
        void ports.loadSnapshot(wanted ? undefined : "").finally(() => { nativeResyncing = false; nativeResyncDone = undefined; resolve(); });
      });
    });
    return true;
  }

  function afterFileChanges() {
    ports.forgetDraftedAssets();
    ports.editorModule?.refreshDrafts();
    ports.versions.history.refresh();
    if (ports.runtime.site) {
      // Component stylesheets are found again where their components now are.
      ports.runtime.state.componentStyles.clear();
      ports.runtime.state.missingComponentStyles.clear();
      ports.refreshNativeRoutes();
      void ports.loadNativeComponentStyles(Object.keys(ports.runtime.site.components));
    }
    filesTreeController.render();
    ports.updateAgentContext();
    ports.updateCurrentPageLabel();
    resyncNativeSite();
    ports.mediaController.requestGalleryRefresh();
  }

  // Opens `path` after an operation, or the home page (else the folder summary)
  // when it is gone. `keepExplorer`: the explorer stays open (true) or closes
  // (false); by default a new file keeps it open and a branch file closes it.
  async function openAfter(path: string | undefined, keepExplorer?: boolean, quietStatus = false) {
    const at = ports.workspaceSession.begin();
    const scope = ports.draftScope();
    const draft = path && scope ? draftStore().get(scope, path) : undefined;
    const keep = { keepExplorer: keepExplorer ?? false, quietStatus };
    if (draft && isNewDraft(draft)) await ports.openNewDraft(draft, { keepExplorer: keepExplorer ?? true });
    else if (path && !draft?.deleted) await ports.restoreFile(path, at, keep);
    else if (ports.runtime.site?.routes["/"]) await ports.restoreFile(ports.runtime.site.routes["/"], at, keep);
    else if (ports.appStore.snapshot.value) ports.showDirectory(ports.appStore.snapshot.value);
  }

  /**
   * Restores deletions and moves renamed files back (Restore in the tree, the
   * Save panel's Restore and Move back, Discard changes on a renamed file).
   */
  function undoFileChanges(what: { restore?: string[]; moveBack?: string[] }) {
    const scope = ports.draftScope();
    if (!scope) return;
    const store = draftStore();
    const involved = new Set<string>();
    for (const path of [...(what.restore ?? []), ...(what.moveBack ?? [])]) {
      involved.add(path);
      const draft = store.get(scope, path);
      if (draft?.movedTo) involved.add(draft.movedTo);
    }
    const opened = releaseFiles(involved);
    const reversed: { from: string; to: string }[] = [];
    const done: string[] = [];
    const results = [
      ...(what.restore ?? []).map((path) => restoreDraftFile(store, scope, path)),
      ...(what.moveBack ?? []).map((path) => {
        const draft = store.get(scope, path);
        const origin = draft?.movedFrom;
        return origin ? restoreDraftFile(store, scope, origin) : undefined;
      }),
    ];
    for (const result of results) {
      if (!result) continue;
      done.push(result.path);
      if (result.from) reversed.push({ from: result.from, to: result.path });
    }
    afterFileChanges();
    const back = opened && (reversed.find((move) => move.from === opened)?.to ?? opened);
    if (back) void openAfter(back);
    ports.announce(done.length === 1 ? (reversed.length ? `Moved ${reversed[0].from} back to ${reversed[0].to}.` : `Restored ${done[0]}.`) : `Restored ${done.length} files.`);
  }

  // A change's Restore (a deletion), Move back (a rename) or Discard (an edit, a new file) in the Save panel.
  async function discardFileChange(change: FileChange) {
    if (change.kind === "A" && change.drafts[0]?.upload) await ports.discardUpload(change.path);
    else if (change.kind === "D") undoFileChanges({ restore: [change.path] });
    else if (change.kind === "R") undoFileChanges({ moveBack: [change.path] });
    else if (savePublish.discard([change.path])) ports.announce(`Discarded the changes to ${change.path}.`);
  }

  const savePublish = createSavePublishController({
    stamp: () => ports.guardedEdits.stamp("repository"),
    snapshot: () => ports.appStore.snapshot.value,
    scope: ports.draftScope, drafts: draftStore, api: ports.api, findEntry: ports.findEntry, changed: afterFileChanges, release: releaseFiles, openAfter, announce: ports.announce, status: ports.status,
    fail: ports.errorMessage, fallback: ports.nativeFallbackPage, resync: resyncNativeSite,
    onWake: (check) => { document.addEventListener("visibilitychange", check); addEventListener("focus", check); return () => { document.removeEventListener("visibilitychange", check); removeEventListener("focus", check); }; },
    visible: () => document.visibilityState === "visible",
    reload: () => ports.loadSnapshot(),
    forget: (scope, path) => ports.editorModule?.forgetDraftModel(scope, path),
    redraw: () => {
      ports.editorModule?.refreshDrafts();
      filesTreeController.render();
      if (ports.runtime.site) ports.updateNativePreviewSources();
    },
    saved: (scope, result, submitted, shown) => {
      if (shown) ports.runtime.adoptSaved(scope, result, submitted);
      else if (!result.unchanged) ports.finishedWork.add(scope, "saved", { commit: { repo: scope.repo, commit: result.commit, url: result.url } });
      // Saved uploads are GitHub's now; this browser lets their bytes go.
      void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
      if (ports.runtime.engaged && !result.unchanged)
        ports.siteActions?.track({ repo: scope.repo, commit: result.commit, url: result.url },
          () => holdsDraftScope(ports.workspaceSession.current().scope, scope));
    },
    adopt: (result) => {
      ports.appStore.snapshot.value = result;
      ports.repositoryIndex.seed(ports.appStore.repository.value!, result);
    },
    showSaved: (commit) => {
      ports.updateAgentContext();
      ports.element("revision").textContent = commit.slice(0, 7);
      ports.element("revision").title = commit;
      filesTreeController.render();
      if (ports.runtime.engaged && ports.runtime.site) ports.startNativeTextIndex(ports.appStore.repository.value!, ports.runtime.site, ports.draftScope(), ports.workspaceSession.begin(), ports.runtime.state.request);
    },
    change: (path) => treeState().changes.get(path),
    openFile: () => ports.appStore.openFile.value,
    secondary: () => ports.linkedStyles.secondaryPath(),
    drop: (scope, path) => Boolean(ports.editorModule?.dropDraft(scope, path)),
    clearHistory: () => ports.editorModule?.clearHistory(),
    reopen: (opened, back, styled) => {
      if (ports.nativeModeActive()) ports.updateNativePreviewSources();
      const page = ports.appStore.openFile.value;
      if (opened) void openAfter(back);
      else if (styled && page && ports.nativeModeActive()) {
        // The open page stays; its stylesheet opens again as GitHub has it.
        if (ports.nativeComponentTagForPath(page)) void ports.linkedStyles.openComponentLinkedStyle(page);
        else void ports.linkedStyles.openDefaultLinkedStyle(page);
      }
    },
    confirm: async (question, all) => {
      const since = ports.guardedEdits.stamp("repository");
      const { createConfirmDialog } = await ports.loadConfirmDialog();
      if (!since.holds()) return false;
      if (all && !discardDialog) { discardDialog = createConfirmDialog("discard-dialog"); ports.app.append(discardDialog.root); }
      if (!all && !confirmDialog) { confirmDialog = createConfirmDialog(); ports.element("explorer").append(confirmDialog.root); }
      return (all ? discardDialog : confirmDialog)!.ask(question);
    },
  });

  async function renameFileTarget(target: FileRowTarget, name: string): Promise<string | undefined> {
    const to = renameTarget(target, name);
    if (!to.ok) return to.error;
    return fileOps!.moveFileTarget(target, to.value, "rename");
  }

  async function dropFileTarget(source: FileRowTarget, folder: string) {
    const problem = dropProblem(source, folder);
    if (problem) { refuse(problem); return; }
    const error = await fileOps!.moveFileTarget(source, folder ? `${folder}/${source.name}` : source.name, "move");
    if (error) ports.errorMessage(new Error(error));
  }

  // The explorer's trees, dialogs and tabs mount afresh with the workspace.
  function mountExplorer() {
    createDialog = confirmDialog = discardDialog = pagePicker = fileActions = undefined;
    filesTree = undefined;
    explorerMount = undefined;
    const newAtRoot = ports.element<HTMLButtonElement>("new-at-root");
    newAtRoot.addEventListener("click", () => openCreate("", newAtRoot));
    pagesTree = undefined;
    pagesTreeMount = undefined;
    mountExplorerTabs();
    ports.element("explorer").addEventListener("toggle", () => {
      if (ports.explorerDropdown?.isOpen()) {
        void ensureExplorer().then(() => {
          pagesController.renderTree();
          if (filesTreeController.visible()) filesTreeController.shown();
        }).catch(ports.errorMessage);
      } else {
        pagesTree?.reset();
        fileActions?.close();
        confirmDialog?.close();
      }
    });
  }

  return {
    /** Mutable host state, read at call time (not destructured). */
    get pageActions() { return pageActions; },
    get pagesTree() { return pagesTree; },
    get fileOps() { return fileOps; },
    get nativeResyncDone() { return nativeResyncDone; },
    loadPagesActions, loadFileOps, pagePorts, filePorts, pagesController, savePublish, filesTreeController,
    mountExplorer, ensureExplorer, openCreate, treeState, pathNow, nativePathExists, nativeSiteReadForCreate,
    branchText, branchPathProblem, discardedNewPages, afterFileChanges, openAfter, undoFileChanges, discardFileChange,
  };
}
