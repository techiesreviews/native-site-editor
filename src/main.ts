import { refuse } from "./components/refusal-note";
import "./components/refusal-note.css";
import { createMediaHost } from "./controllers/media-host";
import { createBootController } from "./controllers/boot-controller";
import { batch } from "@preact/signals-core";
import { createAppStore } from "./app-store";
import { handleChunkLoadFailure, hasEditableRecoveryState, installChunkRecovery } from "./chunk-recovery";
import "./style.css";
import "./theme.css";
import "./ui/parts.css";
import { node } from "./ui/dom";
import { options } from "./ui/select-options";
import { setErrorReporter } from "./ui/report-failure";
import { retainWorkspaceLink, resumeWorkspaceLink } from "./workspace-state";
import { createSetupHost, EDITOR_LOGIN } from "./setup-host";
import { createRepositoryList } from "./repository-list";
import { onWarmCopyForgotten } from "./warm-copy";
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
import { createAgentHost } from "./agent-host";
import { createBlockMoves } from "./page-builder/block-move";
import { createPagesAndFilesHost } from "./pages-and-files-host";
import { createPageBuilderHost } from "./page-builder-host";
import { createSiteLoading } from "./site-loading";
import { createSiteTextIndex } from "./site-text-index";
import { createGuardedEdits } from "./guarded-edit";
import { createParkedSteps, parkedTransitions } from "./guarded-edit/parked";
import { createEditorWorkspace } from "./editor-workspace";
import { createFinishedElsewhere, openLink } from "./finished-elsewhere";
import { createAgentPresence } from "./agent-presence";
import { participants } from "./participant";
import { createWorkspaceShares } from "./workspace-shares";
import { createInbox } from "./inbox/inbox-host";
import { agentStops, STOPPED_AGENTS_KEY } from "./agent-stops";
import { createWorkspaceSession, draftScopeOf, holdsDraftScope, sameBranch, type SessionStamp, type WorkspaceScope } from "./workspace-session";
import type { Repository, SessionInfo, TreeEntry } from "../shared/types";
import type { Notices, Repo, Session, View } from "./host-modules";

const app = document.querySelector<HTMLDivElement>("#app")!;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// #status and the Undo of a step (src/announce.ts).
const { announce, undoAction } = createAnnounce({ element, editorModule: sourceEditor });
// #status, the notice bar and the GitHub reads.
const { status, settleStatus, clearError, placeNotice, errorMessage, api, apiResponse, postApi } = createGitHubReads({
  app, element, explorer: () => workspace.explorerDropdown, trackRead: (read) => codePanes.trackRead(read), handleChunkLoadFailure,
  expired: () => renderLogin("expired"),
});
setErrorReporter(errorMessage);
// The shared host modules (src/host-modules.ts): made once here, each handed whole to the hosts that need it.
const notices: Notices = { status, settleStatus, clearError, errorMessage, announce };
// The source editor without Monaco (src/components/source-editor.ts): drafts,
// Undo/Redo and edits from the preview work from its draft store at once;
// Monaco is only the code pane's view, loaded later.
const editorModule = sourceEditor;
const mediaHistoryHome = createMediaHistoryHome();
const appStore = createAppStore(editorModule.sourceStore());
// What is open and which load of it (src/workspace-session.ts): signing out and each load below start the next.
const workspaceSession = createWorkspaceSession();
function currentLoad() { return workspaceSession.current().load; }
const session: Session = { begin: () => workspaceSession.begin(), current: () => workspaceSession.current(), visits: scope => workspaceSession.visits(scope),
  nextLoad, currentLoad, stampOf, draftScope, shownScope };
