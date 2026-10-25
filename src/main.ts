import { rootRoute, siteAddress } from "../shared/site-path-prefix";
import { MEDIA_RECORDS_PATH } from "../shared/media-records-path";
import { mediaOwnOrigins } from "./page-builder/media-origins";
import { refuse } from "./components/refusal-note";
import "./components/refusal-note.css";
import { createMediaController, type MediaPin } from "./controllers/media-controller";
import { pinMedia } from "./controllers/media-pin";
import { createBootController } from "./controllers/boot-controller";
import { batch, effect } from "@preact/signals-core";
import { createAppStore } from "./app-store";
import { handleChunkLoadFailure, hasEditableRecoveryState, installChunkRecovery } from "./chunk-recovery";
import "./utilities.css";
import "./style.css";
import "./theme.css";
import { node, button } from "./ui/dom";
import { setErrorReporter } from "./ui/report-failure";
import {
  retainWorkspaceLink,
  resumeWorkspaceLink,
} from "./workspace-state";
import { createSetupHost, EDITOR_LOGIN } from "./setup-host";
import { createRepositoryList } from "./repository-list";
import { createAgentController } from "./controllers/agent-controller";
import { createVersionView } from "./version-view";
import type { SharedContext } from "./agent-site";
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { nativeShownFiles, withSiteIndexed } from "./native-boot";
import { draftKey } from "./drafts";
import { createNativePreview, routeStylesheets } from "./components/native-preview";
import { createPageStructure } from "./components/page-structure";
import "./components/pages-tree.css";
import "./components/phone-sheet.css";
import "./components/files-tree.css";
import { createWorkspaceBoot } from "./workspace-boot";
import { createWorkspaceMount } from "./workspace-mount";

import { formatBytes, uploadBytes, uploadDataUrl, uploadKey } from "./uploads";
import { isImagePath } from "./native-structure";
import * as sourceEditor from "./components/source-editor";
import { createMediaHistoryHome } from "./page-builder/media-history-home";
import type { MediaWorkspaceBatch } from "./page-builder/media-workspace";
import { expandStyleImports } from "../shared/css-imports";
import { workingPart } from "./working-part";

