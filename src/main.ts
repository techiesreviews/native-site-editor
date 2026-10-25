import { refuse } from "./components/refusal-note";
import "./components/refusal-note.css";
import { createMediaHost } from "./controllers/media-host";
import { createBootController } from "./controllers/boot-controller";
import { batch } from "@preact/signals-core";
import { createAppStore } from "./app-store";
import { handleChunkLoadFailure, hasEditableRecoveryState, installChunkRecovery } from "./chunk-recovery";
import "./utilities.css";
import "./style.css";
import "./theme.css";
import { node } from "./ui/dom";
import { options } from "./ui/select-options";
import { setErrorReporter } from "./ui/report-failure";
import { retainWorkspaceLink, resumeWorkspaceLink } from "./workspace-state";
import { createSetupHost, EDITOR_LOGIN } from "./setup-host";
import { createRepositoryList } from "./repository-list";
import { createVersionView } from "./version-view";
import { draftKey, draftStore } from "./drafts";
import type { createNativePreview } from "./components/native-preview";
import { createPageStructure } from "./components/page-structure";
import "./components/pages-tree.css";
import "./components/phone-sheet.css";
import "./components/files-tree.css";
import { createWorkspaceBoot } from "./workspace-boot";
import { createWorkspaceMount } from "./workspace-mount";
import { createSitePreview } from "./site-preview";
import { createAnnounce } from "./announce";
import { createDraftViews } from "./draft-views";
import { lazyModule } from "./lazy-module";
import { createLazyLoaders } from "./lazy-loaders";
import { storage } from "./browser-storage";
import * as sourceEditor from "./components/source-editor";
import { createMediaHistoryHome } from "./page-builder/media-history-home";
import { workingPart } from "./working-part";
import { createGitHubReads } from "./github-reads";
import { RepositoryIndex } from "./repository-loading";
import { CleanSourceCache } from "./clean-source-cache";
import { createNativeSiteRuntime } from "./native-site-runtime";
import { createLinkedStylesController } from "./controllers/linked-styles-controller";
import { createSourcePaneController } from "./controllers/source-pane-controller";
import type { ComponentTools } from "./page-builder/components";
import { createAgentCommands } from "./agent-site-host";
import { createAgentMenuHost } from "./agent-menu-host";
import { createPagesAndFilesHost } from "./pages-and-files-host";
import { createPageBuilderHost } from "./page-builder-host";
import { createSiteLoading } from "./site-loading";
import { createSiteTextIndex, isNativeTextFile } from "./site-text-index";
import { createGuardedEdits } from "./guarded-edit";
import { createParkedSteps, parkedTransitions } from "./guarded-edit/parked";
import { createEditorWorkspace } from "./editor-workspace";
import { createFinishedElsewhere, openLink } from "./finished-elsewhere";
import { createAgentPresence } from "./agent-presence";
import { createWorkspaceSession, draftScopeOf, holdsDraftScope, type SessionStamp, type WorkspaceScope } from "./workspace-session";
import type { Repository, SessionInfo, TreeEntry } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
// #status and the toast with its Undo (src/announce.ts).
const { announce, showToast, undoAction } = createAnnounce({ element, editorModule: sourceEditor });
// #status, the notice bar and the GitHub reads.
const { status, settleStatus, clearError, placeNotice, errorMessage, api, apiResponse, postApi } = createGitHubReads({
  app, element, explorer: () => workspace.explorerDropdown, trackRead: (read) => codePanes.trackRead(read), handleChunkLoadFailure,
  expired: () => renderLogin("expired"),
  // As say() in src/components/toast.ts, which loads on first use.
  say: (text, action) => { element("status").textContent = text; showToast(text, action); },
});
setErrorReporter(errorMessage);
// The source editor without Monaco (src/components/source-editor.ts): drafts,
// Undo/Redo and edits from the preview work from its draft store at once;
// Monaco is only the code pane's view, loaded later.
const editorModule = sourceEditor;
const mediaHistoryHome = createMediaHistoryHome();
const appStore = createAppStore(editorModule.sourceStore());
// What is open and which load of it (src/workspace-session.ts): signing out and each load below start the next.
const workspaceSession = createWorkspaceSession();
function currentLoad() { return workspaceSession.current().load; }
// Ticket 33 (src/agent-presence.ts): an agent at work on a section of the page shown, drawn while its workspace is.
const agentPresence = createAgentPresence({
  pages: () => Object.values(runtime.site?.routes ?? {}), source: path => runtime.source(path), begin: () => workspaceSession.begin(),
  paint: target => { nativePreview?.agentPresence(target); pageStructure?.agentPresence(target); },
});
function nextLoad(scope?: WorkspaceScope) { workspaceSession.next(scope); finishedWork.loading(scope); agentPresence.refresh(); workingPart.left(); return workspaceSession.begin(); }
const cleanSources = new CleanSourceCache(() => info?.user?.login);
// The open native site's state (src/native-site-runtime.ts); its preview adapter is the site preview below.
const runtime = createNativeSiteRuntime({
  scope: () => draftScope(), shown: () => shownScope(), drafts: () => draftStore(),
  mounted: path => editorModule?.getMountedSource(path), clean: cleanSources, textKey: () => nativeTextIndexScopeKey(),
  route: () => nativePreview?.route(), openFile: () => appStore.openFile.value, pageStyles: () => nativePageStyles(),
  find: path => findEntry(path), readTexts: (repo, files) => readNativeTexts(repo, files), unreadable: files => noteNativeUnreadable(files),
  changed: () => updateNativePreviewSources(),
  closed: () => {
    clearPendingTitles();
    mediaController.disposeGallery();
    mediaController.closePicker(deactivatingAway);
    pagesController.updateTabs();
    linkedStyles.clearBodyStyles();
    nativePreview?.deactivate();
  },
});
// The open site's routes and the preview's sources and updates (src/site-preview.ts); site loading's readers go in as arrows.
const sitePreview = createSitePreview({
  runtime, appStore, get nativePreview() { return nativePreview; }, get versions() { return versions; }, get previewSelection() { return previewSelection; },
  nativePreviewUnreadable: () => nativePreviewUnreadable(), loadNativeAssets: () => loadNativeAssets(), loadNativeStyleFiles: () => loadNativeStyleFiles(), loadNativeShownFiles: () => loadNativeShownFiles(),
});
const { nativeModeActive, nativeRouteForPath, nativeRouteInfo, nativeTitles, nativeLinkedSheets, nativePageStyles, withSiteConfig, updateNativePreview,
  updateNativePreviewSources, updateNativePreviewAssets, nativeComponentTagForPath, nativeFallbackPage } = sitePreview;