// Tickets 33, am-11 (src/agent-presence.ts): the agents at work on the site's pages, drawn while their workspace is.
const agentPresence = createAgentPresence({
  pages: () => Object.values(runtime.site?.routes ?? {}), source: path => runtime.source(path), begin: () => workspaceSession.begin(),
  sectionTags: () => new Set(nativeSectionChoices().map(choice => choice.tag)),
  shows: at => { const scope = shownScope(); return scope?.kind === "github" && sameBranch(scope, { repoId: at.repoId, branch: at.branch ?? scope.branch }); },
  workspace: () => { const scope = shownScope(); return scope?.kind === "github" ? { repoId: scope.repoId, branch: scope.branch } : undefined; },
  paint: marks => { nativePreview?.agentPresence(marks); pageStructure?.agentPresence(marks); pagesAndFiles.agents(marks); },
  stops: agentStops, participants,
});
// An agent stopped in another tab of this browser (ticket am-12) goes from this one's views too.
window.addEventListener("storage", event => { if (event.key === STOPPED_AGENTS_KEY) { agentStops.reread(); agentPresence.stopsChanged(); } });
function nextLoad(scope?: WorkspaceScope) { workspaceSession.next(scope); finishedWork.loading(scope); agentPresence.loaded(); workingPart.left(); share.check(); previewShare.sync(); return workspaceSession.begin(); }
const { share, preview: previewShare } = createWorkspaceShares({ shown: shownScope, siteOpen: () => Boolean(runtime.site), login: () => info?.user?.login, begin: () => workspaceSession.begin(), preview: () => nativePreview, previewLinks: () => Boolean(info?.previewLinks), files: () => nativeSiteFiles() }); // Share to edit (slice 30), Share preview (slice 35)
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
const { nativeModeActive, nativeRouteForPath, nativeRouteInfo, nativeLinkedSheets, nativePageStyles, withSiteConfig, updateNativePreview,
  updateNativePreviewSources, updateNativePreviewAssets, nativeComponentTagForPath } = sitePreview;
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
const repo: Repo = { api, apiResponse, readFile, readFiles, entryAt, findEntry };
// What the editor shows, a shared host module: later functions go in as arrows, the file counter as accessors.
const view: View = { setCurrentPage, updateAgentContext, updateCurrentPageLabel, openNewDraft: (...args) => openNewDraft(...args), showDirectory: (...args) => showDirectory(...args),
  openEntry: (...args) => openEntry(...args), mountSource: (...args) => mountSource(...args), restoreFile: (...args) => restoreFile(...args), loadSnapshot: (...args) => loadSnapshot(...args),
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; } };
// The site's text index, the first-paint wait and the Pages titles held back while a row is in use (src/site-text-index.ts).
const textIndex = createSiteTextIndex({
  runtime, appStore, workspaceSession, element, currentLoad, draftScope, findEntry, updateNativePreviewSources, updateAgentContext,
  readNativeTexts, noteNativeUnreadable, updateCurrentPageLabel, indexed: () => inbox.changed(),
  get mediaController() { return mediaController; }, get pagesAndFiles() { return pagesAndFiles; }, get pagesController() { return pagesController; },
  get componentTools() { return componentTools; }, get nativePreview() { return nativePreview; }, get pageStructure() { return pageStructure; },
  get nativePreviewBehind() { return sitePreview.nativePreviewBehind; }, set nativePreviewBehind(value) { sitePreview.nativePreviewBehind = value; },
});
const { nativeTextIndexScopeKey, startNativeTextIndex, clearPendingTitles } = textIndex;
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
    api, readFiles, readFile, readBlob, branchText, readSite: () => nativeSiteReadForCreate(), draftScope, draftStore, pathNow,
    rememberStartingPoint, rememberPartialStart, rememberRepositories, repositoryOptions,
    chooseRepository, forgetPartialStart, removeFinishStarter, loadSnapshot, announce, errorMessage,
  }),
});
const { loadConfirmDialog, loadHistory, loadMediaWorkspace, loadMedia, loadSetupActions, loadAgentPrompts, loadWizard,
  loadStartSite, loadAgentMenu, loadSiteSettings, loadAgentSite } = lazyLoaders;

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
  site: () => runtime.site, files: () => runtime.files(), store: draftStore,
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
  showRow: (focus, files) => { if (files) filesTreeController.reveal(files); if (workspace.explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") pagesController.renderTree(focus); },
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
  app, appStore, runtime, editorModule, guardedEdits, element, lazyModule, loadSiteSettings, showNativeWarnings,
  notices, session, repo, view, preview: sitePreview, textIndex,
  get nativeHistoryShares() { return nativeHistoryShares; }, get nativePreview() { return nativePreview; },
  get pageStructure() { return pageStructure; }, get componentTools() { return componentTools; },
  get versions() { return versions; }, get linkedStyles() { return linkedStyles; }, get agentController() { return agentController; },
  // Declared further down: read at call time.
  get panels() { return workspace; }, get media() { return media; }, get pagesAndFiles() { return pagesAndFiles; },
  setupScope: () => setupScope(), nativeHistorySession: (scope, path) => nativeHistorySession(scope, path),
});
const { nativeSectionChoices, previewSelection, nativeVariantFiles, nativeCssWorkspace, openNativePageSettings } = pageBuilder;

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
  notices, session, repo, view, preview: sitePreview, textIndex, pageBuilder,
  runtime, appStore, editorModule, mediaHistoryHome, guardedEdits, parkedSteps, finishedWork, repositoryIndex, versions, cleanSources,
  element, lazyModule, loadMediaWorkspace, loadMedia, readBlob, listRepositoryFiles, loadNativeAssets, imagesSignature, undoAction,
  get nativePreview() { return nativePreview; }, get panels() { return workspace; }, get pagesAndFiles() { return pagesAndFiles; },
  setupScope: () => setupScope(),
});
const { mediaPorts, mediaController, discardUpload, readMediaText } = media;

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