import { NATIVE_CONFIG_PATH, nativeDefaultRoute, nativePageHead, nativePageStylesheets, nativeSiteSettings, type NativeSite, nativeSitePrefix } from "../shared/native-project";
import { createGitHubReads } from "./github-reads";
import { RepositoryIndex } from "./repository-loading";
import { CleanSourceCache } from "./clean-source-cache";
import { createNativeSiteRuntime } from "./native-site-runtime";
import { createLinkedStylesController } from "./controllers/linked-styles-controller";
import { createSourcePaneController } from "./controllers/source-pane-controller";
import type { ComponentTools } from "./page-builder/components";
import { createAgentCommands, createAgentSiteHost } from "./agent-site-host";
import { createPagesAndFilesHost } from "./pages-and-files-host";
import { createPageBuilderHost } from "./page-builder-host";
import { createSiteLoading } from "./site-loading";
import { createSiteTextIndex, isNativeTextFile } from "./site-text-index";
import { createGuardedEdits, type Stamp } from "./guarded-edit";
import { createParkedSteps, parkedTransitions } from "./guarded-edit/parked";
import { createEditorWorkspace } from "./editor-workspace";
import { createFinishedElsewhere, openLink } from "./finished-elsewhere";
import { createAgentPresence } from "./agent-presence";
import { createWorkspaceSession, draftScopeOf, holdsDraftScope, type SessionStamp, type WorkspaceScope } from "./workspace-session";
import type { AnnounceAs } from "./components/toast-rules";
import type { ToastAction } from "./components/toast";
import type {
  Repository,
  SessionInfo,
  TreeEntry,
} from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
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
// The open native site's state (src/native-site-runtime.ts); its preview adapter stays here.
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
  get nativePreviewBehind() { return nativePreviewBehind; }, set nativePreviewBehind(value) { nativePreviewBehind = value; },
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
// Failed imports can be retried; chunk recovery owns the reload policy.
function lazyModule<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => pending ??= load().catch((error) => {
    pending = undefined;
    void handleChunkLoadFailure(error);
    throw error;
  });
}
const loadConfirmDialog = lazyModule(() => import("./components/confirm-dialog"));
const loadHistory = lazyModule(() => import("./components/commit-history"));
// The media picker and the media workspace behind it (its batches are staged by applyMediaBatch).
const loadMediaWorkspace = lazyModule(() => Promise.all([import("./page-builder/media-workspace"), import("./page-builder/media-draft-transaction"), import("../shared/media-records")]));
const loadMedia = lazyModule(async () => {
  const [module, [{ createMediaWorkspace }]] = await Promise.all([import("./page-builder/media-picker"), loadMediaWorkspace()]);
  // Usage badges read the site's usage check, which runs on open.
  // Media lists every kind (pictures, video, audio, PDFs and other downloads); pickers narrow by `accept`.
  module.configureMediaPicker({ ...createMediaWorkspace(() => mediaController.workspaceContext(module.isMediaLibraryPath),
    () => { const pin = mediaPorts.pin?.(); return pin && (() => mediaController.workspaceContext(module.isMediaLibraryPath, pin)); }),
    usage: { records: () => mediaController.usageRecords(), onChange: listener => mediaController.onUsageChange(listener), pageLabel: (file) => pagesController.pageLabel(file) } });
  return module;
});
const loadSetupActions = lazyModule(async () => {
  const { createSetupActions } = await import("./setup-actions");
  return createSetupActions({
    get info() { return info; }, begin: () => workspaceSession.begin(),
    get repositories() { return repositories; }, set repositories(value) { repositories = value; },
    get wizardCreated() { return setup.wizardCreated; }, set wizardCreated(value) { setup.wizardCreated = value; },
    get waitingForRepositories() { return setup.waitingForRepositories; }, set waitingForRepositories(value) { setup.waitingForRepositories = value; },
    get repositorySelect() { return workspace.repositorySelect; }, get repositoryMenu() { return workspace.repositoryMenu; },
    boot, appStore, guardedEdits, nativeBaseSources: runtime.base.sources, repositoryIndex, setupController,
    api, readFiles, readFile, readBlob, branchText, draftScope, draftStore, pathNow,
    rememberStartingPoint, rememberPartialStart, rememberRepositories, repositoryOptions,
    chooseRepository, forgetPartialStart, removeFinishStarter, loadSnapshot, announce, errorMessage,
  });
});
const loadChecklist = lazyModule(async () => (await Promise.all([import("./components/setup-checklist"), loadSetupActions()]))[0]);
// The prompt for a coding agent that sets the site up (src/agent-prompts.ts),
// loaded with the wizard and the start panel that offer it.
let agentPrompts: typeof import("./agent-prompts") | undefined;
const loadAgentPrompts = lazyModule(async () => agentPrompts = await import("./agent-prompts"));
const loadWizard = lazyModule(async () => (await Promise.all([import("./components/setup-wizard"), loadAgentPrompts(), loadSetupActions()]))[0]);
const loadGetStarted = lazyModule(async () => (await Promise.all([import("./components/get-started"), loadSetupActions()]))[0]);
const loadStartSite = lazyModule(async () => (await Promise.all([import("./components/start-site"), loadSetupActions()]))[0]);
// The agent copy is read only beside the spotlight that shows it.
let onboardingCopy: typeof import("./onboarding-copy") | undefined;
const loadSpotlight = lazyModule(async () => {
  const [copy, spotlight] = await Promise.all([import("./onboarding-copy"), import("./components/spotlight")]);
  onboardingCopy = copy;
  return spotlight;
});
const loadAgentMenu = lazyModule(async () => {
  const [menu, records] = await Promise.all([import("./components/agent-menu"), import("./agent-records")]);
  return { createAgentMenu: (options: Parameters<typeof menu.createAgentMenu>[0]) => menu.createAgentMenu({ ...options, records: records.indexedDbAgentRecords() }) };
});
// The Site, Page and Navigation settings dialogs, loaded when one first opens.
const loadSiteSettings = lazyModule(async () => {
  const [{ createNativeSettings }] = await Promise.all([import("./native-settings"), loadPagesActions()]);
  return createNativeSettings({
    get nativeSite() { return runtime.site; }, get generation() { return currentLoad(); },
    appStore, guardedEdits, nativeAssets: runtime.state.assets, setupScope,
    nativePageLabelOf: (file) => pagesController.pageLabel(file),
    nativeUrlPlan: (file, value) => pagesAndFiles.pageActions!.urlPlan(file, value),
    changeNativeUrl: (file, value, keep, since, baseline) => pagesAndFiles.pageActions!.changeUrl(file, value, keep, since, baseline),
    restoreFile: (path, epoch) => restoreFile(path, stampOf(epoch)), nativeSiteReadForCreate,
    choosePath: (place, accept) => mediaController.choosePath(place, undefined, accept), nativeEffectiveSource: path => runtime.source(path), loadNativeAssets,
    shareImage: request => mediaController.shareImage(request),
    nativeFiles: () => runtime.files(), readMediaText,
  });
});
// What agents are shown and how their commands run (src/agent-site.ts), loaded when one asks.
const loadAgentSite = lazyModule(() => import("./agent-site"));

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
  nativePageStyles, nativeImagePaths, ensureNativeTextIndex, wantNativeTextIndex, showNativeWarnings, updateCurrentPageLabel,
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