// Work finished on another project or branch, counted in the repository menu until it is opened (src/finished-elsewhere.ts).
const finishedWork = createFinishedElsewhere({ draw: (notes) => workspace.repositoryMenu?.setNotes(notes), open: (scope) => openLink(scope), showing: (scope) => holdsDraftScope(workspaceSession.current().scope, scope), follow: (commit, scope) => { if (runtime.engaged) workspace.siteActions?.track(commit, () => holdsDraftScope(workspaceSession.current().scope, scope)); } });
// Reading and opening the native site, its assets, the file readers and warnings (src/site-loading.ts).
// Made before anything hands its functions on: later consts and `let` state go in as getters, the text index as an arrow.
const { readFile, readFiles, readBlob, readNativeTexts, noteNativeUnreadable, nativePreviewUnreadable, showNativeWarnings, updateCurrentPageLabel,
  loadNativeShownFiles, loadNativeStyleFiles, nativeRouteShownSources, loadNativeAssets, forgetDraftedAssets, loadNativeComponentStyles,
  listRepositoryFiles, nativeSiteFiles, activateNativeSite } = createSiteLoading({
  runtime, appStore, workspaceSession, api, cleanSources, element, draftScope, findEntry, entryAt, nativeLinkedSheets, updateNativePreviewSources,
  updateNativePreviewAssets, nativeModeActive, withSiteConfig, nativeRouteForPath, nativeRouteInfo, updateAgentContext,
  get repositoryIndex() { return repositoryIndex; }, get nativePreview() { return nativePreview; }, get pageStructure() { return pageStructure; },
  get previewSelection() { return previewSelection; }, get versions() { return versions; },
  startNativeTextIndex: (...args) => startNativeTextIndex(...args),
});
// The site's text index, the first-paint wait and the Pages titles held back while a row is in use (src/site-text-index.ts).
const { nativeTextIndexScopeKey, startNativeTextIndex, wantNativeTextIndex, nativeTextIndexGate, afterNativePaint, noteNativePainted,
  flushPendingNativePageTitles, ensureNativeTextIndex, clearPendingTitles } = createSiteTextIndex({
  runtime, appStore, workspaceSession, element, currentLoad, draftScope, findEntry, updateNativePreviewSources, updateAgentContext,
  readNativeTexts, noteNativeUnreadable, updateCurrentPageLabel,
  get mediaController() { return mediaController; }, get pagesAndFiles() { return pagesAndFiles; }, get pagesController() { return pagesController; },
  get componentTools() { return componentTools; }, get nativePreview() { return nativePreview; }, get pageStructure() { return pageStructure; },
  get nativePreviewBehind() { return sitePreview.nativePreviewBehind; }, set nativePreviewBehind(value) { sitePreview.nativePreviewBehind = value; },
});
// A controller's load number as a stamp (until the follow-ups in ticket 22's Done section); once that load moved on, a deny-all stand-in that says the scope changed.
function stampOf(epoch: number): SessionStamp {
  const stamp = workspaceSession.begin();
  return stamp.load === epoch ? stamp : { load: epoch, scope: undefined, holds: () => false, changed: () => "scope" };
}
installChunkRecovery({
  storage: () => window.sessionStorage,
  // Undo/Redo steps or unsaved text that live only in this tab's memory.
  unsafe: () => editorModule.hasMemoryState() || hasEditableRecoveryState(document),
  flush: () => draftStore().flush(),
  persistenceError: () => Boolean(draftStore().error),
  reload: () => window.location.reload(),
  notice: (message) => {
    const notice = document.getElementById("notice");
    if (notice) { placeNotice(notice); notice.textContent = message; notice.hidden = false; }
  },
});
// The modules loaded on first use (src/lazy-loaders.ts): later consts go in as getters or arrows, setup's actions' ports as an arrow.
const lazyLoaders = createLazyLoaders({
  runtime, appStore, currentLoad, stampOf, loadNativeAssets,
  get guardedEdits() { return guardedEdits; }, get mediaController() { return mediaController; }, get mediaPorts() { return mediaPorts; },
  get pagesController() { return pagesController; }, get pagesAndFiles() { return pagesAndFiles; },
  setupScope: () => setupScope(), restoreFile: (...args) => restoreFile(...args), nativeSiteReadForCreate: () => nativeSiteReadForCreate(),
  readMediaText: (...args) => readMediaText(...args), loadPagesActions: () => loadPagesActions(),
  setupActions: () => ({
    get info() { return info; }, begin: () => workspaceSession.begin(),
    get repositories() { return repositories; }, set repositories(value) { repositories = value; },
    get wizardCreated() { return setup.wizardCreated; }, set wizardCreated(value) { setup.wizardCreated = value; },
    get waitingForRepositories() { return setup.waitingForRepositories; }, set waitingForRepositories(value) { setup.waitingForRepositories = value; },
    get repositorySelect() { return workspace.repositorySelect; }, get repositoryMenu() { return workspace.repositoryMenu; },
    boot, appStore, guardedEdits, nativeBaseSources: runtime.base.sources, repositoryIndex, setupController,
    api, readFiles, readFile, readBlob, branchText, draftScope, draftStore, pathNow,
    rememberStartingPoint, rememberPartialStart, rememberRepositories, repositoryOptions,
    chooseRepository, forgetPartialStart, removeFinishStarter, loadSnapshot, announce, errorMessage,
  }),
});
const { loadConfirmDialog, loadHistory, loadMediaWorkspace, loadMedia, loadSetupActions, loadChecklist, loadAgentPrompts, loadWizard, loadGetStarted,
  loadStartSite, loadSpotlight, loadAgentMenu, loadSiteSettings, loadAgentSite } = lazyLoaders;