// The welcome page, Start your site, the wizard and setup in the Inbox (src/setup-host.ts).
const setup = createSetupHost({
  app, element, appStore, workspaceSession, closeWorkspace: () => closeWorkspace(), setupScope: () => setupScope(), draftScope, nativeEffectiveSource: (path, scope) => runtime.source(path, scope), api,
  get info() { return info; }, get repositories() { return repositories; }, get content() { return workspace.content; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get agentPrompts() { return lazyLoaders.agentPrompts; },
  get boot() { return boot; }, get agentController() { return agentController; },
  loadRepositories: (prefetched) => loadRepositories(prefetched),
  loadSetupActions, loadWizard, loadStartSite, loadAgentPrompts, status, errorMessage,
});
const {
  renderLogin, setupController, setupEntry, checkNewRepositories,
  rememberRepositories, knownRepositories, rememberStartingPoint, rememberPartialStart, forgetPartialStart, removeFinishStarter,
} = setup;
const inbox = createInbox({ appStore, pages: () => Object.values(runtime.site?.routes ?? {}), source: path => runtime.source(path), indexed: () => runtime.state.textIndexed, // The Inbox (TOOLS-222)
  files: () => runtime.files(), stamp: () => workspaceSession.begin(),
  label: file => pagesController.pageLabel(file), route: file => nativeRouteForPath(file), showing: () => nativePreview?.route(), picture: (...args) => mediaController.placeState(...args)?.state, open: page => openAfter(page),
  select: (request, later) => later ? nativePreview?.selectAfterUpdate(request, { reveal: "center" }) : nativePreview?.selectNode(request, false), error: errorMessage,
  pageDetails: page => void openNativePageSettings(page), media: () => mediaController.workspaceContext(), site: () => runtime.site ?? undefined, // TOOLS-253: shared parts, Fix with AI
  agent: () => agentController, edits: guardedEdits, announce: message => announce(message), tools: () => workspace.loadComponentTools(),
  editComponent: (tag, instance, notes) => componentTools?.editComponent(tag, undefined, instance, notes) ?? Promise.resolve(undefined),
  setup: setupController }); // TOOLS-188: setup rows

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
  app, element, appStore, runtime, editorModule, guardedEdits, agentPresence, nativeHistorySession: (scope, path) => nativeHistorySession(scope, path), linkedStyles, versions,
  previewSelection, repositoryIndex, finishedWork, lazyModule, loadConfirmDialog, forgetDraftedAssets, loadNativeComponentStyles,
  notices, session, repo, view, preview: sitePreview, textIndex, media, pageBuilder,
  // Declared further down: read at call time.
  get panels() { return workspace; }, get pageStructure() { return pageStructure; },
});
const { loadPagesActions, loadFileOps, pagesController, savePublish, filesTreeController, treeState, pathNow, nativePathExists, nativeSiteReadForCreate,
  branchText, branchPathProblem, afterFileChanges, openAfter, undoFileChanges } = pagesAndFiles;