function nativeModeActive() {
  return Boolean(runtime.site);
}

// The route whose page file is `path`; undefined when the file is not a page.
function nativeRouteForPath(path: string | undefined) {
  if (!runtime.site || !path) return undefined;
  return Object.entries(runtime.site.routes).find(([, file]) => file === path)?.[0];
}

// The session's scope once its load's snapshot is on show: none on the overview or while a load runs.
function shownScope() { return appStore.snapshot.value ? workspaceSession.current().scope : undefined; }
function draftScope() { return draftScopeOf(shownScope()); }

// The title and description the page at `route` has, from its head.
function nativeRouteInfo(route: string, site = runtime.site) {
  if (!site || !Object.hasOwn(site.routes, route)) return {};
  const source = runtime.source(site.routes[route]);
  return source === undefined ? {} : nativePageHead(source);
}

// The titles of the site's pages by route, for the Pages tab.
function nativeTitles(site: NativeSite) {
  return Object.fromEntries(Object.keys(site.routes).map((route) => [route, nativeRouteInfo(route, site).title]));
}

// The stylesheets any page links, in page order: what the style loader reads.
function nativeLinkedSheets(site: NativeSite, sources: Record<string, string>) {
  const out = new Set<string>();
  const prefix = runtime.prefix();
  for (const file of Object.values(site.routes))
    for (const path of nativePageStylesheets(sources[file] ?? "", file, prefix)) out.add(path);
  return [...out];
}

// The shared stylesheets of the page the preview shows (the home page's
// when it shows no page), with every file they import.
function nativePageStyles() {
  if (!runtime.site) return [];
  const sources = runtime.sources();
  const route = nativeRouteForPath(appStore.openFile.value) ?? nativeDefaultRoute(runtime.site);
  const linked = routeStylesheets(runtime.site, sources, route, runtime.prefix());
  return [...new Set([...linked, ...expandStyleImports(linked, (path) => sources[path], undefined, runtime.prefix()).imported])];
}

// A page selection: the preview follows the newly opened page's route. Opening
// a non-page file (CSS, component) leaves the preview's current route untouched.
// The preview's sources: the effective ones, with History's earlier version
// of the open file in its place while one is on show.
// The preview's sources also carry the site's settings: its Site address
// places the site in a sub-folder (shared/site-path-prefix.ts).
function withSiteConfig(sources: Record<string, string>) {
  const config = runtime.source(NATIVE_CONFIG_PATH);
  if (config !== undefined) sources[NATIVE_CONFIG_PATH] = config;
  return sources;
}
function nativePreviewSources() {
  versions.check();
  const sources = withSiteConfig(runtime.sources());
  if (versions.view) sources[versions.view.path] = versions.view.content;
  return sources;
}