// Components as first-class page builder objects (src/page-builder/components.ts).
let componentTools: ComponentTools | undefined;

// The guarded edit module, told of each file a pane mounts (`pane`: the stylesheet pane, which follows the page opened).
// It is set while the guarded edit module is made, before the workspace host.
let nativeMountListener: ((path: string, pane: boolean) => void) | undefined;
// The guarded edit module (src/guarded-edit.ts) over this host: one way to
// prove nothing changed since a plan read the files, then write one undo
// step (the editor's range step, or its commit through the draft receipt).
const editorWorkspace = createEditorWorkspace({
  session: { ...workspaceSession, shown: shownScope },
  versionView: () => Boolean(versions.view),
  route: () => nativePreview?.route(),
  editModeEntry: () => componentTools?.mode.entry(),
  agentActing: () => agentCommands.acting(),
  site: () => runtime.site,
  files: () => runtime.files(),
  store: draftStore,
  source: path => runtime.textSource(path),
  exists: path => nativePathExists(path) || (!runtime.site && (pathNow(path, treeState()) === "file" || pathNow(path, treeState()) === "folder")),
  base: path => runtime.base.sources.get(path),
  branchText: path => branchText(path),
  entry: async path => { await loadFileOps(); return (await pagesAndFiles.fileOps!.targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true))[0]; },
  createProblem: async path => (await findEntry(path)) ? `${path} already exists.` : branchPathProblem(path),
  openFile: () => appStore.openFile.value,
  restore: (path, at, beforeMount) => restoreFile(path, at, { linkDefaultStyle: false, beforeMount }),
  editor: editorModule,
  shareHistory(paths, anchor) {
    const scope = draftScope();
    if (!scope) return () => {};
    const alias = { stamp: workspaceSession.begin(), session: nativeHistorySession(scope, anchor) };
    for (const path of paths) nativeHistoryAliases.set(draftKey(scope, path), alias);
    return () => { for (const [key, value] of nativeHistoryAliases) if (value === alias) nativeHistoryAliases.delete(key); };
  },
  onMount: listener => { nativeMountListener = listener; },
  paneFile: () => linkedStyles.secondaryPath(),
  closePane: () => linkedStyles.closeSecondary(),
  afterFileChanges: () => afterFileChanges(),
  openAfter: (path, keepExplorer) => openAfter(path, keepExplorer, true),
  showRow: focus => { if (workspace.explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") pagesController.renderTree(focus); },
  status: () => element("status").textContent ?? "",
  select: (request, reveal) => nativePreview?.selectAfterUpdate(request, reveal ? { reveal: "center" } : undefined),
  flash: request => nativePreview?.flashInsert(request),
  announce,
  refuse: (message, history) => refuse(message, history ? { history } : {}),
  error: errorMessage,
  park: step => parkedSteps.park(step),
});
const guardedEdits = createGuardedEdits(editorWorkspace);
// Undo on its own page (ticket 34): a step written where its page was not shown waits for that page to open.
const parkedSteps = createParkedSteps({ transitions: step => parkedTransitions(editorWorkspace, step),
  open: (scope, page) => holdsDraftScope(shownScope(), scope) && appStore.openFile.value === page && editorModule.captureHistoryHost(page) ? (undo, redo, dispose) => editorModule.recordHistoryAction(page, undo, redo, dispose) : undefined });
// The page builder's wiring (src/page-builder-host.ts): the palette, component tools, inserts, block moves and drags,
// preview selection, the edit bar and Page Structure controller, page meta and settings, and the card grids.
// By value: consts and hoisted functions declared above; `let` state and later consts go in as getters, later functions as arrows.
const pageBuilder = createPageBuilderHost({
  app, appStore, runtime, workspaceSession, editorModule, guardedEdits, element, lazyModule, loadSiteSettings, errorMessage, announce,
  currentLoad, draftScope, stampOf, nativeRouteInfo, nativeRouteForPath, nativeComponentTagForPath,
  nativePageStyles, nativeImagePaths: (...args) => nativeImagePaths(...args), ensureNativeTextIndex, wantNativeTextIndex, showNativeWarnings, updateCurrentPageLabel,
  updateNativePreviewSources, updateAgentContext,
  get workspace() { return workspace; }, get codePanes() { return codePanes; }, get nativeHistoryShares() { return nativeHistoryShares; },
  get nativePreview() { return nativePreview; },
  get pageStructure() { return pageStructure; }, get componentTools() { return componentTools; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get versions() { return versions; }, get linkedStyles() { return linkedStyles; }, get mediaController() { return mediaController; },
  get pagesController() { return pagesController; }, get pagesAndFiles() { return pagesAndFiles; }, get agentController() { return agentController; },
  // Declared further down: read at call time.
  setupScope: () => setupScope(), nativeHistorySession: (scope, path) => nativeHistorySession(scope, path),
  restoreFile: (...args) => restoreFile(...args), ensureExplorer: () => ensureExplorer(), openCreate: (...args) => openCreate(...args),
  nativeSiteReadForCreate: () => nativeSiteReadForCreate(),
});
const { paletteController, mountComponentTools, componentPorts, nativeSectionChoices, nativeAddPoints, nativeElementAddPoint, nativeComponentLoaderPlan,
  insertNativeComponent, finishRailTyping, blockMoves, blockInsertPorts, loadBlockDrag, structureDrop, dragPageBlock, loadBlockInsert,
  previewSelection, nativeVariantFiles, nativeCssWorkspace, pageStructureController, nativeComponentFieldsRevision, elementMenuItems,
  nativePageMeta, writeNativePageMeta, nativeNavigationTarget, openNativePageSettings, openNativeSiteSettings, openNativeNavigation,
  refreshNativeRoutes, nativeMoveItems, cards } = pageBuilder;

const versions = createVersionView({
  appStore, workspaceSession, guardedEdits, editorModule,
  get nativePreview() { return nativePreview; },
  currentLoad, setupScope: () => setupScope(), draftScope, draftStore, nativeEffectiveSource: path => runtime.source(path), updateNativePreviewSources, loadHistory, loadConfirmDialog,
  api, postApi, status, errorMessage, refuse,
  restoreFile: (path, at, options) => restoreFile(path, at, options),
  loadSnapshot: path => loadSnapshot(path),
});

// Linked styles, the secondary pane and its rule chips (src/controllers/linked-styles-controller.ts).
const linkedStyles = createLinkedStylesController({
  appStore, workspaceSession, editorModule,
  get info() { return info; }, get nativeSite() { return runtime.site; },
  get primaryHistoryScope() { return workspace.primaryHistoryScope; }, get nativeVariantFiles() { return nativeVariantFiles; },
  element, nativeModeActive, nativeSources: () => runtime.sources(), nativePageStyles, nativeEffectiveSource: path => runtime.source(path), nativeComponentTagForPath, nativeCssWorkspace,
  nativeHistorySession: (scope, path) => nativeHistorySession(scope, path), draftScope, draftStore, findEntry, readFile, errorMessage, updateNativePreviewSources,
  applyWidth: () => codePanes.applyWidth(),
  refreshFiles: () => filesTreeController.refresh(),
  mounted: (path, pane) => nativeMountListener?.(path, pane),
});

// With the whole commit listed in the snapshot, any path resolves without a
// request; otherwise directories are walked one `/api/tree` call at a time.
const repositoryIndex = new RepositoryIndex();
function entryAt(path: string): TreeEntry | undefined {
  return appStore.repository.value && appStore.snapshot.value ? repositoryIndex.entry(appStore.repository.value, appStore.snapshot.value, path) : undefined;
}
function findEntry(path: string) {
  return appStore.repository.value && appStore.snapshot.value ? repositoryIndex.find(api, appStore.repository.value, appStore.snapshot.value, path) : Promise.resolve(undefined);
}

let nativePreview: ReturnType<typeof createNativePreview> | undefined;
let pageStructure: ReturnType<typeof createPageStructure> | undefined;

// The session's scope once its load's snapshot is on show: none on the overview or while a load runs.
function shownScope() { return appStore.snapshot.value ? workspaceSession.current().scope : undefined; }
function draftScope() { return draftScopeOf(shownScope()); }

// Media's wiring: image paths, uploads, media text, the media controller and its batches (src/controllers/media-host.ts).
// Made before Pages & files and the workspace, which take its functions: later consts and `let` state go in as getters, later functions as arrows.
const media = createMediaHost({
  runtime, appStore, workspaceSession, editorModule, mediaHistoryHome, guardedEdits, parkedSteps, finishedWork, pageStructureController,
  repositoryIndex, versions, cleanSources, api, element, lazyModule, loadMediaWorkspace, loadMedia, draftScope, currentLoad, stampOf,
  nativeTextIndexScopeKey, entryAt, findEntry, readFile, readBlob, listRepositoryFiles, loadNativeAssets, updateNativePreviewSources,
  imagesSignature, announce, undoAction, errorMessage,
  get nativePreview() { return nativePreview; }, get pagesController() { return pagesController; }, get workspace() { return workspace; },
  setupScope: () => setupScope(), afterFileChanges: () => afterFileChanges(), openAfter: (...args) => openAfter(...args), restoreFile: (...args) => restoreFile(...args),
});
const { mediaPorts, mediaController, nativeImagePaths, uploadFilesTo, discardUpload, readMediaText, mediaOrigins } = media;

// `away`: another workspace is opening, so a picker's Use under way still lands in its own (ticket 27); closing the workspace cancels it.
let deactivatingAway = false;
function deactivateNative(away = false) {
  deactivatingAway = away;
  try { runtime.reset(); } finally { deactivatingAway = false; }
}

function setCurrentPage(path?: string) {
  if (versions.view && versions.view.path !== path) versions.end(false);
  batch(() => {
    appStore.openFile.value = path;
    closeEditor();
  });
  updateAgentContext();
  updateNativePreview();
  // Another page re-links its own stylesheet once it opens; anything else closes the pane.
  const linkedPage = linkedStyles.linkedPage();
  if (linkedPage !== undefined && path !== linkedPage) linkedStyles.unlink();
  updateCurrentPageLabel();
  element("primary-title").textContent = path ?? "";
  componentTools?.refresh();
  element("explorer-toggle").title = path
    ? `Pages & files — ${path}`
    : "Pages & files";
}

let repositories: Repository[] = [];
// Unset until start() has read the session.
let info: SessionInfo;
let fileGeneration = 0;

// Login, Start your site, the Setup checklist and wizard, and Get started (src/setup-host.ts).
const setup = createSetupHost({
  app, element, appStore, workspaceSession, closeWorkspace: () => closeWorkspace(), setupScope: () => setupScope(), draftScope, draftStore, nativeEffectiveSource: (path, scope) => runtime.source(path, scope), api,
  get info() { return info; }, get repositories() { return repositories; }, get content() { return workspace.content; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get nativeEngaged() { return runtime.engaged; },
  get agentPrompts() { return lazyLoaders.agentPrompts; }, get onboardingCopy() { return lazyLoaders.onboardingCopy; },
  get boot() { return boot; }, get agentController() { return agentController; },
  loadRepositories: (prefetched) => loadRepositories(prefetched),
  loadSetupActions, loadWizard, loadChecklist, loadSpotlight, loadGetStarted, loadStartSite, loadAgentPrompts,
  status, errorMessage, refuse,
});
const {
  renderLogin, setupController, setupEntry, showGetStarted, checkNewRepositories,
  rememberRepositories, knownRepositories, rememberStartingPoint, takeStartingPoint,
  rememberPartialStart, readPartialStart, forgetPartialStart, offerFinishStarter, removeFinishStarter, writeStartingPoint,
} = setup;

function imagesSignature() {
  const scope = draftScope();
  return JSON.stringify([currentLoad(), setupScope(), appStore.snapshot.value?.commit, scope ? draftStore().list(scope) : []]);
}

// New, uploaded and deleted drafts, opened (src/draft-views.ts).
const { openNewDraft, showDeletedFile } = createDraftViews({
  appStore, workspaceSession, draftScope, status, setCurrentPage, discardUpload,
  get workspace() { return workspace; }, get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  openAfter: (...args) => openAfter(...args), undoFileChanges: (...args) => undoFileChanges(...args), mountSource: (...args) => mountSource(...args),
});

// Pages & files: the trees and explorer tabs, Create, file operations, resync and save/publish (src/pages-and-files-host.ts).
// By value: consts and hoisted functions declared above; `let` state goes in as getters (tests/main-ts-ceiling.test.ts).
const pagesAndFiles = createPagesAndFilesHost({
  app, element, appStore, runtime, workspaceSession, editorModule, guardedEdits, mediaController, cards, linkedStyles, versions,
  previewSelection, repositoryIndex, finishedWork, lazyModule, loadConfirmDialog, api, status, clearError, errorMessage, announce,
  currentLoad, stampOf, draftScope, entryAt, findEntry, readFile, readFiles, readMediaText, mediaOrigins, ensureNativeTextIndex,
  nativeRouteForPath, nativeRouteInfo, nativeTitles, nativeNavigationTarget, writeNativePageMeta, refreshNativeRoutes, forgetDraftedAssets,
  loadNativeComponentStyles, updateAgentContext, updateCurrentPageLabel, updateNativePreviewSources, updatePreview: updateNativePreview, setCurrentPage,
  showDirectory: (...args) => showDirectory(...args), openNewDraft, discardUpload, uploadFilesTo, nativeFallbackPage, nativeModeActive, nativeComponentTagForPath,
  startNativeTextIndex, openNativePageSettings, openNativeNavigation, flushPendingNativePageTitles,
  // Declared further down: read at call time.
  restoreFile: (...args) => restoreFile(...args), loadSnapshot: (...args) => loadSnapshot(...args), openEntry: (...args) => openEntry(...args),
  get explorerDropdown() { return workspace.explorerDropdown; }, get files() { return workspace.files; }, get pageStructure() { return pageStructure; },
  get siteActions() { return workspace.siteActions; }, clearPendingTitles,
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
});
const { loadPagesActions, loadFileOps, pagesController, savePublish, filesTreeController, ensureExplorer,
  openCreate, treeState, pathNow, nativePathExists, nativeSiteReadForCreate, branchText, branchPathProblem, discardedNewPages, afterFileChanges,
  openAfter, undoFileChanges, discardFileChange } = pagesAndFiles;

// The workspace's screen, the code panes and the source editor, a folder's summary, and closing it all (src/workspace-mount.ts).
// By value: consts declared above and hoisted functions; `let` state goes in as accessors (tests/main-ts-ceiling.test.ts).
const workspace = createWorkspaceMount({
  app, element, appStore, editorModule, workspaceSession, runtime, finishedWork, mediaHistoryHome, parkedSteps, guardedEdits, mediaController,
  paletteController, previewSelection, pageStructureController, linkedStyles, versions, cards, pagesAndFiles, setup, repositoryIndex, cleanSources,
  draftScope, shownScope, nextLoad, setCurrentPage, errorMessage, announce,
  site: { active: nativeModeActive, deactivate: deactivateNative, update: updateNativePreviewSources, painted: noteNativePainted, assets: loadNativeAssets,
    shown: loadNativeShownFiles, routeSources: nativeRouteShownSources, styles: loadNativeComponentStyles, files: nativeSiteFiles, route: nativeRouteForPath },
  builder: { choices: nativeSectionChoices, addPoint: nativeElementAddPoint, addPoints: nativeAddPoints, insert: insertNativeComponent, drag: dragPageBlock,
    dropTree: structureDrop, loadDrag: loadBlockDrag, loadInsert: loadBlockInsert, insertPorts: blockInsertPorts, finishTyping: finishRailTyping,
    menuItems: elementMenuItems, fields: nativeComponentFieldsRevision, moveItems: nativeMoveItems, tools: mountComponentTools },
  page: { meta: nativePageMeta, writeMeta: writeNativePageMeta, settings: openNativePageSettings, navigation: openNativeNavigation, siteSettings: openNativeSiteSettings },
  get info() { return info; }, get repositories() { return repositories; }, set repositories(value) { repositories = value; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get nativePreview() { return nativePreview; }, set nativePreview(value) { nativePreview = value; },
  get pageStructure() { return pageStructure; }, set pageStructure(value) { pageStructure = value; },
  get componentTools() { return componentTools; }, set componentTools(value) { componentTools = value; },
  get nativePreviewBehind() { return sitePreview.nativePreviewBehind; }, get nativeMountListener() { return nativeMountListener; },
  // Declared further down: read at call time.
  get boot() { return boot; }, get agentController() { return agentController; }, get workspaceBoot() { return workspaceBoot; },
  account: { reload: () => refreshRepositoryList(), switchTo: (login) => switchAccount(login), signOut: () => disconnect(),
    choose: () => chooseRepository(), load: () => loadSnapshot() },
});
const { codePanes, nativeHistoryAliases, nativeHistoryShares, nativeHistorySession, closeEditor, openCodeEditor, mountWorkspace, closeWorkspace,
  setupScope, showDirectory } = workspace;

// Opening a file in the source pane (src/controllers/source-pane-controller.ts).
const sourcePane = createSourcePaneController({
  appStore, workspaceSession, editorModule, linkedStyles, savePublish, versions, previewSelection, nativeBaseSources: runtime.base.sources, nativeVariantFiles,
  get info() { return info; }, get content() { return workspace.content; }, get explorerDropdown() { return workspace.explorerDropdown; },
  get nativeSite() { return runtime.site; }, get nativePreview() { return nativePreview; },
  get componentTools() { return componentTools; }, get pageStructure() { return pageStructure; },
  fileGeneration: () => fileGeneration, nextFileGeneration: () => ++fileGeneration,
  setActiveFileContext: (value) => { workspace.activeFileContext = value; },
  openCodeEditor, element, status, settleStatus, errorMessage, readFile, entryAt, draftScope, draftStore, openAfter, setCurrentPage, showDeletedFile,
  isNativeTextFile, nativeModeActive, nativeRouteForPath, nativeComponentTagForPath, nativeFallbackPage, nativeCssWorkspace,
  updateNativePreviewSources, discardedNewPages, showDirectory, updateAgentContext, updateCurrentPageLabel, discardFileChange,
  restoreFile: (path, at) => restoreFile(path, at),
  refreshFiles: () => filesTreeController.refresh(),
});
const { openEntry, mountSource } = sourcePane;

function updateAgentContext() {
  agentController.changed();
  setupController.refresh();
}

// The agent's commands, run through the editor's own actions (src/agent-site-host.ts).
// By value: consts declared above and hoisted functions; `let` state goes in as getters (tests/main-ts-ceiling.test.ts).
const agentCommands = createAgentCommands({
  appStore, runtime, workspaceSession, guardedEdits, editorModule, editorWorkspace, versions, finishedWork, parkedSteps, repositoryIndex,
  mediaController, mediaPorts, blockMoves, agentPresence, pagesAndFiles, api, loadAgentSite, draftScope, shownScope, openNewDraft,
  nativeComponentLoaderPlan, writeNativePageMeta, nativeSectionChoices, componentPorts, refreshNativeRoutes, updateCurrentPageLabel, updateAgentContext,
  // Declared further down: read at call time.
  restoreFile: (...args) => restoreFile(...args),
  get info() { return info; }, get componentTools() { return componentTools; }, get pageStructure() { return pageStructure; },
  get nativePreview() { return nativePreview; },
});
// The agent menu, the context agents are shown and the files they read (src/agent-menu-host.ts).
const { agentController } = createAgentMenuHost({
  appStore, runtime, guardedEdits, cleanSources, agentCommands, setupController, pageStructureController, mediaPorts, workspace, nativeTextIndexGate,
  api, readFile, readFiles, loadAgentSite, loadAgentMenu, draftScope, nativeRouteInfo, pathNow, errorMessage,
  get info() { return info; }, get nativePreview() { return nativePreview; },
});
// Opening a repository, its snapshot and the remembered boot's guess (src/workspace-boot.ts).
const workspaceBoot = createWorkspaceBoot({
  appStore, savePublish, repositoryIndex, cleanSources, filesTreeController, pagesController, previewSelection, mediaHistoryHome,
  get user() { return info?.user; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get repositories() { return repositories; },
  get content() { return workspace.content; }, get files() { return workspace.files; }, get refreshButton() { return workspace.refreshButton; },
  get branchSelect() { return workspace.branchSelect; }, get repositorySelect() { return workspace.repositorySelect; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get explorerDropdown() { return workspace.explorerDropdown; }, get siteActions() { return workspace.siteActions; },
  get nativeSite() { return runtime.site; }, get nativeSourcesRequest() { return runtime.state.request; },
  get nativePaintedRequest() { return runtime.state.paintedRequest; }, get nativePaintedPaths() { return runtime.state.paintedPaths; },
  source: () => location.origin + location.pathname,
  sessionTag: () => boot.sessionTag(),
  draftsReady: () => boot.draftsReady(),
  nextLoad, api, apiResponse, readFile, storage, element, node, options, status, settleStatus, clearError, errorMessage,
  draftScope, entryAt, setCurrentPage, openNewDraft, openEntry, mountSource, deactivateNative, activateNativeSite, afterNativePaint,
  updateAgentContext, updatePreview: updateNativePreview, showDirectory, takeStartingPoint, writeStartingPoint, readPartialStart, offerFinishStarter,
  removeFinishStarter: () => removeFinishStarter(),
});
const { restoreFile, loadSnapshot, chooseRepository } = workspaceBoot;

// Coming back to the tab lists the repositories again for Get started (src/setup-host.ts).
window.addEventListener("focus", () => void checkNewRepositories());
document.addEventListener("visibilitychange", () => void checkNewRepositories());

// The repository list, account switching and sign-out (src/repository-list.ts).
const { loadRepositories, repositoryOptions, refreshRepositoryList, switchAccount, disconnect } = createRepositoryList({
  appStore, repositoryIndex, mediaHistoryHome, cleanSources, workspaceBoot, setup, setupEntry, setupController,
  get boot() { return boot; }, get user() { return info?.user; },
  get repositories() { return repositories; }, set repositories(value) { repositories = value; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get content() { return workspace.content; }, get files() { return workspace.files; }, get refreshButton() { return workspace.refreshButton; },
  get branchSelect() { return workspace.branchSelect; }, get repositorySelect() { return workspace.repositorySelect; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get siteActions() { return workspace.siteActions; },
  nextLoad, chooseRepository, storage, options, status, clearError, errorMessage, announce, setCurrentPage, openExplorer: () => workspace.explorerDropdown?.open(),
  removeFinishStarter, showGetStarted, knownRepositories, rememberRepositories,
});

// A draft written with GitHub's text of its file, as this tab holds it, is no change (src/drafts.ts).
draftStore().baseline = (scope, path) => {
  return runtime.engaged && holdsDraftScope(shownScope(), scope)
    ? runtime.base.sources.get(path)
    : undefined;
};

const boot = createBootController({
  begin: () => workspaceSession.begin(),
  source: () => `${location.origin}${location.pathname}`,
  url: () => location.href,
  replaceUrl: (url) => history.replaceState(null, "", url),
  redirect: (url) => location.replace(url),
  assign: (url) => location.assign(url),
  readSession: () => apiResponse<SessionInfo>("session"),
  readRepositories: (refresh) => apiResponse<Repository[]>("repositories", refresh ? { refresh: "1" } : undefined),
  loadDrafts: (login) => draftStore().load(login),
  onDraftError: () => { draftStore().onError = (message) => errorMessage(new Error(message)); },
  session: () => info,
  // The source cache keys by account and drops another account's entries itself.
  adoptSession: (session) => { info = session; },
  enterWorkspace: () => {
    resumeWorkspaceLink();
    mountWorkspace();
    agentController.start();
  },
  // A guess not taken by the boot's listing is not kept for a later Reload.
  loadRepositories: (prefetched, hooks) => loadRepositories(prefetched, hooks).finally(() => workspaceBoot.forgetGuess()),
  renderLogin,
  retainLink: retainWorkspaceLink,
  showError: errorMessage,
  storage,
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  menu: () => workspace.repositoryMenu,
  applyList: (next) => {
    repositories = next;
    rememberRepositories(next);
    repositoryOptions();
    workspace.repositorySelect.disabled = !next.length;
    if (appStore.repository.value) workspace.repositorySelect.value = String(appStore.repository.value.id);
  },
});

document.addEventListener("click", (event) => {
  if ((event.target as Element).closest?.(`a[href="${EDITOR_LOGIN}"]`))
    retainWorkspaceLink();
});
// A fragment change before the session has loaded is not lost: once signed
// in, the repositories load from the location as it is then.
window.addEventListener("hashchange", () => { workspaceBoot.dropGuess(); boot.onHashChange(); });
renderLogin("loading");
workspaceBoot.startGuess();
void boot.start();