// The workspace's screen, the code panes and the source editor, a folder's summary, and closing it all (src/workspace-mount.ts).
// By value: consts declared above and hoisted functions; `let` state goes in as accessors (tests/main-ts-ceiling.test.ts).
const workspace = createWorkspaceMount({
  app, element, appStore, editorModule, runtime, finishedWork, mediaHistoryHome, parkedSteps, guardedEdits, linkedStyles, versions, pagesAndFiles, setup, repositoryIndex, cleanSources,
  notices, session, view, preview: sitePreview, textIndex, media, pageBuilder, share, previewShare,
  site: { deactivate: deactivateNative, assets: loadNativeAssets, shown: loadNativeShownFiles, routeSources: nativeRouteShownSources, styles: loadNativeComponentStyles, files: nativeSiteFiles },
  get info() { return info; }, get repositories() { return repositories; }, set repositories(value) { repositories = value; },
  get nativePreview() { return nativePreview; }, set nativePreview(value) { nativePreview = value; },
  get pageStructure() { return pageStructure; }, set pageStructure(value) { pageStructure = value; },
  get componentTools() { return componentTools; }, set componentTools(value) { componentTools = value; },
  get nativeMountListener() { return nativeMountListener; },
  // Declared further down: read at call time.
  get boot() { return boot; }, get agentController() { return agentController; }, get workspaceBoot() { return workspaceBoot; }, get agentCommands() { return agentCommands; },
  account: { reload: () => refreshRepositoryList(), switchTo: (login) => switchAccount(login), signOut: () => disconnect(),
    choose: (resume) => chooseRepository(resume), load: () => loadSnapshot(), overview: () => { void loadRepositories(); } },
});
const { codePanes, nativeHistoryAliases, nativeHistoryShares, nativeHistorySession, closeEditor, mountWorkspace, closeWorkspace,
  setupScope, showDirectory } = workspace;

// Opening a file in the source pane (src/controllers/source-pane-controller.ts): the shared host modules and the hosts above, by value.
const sourcePane = createSourcePaneController({
  notices, session, repo, view, preview: sitePreview, panels: workspace, pageBuilder, pagesAndFiles, runtime,
  appStore, editorModule, linkedStyles, versions, element, draftStore, showDeletedFile,
  get info() { return info; }, get nativePreview() { return nativePreview; }, get componentTools() { return componentTools; }, get pageStructure() { return pageStructure; },
});
const { openEntry, mountSource } = sourcePane;

function updateAgentContext() {
  agentController.changed();
  setupController.refresh();
}