function updateNativePreview() {
  if (!runtime.site || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({
    sources: nativePreviewSources(),
    componentStyles: Object.fromEntries(runtime.state.componentStyles),
    unreadable: nativePreviewUnreadable(),
    route: nativeRouteForPath(appStore.openFile.value),
    component: appStore.openFile.value ? nativeComponentTagForPath(appStore.openFile.value) : undefined,
    editableTemplatePath: previewSelection.editableTemplatePath(),
  });
}

// A source edit: push new sources but never change the route, so an edit while
// the preview is on About (with a different file open) does not snap it Home.
// The preview holds sources older than the editor's (the text index read
// pages it does not show): the next update or route shown brings them.
let nativePreviewBehind = false;
function updateNativePreviewSources() {
  if (!runtime.site || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({ sources: nativePreviewSources(), componentStyles: Object.fromEntries(runtime.state.componentStyles), assets: Object.fromEntries(runtime.state.assets), unreadable: nativePreviewUnreadable(), editableTemplatePath: previewSelection.editableTemplatePath() });
  void loadNativeAssets();
  void loadNativeStyleFiles();
  void loadNativeShownFiles();
}

// Images and fonts that arrived after the page was drawn: the preview shows
// them in place, without drawing the page again.
function updateNativePreviewAssets() {
  if (!runtime.site || !nativePreview) return;
  nativePreview.setAssets(Object.fromEntries(runtime.state.assets));
}

// Images an image's Address suggests: the branch's and the drafted ones, not deleted ones.
function nativeImagePaths() {
  const scope = draftScope();
  const drafts = scope ? draftStore().list(scope) : [];
  const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
  return [...new Set([
    ...(appStore.snapshot.value?.tree ?? []).filter((entry) => entry.type === "blob" && isImagePath(entry.path)).map((entry) => entry.path),
    ...runtime.newDraftPaths({ kind: isImagePath }, scope),
  ])].filter((path) => !gone.has(path)).sort();
}

// Files from the computer as new-file drafts in `folder` (src/uploads.ts), never over something
// that is there, with the shared adding progress at the foot of Files; resolves to the paths added.
// They land in the drop's repository and branch even once another is shown (ticket 23).
async function uploadFilesTo(folder: string, files: File[]): Promise<string[]> {
  const pin = mediaPorts.pin?.();
  if (!pin || !files.length) return [];
  try {
    const { addFilesTo } = await import("./page-builder/media-files-adding");
    return await addFilesTo(element("explorer-files"), folder, files, { error: errorMessage,
      // Finished on a workspace not shown, nothing is said: the menu counts it there (ticket 27, Lex: no toasts).
      announce: text => { if (pin.here()) announce(text); }, context: () => mediaController.workspaceContext(undefined, pin),
      // Pictures not added yet go to Media's Optimise sheet, still bound for this folder (on show only).
      review: element("explorer-tabs").hidden ? undefined : (images, into, reasons) => {
        if (!pin.here()) return;
        workspace.explorerDropdown?.open(); pagesController.selectTab("media");
        void mediaController.reviewInGallery(images, into, reasons).catch(errorMessage);
      } }).then((paths) => { if (!pin.here()) finishedWork.add(pin.scope, "added", { count: paths.length }); return paths; });
  } catch (error) { errorMessage(error); return []; }
}

// An upload and its per-file records leave together, through the lazy media rules.
async function discardUpload(path: string) {
  const scope = draftScope(), since = guardedEdits.stamp();
  if (!scope || !draftStore().get(scope, path)?.upload) return;
  const draft = draftStore().get(scope, path), records = draftStore().get(scope, ".editor/media.json");
  const { discardUploadDraft } = await import("./page-builder/media-upload-discard");
  if (!since.holds() || draftStore().get(scope, path) !== draft || draftStore().get(scope, ".editor/media.json") !== records) return;
  try {
    let discarded = false;
    batch(() => { discarded = discardUploadDraft(draftStore(), scope, path); });
    if (discarded) { afterFileChanges(); announce(`Discarded ${path}.`); }
  } catch (error) { errorMessage(error); }
}

async function readMediaText(path: string) {
  const key = nativeTextIndexScopeKey(), repo = appStore.repository.value;
  const held = runtime.textSource(path);
  if (held !== undefined) return held;
  if (!repo || !key) return undefined;
  const scope = draftScope(), draft = scope ? draftStore().get(scope, path) : undefined;
  if (draft?.deleted) return undefined;
  // An uploaded or moved file (an SVG, say) holds no text in its draft: read its bytes.
  if (scope && draft?.opaque && draft.sourceSha) {
    const text = draft.upload ? await (await uploadBytes().get(uploadKey(scope, draft.sourceSha)))?.text() : await readFile(repo.full_name, draft.sourceSha);
    if (key !== nativeTextIndexScopeKey() || draftStore().get(scope, path) !== draft) return undefined;
    if (text !== undefined) runtime.state.opaqueText.set(draftKey(scope, path), { sha: draft.sourceSha, text });
    return text;
  }
  const entry = await findEntry(path);
  if (key !== nativeTextIndexScopeKey() || !entry) return undefined;
  const source = await readFile(repo.full_name, entry.sha);
  if (key !== nativeTextIndexScopeKey()) return undefined;
  cleanSources.put("", key, path, source);
  return source;
}
function mediaOrigins() {
  return mediaOwnOrigins(nativeSiteSettings(runtime.textSource(NATIVE_CONFIG_PATH)).url, runtime.textSource("CNAME"));
}

// Background pages of workspaces not shown (src/background-page.ts), made with the first.
let backgroundPages: ReturnType<typeof import("./background-page").createBackgroundPages<import("./background-page").BackgroundFrame>> | undefined;
// Media context and UI lifecycle use live getters; binary/Undo writes stay here.
const mediaPorts: import("./controllers/media-controller").MediaControllerPorts = {
  measureImage: (path, node, image, slot, style) => nativePreview && runtime.site?.routes[nativePreview.shownRoute() ?? ""] === path
    ? nativePreview.measureImage({ path, node, slot, style, ...(image.width && image.height ? { image: { width: image.width, height: image.height } } : {}) }) : Promise.resolve(undefined),
  finishedAway: (scope) => finishedWork.add(scope, "media"),
  // Work whose workspace is not shown measures in a background page of its site and page (ticket 27).
  measureAway: async (pin, path, node, image, slot, style) => {
    const site = pin.site, module = await import("./background-page");
    if (!site) return undefined;
    backgroundPages ??= module.createBackgroundPages();
    // This work's own texts: a page shared with other work is drawn from them as it measures.
    const own = { site, page: path, files: () => new Set(pin.files()),
      text: async (file: string) => pin.source(file) ?? await pin.find(file).then((entry) => entry && readFile(pin.repo, entry.sha)),
      shown: (source: (file: string) => string | undefined, isFile: (file: string) => boolean) => nativeShownFiles(site, [path], source, isFile, nativeSitePrefix(pin.source(NATIVE_CONFIG_PATH))) };
    return backgroundPages.use(module.backgroundKey(pin.scope, path), () => module.openBackgroundFrame(own, (host) => createNativePreview(host)),
      (frame) => frame.measure({ path, node, slot, style, ...(image.width && image.height ? { image: { width: image.width, height: image.height } } : {}) }, own));
  },
  origins: mediaOrigins,
  usage: {
    key: () => runtime.state.textIndexScope === nativeTextIndexScopeKey() ? nativeTextIndexScopeKey() : "", files: () => runtime.files(),
    pages: () => Object.values(runtime.site?.routes ?? {}), components: () => runtime.site?.components ?? {},
    source: path => runtime.textSource(path), read: readMediaText,
    url: () => nativeSiteSettings(runtime.textSource(NATIVE_CONFIG_PATH)).url,
    settled: () => runtime.state.textIndexing ?? Promise.resolve(), changed: () => {},
  },
  cleanUp: { place: () => setupScope() },
  // Improve images opens each page so its pictures are measured; the canvas draws it a moment later (at most 5 s).
  showPage: async path => {
    if (appStore.openFile.value !== path) await openAfter(path, true, true);
    for (let wait = 0; wait < 50 && runtime.site?.routes[nativePreview?.shownRoute() ?? ""] !== path; wait++) await new Promise(done => setTimeout(done, 100));
  },
  workspace: () => {
    const repo = appStore.repository.value, scope = draftScope();
    if (!repo || !scope || !appStore.snapshot.value) return undefined;
    return { repo: repo.full_name, repoSize: repo.size, scope, identity: mediaIdentity(), site: runtime.site,
      nativePaths: runtime.site ? runtime.files(scope) : undefined, drafts: draftStore() };
  },
  // The workspace shown, for work to finish in (ticket 23): the editor's reads while it is on show,
  // then its snapshot's, the branch texts read so far and its drafts.
  pin: () => pinMedia({ shown: () => { const repo = appStore.repository.value, scope = draftScope(), snapshot = appStore.snapshot.value; return repo && scope && snapshot && { repo, scope, snapshot, site: runtime.site }; },
    begin: () => workspaceSession.begin(), base: () => ({ files: runtime.base.files, texts: runtime.base.sources, key: nativeTextIndexScopeKey() }), identity: mediaIdentity, drafts: draftStore,
    live: { entry: entryAt, find: findEntry, source: (path, scope) => runtime.textSource(path, scope), files: scope => runtime.files(scope), remember: (path, text) => mediaPorts.rememberSource(path, text) },
    // Seeded first: a switch clears the index, and the pinned snapshot's files must read the same before and after (ticket 27).
    entry: (repo, snapshot, path) => { repositoryIndex.seed(repo, snapshot); return repositoryIndex.entry(repo, snapshot, path); }, find: (repo, snapshot, path) => repositoryIndex.find(api, repo, snapshot, path),
    files: (scope, base) => runtime.files(scope, base), list: listRepositoryFiles, peek: (repo, revision, path) => cleanSources.peek(repo, revision, path) }),
  identity: mediaIdentity,
  stamp: () => guardedEdits.stamp("repository"),
  generation: currentLoad,
  selected: (path, node) => appStore.selection.value?.path === path && appStore.selection.value.node?.join(".") === node.join("."),
  source: (path, scope) => runtime.textSource(path, scope),
  listPaths: async () => { const repo = appStore.repository.value, snapshot = appStore.snapshot.value; if (!repo || !snapshot) throw new Error("Choose a repository before opening Media."); return listRepositoryFiles(repo, snapshot); },
  findEntry,
  entry: entryAt,
  readText: readFile,
  rememberSource: (path, source) => {
    // Native preview sources stay separate from the wider text index; without a site nothing keeps either current.
    if (!runtime.site) return;
    if (/\.(?:html|css)$/i.test(path) || path === MEDIA_RECORDS_PATH) runtime.base.sources.set(path, source);
    else cleanSources.put("", nativeTextIndexScopeKey(), path, source);
  },
  uploadedBlob: (scope, sha) => uploadBytes().get(uploadKey(scope, sha)),
  readBlob,
  applyBatch: applyMediaBatch,
  refreshDescriptions: () => { if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
  placeLabel: (file) => pagesController.pageLabel(file),
  select: (path, node) => { nativePreview?.selectAfterUpdate({ path, node }); nativePreview?.flashInsert({ path, node }); },
  imagePopup: {
    image: () => nativePreview?.selectionBox(),
    bar: () => document.querySelector<HTMLElement>(".edit-bar"),
    frame: () => element("main").querySelector(".native-preview-frame")?.getBoundingClientRect(),
    look: (target, look) => nativePreview?.imageLook(target, look),
    scroll: dy => nativePreview?.scrollBy(dy),
    // Read as the canvas reads its images, so the page can show a replacement too.
    picture: async path => {
      if (!runtime.state.assets.has(path)) await loadNativeAssets({ [appStore.openFile.value ?? "index.html"]: `<img src="${siteAddress(path, runtime.prefix()).replace(/&/g, "&amp;")}">` });
      return runtime.state.assets.get(path);
    },
  },
  mediaPlay: {
    send: (id, request, blob) => nativePreview?.playMedia(id, request, blob),
    box: () => nativePreview?.selectionBox() ?? undefined,
    frame: () => element("main").querySelector(".native-preview-frame")?.getBoundingClientRect(),
    watch: (listener) => appStore.selection.subscribe(listener),
  },
  openPage: (...args) => openAfter(...args),
  load: loadMedia,
  openFile: () => appStore.openFile.value,
  viewingVersion: () => Boolean(versions.view),
  restoreFile: (path, epoch) => restoreFile(path, stampOf(epoch), { linkDefaultStyle: false }),
  change: (...args) => pageStructureController.editOpenPage(...args),
  galleryHost: () => { const host = element("explorer-media"); host.querySelector(":scope > .sidebar-hint")?.remove(); return host; },
  galleryVisible: () => !element("explorer-media").hidden && element("explorer").matches(":popover-open"),
  mediaSelected: () => pagesController.explorerTab() === "media",
  gallerySignature: imagesSignature,
  announce,
  undoAction,
  error: errorMessage,
};
const mediaController = createMediaController(mediaPorts, lazyModule(() => import("./controllers/media-actions")));
// Typing changes drafts often; the usage check waits for a pause.
let mediaUsageTimer: ReturnType<typeof setTimeout> | undefined;
effect(() => {
  appStore.repository.value; appStore.snapshot.value; appStore.drafts.revision.value;
  mediaController.invalidateUsage();
  clearTimeout(mediaUsageTimer);
  mediaUsageTimer = setTimeout(() => mediaController.refreshUsage(), 400);
});
function mediaIdentity() { return `${currentLoad()}:${setupScope()}`; }

// Undo goes to the page open as the step commits; a pinned batch finishes where it started (src/media-batch.ts).
const loadMediaBatch = lazyModule(() => import("./media-batch"));
async function applyMediaBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin?: MediaPin, asked?: string) {
  const opened = asked ?? appStore.openFile.value, module = await loadMediaBatch();
  return module.applyMediaBatch({
    appStore, editor: editorModule, mediaHistoryHome, site: () => runtime.site, load: loadMediaWorkspace, stamp: () => guardedEdits.stamp("repository"),
    listRepositoryFiles, nativeFiles: scope => runtime.files(scope), draftStore, bytes: uploadBytes, mediaTextSource: (path, scope) => runtime.textSource(path, scope), entryAt, findEntry, announce, park: step => parkedSteps.park(step),
    refresh: () => { afterFileChanges(); updateNativePreviewSources(); if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
  }, scope, stamp, batch, pin, opened);
}

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

function options(
  select: HTMLSelectElement,
  values: { value: string; label: string }[],
) {
  select.replaceChildren(
    ...values.map((value) => {
      const option = node("option", "", value.label);
      option.value = value.value;
      return option;
    }),
  );
}

// Login, Start your site, the Setup checklist and wizard, and Get started (src/setup-host.ts).
const setup = createSetupHost({
  app, element, appStore, workspaceSession, closeWorkspace: () => closeWorkspace(), setupScope: () => setupScope(), draftScope, draftStore, nativeEffectiveSource: (path, scope) => runtime.source(path, scope), api,
  get info() { return info; }, get repositories() { return repositories; }, get content() { return workspace.content; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get nativeEngaged() { return runtime.engaged; },
  get agentPrompts() { return agentPrompts; }, get onboardingCopy() { return onboardingCopy; },
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
  get nativePreviewBehind() { return nativePreviewBehind; }, get nativeMountListener() { return nativeMountListener; },
  // Declared further down: read at call time.
  get boot() { return boot; }, get agentController() { return agentController; }, get workspaceBoot() { return workspaceBoot; },
  account: { reload: () => refreshRepositoryList(), switchTo: (login) => switchAccount(login), signOut: () => disconnect(),
    choose: () => chooseRepository(), load: () => loadSnapshot() },
});
const { codePanes, nativeHistoryAliases, nativeHistoryShares, nativeHistorySession, closeEditor, openCodeEditor, mountWorkspace, closeWorkspace,
  setupScope, showDirectory } = workspace;

type Toast = typeof import("./components/toast");
let toast: Toast | undefined, toastLoad: Promise<Toast> | undefined;
// Said in #status and shown as the toast (slice 105, loaded on first use).
function announce(text: string, as?: AnnounceAs) {
  element("status").textContent = text;
  if (as === "quiet") return;
  showToast(text, as?.undo === undefined ? undefined : undoAction(as.undo));
}
// Shows `text` (already said in #status) as the toast with `action`.
function showToast(text: string, action?: ToastAction) {
  if (toast) toast.showToast(text, action);
  else void (toastLoad ??= import("./components/toast")).then(loaded => {
    toast = loaded;
    // Said over meanwhile (a refusal, a newer announcement): not shown.
    if (element("status").textContent === text) loaded.showToast(text, action);
  });
}
// The toast's Undo takes back the step it names, the newest one: once another is newer, it refuses.
function undoAction(path: string) {
  const step = editorModule.latestUndo(path);
  return step === undefined ? undefined : { label: "Undo", run() {
    if (editorModule.latestUndo(path) === step) void editorModule.runVisualHistory("undo", path);
    else refuse("Newer changes came after this one. Use Undo at the top to take them back first.");
  } };
}

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

// The component whose template is `path`.
function nativeComponentTagForPath(path: string) {
  if (!runtime.site) return undefined;
  return Object.entries(runtime.site.components).find(([, file]) => file === path)?.[0];
}

function updateAgentContext() {
  agentController.changed();
  setupController.refresh();
}

// ---- Agents (src/agent-site-host.ts): the context shared, and changes applied through the editor's own actions. ----

// Agents see the whole site (its pages are read after the first paint):
// the context waits for the complete index of the repository open then.
function agentContext(): Promise<SharedContext | undefined> {
  return withSiteIndexed(nativeTextIndexGate, () => agentSiteHost.context());
}
const agentSiteHost = createAgentSiteHost({
  files: () => appStore.repository.value && appStore.snapshot.value ? { repo: appStore.repository.value, snapshot: appStore.snapshot.value,
    api, read: readFile, batch: readFiles, has: (repo, sha) => Boolean(cleanSources.get(repo, sha)) } : undefined,
  stamp: () => guardedEdits.stamp("repository"),
  source: path => runtime.textSource(path),
  load: loadAgentSite,
  input: () => {
    const scope = draftScope();
    if (!appStore.repository.value || !appStore.snapshot.value || !scope) return undefined;
    const site = runtime.site;
    return {
      repository: { id: appStore.repository.value.id, fullName: appStore.repository.value.full_name },
      branch: appStore.snapshot.value.branch,
      commit: appStore.snapshot.value.commit,
      file: workspace.activeFileContext,
      drafts: draftStore().list(scope),
      mountedSource: (path) => runtime.source(path, scope),
      native: site && {
        site,
        routeInfo: (route) => nativeRouteInfo(route, site),
        source: (path) => runtime.source(path, scope),
        exists: (path) => pathNow(path) === "file",
        openFile: appStore.openFile.value,
        selection: appStore.selection.value && { ...appStore.selection.value, route: nativePreview?.route() },
        working: workingPart.now(),
      },
    };
  },
  mediaPin: () => mediaPorts.pin?.(),
});
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
// The page shown after the page `path` is gone: the nearest page above it
// (by folder) that has one, else the home page.
function nativeFallbackPage(path: string) {
  if (!runtime.site) return undefined;
  const parts = path.split("/").slice(0, -1);
  for (let length = parts.length; length > 0; length--) {
    const file = runtime.site.routes[rootRoute(`${parts.slice(0, length).join("/")}/`)];
    if (file && file !== path) return file;
  }
  return runtime.site.routes["/"];
}

async function openNewDraft(draft: SavedDraft, options: { keepExplorer?: boolean; linkDefaultStyle?: boolean; beforeMount?: () => boolean } = {}) {
  if (
    !appStore.snapshot.value ||
    !appStore.repository.value ||
    draft.repoId !== appStore.repository.value.id ||
    draft.branch !== appStore.snapshot.value.branch
  )
    return;
  const at = workspaceSession.begin(),
    selection = ++fileGeneration;
  if (!options.keepExplorer) workspace.explorerDropdown?.close();
  setCurrentPage(draft.path);
  // A binary or large file moved or copied here: its text is not held.
  if (draft.upload) {
    showUpload(draft);
    return;
  }
  if (draft.opaque) {
    workspace.content.replaceChildren(node("p", "empty-message", `${draft.path} is ${draft.movedFrom ? `${draft.movedFrom} moved here` : "a copy of another file"}. Its content is not shown in the editor; publish to keep the change.`));
    status(`Selected ${draft.path}.`);
    return;
  }
  await mountSource(draft.path, "", null, false, at, selection, options);
}

// An uploaded file, opened: the image itself when it is one, and Discard.
function showUpload(draft: SavedDraft) {
  const panel = node("section", "directory-summary upload-summary");
  const name = draft.path.split("/").pop() ?? draft.path;
  panel.append(
    node("span", "badge", "Uploaded"),
    node("h1", "", name),
    node("p", "intro", `${draft.path} (${formatBytes(draft.upload?.size ?? 0)}) is kept in this browser until you save it to GitHub.`),
  );
  const scope = draftScope();
  if (isImagePath(draft.path) && scope) {
    const image = node("img", "upload-summary__image");
    image.alt = name;
    void uploadDataUrl(uploadBytes(), scope, draft).then((url) => { if (url) image.src = url; });
    panel.append(image);
  }
  const discard = button("Discard", () => { void discardUpload(draft.path).then(() => openAfter(undefined)); }, "button secondary");
  discard.setAttribute("aria-label", `Discard ${draft.path}`);
  panel.append(discard);
  workspace.content.replaceChildren(panel);
  status(`Selected ${draft.path}.`);
}

// A file deleted in the drafts, opened (from the changes window, a link or a
// reload): what happens to it, and Restore.
function showDeletedFile(path: string) {
  const panel = node("section", "directory-summary");
  panel.append(
    node("span", "badge", "Deleted"),
    node("h1", "", path.split("/").pop() ?? path),
    node("p", "intro", `${path} is deleted in your changes. It is removed from GitHub when you save.`),
  );
  const restore = button("Restore", () => undoFileChanges({ restore: [path] }), "button primary");
  restore.setAttribute("aria-label", `Restore ${path}`);
  panel.append(restore);
  workspace.content.replaceChildren(panel);
  status(`${path} is deleted in your changes.`);
}

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

/** localStorage or sessionStorage, or a store that keeps nothing where the browser refuses it. */
function storage(kind: "local" | "session"): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

// A draft written with GitHub's text of its file, as this tab holds it, is no change (src/drafts.ts).
draftStore().baseline = (scope, path) => {
  return runtime.engaged && holdsDraftScope(shownScope(), scope)
    ? runtime.base.sources.get(path)
    : undefined;
};

const agentController = createAgentController<HTMLElement>({
  account: () => info?.user?.login,
  host: () => document.getElementById("agent-menu") ?? undefined,
  appStore,
  load: loadAgentMenu,
  onError: errorMessage,
  createOptions: () => ({
    context: agentContext,
    tools: agentSiteHost.tools(agentContext),
    onCommand: command => agentCommands.apply(command),
    reload: snapshot => agentCommands.reload(snapshot),
    // Ask agent shows in the edit bar while an agent is connected.
    onConnection: (connected) => { setupController.noteAgent(connected); if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
    onRequests: (requests) => nativePreview?.setRequests(requests),
    onQuestions: (count) => workspace.repositoryMenu?.setQuestions(count),
    // A question in the selector's list: its pin, card open, answer box focused.
    onShowRequest: (id) => {
      workspace.repositoryMenu?.close();
      nativePreview?.showRequest(id);
    },
  }),
});

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