// The agent menu's controller; the agent's commands and the menu's wiring load with the menu (src/agent-host.ts, src/agent-path.ts).
// By value: consts declared above and hoisted functions; `let` state goes in as getters (tests/main-ts-ceiling.test.ts).
const { agentController, agentCommands } = createAgentHost({
  notices, session, repo, view, preview: sitePreview, textIndex, panels: workspace, pageBuilder, media, pagesAndFiles,
  appStore, runtime, guardedEdits, editorModule, editorWorkspace, versions, finishedWork, parkedSteps, repositoryIndex,
  createBlockMoves, agentPresence, loadAgentSite, cleanSources, setupController, loadAgentMenu,
  // Read at call time.
  loadComponentTools: () => workspace.loadComponentTools(),
  get info() { return info; }, get componentTools() { return componentTools; }, get pageStructure() { return pageStructure; },
  get nativePreview() { return nativePreview; },
});
// Opening a repository, its snapshot and the remembered boot's guess (src/workspace-boot.ts).
const workspaceBoot = createWorkspaceBoot({
  appStore, savePublish, repositoryIndex, cleanSources, filesTreeController, pagesController, previewSelection, mediaHistoryHome, runtime, setup,
  notices, session, repo, view, preview: sitePreview, textIndex, panels: workspace,
  get user() { return info?.user; }, get repositories() { return repositories; },
  source: () => location.origin + location.pathname,
  sessionTag: () => boot.sessionTag(),
  opening: { show: (repo, branch) => workspace.showOpening(repo, branch), finish: () => workspace.finishOpening() },
  draftsReady: () => boot.draftsReady(),
  storage, element, node, options, draftsOf: (scope) => draftStore().list(scope), deactivateNative, activateNativeSite,
});
const { restoreFile, loadSnapshot, chooseRepository } = workspaceBoot;

// Coming back to the tab lists the repositories again for the welcome page (src/setup-host.ts).
window.addEventListener("focus", () => void checkNewRepositories());
document.addEventListener("visibilitychange", () => void checkNewRepositories());

// The repository list, account switching and sign-out (src/repository-list.ts).
const { loadRepositories, repositoryOptions, refreshRepositoryList, switchAccount, disconnect, forgetProjects } = createRepositoryList({
  appStore, repositoryIndex, mediaHistoryHome, cleanSources, workspaceBoot, setup, setupEntry, setupController,
  get boot() { return boot; }, get user() { return info?.user; },
  get repositories() { return repositories; }, set repositories(value) { repositories = value; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get content() { return workspace.content; }, get files() { return workspace.files; }, get refreshButton() { return workspace.refreshButton; },
  get branchSelect() { return workspace.branchSelect; }, get repositorySelect() { return workspace.repositorySelect; },
  get repositoryMenu() { return workspace.repositoryMenu; }, get siteActions() { return workspace.siteActions; },
  nextLoad, stopProjectMemory: () => workspace.stopProjectMemory(), chooseRepository, storage, options, status, clearError, errorMessage, announce, setCurrentPage,
  removeFinishStarter, knownRepositories, rememberRepositories,
  showProjects: (list, message, failed) => workspace.showProjects(list, message, failed),
});
onWarmCopyForgotten(forgetProjects);

// A draft written with GitHub's text of its file, as this tab holds it, is no change (src/drafts.ts).
draftStore().baseline = (scope, path) => {
  return runtime.engaged && holdsDraftScope(shownScope(), scope)
    ? runtime.base.sources.get(path)
    : undefined;
};

/** Legacy and damaged drafts are rare: the store fetches their code only when it finds one. */
const loadDraftRecovery = () => import("./drafts-recovery");
const boot = createBootController({
  begin: () => workspaceSession.begin(),
  source: () => `${location.origin}${location.pathname}`,
  url: () => location.href,
  replaceUrl: (url) => history.replaceState(null, "", url),
  redirect: (url) => location.replace(url),
  assign: (url) => location.assign(url),
  readSession: (early) => apiResponse<SessionInfo>("session", undefined, early),
  readRepositories: (refresh, early) => apiResponse<Repository[]>("repositories", refresh ? { refresh: "1" } : undefined, early),
  loadDrafts: (login) => draftStore().load(login, loadDraftRecovery), warmCopy: (login) => workspaceBoot.takeWarmCopy(login),
  onDraftError: () => { draftStore().onError = (message) => errorMessage(new Error(message)); workspace.showProjects(); },
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

document.addEventListener("click", (event) => { if ((event.target as Element).closest?.(`a[href="${EDITOR_LOGIN}"]`)) retainWorkspaceLink(); });
// A fragment change before the session has loaded is not lost: once signed
// in, the repositories load from the location as it is then.
window.addEventListener("hashchange", () => { workspaceBoot.dropGuess(); boot.onHashChange(); });
renderLogin("loading");
workspaceBoot.startGuess();
void boot.start();
