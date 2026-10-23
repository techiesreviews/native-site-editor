import { rootRoute, siteAddress } from "../shared/site-path-prefix";
import { MEDIA_RECORDS_PATH } from "../shared/media-records-path";
import { mediaOwnOrigins } from "./page-builder/media-origins";
import { dismissRefusalNote, refuse } from "./components/refusal-note";
import "./components/refusal-note.css";
import { createRowMenu } from "./components/row-menu";
import { elementMenuItems as collectElementMenuItems, type ElementMenuTarget } from "./components/element-menu";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import { nativeChoiceMarkup, placeholderImageCreates } from "./page-builder/native-elements";
import { nativeDestinations, nativeMarkupInsertEdit } from "./page-builder/native-operations";
import { INLINE_FORMATTING, TEXT_LINE_TAGS, TEXT_TAGS } from "./page-builder/rules/text-level";
import type { VariantFiles, VariantSite } from "../shared/variant-lookup";
import type { createFilesTreeController } from "./controllers/files-tree-controller";
import { createPageStructureController } from "./controllers/page-structure-controller";
import { createMediaController, type MediaPin } from "./controllers/media-controller";
import type { BlockInsertPorts } from "./controllers/block-insert-controller";
import { createCardsController } from "./controllers/cards-controller";
import { createPagesState, explorerTabNames, NATIVE_HOME_UNREAD, type ExplorerTab, pageOnBranchHere } from "./controllers/pages-state";
import type { createPagesController } from "./controllers/pages-controller";
import { createPreviewSelectionController } from "./controllers/preview-selection-controller";
import { createBootController, planRepositoryOpen } from "./controllers/boot-controller";
import { batch, effect } from "@preact/signals-core";
import { createAppStore } from "./app-store";
import { handleChunkLoadFailure, hasEditableRecoveryState, installChunkRecovery } from "./chunk-recovery";
import "./utilities.css";
import "./style.css";
import "./theme.css";
import { node, button } from "./ui/dom";
import { reported, setErrorReporter } from "./ui/report-failure";
import {
  readWorkspace,
  readWorkspaceUrl,
  retainWorkspaceLink,
  resumeWorkspaceLink,
  rememberWorkspace,
} from "./workspace-state";
import { createSetupHost, EDITOR_LOGIN } from "./setup-host";
import { createAgentController } from "./controllers/agent-controller";
import { createVersionView } from "./version-view";
import type { AgentSiteActions, SharedContext } from "./agent-site";
import type { AgentCommand } from "../shared/agent";
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { nativeBootExtras, nativeBootStyleExtras, nativeShownFiles, readSiteTexts, unreadableAsText, unreadableNeededFile, withSiteIndexed, type SiteIndexGate, type UnreadableFile } from "./native-boot";
import { draftKey } from "./drafts";
import { mountDropdown } from "./components/dropdown";
import { createRepositoryMenu } from "./components/repository-menu";
import { mountSiteActions } from "./components/site-actions";
import type { SiteFiles } from "./site-download";
import { mountSidebarResize, type SidebarResize } from "./components/sidebar-resize";
import { mountBlockRail } from "./components/block-rail";
import { createNativePreview, routeStylesheets, type NativePreviewSelection, type NativeStructureItem, type PressedBlock } from "./components/native-preview";
import { trackDrag, type DragPress } from "./page-builder/insert-drag";
import type { DraggedBlock } from "./page-builder/drop-target";
import { createPageStructure, type PageMetaField } from "./components/page-structure";
import { readNavigation } from "./page-builder/site-navigation";
import { withPageField } from "./page-builder/site-head";
import { newFilePath, newFolderPath, renamedPath, type Checked } from "./native-create";
import type { createCreateDialog, CreateKind, CreateRequest } from "./components/create-dialog";
import type { createPagesTree } from "./components/pages-tree";
import "./components/pages-tree.css";
import "./components/phone-sheet.css";
import type { createFileRowActions, FileRowTarget } from "./components/file-row-actions";
import "./components/files-tree.css";
import type { createConfirmDialog } from "./components/confirm-dialog";
import { forgetBootMemory } from "./boot-memory";
import { createWorkspaceBoot } from "./workspace-boot";
import { clearWizard, readWizard } from "./setup-wizard";
import { forgetSignedIn } from "./auto-signin";

import type { createPagePicker } from "./components/page-picker";
import type { MenuItem } from "./components/row-menu";
import { duplicateFile, listChanges, restoreFile as restoreDraftFile, type FileChange } from "./file-changes";
import { formatBytes, pickFiles, sweepUploads, uploadBytes, uploadDataUrl, uploadKey } from "./uploads";
import { firstHeadingText, nativeLinkSuggestions, nativePageLabel } from "./native-pages";
import { elementPathAt, locateNativeElement, locateNativeElementRange, startTagAttribute, wrapperAround, type ElementRange } from "./native-source-location";
import { positionText } from "./page-builder/insert-target";
import { itemsSlotRule } from "./page-builder/block-insert";
import { createBlockMoves, type MoveAt } from "./page-builder/block-move";
import { componentLabel, nativeInsertEdit, isSectionTemplate } from "./native-insert";
import { isImagePath, structureLabel } from "./native-structure";
import { gridOfItem } from "./page-builder/card-source";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import * as sourceEditor from "./components/source-editor";
import { createMediaHistoryHome } from "./page-builder/media-history-home";
import { isRenamableMedia, mediaFileName } from "./page-builder/media-names";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "./styles-index";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "./style-cascade";
import type { MediaWorkspaceBatch } from "./page-builder/media-workspace";
import type { CssWorkspace } from "./page-builder/css-intelligence";
import type { DeclarationStatus, RuleStatus } from "../shared/cascade";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports";
import { readStyleFiles } from "./native-style-files";
import { nativePageRoute } from "../shared/native-routes";





import { descendants, parseSource } from "./page-builder/component-model";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, NATIVE_REDIRECTS_PATH, minimalTextEdit, nativeComponentCssPath, nativeDefaultRoute, nativePageHead, nativePageStylesheets, nativePageMovedUrl, nativeSitePaths, nativeSiteSettings, resolveNativeProject, type NativeSite, nativeSitePrefix } from "../shared/native-project";
import { dataUrlOf, loadNativeAssetRequests } from "./native-assets";
import { assetType, audioType, blobUrl, CANVAS_AUDIO_MAX_BYTES, isFontType } from "../shared/asset-types";
import { fetchWithReadRetry } from "./read-retry";
import { ApiError, createGitHubReads, unanswered } from "./github-reads";
import { RepositoryIndex, readFileText, readFileTexts } from "./repository-loading";
import { CleanSourceCache } from "./clean-source-cache";
import { iconMarkup, setIcon } from "./icons";
import { createCommandPaletteController } from "./controllers/command-palette-controller";
import { createCodePanesController } from "./controllers/code-panes-controller";
import { createSavePublishController } from "./controllers/save-publish-controller";
import type { createLazyFileOperationsController } from "./controllers/file-operation-checks";
import { createComponentTools, type ComponentTools, type PreparedComponentLoader } from "./page-builder/components";
import { addSectionStep } from "./page-builder/component-plans";
import { createAgentSiteHost } from "./agent-site-host";
import { createGuardedEdits, type GuardedEdits, type Reads, type PlanResult, type Stamp } from "./guarded-edit";
import { createEditorWorkspace } from "./editor-workspace";
import { createWorkspaceSession, draftScopeOf, holdsDraftScope, onShow, sameRepository, setupKeyOf, type SessionStamp, type WorkspaceScope } from "./workspace-session";
import type { AnnounceAs } from "./components/toast-rules";
import type { ToastAction } from "./components/toast";
import type {
  EditorContext,
  Directory,
  PublishResult,
  Repository,
  SessionInfo,
  Snapshot,
  TreeEntry,
} from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
// #status, the notice bar and the GitHub reads.
const { status, settleStatus, clearError, placeNotice, errorMessage, api, apiResponse, postApi } = createGitHubReads({
  app, element, explorer: () => explorerDropdown, trackRead: (read) => codePanes.trackRead(read), handleChunkLoadFailure,
  expired: () => renderLogin("expired"),
  // As say() in src/components/toast.ts, which loads on first use.
  say: (text, action) => { element("status").textContent = text; showToast(text, action); },
});
setErrorReporter(errorMessage);
let repositorySelect: HTMLSelectElement;
let branchSelect: HTMLSelectElement;
let refreshButton: HTMLButtonElement;
let content: HTMLDivElement;
let files: HTMLElement;
let explorerDropdown: ReturnType<typeof mountDropdown> | undefined;
let repositoryMenu: ReturnType<typeof createRepositoryMenu> | undefined;
let siteActions: ReturnType<typeof mountSiteActions> | undefined;
let sidebarResize: SidebarResize | undefined;
let blockRail: ReturnType<typeof mountBlockRail> | undefined;
// The source editor without Monaco (src/components/source-editor.ts): drafts,
// Undo/Redo and edits from the preview work from its draft store at once;
// Monaco is only the code pane's view, loaded later.
const editorModule = sourceEditor;
const mediaHistoryHome = createMediaHistoryHome();
const appStore = createAppStore(editorModule.sourceStore());
// What is open and which load of it (src/workspace-session.ts): signing out and each load below start the next.
const workspaceSession = createWorkspaceSession();
function currentLoad() { return workspaceSession.current().load; }
function nextLoad(scope?: WorkspaceScope) { workspaceSession.next(scope); return workspaceSession.begin(); }
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
let pageActions: ReturnType<typeof createPagesController> | undefined;
const loadPagesActions = lazyModule(async () => {
  const [module] = await Promise.all([import("./controllers/pages-controller"), loadFileOps()]);
  pageActions = module.createPagesController(pagePorts(), pagesController);
  return module;
});
const loadConfirmDialog = lazyModule(() => import("./components/confirm-dialog"));
const loadExplorerModules = lazyModule(async () => {
  const [create, actions, confirm, picker, tree] = await Promise.all([
    import("./components/create-dialog"), import("./components/file-row-actions"), loadConfirmDialog(),
    import("./components/page-picker"), import("./controllers/files-tree-controller"), loadPagesActions(), loadFileOps(),
  ]);
  return { ...create, ...actions, ...confirm, ...picker, ...tree };
});
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
    get repositorySelect() { return repositorySelect; }, get repositoryMenu() { return repositoryMenu; },
    boot, appStore, guardedEdits, nativeBaseSources, repositoryIndex, setupController,
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
    get nativeSite() { return nativeSite; }, get generation() { return currentLoad(); },
    appStore, guardedEdits, nativeAssets, setupScope,
    nativePageLabelOf: (file) => pagesController.pageLabel(file),
    nativeUrlPlan: (file, value) => pageActions!.urlPlan(file, value),
    changeNativeUrl: (file, value, keep, since, baseline) => pageActions!.changeUrl(file, value, keep, since, baseline),
    restoreFile: (path, epoch) => restoreFile(path, stampOf(epoch)), nativeSiteReadForCreate,
    choosePath: (place, accept) => mediaController.choosePath(place, undefined, accept), nativeEffectiveSource, loadNativeAssets,
    shareImage: request => mediaController.shareImage(request),
    nativeFiles: () => nativeFiles(), readMediaText,
  });
});
// What agents are shown and how their commands run (src/agent-site.ts), loaded when one asks.
const loadAgentSite = lazyModule(() => import("./agent-site"));
// The code panes' Monaco load gate and resize handles (src/controllers/code-panes-controller.ts).
const codePanes = createCodePanesController({
  load: () => import("./components/code-editor"),
  onChunkFailure: (error) => void handleChunkLoadFailure(error),
  mountCodeResize,
  mountCodeWidthResize,
});
// Undo or Redo of a file no pane shows still redraws the preview and syncs the framed instance.
editorModule.onUnmountedText(({ scope, path }) => {
  const live = draftScope();
  if (!live || draftKey(live, path) !== draftKey(scope, path)) return;
  filesTreeController.refresh();
  if (nativeModeActive()) updateNativePreviewSources();
  componentTools?.refresh();
});
// A pane that needs the code now (Review, focusing the code) asks for Monaco.
editorModule.setViewLoader(() => codePanes.want().then((module) => module.monacoView));
let disposeEditor: (() => void) | undefined;
// The live primary keeps its journal even when a completed operation releases its alias.
let primaryHistoryScope: { key: string; session: string; proof: { isCurrent(): boolean } } | undefined;
let activeFileContext: EditorContext["file"] = null;
let editorRequest = 0;

// A guarded edit's step binds only its own new and moved-in paths to the anchor page's journal.
const nativeHistoryAliases = new Map<string, { stamp: SessionStamp; session: string }>();
// The guarded edit module, told of each file a pane mounts (`pane`: the stylesheet pane, which follows the page opened).
let nativeMountListener: ((path: string, pane: boolean) => void) | undefined;
// Edit component's shares (components' shareHistory): a template records its steps in a page's journal, the latest share first.
const nativeHistoryShares = new Map<string, { stamp: SessionStamp; session: string }[]>();
function nativeHistorySession(scope: NonNullable<ReturnType<typeof draftScope>>, path: string) {
  const key = draftKey(scope, path), share = nativeHistoryShares.get(key)?.at(-1), alias = nativeHistoryAliases.get(key);
  const live = (bound: typeof alias): bound is NonNullable<typeof alias> => !!bound && bound.stamp.holds();
  return live(share) ? share.session : live(alias) ? alias.session : key;
}

function closeEditor() {
  primaryHistoryScope = undefined;
  editorRequest++;
  disposeEditor?.();
  disposeEditor = undefined;
}

// Mounts the file's source editor at once (toolbar, drafts, Undo/Redo, Save);
// its code shows once Monaco is here.
function openCodeEditor(
  file: import("./components/source-editor").SourceFile,
  beforeMount?: () => boolean,
) {
  closeEditor();
  const request = editorRequest;
  if (!info.user) return Promise.resolve();
  if (beforeMount && !beforeMount()) {
    content.replaceChildren(node("p", "empty-message", "The source changed while its editor opened. Select it again."));
    return Promise.resolve();
  }
  const defer = codePanes.deferPane(nativeModeActive());
  const historyScope = file.scope ? nativeHistorySession(file.scope, file.path) : undefined;
  disposeEditor = editorModule.mountSourceEditor(
    content,
    { ...(file.scope ? { ...file, historyScope } : file), loadingMessage: defer ? "The code loads once the page is on screen." : "Opening editor…" },
    element("editor-toolbar-host"),
  );
  const historyHost = editorModule.captureHistoryHost(file.path), liveScope = draftScope();
  if (appStore.openFile.value === file.path && historyHost) {
    mediaHistoryHome.adopt((undo, redo, dispose) => editorModule.recordHistoryAction(file.path, undo, redo, dispose));
  }
  primaryHistoryScope = file.scope && historyScope && appStore.openFile.value === file.path && historyHost && liveScope &&
    draftKey(liveScope, file.path) === draftKey(file.scope, file.path)
    ? { key: draftKey(file.scope, file.path), session: historyScope, proof: historyHost } : undefined;
  nativeMountListener?.(file.path, false);
  void codePanes.whenDue(defer).catch((error) => {
    if (request !== editorRequest) return;
    content.querySelector(".code-editor__body")?.replaceChildren(
      node("p", "empty-message", "The code editor could not load."),
      button("Retry editor", () => void codePanes.want().catch(errorMessage)),
    );
    errorMessage(error);
  });
  return Promise.resolve();
}

function mountWorkspace() {
  app.className = "";
  app.innerHTML = `
    <header class="topbar">
      <div id="repository-menu"></div>
      <button id="explorer-toggle" title="Pages & files" class="explorer-toggle" aria-controls="explorer"><span id="current-page">Select a page</span> ${iconMarkup("caret-down", 12, "icon--after")}</button>
      <div class="topbar-actions">
        <div id="setup-checklist"></div>
        <div id="change-status"></div>
        <div id="editor-toolbar-host" class="editor-toolbar-host"></div>
        <div id="changes" class="changes-window" popover="auto" role="dialog" aria-label="History"></div>
      </div>
    </header>
    <div id="notice" class="notice" role="alert" hidden></div>
    <div id="explorer" class="explorer" role="region" aria-label="Pages & files">
      <div class="explorer-head">
        <div id="explorer-tabs" class="explorer-tabs" role="tablist" aria-label="Pages, media or files" hidden>
          <button type="button" id="explorer-tab-pages" class="explorer-tab" role="tab" aria-controls="explorer-pages" aria-selected="true">Pages</button>
          <button type="button" id="explorer-tab-media" class="explorer-tab" role="tab" aria-controls="explorer-media" aria-selected="false" tabindex="-1">Media</button>
          <button type="button" id="explorer-tab-files" class="explorer-tab" role="tab" aria-controls="explorer-files" aria-selected="false" tabindex="-1">Files</button>
        </div>
        <button type="button" id="site-settings-toggle" class="icon-button explorer-settings" aria-label="Site settings" title="Site settings">${iconMarkup("gear")}</button>
      </div>
      <div id="explorer-pages" class="explorer-panel" aria-labelledby="explorer-tab-pages" hidden><p class="muted sidebar-hint">Loading pages…</p></div>
      <div id="explorer-media" class="explorer-panel" aria-labelledby="explorer-tab-media" hidden><p class="muted sidebar-hint">Loading media…</p></div>
      <div id="explorer-files" class="explorer-panel" aria-labelledby="explorer-tab-files">
        <div class="files-heading explorer-heading"><span class="explorer-heading__start"><h2 class="explorer-heading__title">Files</h2><span id="files-count" class="explorer-heading__count"></span></span><span id="revision" hidden>—</span><button type="button" id="new-at-root" class="explorer-new" aria-label="New file or folder" title="New file or folder at the top of the repository" aria-haspopup="dialog">+ New</button></div>
        <nav id="files" aria-label="Repository files"></nav>
      </div>
    </div>
    <div class="workspace">
      <button type="button" id="sheet-handle" class="sheet-handle" aria-expanded="false" aria-controls="structure-sidebar code-split" title="Pull up or tap for the page structure and code"><span class="sheet-handle__grip"></span>Page structure and code</button>
      <aside class="sidebar" aria-label="Page structure">
        <div class="sidebar-heading"><span class="eyebrow">PAGE STRUCTURE</span><button type="button" id="add-panel-toggle" class="structure-add" title="Add to the page" hidden>${iconMarkup("plus")} Add</button></div>
        <div id="structure" class="page-structure"></div>
      </aside>
      <main id="main">
        <div id="code-split" class="code-split">
          <div class="code-pane"><div class="code-pane__title"><span id="primary-title"></span></div><div id="content" class="workspace-content"></div></div>
          <div class="code-pane" id="secondary-pane" hidden><div class="code-pane__title"><span id="secondary-title"></span><span id="secondary-rules" class="code-pane__rules"></span></div><div id="content-secondary" class="workspace-content"></div></div>
        </div>
      </main>
    </div>
    <span id="status" class="sr-only" role="status" aria-live="polite"></span>
  `;
  element("changes").addEventListener("toggle", () => {
    document.getElementById("history-button")?.setAttribute("aria-expanded", String(element("changes").matches(":popover-open")));
  });
  repositoryMenu = createRepositoryMenu({
    installUrl: info.installUrl,
    accounts:
      info.accounts ??
      (info.user ? [{ ...info.user, current: true }] : []),
    onOpen: () => void boot.ensureList(),
    onReload: () => void refreshRepositoryList(),
    onAccessChanged: () => void refreshRepositoryList(),
    onSwitchAccount: (login) => void switchAccount(login),
    onSignOut: reported(disconnect),
  });
  element("repository-menu").append(repositoryMenu.root);
  element("site-settings-toggle").addEventListener("click", () => void openNativeSiteSettings());
  mediaController.disposeGallery();
  siteActions = mountSiteActions({ statusHost: element("change-status"), menuHost: element("site-actions"), siteFiles: nativeSiteFiles, announce });
  const menuPanel = element("repository-actions");
  menuPanel.addEventListener("toggle", () => {
    if (menuPanel.matches(":popover-open")) { void agentController.ensure().catch(errorMessage); void setupController.mount().catch(errorMessage); }
  });
  repositorySelect = element<HTMLSelectElement>("repository");
  blockRail = mountBlockRail(app.querySelector<HTMLElement>(".workspace")!, element<HTMLButtonElement>("add-panel-toggle"), {
    onPick: kind => {
      // The click's page, selection and repository, held while typing finishes and the insert code loads.
      const since = guardedEdits.stamp(), at = blockInsertPorts.target();
      void finishRailTyping(() => since.holds()).then(async finished => {
        if (!since.holds()) return;
        if (!finished) { blockInsertPorts.refuse(STILL_UPDATING); return; }
        const blocks = await loadBlockInsert();
        if (since.holds()) await blocks.click(kind, at, since);
      }).catch(errorMessage);
    },
    onUp: () => nativePreview?.selectParent(),
    // The drag's targets and drawing load with the first press on a block;
    // the press's repository, branch and session hold through both loads.
    // In Edit component mode, into the template edited (its items slots are its own <slot> elements).
    drag: kind => {
      const since = guardedEdits.stamp();
      const template = componentTools?.mode.now();
      const block = { kind: "new", block: kind, ...(template ? { template: true } : {}) } as const;
      // In Edit component mode Page Structure takes it into the template edited, as the canvas does.
      return loadBlockDrag().then(drag => since.holds() ? nativePreview?.blockDrag(block, {
        tree: structureDrop(drag, block, template),
        drop: (target, where, painted, pointer) => {
          const place = { parent: target.container.path, index: target.index, where, ...(target.container.kind === "items" && !template ? { slot: target.container.slot } : {}) };
          const at = blockInsertPorts.target();
          if (template && at?.path !== template.template) { refuse("Edit component mode was left meanwhile: nothing was added.", { pointer }); return; }
          if (since.holds()) void finishRailTyping(() => since.holds()).then(async finished => {
            if (!since.holds()) return;
            if (!finished) { blockInsertPorts.refuse(STILL_UPDATING, pointer); return; }
            const blocks = await loadBlockInsert();
            if (since.holds()) await blocks.drop(kind, place, painted, at, pointer, since);
          }).catch(errorMessage);
        },
        announce,
      }, drag.createBlockDrag, template?.template) : undefined);
    },
  });
  sidebarResize = mountSidebarResize(
    app.querySelector<HTMLElement>(".workspace")!,
    app.querySelector<HTMLElement>(".sidebar")!,
  );
  // Phones: Page structure and the code fold into a sheet under the page (phone-sheet.css); its handle loads on the first phone-wide window.
  const phone = matchMedia("(max-width: 650px) and (min-height: 500px)");
  const sheet = () => {
    if (!phone.matches) return;
    phone.removeEventListener("change", sheet);
    void import("./components/phone-sheet").then((module) => module.mountPhoneSheet(app.querySelector<HTMLElement>(".workspace")!, element<HTMLButtonElement>("sheet-handle"))).catch(errorMessage);
  };
  phone.addEventListener("change", sheet);
  sheet();
  branchSelect = element<HTMLSelectElement>("branch");
  refreshButton = element<HTMLButtonElement>("refresh");
  content = element<HTMLDivElement>("content");
  files = element("files");
  // Choosing a project or branch, or refreshing, hands over to the explorer to pick a file.
  const handOver = () => {
    repositoryMenu?.close();
    element("explorer-toggle").focus();
    openExplorer();
  };
  repositorySelect.addEventListener("change", () => {
    void chooseRepository();
    handOver();
  });
  branchSelect.addEventListener("change", () => {
    batch(() => {
      appStore.branch.value = branchSelect.value || undefined;
      void loadSnapshot();
    });
    handOver();
  });
  refreshButton.addEventListener("click", () => {
    void loadSnapshot();
    handOver();
  });
  explorerDropdown = mountDropdown({
    trigger: element<HTMLButtonElement>("explorer-toggle"),
    panel: element("explorer"),
    below: app.querySelector<HTMLElement>(".topbar")!,
    anchor: "--explorer",
  });
  createDialog = confirmDialog = discardDialog = pagePicker = fileActions = undefined;
  filesTree = undefined;
  explorerMount = undefined;
  const newAtRoot = element<HTMLButtonElement>("new-at-root");
  newAtRoot.addEventListener("click", () => openCreate("", newAtRoot));
  pagesTree = undefined;
  pagesTreeMount = undefined;
  mountExplorerTabs();
  element("explorer").addEventListener("toggle", () => {
    if (explorerDropdown?.isOpen()) {
      void ensureExplorer().then(() => {
        pagesController.renderTree();
        if (filesTreeController.visible()) filesTreeController.shown();
      }).catch(errorMessage);
    } else {
      pagesTree?.reset();
      fileActions?.close();
      confirmDialog?.close();
    }
  });
  codePanes.mountResize(element("main"), element("code-split"), element("secondary-pane"));
  cardsController.mount();
  // A selection inside a component's template gets Select card once the runtime says which card.
  // A remount must not leave the old pane (parked or shown) behind.
  nativePreview?.destroy();
  previewElementMenu?.close(false);
  previewElementMenu?.element.remove();
  previewElementMenu = createRowMenu(app);
  nativePreview = createNativePreview(element("main"), {
    onShortcut: name => paletteController.shortcut(name),
    onRefusalNoteAction: dismissRefusalNote,
    onMediaEnded: (id) => mediaController.mediaEnded(id),
    ...previewSelection.handlers(),
    onDismissContextMenu: () => previewElementMenu?.close(false),
    // The right-clicked element as the edit bar takes it (a shared template's part maps to its instance).
    onContextMenu: (point, anchor, selection) => {
      const target = componentTools?.mode.opened() ? selection : componentTools?.instanceSelection(selection);
      const entries = target ? elementMenuItems(target) : [];
      if (entries.length) previewElementMenu?.open(anchor, entries, point, "Element actions");
    },
    // The images of a page shown by following a link are read when it shows.
    // A page the text index has not read yet is read when it shows.
    onRouteShown: (route) => {
      componentTools?.mode.sync();
      if (!nativeSite) return;
      if (nativePreviewBehind) updateNativePreviewSources();
      void loadNativeAssets(nativeRouteShownSources(route));
      void loadNativeShownFiles(route);
    },
    cards: cardsController.preview,
    onComponentStyles: (tags) => void loadNativeComponentStyles(tags),
    onDefaultStyles: (styles) => updateBodyStyles({ rules: styles.selectors, cascade: styles.cascade }),
    onFormat: (format) => pageStructureController.nativeFormatActions[format]?.(),
    onImageDrop: (target, files) => void mediaController.chooseImage(target, files),
    onImageEdit: (target) => void mediaController.chooseImage(target),
    onTextEdit: (edit) => void pageStructureController.applyNativeTextEdit(edit),
    insertChoices: nativeSectionChoices,
    insertPointFor: nativeElementAddPoint,
    insertDestinationText: point => point ? nativeAddPoints.get(point)?.description ?? positionText(point) : "Choose a section destination.",
    onInsert: (point, choice) => void insertNativeComponent(point, choice),
    onNewComponent: (tag, point) => componentTools?.newComponent(tag, point) ?? Promise.resolve(false),
    onStructure: (structure) => {
      if (!structure) { pageStructure?.update(undefined); return; }
      codePanes.notePreviewPainted();
      noteNativePainted();
      const path = structure.path, source = structure.paintedSource, scope = draftScope();
      // A row's move holds the workspace from this paint, and the page's editor model if it is mounted.
      const paint = { since: guardedEdits.stamp(), model: scope && editorModule?.isMounted(path) ? editorModule.captureFileModelState(scope, path) : undefined };
      const capture = (item: NativeStructureItem) => {
        nativeStructurePaintedSources.set(item, source);
        nativeStructurePaints.set(item, paint);
        item.children.forEach(capture);
      };
      const shown = structure;
      shown.items.forEach(capture);
      pageStructure?.update(shown);
    },
    // Alt+arrows on the canvas: the edit bar's step for the selection.
    onMove: (direction) => pageStructureController.nativeElementMoveAction?.(direction),
    onBlockPress: dragPageBlock,
    onDismissRequest: (id) => void agentController.dismiss(id),
    onAnswerRequest: async (id, text) => {
      await agentController.answer(id, text);
    },
    // The Add panel docks over the page structure sidebar; under a phone's sheet (folded or not), over the page and sheet.
    addPanelDock: () => {
      const area = app.querySelector<HTMLElement>(".workspace")?.getBoundingClientRect();
      const sheet = getComputedStyle(element("sheet-handle")).display !== "none";
      const side = app.querySelector<HTMLElement>(sheet ? ".workspace > main" : ".workspace > .sidebar")?.getBoundingClientRect();
      return area && { left: side?.left ?? area.left, top: side?.top ?? area.top, bottom: Math.min(area.bottom, innerHeight), width: side?.width ?? 320 };
    },
  });
  nativePreview.attachAddButton(element<HTMLButtonElement>("add-panel-toggle"));
  pageStructure = createPageStructure(element("structure"), {
    menuItems: (path, item, opening, template) => {
      const painted = template ? template.source : nativeStructurePaintedSources.get(item);
      const fresh = () => painted !== undefined && nativeEffectiveSource(path) === painted && !versions.view;
      if (!fresh()) {
        if (opening) announce("The source changed. Wait for the preview before using this action.");
        return [];
      }
      return elementMenuItems({ path, node: template ? template.node : item.node, tag: item.tag, paintedSource: painted, renameChip: template?.chip }).map(entry => ({ ...entry, run: () => {
        if (!fresh()) { announce("The source changed. Wait for the preview before using this action."); return; }
        entry.run();
      } }));
    },
    pageSource: (path) => nativeEffectiveSource(path),
    label: (item) => {
      const component = Boolean(nativeSite && Object.hasOwn(nativeSite.components, item.tag));
      return { ...structureLabel(item, component), component };
    },
    onSelect: (path, node, edit) => nativePreview?.selectNode({ path, node }, edit),
    onRemove: (path, node, source) => pageStructureController.removeRow(path, node, source),
    componentSlots: (path, node) => componentTools?.structure(path, node),
    textRow: (path, node, tag) => TEXT_LINE_TAGS.has(tag) ? componentTools?.textRow(path, node) : undefined,
    templateRows: (path, node) => componentTools?.templateRows(path, node),
    componentFieldsRevision: nativeComponentFieldsRevision,
    pageMeta: nativePageMeta,
    onPageSettings: (path) => void openNativePageSettings(path),
    onNavigation: (path) => void openNativeNavigation(path),
    onPageMeta: (path, field, value) => void writeNativePageMeta(path, field, value).then((error) => { if (error) errorMessage(new Error(error)); }),
    pageUrl: (path) => {
      const route = nativeRouteForPath(path);
      if (!route) return undefined;
      return route === "/" ? { route, fixed: "The home page's URL is always /." } : { route };
    },
    planUrl: (file, value) => {
      // The sidebar's URL field is hidden while Page settings holds the URL; this keeps it calm if it shows again.
      if (pageActions) return pageActions.urlPlan(file, value);
      if (value === nativeRouteForPath(file)) return { ok: false, error: "", unchanged: true };
      void loadPagesActions().then(() => pageStructure?.refreshMeta()).catch(errorMessage);
      return { ok: false, error: "Loading page actions…", pending: true };
    },
    applyUrl: async (file, value, keep) => {
      const since = guardedEdits.stamp("repository");
      await loadPagesActions();
      return since.holds() ? pageActions!.changeUrl(file, value, keep) : "The repository changed meanwhile. Try again.";
    },
    onPageMetaClose: (path) => editorModule?.closeActiveEditGroup(path),
    // A row's Alt+arrows, by the Block move module. In Edit component mode a row of the template
    // edited (`template`: the bytes it was painted from) moves in it while that mode lasts. A page
    // that is not open opens first (the model held from the paint is then not its editor's).
    onMove: (path, item, direction, template) => {
      const paint = nativeStructurePaints.get(item), opens = !editorModule?.isMounted(path) || appStore.openFile.value !== path;
      const stale = !opens ? STRUCTURE_MOVE_STALE : pageStructureController.isNativeSectionTag(item.tag) ? SECTION_OPEN_STALE : BLOCK_OPEN_STALE;
      const at = { path, node: item.node, painted: template ? template.painted : nativeStructurePaintedSources.get(item) };
      return pageStructureController.moveBlock(at, direction, template
        ? { guard: () => componentTools?.mode.now()?.template === path, stale }
        : { since: paint?.since, guard: () => opens || !paint?.model || paint.model.isCurrent(), stale });
    },
    // A row drags as its block does on the page: the same targets, in the tree as well.
    itemsSlots: nativeMoveItems,
    // In Edit component mode a row of the template edited (`template`: the bytes it was painted from).
    onRowDrag: (press, item, template) => dragPageBlock(press, {
      node: item.node, tag: item.tag, cls: item.className ?? "", band: !template && pageStructureController.isNativeSectionTag(item.tag),
      painted: template ? template.painted : nativeStructurePaintedSources.get(item), ...(template ? { template: true } : {}),
    }),
    announce,
  });
  componentTools?.destroy();
  componentTools = mountComponentTools();
  paletteController.mount();
}

// The command palette (⌘K, ⌘P) and the keyboard shortcuts sheet (?), with
// the editor's commands calling what its own controls call
// (src/page-builder/palette.ts, docs/page-builder/palette.md).
const paletteController = createCommandPaletteController({
  appStore,
  host: () => app,
  site: () => nativeSite,
  routeTitle: route => nativeRouteInfo(route).title,
  files: nativeFiles,
  sources: nativeSources,
  effectiveSource: nativeEffectiveSource,
  indexed: () => nativeTextIndexed,
  index: ensureNativeTextIndex,
  stamp: () => guardedEdits.stamp("repository"),
  isMounted: path => Boolean(editorModule?.isMounted(path)),
  beginNewPage: () => { openExplorer(); pagesController.selectTab("pages"); },
  startNewPage: () => {
    const since = guardedEdits.stamp("repository");
    void ensureExplorer().then(() => { if (since.holds() && explorerDropdown?.isOpen()) pagesTree?.startNew("/"); }).catch(errorMessage);
  },
  actions: {
    open: (path) => {
      if (path === appStore.openFile.value && editorModule?.isMounted(path)) return;
      previewSelection.recordIntent(path);
      void restoreFile(path, workspaceSession.begin());
    },
    isSectionTag: tag => pageStructureController.isNativeSectionTag(tag),
    insert: (point, component) => insertNativeComponent({ ...point, top: 0, left: 0, width: 0, before: "" }, component),
    editBar: () => (document.querySelector(".edit-bar[data-model]") ? pageStructureController.nativeEditBarModel : undefined),
    select: (path, node) => nativePreview?.selectNode({ path, node }),
    textSelected: () => { const text = previewSelection.textSelection(); return Boolean(text && !text.caret && text.text); },
    history: (direction) => void editorModule?.runVisualHistory(direction, appStore.openFile.value),
    toggleCode: () => codePanes.heightResize()?.toggle(),
    codeHidden: () => element("main").classList.contains("code-collapsed"),
    toggleStructure: () => sidebarResize?.toggle(),
    structureHidden: () => Boolean(app.querySelector(".workspace--sidebar-collapsed")),
    newFile: () => {
      openExplorer();
      if (nativeSite) pagesController.selectTab("files");
      openCreate("", element("new-at-root"));
    },
    showPagesAndFiles: () => {
      openExplorer();
      element("explorer").querySelector<HTMLElement>("[role='tab'][aria-selected='true'], [role='treeitem'][tabindex='0']")?.focus();
    },
    announce,
    onError: errorMessage,
  },
});

// Components as first-class page builder objects (src/page-builder/components.ts).
let componentTools: ComponentTools | undefined;
function mountComponentTools() {
  return createComponentTools(componentPorts());
}
function componentPorts(): Parameters<typeof createComponentTools>[0] {
  return {
    site: () => nativeSite,
    sources: () => nativeSources(),
    variantFiles: nativeVariantFiles,
    structureFields: true,
    files: () => nativeFiles(),
    index: ensureNativeTextIndex,
    loaderPlan: nativeComponentLoaderPlan,
    edits: guardedEdits,
    editor: () => editorModule,
    preview: () => nativePreview,
    currentPath: () => appStore.openFile.value,
    selection: () => appStore.selection.value,
    openFile: async (path) => {
      const at = workspaceSession.begin(), scope = draftScope();
      previewSelection.recordIntent(path);
      // A pane open on its own history when a share (shareHistory below) asks for another opens again on that.
      const shared = scope && nativeHistoryShares.has(draftKey(scope, path)) ? nativeHistorySession(scope, path) : undefined;
      if (appStore.openFile.value !== path || !editorModule?.isMounted(path) || (shared && editorModule.paneOf(path)?.session !== shared)) await restoreFile(path, at);
      return at.holds() && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path));
    },
    announce,
    error: errorMessage,
    images: nativeImagePaths,
    prefix: () => nativePrefix(),
    chooseImage: (place, placement) => mediaController.choosePath(place, placement),
    links: () => (nativeSite ? nativeLinkSuggestions(Object.keys(nativeSite.routes), (route) => nativeRouteInfo(route).title, nativePrefix()) : []),
    pageLabel: (file) => pagesController.pageLabel(file),
    panelHost: app.querySelector<HTMLElement>(".sidebar")!,
    canvasComponent: (parts) => nativePreview?.setCanvasComponent(parts),
    codeTitle: element("primary-title").parentElement!,
    previewPage: () => {
      const route = nativePreview?.route();
      return route && nativeSite ? nativeSite.routes[route] : undefined;
    },
    refreshBar: () => { if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
    refreshStructure: () => pageStructure?.refresh(),
    // Joins the template to the page's journal, as the stylesheet pane follows the page's; an operation's alias stays under it.
    shareHistory: (path, owner) => {
      const scope = draftScope();
      if (!scope) return () => {};
      const key = draftKey(scope, path), share = { stamp: workspaceSession.begin(), session: nativeHistorySession(scope, owner) };
      nativeHistoryShares.set(key, [...nativeHistoryShares.get(key) ?? [], share]);
      return () => {
        const rest = nativeHistoryShares.get(key)?.filter((each) => each !== share) ?? [];
        if (rest.length) nativeHistoryShares.set(key, rest); else nativeHistoryShares.delete(key);
      };
    },
  };
}

function nativeEditableSource(path: string): string | undefined {
  return nativeSources()[path];
}

function nativeSectionChoices(): InsertChoice[] {
  if (!nativeSite) return [];
  // The Add panel lists every section component: their templates are the text index.
  if (!nativeTextIndexed) wantNativeTextIndex();
  const sources = nativeSources();
  return Object.entries(nativeSite.components)
    .filter(([, path]) => isSectionTemplate(sources[path] ?? ""))
    .map(([tag]) => ({ tag, label: componentLabel(tag) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Puts a new instance of a section component into the page at `point`, as
// one undo step, and selects it. The page file opens first when another
// file is in the editor, since edits go through the mounted editor.
const nativeAddPoints = new WeakMap<InsertPoint, { source: string; stamp: SessionStamp; description: string }>();
function nativeElementAddPoint(choice: InsertChoice, fallback: InsertPoint | undefined, mode: "click" | "drop" | "gap" = "click"): InsertPoint | undefined {
  const markup = nativeChoiceMarkup(choice.tag, undefined, nativePrefix());
  if (!markup) return fallback;
  if (versions.view || !nativeSite) return;
  const selected = appStore.selection.value;
  const path = selected?.path && Object.values(nativeSite.routes).includes(selected.path) ? selected.path : fallback?.path;
  const source = path && nativeEffectiveSource(path);
  if (!path || source === undefined) return;
  const destinations = selected?.path === path && selected.node ? nativeDestinations(source, path, selected.node) : [];
  const candidates = mode !== "click" ? [] : [...destinations.filter(item => item.placement === "inside"), ...destinations.filter(item => item.placement === "after")];
  if (fallback?.path === path) candidates.push({ point: fallback, description: `Inside ${fallback.tag || "page"}, at this gap`, placement: "inside", selection: [] });
  const found = candidates.find(item => nativeMarkupInsertEdit(source, item.point.parent, item.point.index, markup));
  if (!found) return;
  const point = { ...found.point, parent: [...found.point.parent] };
  nativeAddPoints.set(point, { source, stamp: workspaceSession.begin(), description: found.description });
  return point;
}
/**
 * Plans from every indexed page and stylesheet, read through the step's `r` once the index has
 * loaded: the module proves them, the loader's existence and the route graph at the write.
 */
async function nativeComponentLoaderPlan(path: string, nextPageText: string, r: Reads, check?: () => Promise<void>): Promise<PreparedComponentLoader | string | undefined> {
  const error = await ensureNativeTextIndex();
  if (check) await check();
  if (error) return error;
  const site = r.site();
  if (!site) return "The repository or source changed meanwhile. Review the latest files and try again.";
  const sources = nativeSiteSources(site, file => r.source(file));
  try {
    const { componentLoaderPlan } = await import("./page-builder/component-loader");
    if (check) await check();
    // The first pass avoids loading the vendored bytes when the site already has its loader.
    const input = { prefix: nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)), pages: Object.values(site.routes), sources: { ...sources, [path]: nextPageText }, exists: (file: string) => r.exists(file), loader: "" };
    const needed = componentLoaderPlan(input);
    if (!needed?.creates.length) return needed;
    const { starterLoader } = await import("./page-builder/starter-loader");
    if (check) await check();
    const loader = await starterLoader();
    if (check) await check();
    return componentLoaderPlan({ ...input, loader });
  } catch (error) {
    void handleChunkLoadFailure(error);
    return "The component loader could not load. Try again.";
  }
}

// A section's instance into the page at `point`, as one undo step (component-plans.ts
// addSectionStep), with the component loader when the site lacks it; the new
// section selected, Undo selects what was selected before. The page opens
// first when another file is in the editor.
async function insertNativeComponent(point: InsertPoint, choice: InsertChoice) {
  const path = point.path;
  const native = nativeChoiceMarkup(choice.tag, undefined, nativePrefix());
  // A destination planned against the page's bytes then (the Add panel's) holds only while they do.
  const captured = nativeAddPoints.get(point), moved = "The insertion source changed. Choose the destination again.";
  if (captured && (!captured.stamp.holds() || versions.view)) { errorMessage(new Error(moved)); return; }
  if (!nativePreview || !nativeSite || !Object.values(nativeSite.routes).includes(path)) return;
  const selected = appStore.selection.value;
  const before = selected?.node ? { path: selected.path, node: [...selected.node] } : undefined;
  // The page opens first when another file is in the editor (Edit component mode on a template it
  // uses ends then): the repository and branch hold, as the page's bytes do.
  const since = guardedEdits.stamp("repository");
  const outcome = await guardedEdits.run(async r => {
    const plan = await addSectionStep(r, { path, select: [...point.parent, point.index], message: `${choice.label} added`, before,
      loader: native ? undefined : nativeComponentLoaderPlan,
      edit(page) {
        if (native && captured && page !== captured.source) return moved;
        const edit = native ? nativeMarkupInsertEdit(page, point.parent, point.index, nativeChoiceMarkup(choice.tag, undefined, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)))!)
          : nativeInsertEdit(page, point.parent, point.index, choice.tag, r.template(choice.tag)?.source ?? "");
        return edit ? [edit] : `${choice.label} was not added: the HTML around that spot could not be located exactly in ${path}.`;
      } });
    if ("done" in plan && native) {
      const prefix = nativeSitePrefix(r.source(NATIVE_CONFIG_PATH));
      plan.creates = placeholderImageCreates(r, nativeChoiceMarkup(choice.tag, undefined, prefix)!, prefix);
    }
    return plan;
  }, { since, anchor: path, guard: () => !versions.view });
  if (!outcome.ok || outcome.message) errorMessage(new Error(!outcome.ok && outcome.reason === "stale" ? moved : outcome.message));
}

// A rail click or drop ends typing first, as Escape does: the runtime's
// answer follows its text edit, whose queue is then drained. False when the
// page did not answer: inserting before the typed text lands could move it.
const STILL_UPDATING = "The page is still updating. Try again in a moment.";
async function finishRailTyping(current: () => boolean) {
  if (nativePreview && !await nativePreview.finishTyping()) return false;
  if (current()) await pageStructureController.textEdits();
  return true;
}

// The guarded edit module (src/guarded-edit.ts) over this host: one way to
// prove nothing changed since a plan read the files, then write one undo
// step (the editor's range step, or its commit through the draft receipt).
const editorWorkspace = createEditorWorkspace({
  session: { ...workspaceSession, shown: shownScope },
  versionView: () => Boolean(versions.view),
  route: () => nativePreview?.route(),
  editModeEntry: () => componentTools?.mode.entry(),
  agentActing: () => agentActingDepth > 0,
  site: () => nativeSite,
  files: () => nativeFiles(),
  store: draftStore,
  source: path => mediaTextSource(path),
  exists: path => nativePathExists(path) || (!nativeSite && (pathNow(path, treeState()) === "file" || pathNow(path, treeState()) === "folder")),
  base: path => nativeBaseSources.get(path),
  branchText,
  entry: async path => { await loadFileOps(); return (await fileOps!.targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true))[0]; },
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
  paneFile: () => secondaryPath,
  closePane: closeSecondary,
  afterFileChanges,
  openAfter: (path, keepExplorer) => openAfter(path, keepExplorer, true),
  showRow: focus => { if (explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") pagesController.renderTree(focus); },
  status: () => element("status").textContent ?? "",
  select: (request, reveal) => nativePreview?.selectAfterUpdate(request, reveal ? { reveal: "center" } : undefined),
  flash: request => nativePreview?.flashInsert(request),
  announce,
  refuse: (message, history) => refuse(message, history ? { history } : {}),
  error: errorMessage,
});
const guardedEdits = createGuardedEdits(editorWorkspace);
// The Block move module (src/page-builder/block-move.ts): what a press moves, where it may go,
// and the move as one guarded edit, on the page or the template edited: the edit bar, the
// canvas's and Page Structure's Alt+arrows, and MCP move_section (drags arrive in slice 32).
const blockMoves = createBlockMoves({
  edits: guardedEdits,
  editing: () => componentTools?.mode.now(),
  mounted: path => appStore.openFile.value === path && Boolean(editorModule?.isMounted(path)),
  recheck: (path, source, node, tag) => {
    const stamp = guardedEdits.stamp(), close = editorModule!.editGroupCloser(path, tag);
    let changed = false;
    const stop = editorModule!.sourceStore().subscribe(event => {
      if (event.type === "text" || event.type === "history") { changed = true; close(); }
    });
    const current = () => !changed && stamp.holds() && nativeEffectiveSource(path) === source && Boolean(editorModule?.hasOpenEditGroup(path, tag));
    void import("./page-builder/media-move-recheck").then(module => module.recheckMove({
      edits: guardedEdits, current, painted: () => nativePreview?.paintedSource(path),
      measure: node => nativePreview!.measureImage({ path, node }, source),
      close: () => { stop(); close(); },
    }, path, source, node, tag)).catch(() => { stop(); close(); });
  },
  forgetOpening: path => {
    const draft = draftScope();
    // A kept model of the page, forgotten when the open is refused: it holds bytes older than the draft's.
    const kept = draft ? editorModule?.captureFileModelState(draft, path, true) : undefined;
    return painted => {
      if (draft && nativeEffectiveSource(path) !== painted && kept?.isCurrent() && !editorModule?.isMounted(path)) editorModule?.forgetDraftModel(draft, path);
      updateNativePreviewSources();
    };
  },
});
// The block rail's clicks and drags: one source edit per block, the new block selected.
// Loaded with the first click.
const blockInsertPorts: BlockInsertPorts = {
  target: () => {
    const route = nativePreview?.route();
    const path = route !== undefined && nativeSite && !versions.view ? nativeSite.routes[route] : undefined;
    if (!path) return undefined;
    // Edit component mode builds in the template edited, a part of it selected.
    const template = componentTools?.mode.now();
    if (template) {
      const selection = appStore.selection.value;
      return selection?.path === template.template ? { path: template.template, node: selection.node, painted: selection.paintedSource, template: template.tag } : { path: template.template, template: template.tag };
    }
    // A part of a component's template stands for its instance on the page.
    const selection = appStore.selection.value;
    const host = selection && [selection.host, ...selection.hostChain ?? []].find(item => item?.path === path && item.node);
    return selection?.path === path ? { path, node: selection.node, painted: selection.paintedSource } : { path, node: host?.node, painted: host?.paintedSource };
  },
  edits: guardedEdits,
  refuse: (reason, pointer) => {
    if (pointer) { refuse(reason, { pointer }); return; }
    nativePreview?.flashRefusal(reason);
    refuse(reason, { visible: document.querySelector<HTMLElement>(".pb-flash-label.is-refused") ?? undefined });
  },
};
const loadBlockDrag = lazyModule(() => import("./page-builder/block-drag"));
// Page Structure's side of a block's drag: its line, and its own targets
// (in Edit component mode, the rows of the template edited).
const structureDrop = (drag: Awaited<ReturnType<typeof loadBlockDrag>>, block: DraggedBlock, template?: { template: string; tag: string }) =>
  pageStructure && drag.structureDrop(pageStructure.dropView(template?.template), block, tag => guardedEdits.peek.template(tag)?.source, template?.tag);

// A page block dragged by its name in the edit bar (`pressed` none: the
// selection) or pressed in the page: moved where it is dropped, one undo
// step (the Block move module's `move`), anywhere HTML's content rules
// allow (slice 82). In Edit component mode the template's parts move the
// same way in the template (a named slot with its element), and the page's
// blocks stay put. The drag's targets load with the first one; the press's
// page, repository and session hold throughout.
function dragPageBlock(press: DragPress, pressed?: PressedBlock) {
  const target = blockInsertPorts.target(), selection = appStore.selection.value;
  const template = target?.template !== undefined ? componentTools?.mode.now() : undefined;
  if (pressed && Boolean(pressed.template) !== Boolean(template)) return undefined;
  const from = pressed ?? (selection?.node && selection.path === target?.path
    ? { node: selection.node, tag: selection.tag, cls: "", painted: selection.paintedSource } : undefined);
  if (!target || !from) return undefined;
  const at: MoveAt = { path: target.path, node: from.node, painted: from.painted };
  const grip = blockMoves.grip(at);
  if (!grip || !grip.drags) return undefined;
  // Another page shown meanwhile ends it too: its probes measure that page.
  const since = guardedEdits.stamp();
  const block: DraggedBlock = {
    kind: "move", path: grip.from, band: grip.band,
    fits: container => grip.refusal(container.path, container.kind === "items" && !template ? container.slot : undefined),
    ...(template ? { template: true } : {}),
  };
  // The chip says the name; a press in the page names it once the drag code is in.
  let name = press.source?.textContent?.trim() || from.tag;
  const component = Boolean(nativeSite && Object.hasOwn(nativeSite.components, from.tag));
  return trackDrag(press, () => ({ name, tag: from.tag, component }), () => loadBlockDrag().then(drag => {
    if (!since.holds()) return undefined;
    if (pressed) name = drag.dropBlockName(from.tag, from.cls);
    return nativePreview?.blockDrag(block, {
      tree: structureDrop(drag, block, template),
      drop: (target, where, painted) => {
        if (drag.dropStays(block, target)) { announce(`${name} stayed in place`); return; }
        const drop = { parent: target.container.path, index: target.index, ...(target.container.kind === "items" && !template ? { slot: target.container.slot } : {}) };
        if (!since.holds()) return;
        const outcome = blockMoves.move(at, { drop, painted, name, where }, { since, stale: "The page is still updating. Try again in a moment." });
        const report = (settled: Exclude<typeof outcome, { status: "pending" }>) => {
          if (settled.status !== "stayed" && settled.message) blockInsertPorts.refuse(settled.message);
        };
        if (outcome.status === "pending") void outcome.settled.then(report).catch(errorMessage);
        else report(outcome);
      },
      announce,
    }, drag.createBlockDrag, template?.template);
  }), true);
}
const loadBlockInsert = lazyModule(async () => (await import("./controllers/block-insert-controller")).createBlockInsertController(blockInsertPorts));

const versions = createVersionView({
  appStore, workspaceSession, guardedEdits, editorModule,
  get nativePreview() { return nativePreview; },
  currentLoad, setupScope, draftScope, draftStore, nativeEffectiveSource, updateNativePreviewSources, loadHistory, loadConfirmDialog,
  api, postApi, status, errorMessage, refuse,
  restoreFile: (path, at, options) => restoreFile(path, at, options),
  loadSnapshot: path => loadSnapshot(path),
});

// Side by side with the page: its stylesheet, and after a click in the
// preview, every rule that styles the selected element in the order the
// cascade applies them (shared/cascade.ts): rules that decide the element's
// look first, rules whose declarations all lose last. An edit to either file
// re-maps the rules to their source.
const linkedStyleSourceByPath = new Map<string, string>();
let linkedStyleContext = "";
function syncLinkedStyles(path: string, content: string) {
  const context = `${info.user?.login}:${appStore.repository.value?.id}:${appStore.snapshot.value?.branch}`;
  if (linkedStyleContext !== context) {
    linkedStyleSourceByPath.clear();
    linkedStyleContext = context;
  }
  const previous = linkedStyleSourceByPath.get(path);
  linkedStyleSourceByPath.set(path, content);
  if (previous !== content && linkedStyle && (path === linkedStyle.page || path === secondaryPath)) void refreshLinkedStyleRules();
}
// A rule in the Source editor rule chips: its range in its file and how the cascade treats it.
interface LinkedRule extends StyleRule {
  rule: NativeSelectedRule;
  status: RuleStatus;
  // Per declaration of `rule.declarations`, and for an overridden one the rule that wins its property.
  declarations: DeclarationStatus[];
  winners: (NativeSelectedRule | undefined)[];
}
// Rules the preview matched on an element, with what resolves them.
interface NativeStyles {
  rules: NativeSelectedRule[];
  cascade?: NativeCascade;
  // The element, for its `style` attribute's range in the source.
  node?: number[];
}
let linkedStyle: { page: string; css?: string; rules: LinkedRule[]; isDefault?: boolean } | undefined;
let nativeLinkedStyles: NativeStyles | undefined;
// The rules styling the preview's <body>: with nothing selected, the first
// stylesheet among them opens beside a page.
let nativeBodyStyles: NativeStyles | undefined;
let linkedStyleRequest = 0;
let disposeSecondary: (() => void) | undefined;
let secondaryPath: string | undefined;
let secondaryHistoryScope: string | undefined;
let secondaryRequest = 0;

// The cascade over `styles`, in display order, mapped to source ranges. A
// rule whose declarations the CSSOM splits around nested rules is one entry.
function linkedRules(styles: NativeStyles): LinkedRule[] {
  const sources = nativeSources();
  const result = resolveSelectedRules(styles.rules, styles.cascade);
  const found = new Map<number, StyleRule[]>();
  const lookups = styles.rules.map((rule) => rule.kind === "inline" ? { path: "", selector: "" } : rule);
  for (const rule of findStyleRulesInSources(sources, lookups)) {
    if (!found.has(rule.match)) found.set(rule.match, []);
    found.get(rule.match)!.push(rule);
  }
  styles.rules.forEach((rule, index) => {
    const source = sources[rule.path];
    const tag = rule.kind === "inline" && styles.node && source !== undefined ? locateNativeElement(source, styles.node) : undefined;
    if (tag) found.set(index, [{ path: rule.path, selector: rule.selector, start: tag.start, end: tag.end, match: index }]);
  });
  const winner = (property: string) => {
    const at = result.winners[property];
    return at ? styles.rules[at.rule] : undefined;
  };
  const out: LinkedRule[] = [];
  const byRange = new Map<string, LinkedRule>();
  for (const index of result.order) {
    const rule = styles.rules[index];
    const statuses = result.declarations[index];
    const winners = (rule.declarations ?? []).map((item, n) => statuses[n] === "overridden" ? winner(item.property) : undefined);
    for (const located of found.get(index) ?? []) {
      const key = `${located.path}\n${located.start}\n${located.end}`;
      const same = byRange.get(key);
      if (!same) {
        const linked: LinkedRule = { ...located, rule, status: result.rules[index], declarations: statuses, winners };
        byRange.set(key, linked);
        out.push(linked);
        continue;
      }
      same.rule = { ...same.rule, declarations: [...(same.rule.declarations ?? []), ...(rule.declarations ?? [])] };
      same.declarations = [...same.declarations, ...statuses];
      same.winners = [...same.winners, ...winners];
      same.status = same.status === "wins" || result.rules[index] === "wins" ? "wins"
        : same.status === "overridden" && result.rules[index] === "overridden" ? "overridden" : "neutral";
    }
  }
  return out;
}

function defaultLinkedStyle() {
  if (!nativeSite) return undefined;
  const rules = nativeBodyStyles ? linkedRules(nativeBodyStyles) : [];
  const css = rules.find((rule) => /\.css$/.test(rule.path))?.path ?? nativePageStyles()[0];
  return css ? { css, rules } : undefined;
}
async function openDefaultLinkedStyle(page = appStore.openFile.value) {
  const found = defaultLinkedStyle();
  if (!page || !found) return false;
  const request = ++linkedStyleRequest;
  const at = workspaceSession.begin();
  nativeLinkedStyles = nativeBodyStyles;
  linkedStyle = { page, css: found.css, rules: found.rules.length ? found.rules : linkedStyleIdle, isDefault: true };
  if (!(await openSecondary(found.css))) return false;
  if (request !== linkedStyleRequest || !at.holds() || linkedStyle?.page !== page) return false;
  renderLinkedStyle();
  return true;
}
// New <body> rules from the preview: a page showing them follows, opening
// another stylesheet when the cascade now puts another one first.
function updateBodyStyles(styles: NativeStyles) {
  nativeBodyStyles = styles;
  if (!linkedStyle?.isDefault || linkedStyle.page !== appStore.openFile.value) return;
  const found = defaultLinkedStyle();
  if (found && found.css === linkedStyle.css) {
    nativeLinkedStyles = styles;
    linkedStyle = { ...linkedStyle, rules: found.rules.length ? found.rules : linkedStyleIdle };
    renderLinkedStyle();
  } else void openDefaultLinkedStyle(linkedStyle.page);
}
function closeSecondary() {
  secondaryRequest++;
  disposeSecondary?.();
  disposeSecondary = undefined;
  secondaryPath = undefined;
  secondaryHistoryScope = undefined;
  element("secondary-pane").hidden = true;
  element("main").classList.remove("has-secondary");
  codePanes.applyWidth();
}
// With the whole commit listed in the snapshot, any path resolves without a
// request; otherwise directories are walked one `/api/tree` call at a time.
const repositoryIndex = new RepositoryIndex();
function entryAt(path: string): TreeEntry | undefined {
  return appStore.repository.value && appStore.snapshot.value ? repositoryIndex.entry(appStore.repository.value, appStore.snapshot.value, path) : undefined;
}
function findEntry(path: string) {
  return appStore.repository.value && appStore.snapshot.value ? repositoryIndex.find(api, appStore.repository.value, appStore.snapshot.value, path) : Promise.resolve(undefined);
}
// Opens `css` in the secondary pane (or keeps it if already there), then resolves.
async function openSecondary(css: string, guard: () => boolean = () => true) {
  if (!appStore.repository.value || !appStore.snapshot.value || !info.user || !guard()) return false;
  const request = ++secondaryRequest;
  const scope = {
    account: info.user.login,
    repoId: appStore.repository.value.id,
    repo: appStore.repository.value.full_name,
    branch: appStore.snapshot.value.branch,
  };
  const primaryKey = appStore.openFile.value ? draftKey(scope, appStore.openFile.value) : undefined;
  const primary = primaryKey && primaryHistoryScope?.key === primaryKey && primaryHistoryScope.proof.isCurrent() ? primaryHistoryScope : undefined;
  const historyScope = primary?.session ?? (appStore.openFile.value ? nativeHistorySession(scope, appStore.openFile.value) : undefined);
  const current = () => {
    const liveScope = draftScope();
    return guard() && (!primary || primaryHistoryScope === primary && primary.proof.isCurrent() &&
      !!appStore.openFile.value && !!liveScope && draftKey(liveScope, appStore.openFile.value) === primary.key);
  };
  if (draftStore().get(scope, css)?.deleted) return false;
  if (secondaryPath === css && secondaryHistoryScope === historyScope && disposeSecondary) return true;
  try {
    // A stylesheet only in the drafts (a new component's) opens from its draft.
    const draft = draftStore().get(scope, css);
    const created = draft && draft.baseSha === null && !draft.deleted && !draft.upload && !draft.opaque;
    const entry = created ? undefined : await findEntry(css);
    if (!current() || request !== secondaryRequest) return false;
    if (!created && (!entry || (entry.size ?? 0) > 1024 * 1024)) throw new Error(`Could not open ${css}.`);
    // The stylesheet's source editor mounts at once; its code shows with Monaco.
    const source = entry ? await readFile(scope.repo, entry.sha) : "";
    if (request !== secondaryRequest || !current() || draftStore().get(scope, css)?.deleted) return false;
    disposeSecondary?.();
    element("secondary-pane").hidden = false;
    element("main").classList.add("has-secondary");
    codePanes.applyWidth();
    disposeSecondary = editorModule.mountSourceEditor(
      element("content-secondary"),
      { key: draftKey(scope, css), historyScope, cssWorkspace: nativeCssWorkspace, variants: nativeVariantFiles, scope, baseSha: entry?.sha ?? null, path: css, source, readOnly: entry?.mode === "120000",
        onContextChange: (value) => {
          if (value) {
            syncLinkedStyles(value.path, value.content);
            if (nativeModeActive()) updateNativePreviewSources();
          }
          filesTreeController.refresh();
        } },
      null,
    );
    secondaryPath = css;
    secondaryHistoryScope = historyScope;
    nativeMountListener?.(css, true);
    return true;
  } catch (error) {
    if (request === secondaryRequest) errorMessage(error);
    return false;
  }
}
// Title and rule chips of the secondary pane; highlights the rules in both
// panes, crossing out the declarations the cascade overrides.
function renderLinkedStyle() {
  const linked = linkedStyle;
  const title = element("secondary-title");
  const chips = element("secondary-rules");
  chips.replaceChildren();
  if (!linked || !secondaryPath) return;
  title.textContent = secondaryPath;
  const inPane = (path: string) => linked.rules.filter((rule) => rule.path === path).map(ruleMarks);
  editorModule?.highlightRanges(secondaryPath, inPane(secondaryPath));
  if (appStore.openFile.value && appStore.openFile.value !== secondaryPath) editorModule?.highlightRanges(appStore.openFile.value, inPane(appStore.openFile.value));
  if (!linked.rules.length) {
    if (linked.rules !== linkedStyleIdle) chips.append(node("span", "muted", "No rules match this element"));
    return;
  }
  for (const rule of linked.rules) chips.append(ruleChip(rule));
}
const linkedStyleIdle: LinkedRule[] = [];

// Longhands a property sets, as this browser expands it (itself for a longhand).
const longhandCache = new Map<string, string[]>();
function longhandsOf(property: string) {
  if (!longhandCache.has(property)) {
    const style = document.createElement("div").style;
    if (!property.startsWith("--")) style.setProperty(property, "inherit");
    const list = Array.from(style);
    longhandCache.set(property, list.length ? list : [property]);
  }
  return longhandCache.get(property)!;
}

// A rule's highlight: the whole rule, dimmed when all of it is overridden,
// and each declaration in its source whose longhands are all overridden.
function ruleMarks(rule: LinkedRule) {
  const struck: { start: number; end: number }[] = [];
  const source = nativeSources()[rule.path];
  if (rule.rule.kind !== "inline" && source !== undefined) {
    const items = rule.rule.declarations ?? [];
    for (const declaration of declarationRanges(source, rule.start, rule.end)) {
      const longhands = new Set(longhandsOf(declaration.property));
      const statuses = items.flatMap((item, index) =>
        longhands.has(item.property) || item.shorthand === declaration.property ? [rule.declarations[index]] : []);
      if (statuses.length && statuses.every((status) => status === "overridden")) struck.push(declaration);
    }
  }
  return { start: rule.start, end: rule.end, overridden: rule.status === "overridden", struck };
}

const fileName = (path: string) => path.split("/").pop() ?? path;

// A chip per rule: its selector, where it comes from (context, layer,
// conditions, state), its file when that is not the pane's, and a tooltip
// listing its declarations with what the cascade makes of each.
function ruleChip(rule: LinkedRule) {
  const origin = ruleOrigin(rule.rule);
  const inline = rule.rule.kind === "inline";
  const chip = button("", () => void revealRule(rule), `code-pane__rule code-pane__rule--${rule.status}`);
  chip.append(node("span", "code-pane__rule-selector", inline ? "style=\"…\"" : rule.selector));
  const layer = origin.layer === "unlayered" ? "" : origin.layer.replace(/^@layer /, "");
  const tags = [inline ? "" : origin.context, layer, ...origin.conditions.map((condition) => condition.split(" ")[0]),
    ...origin.state.filter((state) => !rule.selector.includes(state))].filter(Boolean);
  if (tags.length) chip.append(node("span", "code-pane__rule-origin", [...new Set(tags)].join(" ")));
  if (rule.path !== secondaryPath) chip.append(node("span", "code-pane__rule-file", fileName(rule.path)));
  const items = rule.rule.declarations ?? [];
  const having = (status: DeclarationStatus) => [...new Set(items.filter((_, index) => rule.declarations[index] === status).map((item) => item.property))];
  chip.dataset.cascade = rule.status;
  chip.dataset.wins = having("wins").join(" ");
  chip.dataset.overridden = having("overridden").join(" ");
  chip.title = ruleTooltip(rule);
  return chip;
}

const MAX_TOOLTIP_DECLARATIONS = 14;
function ruleTooltip(rule: LinkedRule) {
  const origin = ruleOrigin(rule.rule);
  const lines = [
    rule.rule.kind === "inline" ? "style attribute" : rule.selector,
    rule.path + (rule.rule.importer ? ` (imported by ${rule.rule.importer})` : ""),
    [origin.context, origin.layer, ...origin.conditions, ...origin.state.map((state) => `in ${state} state`)].filter(Boolean).join(" · "),
  ];
  // A shorthand written with var() is one line, not one per longhand.
  const seen = new Set<string>();
  const described = (rule.rule.declarations ?? []).flatMap((item, index) => {
    const text = `${item.shorthand ?? item.property}: ${item.value}${item.important ? " !important" : ""}`;
    const status = rule.declarations[index];
    const by = rule.winners[index];
    const line = status === "overridden" ? `✕ ${text} — overridden${by ? ` by ${by.kind === "inline" ? "style attribute" : by.selector} (${fileName(by.path)})` : ""}`
      : status === "wins" ? `✓ ${text}`
      : status === "inactive" ? `· ${text} — @container not met`
      : status === "state" ? `· ${text} — ${origin.state.join(", ")} only`
      : `· ${text} — not verified`;
    if (seen.has(line)) return [];
    seen.add(line);
    return [line];
  });
  if (described.length > MAX_TOOLTIP_DECLARATIONS) described.splice(MAX_TOOLTIP_DECLARATIONS, Infinity, `… ${described.length - MAX_TOOLTIP_DECLARATIONS} more`);
  return [...lines.filter(Boolean), ...described].join("\n");
}

async function revealRule(rule: StyleRule) {
  if (rule.path === appStore.openFile.value) {
    editorModule?.revealRange(rule.path, rule.start, rule.end);
    return;
  }
  if (rule.path !== secondaryPath) {
    if (!(await openSecondary(rule.path))) return;
    renderLinkedStyle();
  }
  editorModule?.revealRange(rule.path, rule.start, rule.end);
}

function refreshLinkedStyleRules() {
  if (!appStore.repository.value || !appStore.snapshot.value || !linkedStyle || !nativeLinkedStyles?.rules.length || !nativeModeActive()) return;
  const page = linkedStyle.page;
  if (page !== appStore.openFile.value) return;
  linkedStyle = { ...linkedStyle, rules: linkedRules(nativeLinkedStyles) };
  renderLinkedStyle();
}

async function linkNativeStyles(selection: NativePreviewSelection, reveal: boolean) {
  const request = reveal ? ++linkedStyleRequest : linkedStyleRequest;
  const at = workspaceSession.begin();
  const page = selection.path;
  // An element no rule matches shows what it inherits from: the <body> rules.
  const styles = selection.selectors.length
    ? { rules: selection.selectors, cascade: selection.cascade, node: selection.node }
    : nativeBodyStyles;
  if (!reveal && (!styles?.rules.length || !secondaryPath)) return;
  nativeLinkedStyles = styles;
  const rules = styles ? linkedRules(styles) : [];
  if (request !== linkedStyleRequest || !at.holds() || page !== appStore.openFile.value) return;
  // Explicit template entry keeps its authored stylesheet when the selected
  // template element has no direct rules, rather than using page-body rules.
  const componentCss = page && nativeComponentTagForPath(page) && !selection.selectors.length
    ? nativeComponentCssPath(page) : undefined;
  const scope = draftScope();
  const componentDraft = componentCss && scope ? draftStore().get(scope, componentCss) : undefined;
  const fallbackCss = componentCss && !componentDraft?.deleted && !componentDraft?.upload && !componentDraft?.opaque &&
    nativeEffectiveSource(componentCss) !== undefined ? componentCss : undefined;
  const css = fallbackCss ?? rules.find((rule) => rule.path !== page)?.path ??
    styles?.rules.find((rule) => rule.path !== page)?.path ?? defaultLinkedStyle()?.css ?? secondaryPath;
  if (!reveal && css !== secondaryPath) {
    // Code selection updates matching rules without moving the open CSS pane.
    linkedStyle = { page, css: secondaryPath, rules };
    renderLinkedStyle();
    return;
  }
  linkedStyle = { page, css, rules };
  const current = () => {
    const draft = fallbackCss && scope ? draftStore().get(scope, fallbackCss) : undefined;
    return request === linkedStyleRequest && at.holds() && page === appStore.openFile.value &&
      (!fallbackCss || (!draft?.deleted && !draft?.upload && !draft?.opaque && nativeEffectiveSource(fallbackCss) !== undefined));
  };
  if (css && !(await openSecondary(css, current))) return;
  if (!current()) return;
  if (!css) closeSecondary();
  renderLinkedStyle();
  // The first rule in the pane's file, which decides the most; the page's
  // own caret stays on the selected element.
  const top = rules.find((rule) => rule.path === css);
  if (reveal && top && top.path !== page) editorModule?.revealRange(top.path, top.start, top.end);
}

const previewSelection = createPreviewSelectionController({
  generation: currentLoad,
  scope: () => setupScope(),
  store: appStore,
  site: () => nativeSite,
  sources: () => nativeSources(),
  editableSource: (path) => nativeEditableSource(path),
  preview: () => nativePreview,
  editor: () => editorModule,
  componentTag: (path) => nativeComponentTagForPath(path),
  editingScopePath: () => componentTools?.mode.opened(),
  instanceContent: (source, node, tag) => nativeInstanceContent(source, node, tag),
  locateTag: (source, node) => locateNativeElement(source, node),
  tagName: (source, node) => locateNativeElementRange(source, [...node])?.tag.name,
  openFile: (path, epoch) => restoreFile(path, stampOf(epoch), { linkDefaultStyle: false }),
  renderEditBar: (selection) => pageStructureController.renderEditBar(selection),
  linkStyles: (selection, reveal) => void linkNativeStyles(selection, reveal),
  clearMoveAction: () => { pageStructureController.nativeElementMoveAction = undefined; },
  structureSelect: (target) => pageStructure?.select(target),
  hideComponentTools: () => componentTools?.show(undefined),
  agentContext: () => updateAgentContext(),
  announce: (message) => refuse(message),
  beginReveal: () => {
    const request = ++linkedStyleRequest;
    fileGeneration++;
    secondaryRequest++;
    return request;
  },
  styleRequest: () => linkedStyleRequest,
  clearStyles: () => {
    nativeLinkedStyles = undefined;
    linkedStyle = undefined;
    void openDefaultLinkedStyle();
  },
});

// The site's files for its one Variant lookup (shared/variant-lookup.ts), for
// the edit bar, the card looks and the code pane: drafts applied. A file the
// lookup asks for that is not read yet is read in the background (one
// in-flight read per path in this scope) and they all ask again once it is
// here; a failed read settles without asking again, and the next ask retries.
let variantSite: { from: NativeSite; site: VariantSite } | undefined;
let variantWanted: Set<string> | undefined;
const variantReads = new Set<string>();
const nativeVariantFiles: VariantFiles = {
  site: () => {
    const site = nativeSite;
    if (!site || !draftScope() || versions.view) return undefined;
    if (variantSite?.from !== site) variantSite = { from: site, site: { pages: Object.values(site.routes), components: site.components } };
    return variantSite.site;
  },
  read: (path) => {
    const scope = draftScope();
    if (!nativeSite || !scope || versions.view) return undefined;
    const source = nativeEffectiveSource(path, scope);
    if (source === undefined) {
      if (!variantWanted) queueMicrotask(readVariantFiles);
      (variantWanted ??= new Set()).add(path);
    }
    return source;
  },
};

function readVariantFiles() {
  const wanted = variantWanted, scope = draftScope(), repo = appStore.repository.value;
  variantWanted = undefined;
  if (!wanted || !nativeSite || !scope || !repo || versions.view) return;
  const at = workspaceSession.begin(), scopeKey = setupScope();
  const key = (path: string) => JSON.stringify([at.load, scopeKey, path]);
  const files = new Set(nativeFiles(scope));
  const missing = [...wanted].filter(path => files.has(path) && nativeEffectiveSource(path, scope) === undefined && !variantReads.has(key(path)));
  if (!missing.length) return;
  missing.forEach(path => variantReads.add(key(path)));
  const live = () => at.holds();
  void readNativePredicted(repo.full_name, missing, live).then((read) => {
    missing.forEach(path => variantReads.delete(key(path)));
    if (!live() || !read) return;
    editorModule?.refreshVariants();
    nativePreview?.refreshCardLooks();
    if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value);
  });
}

/** A fresh source appStore.snapshot.value for CSS code intelligence. */
function nativeCssWorkspace(): CssWorkspace | undefined {
  const scope = draftScope(), requester = appStore.openFile.value;
  if (!nativeSite || !scope || !requester || versions.view || !editorModule?.isMounted(requester)) return;
  const at = workspaceSession.begin(), scopeKey = setupScope(), sources = nativeSources();
  const revision = JSON.stringify([at.load, scopeKey, requester, nativeSite.routes, nativeSite.components, appStore.selection.value?.path, appStore.selection.value?.node, sources]);
  const orderedPaths = [...new Set([...nativePageStyles(), ...Object.keys(sources).sort()])];
  return {
    revision, sources, orderedPaths,
    async openDefinition(path, start, end, expectedRevision) {
      if (expectedRevision !== revision || !/\.css$/i.test(path) || sources[path] === undefined || start < 0 || end < start || end > sources[path].length) return false;
      const requesterProof = editorModule!.captureFileModelState(scope, requester);
      const targetProof = editorModule!.captureFileModelState(scope, path);
      const current = () => at.holds() && appStore.openFile.value === requester && !versions.view &&
        requesterProof.isCurrent() && nativeCssWorkspace()?.revision === revision;
      if (!current() || !targetProof.isCurrent()) return false;
      if (path !== requester && !(await openSecondary(path, () => current() && targetProof.isCurrent()))) return false;
      if (!current() || editorModule?.getMountedSource(path) !== sources[path] || !editorModule.isMounted(path)) return false;
      renderLinkedStyle();
      editorModule.revealRange(path, start, end);
      return true;
    },
  };
}

// The selected element when it is a link, else the nearest ancestor link
// within the same source (a link around a component's slotted text lives in
// the page; one around the component lives outside it), with its index path.
function nearestLink(source: string, node: number[], range: ElementRange | undefined) {
  if (range?.tag.name === "a") return { range, node };
  for (let depth = node.length - 1; depth > 0; depth--) {
    const ancestor = node.slice(0, depth);
    const found = locateNativeElementRange(source, ancestor);
    if (found?.tag.name === "a") return { range: found, node: ancestor };
  }
  return undefined;
}


// Whether `inner` is exactly one `tags` element (plus whitespace), the bar's
// notion of "the whole element is bold/italic"; returns that wrapper's range.
function wholeWrapper(inner: string, tags: string[]) {
  const template = document.createElement("template");
  template.innerHTML = inner;
  const nodes = [...template.content.childNodes].filter((n) => n.nodeType !== Node.TEXT_NODE || n.textContent?.trim());
  const only = nodes.length === 1 && nodes[0] instanceof Element ? nodes[0] : undefined;
  if (!only || !tags.includes(only.localName)) return undefined;
  const open = inner.search(new RegExp(`<(${tags.join("|")})[\\s>]`, "i"));
  const closeAt = inner.toLowerCase().lastIndexOf(`</${only.localName}`);
  const closeEnd = inner.indexOf(">", closeAt);
  if (open < 0 || closeAt < 0 || closeEnd < 0) return undefined;
  const openEnd = inner.indexOf(">", open);
  return { open, openEnd: openEnd + 1, closeAt, closeEnd: closeEnd + 1 };
}
// Elements a link inside can be removed from, keeping its text.
const nativeLinkParents = new Set([...TEXT_LINE_TAGS].filter((tag) => tag !== "a" && tag !== "button"));
const nativeStructurePaintedSources = new WeakMap<NativeStructureItem, string | undefined>();
// The workspace and the page's editor model when a Structure row was painted, for its moves.
const nativeStructurePaints = new WeakMap<NativeStructureItem, { since: Stamp; model?: { isCurrent(): boolean } }>();
// A Structure row's stale words: the page open, or opening for the move.
const STRUCTURE_MOVE_STALE = "The source changed. Wait for the preview before moving this element.";
const SECTION_OPEN_STALE = "The source changed while its editor opened. Select the section again before moving it.";
const BLOCK_OPEN_STALE = "The source changed while its editor opened. Select the element again before moving it.";

const pageStructureController = createPageStructureController({
  get nativePreview() { return nativePreview; },
  get editorModule() { return editorModule; },
  get appStore() { return appStore; },
  get componentTools() { return componentTools; },
  get nativeEditableSource() { return nativeEditableSource; },
  get nativeSite() { return nativeSite; },
  get element() { return element; },
  get generation() { return currentLoad(); },
  get setupScope() { return setupScope; },
  get draftScope() { return draftScope; },
  get openNativeNavigation() { return openNativeNavigation; },
  get nativeSources() { return nativeSources; },
  get nativePageStyles() { return nativePageStyles; },
  get nativeTextTags() { return TEXT_LINE_TAGS; },
  get previewSelection() { return previewSelection; },
  get wholeWrapper() { return wholeWrapper; },
  get nativeLinkParents() { return nativeLinkParents; },
  get errorMessage() { return errorMessage; },
  get nearestLink() { return nearestLink; },
  get nativeRouteInfo() { return nativeRouteInfo; },
  get versionView() { return versions.view; },
  get nativeEffectiveSource() { return nativeEffectiveSource; },
  get nativeNamedDescendant() { return nativeNamedDescendant; },
  chooseMediaForImage: (target, files) => mediaController.chooseImage(target, files),
  mediaPlaceState: (page, src, alt) => mediaController.placeState(page, src, alt),
  mediaVideoControls: (page, node, source) => mediaController.videoControls(page, node, source),
  mediaButton: (page, node, source) => mediaController.mediaButton(page, node, source),
  mediaPlaceFrame: (page, node, tag) => mediaController.placeFrame(page, node, tag),
  editImage: target => void mediaController.editImage(target),
  changeMediaPlace: (page, node, decorative) => mediaController.changePlace(page, node, decorative),
  get nativePictureSources() { return nativePictureSources; },
  // cardsController is declared later in this module: read it at call time.
  cardControls: (selection, source) => cardsController.controls(selection, source),
  get agentController() { return agentController; },
  get announce() { return announce; },
  refuse,
  restoreFile: (path, epoch, options) => restoreFile(path, stampOf(epoch), options),
  get updateNativePreviewSources() { return updateNativePreviewSources; },
  nativeEditableTemplatePath: () => previewSelection.editableTemplatePath(),
  nativePageLabelOf: file => pagesController.pageLabel(file),
  get pageStructure() { return pageStructure; },
  get locateNativeElementRange() { return locateNativeElementRange; },
  get elementPathAt() { return elementPathAt; },
  get wrapperAround() { return wrapperAround; },
  get moves() { return blockMoves; },
  edits: guardedEdits,
});

// Components that fit between page sections: those whose template is a
// single <section>, read from their current source so a draft counts.
/** Instance content uses the same text/inline boundary as native canvas typing. */
function nativeInstanceContent(source: string, node: readonly number[], tag: string): boolean {
  const range = locateNativeElementRange(source, [...node]);
  if (!range || range.tag.name !== tag) return false;
  if (["img", "picture", "video", "a", "button"].includes(tag)) return true;
  const route = nativePreview?.route();
  if (route && gridOfItem(source, [...node], { route, prefix: nativePrefix(), routes: nativeSite?.routes ?? {}, isSection: (...args) => pageStructureController.isNativeSectionTag(...args) })) return true;
  if (!range.close || !TEXT_TAGS.has(tag)) return false;
  const template = document.createElement("template");
  template.innerHTML = source.slice(range.tag.end, range.close.start);
  return Boolean(template.content.textContent?.trim()) && [...template.content.querySelectorAll("*")].every(element => INLINE_FORMATTING.has(element.localName));
}


let nativeComponentFieldToken = 0;
let nativeComponentFieldSnapshot: { key: string; proofs: { isCurrent(): boolean }[] } | undefined;
function nativeComponentFieldsRevision() {
  const scope = draftScope();
  const sources = nativeSources();
  // Without a scope or the editor module there are no model proofs, so nothing would ever mark this
  // snapshot stale: whether proofs exist belongs to the key, or Structure keeps its pre-editor fields.
  const key = JSON.stringify([currentLoad(), setupScope(), appStore.openFile.value, nativeSite?.components, sources, Boolean(scope && editorModule)]);
  if (nativeComponentFieldSnapshot?.key === key && nativeComponentFieldSnapshot.proofs.every(proof => proof.isCurrent())) return String(nativeComponentFieldToken);
  nativeComponentFieldSnapshot = { key, proofs: scope && editorModule ? Object.keys(sources).map(path => editorModule!.captureFileModelState(scope, path)) : [] };
  return String(++nativeComponentFieldToken);
}


// Whether an element inside `range` names it: a non-empty aria-label (an svg role="img", say) or
// an image's non-empty alt, read from the parsed start tags (not a data-alt or other lookalike).
function nativeNamedDescendant(source: string, range: { start: number; end: number }) {
  return [...descendants(parseSource(source))].some(item => item.start > range.start && item.end <= range.end
    && (Boolean(startTagAttribute(source, item.tag, "aria-label")?.value.trim()) || item.name.toLowerCase() === "img" && Boolean(startTagAttribute(source, item.tag, "alt")?.value.trim())));
}
// Whether the image at `node` sits in a <picture> whose <source> elements give a non-empty srcset.
function nativePictureSources(source: string, node: readonly number[]) {
  const parent = node.length > 1 ? locateNativeElementRange(source, node.slice(0, -1)) : undefined;
  if (!parent || parent.tag.name.toLowerCase() !== "picture") return false;
  return [...descendants(parseSource(source))].some(item => item.start > parent.start && item.end <= parent.end && item.name.toLowerCase() === "source"
    && Boolean(startTagAttribute(source, item.tag, "srcset")?.value.trim()));
}

let previewElementMenu: ReturnType<typeof createRowMenu> | undefined;
window.addEventListener("blur", () => previewElementMenu?.close(false));
function elementMenuItems(target: ElementMenuTarget) {
  const providers = [
    (target: ElementMenuTarget) => componentTools?.menuItems(target) ?? [],
    (target: ElementMenuTarget) => componentTools?.slotMenu(target) ?? [],
  ];
  return collectElementMenuItems(target, providers);
}

let nativePreview: ReturnType<typeof createNativePreview> | undefined;
let pageStructure: ReturnType<typeof createPageStructure> | undefined;
// The loaded native site: its pages by route and its components by tag,
// read from the repository's files (shared/native-project.ts).
let nativeSite: NativeSite | undefined;
// True whenever the project is native (it has `index.html` at its root),
// even when its sources fail to load: the preview then shows the error
// instead of the plain file browser.
let nativeEngaged = false;
const cleanSources = new CleanSourceCache(() => info?.user?.login);
const nativeBaseSources = cleanSources.base;
const mediaOpaqueText = new Map<string, { sha: string; text: string }>();
const nativeComponentStyles = new Map<string, string>();
const nativeMissingComponentStyles = new Set<string>();
const nativeComponentStyleRequests = new Set<string>();
// The stylesheets the pages link and every file those `@import`: loaded,
// or missing from the branch, or being read. Each is a style dependency:
// its effective source reaches the preview and edits to it re-render.
const nativeStyleFiles = new Set<string>();
const nativeMissingStyleFiles = new Set<string>();
const nativeStyleFileRequests = new Set<string>();
// Files GitHub cannot give as text (not UTF-8, binary, over 1 MB), with why.
// Every read of the site skips them: a stylesheet among them is left out of
// the preview with a warning, never shown as a preview error.
const nativeUnreadableFiles = new Map<string, string>();
// The project's own warnings (shared/native-project.ts), shown with the unreadable stylesheets'.
let nativeProjectWarnings: string[] = [];
let nativeSourcesRequest = 0;
let nativeTextIndexing: Promise<boolean> | undefined;
let nativeTextIndexScope = "";
// Every file on the branch; pages are routed by where they are
// (shared/native-routes.ts) and components found by convention
// (shared/native-project.ts), so this list, with new files drafted in the
// browser (`nativeFiles`), decides the site's pages and components.
let nativeBaseFiles: string[] = [];

function nativeModeActive() {
  return Boolean(nativeSite);
}

// The route whose page file is `path`; undefined when the file is not a page.
function nativeRouteForPath(path: string | undefined) {
  if (!nativeSite || !path) return undefined;
  return Object.entries(nativeSite.routes).find(([, file]) => file === path)?.[0];
}

// The session's scope once its load's snapshot is on show: none on the overview or while a load runs.
function shownScope() { return appStore.snapshot.value ? workspaceSession.current().scope : undefined; }
function draftScope() { return draftScopeOf(shownScope()); }

// The title and description of the page file `path` for the Page block,
// from its head (`<title>`, `<meta name="description">`); nothing when the
// file is not one of the site's pages. The title's placeholder is the
// page's first heading.
function nativePageMeta(path: string) {
  if (!nativeRouteForPath(path)) return undefined;
  const source = nativeEffectiveSource(path) ?? "";
  const head = nativePageHead(source);
  return {
    title: head.title ?? "",
    description: head.description ?? "",
    placeholders: { title: firstHeadingText(source) || undefined },
  };
}

// The title and description the page at `route` has, from its head.
function nativeRouteInfo(route: string, site = nativeSite) {
  if (!site || !Object.hasOwn(site.routes, route)) return {};
  const source = nativeEffectiveSource(site.routes[route]);
  return source === undefined ? {} : nativePageHead(source);
}

// The titles of the site's pages by route, for the Pages tab.
function nativeTitles(site: NativeSite) {
  return Object.fromEntries(Object.keys(site.routes).map((route) => [route, nativeRouteInfo(route, site).title]));
}

// Writes a Page field (the Page block's Title or Description, the Pages
// tab's Rename) into the page's head as one minimal edit
// (`nativePageWithDetail`: the `<title>` or the description's `content`,
// with `og:title`/`og:description` when the page has them). The open page's
// edit goes into its editor (`group` joins the field's keystrokes into one
// undo step until it closes); another page's is one operation over the
// drafts. Resolves to an error.
async function writeNativePageMeta(path: string, field: PageMetaField, value: string, group = true): Promise<string | undefined> {
  const plan = (r: Reads): PlanResult => {
    const site = r.site(), route = site && Object.entries(site.routes).find(([, file]) => file === path)?.[0];
    if (!site || !route) return { refuse: "This page has no URL in the site." };
    const source = r.source(path);
    if (source === undefined) return { refuse: "The page could not be read." };
    const edit = minimalTextEdit(source, withPageField(source, field, value));
    const label = field === "title" ? "Title" : "Description";
    const page = nativePageLabel(path, { routes: site.routes, titles: { [route]: nativePageHead(source).title }, heading: () => firstHeadingText(source) }) ?? path;
    return { edits: new Map([[path, edit ? [{ ...edit, expected: source.slice(edit.start, edit.end) }] : []]]),
      done: value.trim() ? `${label} updated` : `${label} removed`,
      undone: `Undid changing the ${field} of ${page}.`, focus: { file: path } };
  };
  const outcome = appStore.openFile.value === path && editorModule?.isMounted(path)
    ? guardedEdits.now(plan, { group: group ? `page-meta:${path}:${field}` : undefined })
    : await guardedEdits.run(plan);
  if (outcome.message) return outcome.message;
  updateCurrentPageLabel();
  if (explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") pagesController.renderTree();
  if (outcome.ok && outcome.status === "applied") element("status").textContent = value.trim() ? `${field === "title" ? "Title" : "Description"} updated` : `${field === "title" ? "Title" : "Description"} removed`;
  return undefined;
}

// ---- Page-builder site controls. Kept together to isolate this slice's wiring. ----

function nativeNavigationTarget(pagePath: string | undefined, r: Reads = guardedEdits.peek) {
  const site = r.site();
  if (!site || !pagePath) return undefined;
  const page = r.source(pagePath) ?? "";
  // Only offer the header component actually used on this page.
  const headerPath = site.components["site-header"];
  if (headerPath && /<site-header(?:\s|>)/i.test(page)) {
    const source = r.source(headerPath);
    const list = source !== undefined ? readNavigation(source, true, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))) : undefined;
    if (source !== undefined && list) return { path: headerPath, source, list, shared: true };
  }
  const list = readNavigation(page, false, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH)));
  return list ? { path: pagePath, source: page, list, shared: false } : undefined;
}

async function openNativePageSettings(path: string) {
  const at = workspaceSession.begin();
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (!at.holds()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const source = nativeEffectiveSource(path), route = nativeRouteForPath(path);
  if (source === undefined || !route) return;
  try { settings.nativeSettingsController(settings, [path]).page({ path, source, route, images: nativeImagePaths() }); }
  catch (error) { errorMessage(error); }
}

async function openNativeSiteSettings() {
  const at = workspaceSession.begin();
  if (!nativeSite) { refuse("Open a native site first."); return; }
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (!at.holds()) return;
  if (problem || !nativeSite) { if (problem) errorMessage(new Error(problem)); return; }
  try {
    settings.nativeSettingsController(settings, [NATIVE_CONFIG_PATH, nativeSite.routes["/"]]).site({ values: settings.readSiteIdentity(nativeEffectiveSource(NATIVE_CONFIG_PATH), nativeEffectiveSource(nativeSite.routes["/"]) ?? ""), pages: settings.nativeSitePageChoices(), images: nativeImagePaths(), has404: Boolean(nativeSite.routes["/404.html"]) });
  } catch (error) { errorMessage(error); }
}

async function openNativeNavigation(pagePath: string) {
  const at = workspaceSession.begin();
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (!at.holds()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const target = nativeNavigationTarget(pagePath);
  if (!target) { refuse("No editable navigation found in this page's header. Navigation supports simple links, or a list of single-link items."); return; }
  settings.nativeSettingsController(settings).navigation({ path: target.path, source: target.source, links: target.list.links, pages: settings.nativeSitePageChoices(), shared: target.shared });
}

// Pages and components are found from the files when the project loads. A
// file created, moved or discarded here finds them again with the files
// now, so a new page routes (and a new component renders) at once.
function refreshNativeRoutes() {
  if (!nativeSite) return;
  const parsed = resolveNativeProject(nativeFiles());
  if (!parsed.ok) { errorMessage(new Error(parsed.error)); return; }
  nativeSite = parsed.site;
  showNativeWarnings(parsed.warnings);
  nativePreview?.activate(parsed.site);
  updateNativePreviewSources();
  updateAgentContext();
  pageStructure?.refreshMeta();
  pagesController.renderTree();
  updateCurrentPageLabel();
}

// Every page, component and style file to its effective source: a mounted
// editor model wins, then a saved/new browser draft, then the clean snapshot
// baseline.
function nativeSources(site = nativeSite): Record<string, string> {
  const scope = draftScope();
  return site ? nativeSiteSources(site, path => nativeEffectiveSource(path, scope)) : {};
}
/** The site's pages, templates and stylesheets as `effective` reads them (a plan passes its `r`). */
function nativeSiteSources(site: NativeSite, effective: (path: string) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const paths = new Set([...nativeSitePaths(site), ...nativeComponentStyles.values()]);
  for (const path of paths) out[path] = effective(path) ?? "";
  // A style file that is neither in the branch nor a draft stays out, so
  // the preview reports the link or import as missing.
  for (const path of [...nativeStyleFiles, ...nativeMissingStyleFiles]) {
    if (Object.hasOwn(out, path)) continue;
    const content = effective(path);
    if (content !== undefined) out[path] = content;
  }
  return out;
}

/** Alt+arrow moves open an instance's seal at its items slots, as drags do. */
function nativeMoveItems() {
  return itemsSlotRule(tag => guardedEdits.peek.template(tag)?.source);
}

function nativeEffectiveSource(path: string, scope = draftScope()) {
  let content = nativeBaseSources.get(path);
  const draft = scope ? draftStore().get(scope, path) : undefined;
  // A file deleted in the drafts has no source; a binary one moved has none to show.
  if (draft?.deleted || draft?.opaque) return undefined;
  if (draft) content = draft.content;
  const mounted = editorModule?.getMountedSource(path);
  if (mounted !== undefined) content = mounted;
  return content;
}

// The site's sub-folder from its Site address (`/my-site`); none at a domain root.
function nativePrefix() {
  return nativeSitePrefix(nativeEffectiveSource(NATIVE_CONFIG_PATH) ?? "");
}

// The stylesheets any page links, in page order: what the style loader reads.
function nativeLinkedSheets(site: NativeSite, sources: Record<string, string>) {
  const out = new Set<string>();
  const prefix = nativePrefix();
  for (const file of Object.values(site.routes))
    for (const path of nativePageStylesheets(sources[file] ?? "", file, prefix)) out.add(path);
  return [...out];
}

// The shared stylesheets of the page the preview shows (the home page's
// when it shows no page), with every file they import.
function nativePageStyles() {
  if (!nativeSite) return [];
  const sources = nativeSources();
  const route = nativeRouteForPath(appStore.openFile.value) ?? nativeDefaultRoute(nativeSite);
  const linked = routeStylesheets(nativeSite, sources, route, nativePrefix());
  return [...new Set([...linked, ...expandStyleImports(linked, (path) => sources[path], undefined, nativePrefix()).imported])];
}

// A page selection: the preview follows the newly opened page's route. Opening
// a non-page file (CSS, component) leaves the preview's current route untouched.
// The preview's sources: the effective ones, with History's earlier version
// of the open file in its place while one is on show.
// The preview's sources also carry the site's settings: its Site address
// places the site in a sub-folder (shared/site-path-prefix.ts).
function withSiteConfig(sources: Record<string, string>) {
  const config = nativeEffectiveSource(NATIVE_CONFIG_PATH);
  if (config !== undefined) sources[NATIVE_CONFIG_PATH] = config;
  return sources;
}
function nativePreviewSources() {
  versions.check();
  const sources = withSiteConfig(nativeSources());
  if (versions.view) sources[versions.view.path] = versions.view.content;
  return sources;
}

function updateNativePreview() {
  if (!nativeSite || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({
    sources: nativePreviewSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
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
// Every file the page on show draws from: its page, templates and stylesheets.
function nativeShownPaths() {
  if (!nativeSite) return new Set<string>();
  const site = nativeSite, scope = draftScope(), files = new Set(nativeFiles(scope));
  const route = nativePreview?.route();
  const page = (route !== undefined && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
  const pages = [page, ...(appStore.openFile.value ? [appStore.openFile.value] : [])];
  return new Set([...nativeShownFiles(site, pages, (path) => nativeEffectiveSource(path, scope), (path) => files.has(path), nativePrefix()).files, ...nativePageStyles()]);
}
function updateNativePreviewSources() {
  if (!nativeSite || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({ sources: nativePreviewSources(), componentStyles: Object.fromEntries(nativeComponentStyles), assets: Object.fromEntries(nativeAssets), unreadable: nativePreviewUnreadable(), editableTemplatePath: previewSelection.editableTemplatePath() });
  void loadNativeAssets();
  void loadNativeStyleFiles();
  void loadNativeShownFiles();
}

// Images and fonts that arrived after the page was drawn: the preview shows
// them in place, without drawing the page again.
function updateNativePreviewAssets() {
  if (!nativeSite || !nativePreview) return;
  nativePreview.setAssets(Object.fromEntries(nativeAssets));
}

// Reads the stylesheets the pages link and the files those `@import` that
// are not loaded yet, following imports of imports, into the base sources.
// True when any loaded.
function readNativeStyleFiles(repo: string, site: NativeSite, live: () => boolean) {
  const scope = draftScope();
  return readStyleFiles({
    wanted: () => {
      const sources = nativeSources(site), linked = nativeLinkedSheets(site, sources);
      return [...linked, ...expandStyleImports(linked.filter((path) => Object.hasOwn(sources, path)), (path) => sources[path], undefined, nativePrefix()).imported]
        .filter((path) => !Object.hasOwn(sources, path));
    },
    skipped: (path) => nativeMissingStyleFiles.has(path) || nativeUnreadableFiles.has(path) || nativeStyleFileRequests.has(path),
    // A stylesheet drafted here (new, or moved) is its draft; one read with the site is there.
    draft: (path) => (scope ? draftStore().get(scope, path) : undefined),
    read: (path) => nativeBaseSources.has(path),
    find: (path) => findEntry(path),
    readTexts: (found) => readNativeTexts(repo, found),
    live,
    reading: (paths, on) => paths.forEach((path) => (on ? nativeStyleFileRequests.add(path) : nativeStyleFileRequests.delete(path))),
    shown: (path, text) => { if (text !== undefined) nativeBaseSources.set(path, text); nativeStyleFiles.add(path); },
    missing: (path) => nativeMissingStyleFiles.add(path),
    unreadable: noteNativeUnreadable,
  });
}

// Reads what the pages `pages` show that is not read yet (src/native-boot.ts):
// the pages, the component templates they use with their stylesheets, and
// the stylesheets they link with their imports, a level at a time, each
// level in one request; `extra` comes with the first. Stylesheets read here
// are taken up by readNativeStyleFiles and component stylesheets by
// `nativeComponentStyles`. True when anything was read.
// Paths being read, with the read that owns them: a read left over from a
// previous load (cleared with the rest of its state) never clears a newer one's.
const nativeShownRequests = new Map<string, object>();
async function readNativeShownFiles(repo: string, site: NativeSite, pages: string[], live: () => boolean, extra: string[] = [], predicted: string[] = []) {
  const scope = draftScope();
  const held = (path: string) => nativeBaseSources.has(path) || Boolean(scope && draftStore().get(scope, path));
  const fileSet = new Set(nativeFiles(scope));
  const isFile = (path: string) => fileSet.has(path);
  let loaded = false, first = true;
  for (let round = 0; round < 20; round++) {
    // A file that cannot be read as text is not asked for again: a
    // stylesheet is left out of the page, and a page or template the page
    // needs is the preview's error (nativeUnreadableShown).
    const shown = nativeShownFiles(site, pages, (path) => nativeEffectiveSource(path, scope), isFile, nativePrefix());
    for (const [tag, css] of shown.componentCss)
      if (held(css) && !nativeComponentStyles.has(tag)) { nativeComponentStyles.set(tag, css); loaded = true; }
    for (const tag of shown.missingComponentCss) nativeMissingComponentStyles.add(tag);
    const wanted = [...new Set([...shown.files, ...(first ? extra : [])])].filter((path) =>
      !held(path) && !nativeMissingStyleFiles.has(path) && !nativeUnreadableFiles.has(path) && !nativeShownRequests.has(path));
    // Predicted files (the site's own stylesheets) come in the same wave but
    // apart: one that cannot be read (not UTF-8) fails only its own batch,
    // and a sheet a page links is then read in a later round as usual.
    const guessed = round === 0 ? predicted.filter((path) => !wanted.includes(path) && !held(path) && !nativeShownRequests.has(path)) : [];
    first = false;
    if (!wanted.length && !guessed.length) break;
    const guessing = guessed.length ? readNativePredicted(repo, guessed, live) : Promise.resolve(false);
    if (!wanted.length) {
      if (await guessing) loaded = true;
      if (!live()) return false;
      continue;
    }
    const owner = {};
    wanted.forEach((path) => nativeShownRequests.set(path, owner));
    try {
      const entries = await Promise.all(wanted.map((path) => findEntry(path)));
      if (!live()) return false;
      const found = wanted.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
      // A linked stylesheet that is not in the branch is reported by the preview.
      wanted.forEach((path, index) => { if (!entries[index] && /\.css$/i.test(path)) nativeMissingStyleFiles.add(path); });
      const { texts, unreadable } = await readNativeTexts(repo, found);
      if (!live()) return false;
      // Checked at the next round's start, with what this read brought.
      if (unreadable.length) { noteNativeUnreadable(unreadable); loaded = true; }
      for (const file of found) {
        const text = texts.get(file.path);
        if (nativeBaseSources.has(file.path) || text === undefined) continue;
        nativeBaseSources.set(file.path, text);
        loaded = true;
      }
      if (await guessing) loaded = true;
      if (!live()) return false;
      // Files that are not in the branch are not asked for again.
      if (!found.length) break;
    } finally {
      wanted.forEach((path) => { if (nativeShownRequests.get(path) === owner) nativeShownRequests.delete(path); });
    }
  }
  return loaded;
}

// Best effort: whether any predicted file was read. A failure leaves them
// unread; so does a newer load (`live` false), whose sources it must not touch.
async function readNativePredicted(repo: string, paths: string[], live: () => boolean) {
  const owner = {};
  paths.forEach((path) => nativeShownRequests.set(path, owner));
  try {
    const entries = await Promise.all(paths.map((path) => findEntry(path)));
    if (!live()) return false;
    const found = paths.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
    if (!found.length) return false;
    const { texts, unreadable } = await readNativeTexts(repo, found);
    if (!live()) return false;
    noteNativeUnreadable(unreadable);
    let read = false;
    for (const file of found) {
      const text = texts.get(file.path);
      if (nativeBaseSources.has(file.path) || text === undefined) continue;
      nativeBaseSources.set(file.path, text);
      read = true;
    }
    return read;
  } catch {
    return false;
  } finally {
    paths.forEach((path) => { if (nativeShownRequests.get(path) === owner) nativeShownRequests.delete(path); });
  }
}

// The page on show, before the text index has read the whole site: what it
// shows that is not read yet (a page followed by a link, a component an
// edit added) is read, and the preview drawn again.
async function loadNativeShownFiles(route = nativePreview?.route()) {
  if (!nativeSite || !appStore.repository.value || !appStore.snapshot.value || nativeTextIndexed) return;
  const site = nativeSite;
  const request = nativeSourcesRequest;
  const at = workspaceSession.begin();
  const live = () => at.holds() && request === nativeSourcesRequest && nativeSite === site;
  const page = (route !== undefined && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
  let loaded = false;
  try {
    loaded = await readNativeShownFiles(appStore.repository.value.full_name, site, [page], live);
  } catch {
    // The text index reads them again.
  }
  if (loaded && live()) updateNativePreviewSources();
}

async function loadNativeStyleFiles() {
  if (!nativeSite || !appStore.repository.value || !appStore.snapshot.value) return;
  const site = nativeSite;
  const request = nativeSourcesRequest;
  const at = workspaceSession.begin();
  const live = () => at.holds() && request === nativeSourcesRequest && nativeSite === site;
  let loaded = false;
  try {
    loaded = await readNativeStyleFiles(appStore.repository.value.full_name, site, live);
  } catch {
    // The preview reports the stylesheet as missing.
  }
  if (loaded && live()) updateNativePreviewSources();
}

// Images and fonts the page on show, its components and stylesheets refer
// to, read once per path as data URLs so the sandboxed frame can show them
// (it has an opaque origin: neither the session cookie nor the editor's blob:
// URLs reach it). The bytes come from `/api/blob` by SHA, which the browser
// caches for good, so a reload reads them from its cache. They are read after
// the page is drawn and shown in place as they arrive (fonts get a short
// head start, NATIVE_FONT_WAIT_MS); a path that is not in the branch (or not
// an image or font) is remembered as missing and left as written.
const nativeAssets = new Map<string, string>();
const nativeMissingAssets = new Set<string>();
const nativeAssetRequests = new Map<string, number>();
let nativeAssetRequestId = 0;
const NATIVE_FONT_WAIT_MS = 300;
// The sources of what the page `file` shows: the page, every component and
// component stylesheet, and the stylesheets it links with their imports.
function nativePageShownSources(site: NativeSite, file: string) {
  const sources = nativeSources(site);
  const linked = nativePageStylesheets(sources[file] ?? "", file, nativePrefix());
  const shown = new Set([file, ...Object.values(site.components), ...nativeComponentStyles.values(), ...linked, ...expandStyleImports(linked, (path) => sources[path], undefined, nativePrefix()).imported]);
  return Object.fromEntries(Object.entries(sources).filter(([path]) => shown.has(path)));
}
// The sources of the page at `route` (the home page's for a component shown
// alone), so its images are found.
function nativeRouteShownSources(route: string | undefined) {
  if (!nativeSite) return {};
  const site = nativeSite;
  const file = (route && site.routes[route]) || site.routes[nativeDefaultRoute(site)];
  const sources = nativePageShownSources(site, file);
  return sources;
}
// The page the preview last drew; nothing before its first draw, so no
// image is read before the page is on screen (onRouteShown reads them then).
function nativeAssetSources() {
  const drawn = nativePreview?.shownRoute();
  return drawn === undefined ? {} : nativeRouteShownSources(drawn);
}
// A blob's bytes from `/api/blob`, which the browser keeps in its cache (a blob never changes).
async function readBlob(repo: string, sha: string, path?: string): Promise<Blob> {
  const response = await fetchWithReadRetry(blobUrl(repo, sha, path), { credentials: "same-origin" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(response.status, data.error || "Could not load the file.");
  }
  return response.blob();
}
// Reads the assets `sources` name that are not read yet (only those `only`
// keeps); `onProgress` runs as they arrive, in batches.
async function loadNativeAssets(sources = nativeAssetSources(), onProgress = updateNativePreviewAssets, only: (path: string) => boolean = () => true, fontsOnly = false) {
  if (!appStore.repository.value || !appStore.snapshot.value || !Object.keys(sources).length) return;
  const repo = appStore.repository.value.full_name;
  const request = nativeSourcesRequest;
  const at = workspaceSession.begin();
  const references = new Set<string>(), sounds = new Set<string>();
  if (fontsOnly) {
    // Font preloading precedes paint. The page-media scanner stays out of that boot path.
    for (const [file, source] of Object.entries(sources)) if (file.endsWith(".css")) rewriteCssUrls(source, url => {
      const path = resolveImportPath(file, url, nativePrefix());
      if (path) references.add(path);
      return undefined;
    });
  } else {
    const { scanMediaReferences } = await import("./page-builder/media-references");
    if (!at.holds() || request !== nativeSourcesRequest) return;
    for (const [file, source] of Object.entries(sources)) for (const ref of scanMediaReferences(file.endsWith(".css") || nativePageRoute(file) ? file : "index.html", source, undefined, nativePrefix())) {
      references.add(ref.path);
      // An audio player's file, so the canvas shows its length (a link to a recording is not read).
      if (ref.tag === "audio" || ref.tag === "source") sounds.add(ref.path);
    }
  }
  const typeOf = (path: string) => assetType(path) ?? (sounds.has(path) ? audioType(path) : undefined);
  const wanted = [...references].filter((path) =>
    typeOf(path) && only(path) && !nativeAssets.has(path) && !nativeMissingAssets.has(path) && !nativeAssetRequests.has(path));
  if (!wanted.length) return;
  const assetRequest = ++nativeAssetRequestId;
  wanted.forEach((path) => nativeAssetRequests.set(path, assetRequest));
  const scope = draftScope();
  const live = () => at.holds() && request === nativeSourcesRequest;
  const load = async ({ path, type }: { path: string; type: string }): Promise<string | undefined> => {
    // A drafted image: an upload's bytes from this browser, a moved or
    // copied one's blob; a deleted one is missing.
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft) nativeDraftAssets.add(path);
    if (draft?.upload && sounds.has(path) && draft.upload.size > CANVAS_AUDIO_MAX_BYTES) return undefined;
    if (draft?.upload && scope) return uploadDataUrl(uploadBytes(), scope, draft).catch(() => undefined);
    // An SVG written as text here (the block placeholder, an edited one) shows its draft.
    if (draft && !draft.deleted && !draft.opaque && !draft.sourceSha && type === "image/svg+xml") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.content)}`;
    const entry = draft?.deleted ? undefined : draft?.sourceSha ? { sha: draft.sourceSha } : await findEntry(path);
    if (!live()) return undefined;
    // A batch can place an image just before its upload draft becomes visible.
    if (scope && draftStore().get(scope, path) !== draft) return load({ path, type });
    if (!entry || (sounds.has(path) && ("size" in entry ? entry.size ?? 0 : 0) > CANVAS_AUDIO_MAX_BYTES)) return undefined;
    try {
      return await dataUrlOf(await readBlob(repo, entry.sha, path), type);
    } catch {
      return undefined;
    }
  };
  try {
    await loadNativeAssetRequests({
      requests: wanted.map((path) => ({ path, type: typeOf(path)! })),
      concurrency: 8,
      live,
      load,
      onLoaded: (path, dataUrl) => nativeAssets.set(path, dataUrl),
      onMissing: (path) => nativeMissingAssets.add(path),
      onProgress,
    });
  } finally {
    wanted.forEach((path) => {
      if (nativeAssetRequests.get(path) === assetRequest) nativeAssetRequests.delete(path);
    });
  }
}
// Paths whose image came from a draft (or that a draft now covers) are read
// again after files change, so an upload, move or discard shows at once.
const nativeDraftAssets = new Set<string>();
function forgetDraftedAssets() {
  const scope = draftScope();
  let forgot = false;
  for (const path of [...nativeAssets.keys(), ...nativeMissingAssets])
    if (nativeDraftAssets.has(path) || (scope && draftStore().get(scope, path))) {
      forgot = nativeAssets.delete(path) || forgot;
      nativeMissingAssets.delete(path);
    }
  nativeDraftAssets.clear();
  if (forgot && nativeModeActive()) updateNativePreviewSources();
  if (scope) void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
}

// Images an image's Address suggests: the branch's and the drafted ones, not deleted ones.
function nativeImagePaths() {
  const scope = draftScope();
  const drafts = scope ? draftStore().list(scope) : [];
  const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
  return [...new Set([
    ...(appStore.snapshot.value?.tree ?? []).filter((entry) => entry.type === "blob" && isImagePath(entry.path)).map((entry) => entry.path),
    ...drafts.filter((draft) => draft.baseSha === null && !draft.deleted && isImagePath(draft.path)).map((draft) => draft.path),
  ])].filter((path) => !gone.has(path)).sort();
}

// Files from the computer as new-file drafts in `folder` (src/uploads.ts), never over something
// that is there, with the shared adding progress at the foot of Files; resolves to the paths added.
// They land in the drop's repository and branch even once another is shown (ticket 23).
async function uploadFilesTo(folder: string, files: File[]): Promise<string[]> {
  const pin = mediaPorts.pin?.();
  if (!pin || !files.length) return [];
  // Where it landed when that is not shown: the branch, with the repository when it is another.
  const where = () => sameRepository(draftScope(), pin.scope) ? pin.scope.branch : `${pin.scope.repo} (${pin.scope.branch})`;
  try {
    const { addFilesTo } = await import("./page-builder/media-files-adding");
    return await addFilesTo(element("explorer-files"), folder, files, { error: errorMessage,
      announce: text => announce(pin.here() ? text : `On ${where()}: ${text}`), context: () => mediaController.workspaceContext(undefined, pin),
      // Pictures not added yet go to Media's Optimise sheet, still bound for this folder.
      review: element("explorer-tabs").hidden ? undefined : (images, into, reasons) => {
        if (!pin.here()) { announce(`Open ${where()} to review these pictures.`); return; }
        openExplorer(); pagesController.selectTab("media");
        void mediaController.reviewInGallery(images, into, reasons).catch(errorMessage);
      } });
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

// Text read for usage (scripts, data, notes…) is kept out of the preview source map and out of
// nativeEffectiveSource, whose readers (the draft store's commit check) know only HTML and CSS.
// Media batches and guarded file operations read it through mediaTextSource.
function mediaTextSource(path: string, scope = draftScope()) {
  const held = nativeEffectiveSource(path, scope);
  const draft = scope ? draftStore().get(scope, path) : undefined;
  if (draft?.opaque && !draft.deleted && scope) {
    const cached = mediaOpaqueText.get(draftKey(scope, path));
    return cached?.sha === draft.sourceSha ? cached?.text : undefined;
  }
  if (held !== undefined || draft) return held;
  return cleanSources.peek("", nativeTextIndexScopeKey(), path);
}
async function readMediaText(path: string) {
  const key = nativeTextIndexScopeKey(), repo = appStore.repository.value;
  const held = mediaTextSource(path);
  if (held !== undefined) return held;
  if (!repo || !key) return undefined;
  const scope = draftScope(), draft = scope ? draftStore().get(scope, path) : undefined;
  if (draft?.deleted) return undefined;
  // An uploaded or moved file (an SVG, say) holds no text in its draft: read its bytes.
  if (scope && draft?.opaque && draft.sourceSha) {
    const text = draft.upload ? await (await uploadBytes().get(uploadKey(scope, draft.sourceSha)))?.text() : await readFile(repo.full_name, draft.sourceSha);
    if (key !== nativeTextIndexScopeKey() || draftStore().get(scope, path) !== draft) return undefined;
    if (text !== undefined) mediaOpaqueText.set(draftKey(scope, path), { sha: draft.sourceSha, text });
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
  return mediaOwnOrigins(nativeSiteSettings(mediaTextSource(NATIVE_CONFIG_PATH)).url, mediaTextSource("CNAME"));
}

// Media context and UI lifecycle use live getters; binary/Undo writes stay here.
const mediaPorts: import("./controllers/media-controller").MediaControllerPorts = {
  measureImage: (path, node, image, slot, style) => nativePreview && nativeSite?.routes[nativePreview.shownRoute() ?? ""] === path
    ? nativePreview.measureImage({ path, node, slot, style, ...(image.width && image.height ? { image: { width: image.width, height: image.height } } : {}) }) : Promise.resolve(undefined),
  origins: mediaOrigins,
  usage: {
    key: () => nativeTextIndexScope === nativeTextIndexScopeKey() ? nativeTextIndexScopeKey() : "", files: nativeFiles,
    pages: () => Object.values(nativeSite?.routes ?? {}), components: () => nativeSite?.components ?? {},
    source: path => mediaTextSource(path), read: readMediaText,
    url: () => nativeSiteSettings(mediaTextSource(NATIVE_CONFIG_PATH)).url,
    settled: () => nativeTextIndexing ?? Promise.resolve(), changed: () => {},
  },
  cleanUp: { place: setupScope },
  // Improve images opens each page so its pictures are measured; the canvas draws it a moment later (at most 5 s).
  showPage: async path => {
    if (appStore.openFile.value !== path) await openAfter(path, true, true);
    for (let wait = 0; wait < 50 && nativeSite?.routes[nativePreview?.shownRoute() ?? ""] !== path; wait++) await new Promise(done => setTimeout(done, 100));
  },
  workspace: () => {
    const repo = appStore.repository.value, scope = draftScope();
    if (!repo || !scope || !appStore.snapshot.value) return undefined;
    return { repo: repo.full_name, repoSize: repo.size, scope, identity: mediaIdentity(), site: nativeSite,
      nativePaths: nativeSite ? nativeFiles(scope) : undefined, drafts: draftStore() };
  },
  // The workspace shown, for work to finish in (ticket 23): the editor's reads while it is on show,
  // then its snapshot's, the branch texts read so far and its drafts.
  pin: () => {
    const repo = appStore.repository.value, scope = draftScope(), snapshot = appStore.snapshot.value; if (!repo || !scope || !snapshot) return undefined;
    const at = workspaceSession.begin(), here = () => onShow(at);
    const site = nativeSite, base = nativeBaseFiles, texts = new Map(nativeBaseSources), key = nativeTextIndexScopeKey(), files = () => nativeFiles(scope, here() ? nativeBaseFiles : base);
    const entry = (path: string) => here() ? entryAt(path) : repositoryIndex.entry(repo, snapshot, path);
    const text = (path: string, draft = draftStore().get(scope, path), sha = entry(path)?.sha) => draft ? draft.deleted || draft.opaque ? undefined : draft.content
      : texts.get(path) ?? cleanSources.peek("", key, path) ?? (sha && cleanSources.peek(repo.full_name, sha));
    return { repo: repo.full_name, repoSize: repo.size, scope, identity: mediaIdentity(), site, drafts: draftStore(), here, entry, files, get nativePaths() { return site && files(); },
      list: () => listRepositoryFiles(repo, snapshot), find: path => here() ? findEntry(path) : repositoryIndex.find(api, repo, snapshot, path),
      source: path => here() ? mediaTextSource(path, scope) : text(path), remember: (path, source) => { if (here()) mediaPorts.rememberSource(path, source); } };
  },
  identity: mediaIdentity,
  stamp: () => guardedEdits.stamp("repository"),
  generation: currentLoad,
  selected: (path, node) => appStore.selection.value?.path === path && appStore.selection.value.node?.join(".") === node.join("."),
  source: (path, scope) => mediaTextSource(path, scope),
  listPaths: async () => { const repo = appStore.repository.value, snapshot = appStore.snapshot.value; if (!repo || !snapshot) throw new Error("Choose a repository before opening Media."); return listRepositoryFiles(repo, snapshot); },
  findEntry,
  entry: entryAt,
  readText: readFile,
  rememberSource: (path, source) => {
    // Native preview sources stay separate from the wider text index.
    if (/\.(?:html|css)$/i.test(path) || path === MEDIA_RECORDS_PATH) nativeBaseSources.set(path, source);
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
    frame: () => document.querySelector(".native-preview-frame")?.getBoundingClientRect(),
    look: (target, look) => nativePreview?.imageLook(target, look),
    scroll: dy => nativePreview?.scrollBy(dy),
    // Read as the canvas reads its images, so the page can show a replacement too.
    picture: async path => {
      if (!nativeAssets.has(path)) await loadNativeAssets({ [appStore.openFile.value ?? "index.html"]: `<img src="${siteAddress(path, nativePrefix()).replace(/&/g, "&amp;")}">` });
      return nativeAssets.get(path);
    },
  },
  mediaPlay: {
    send: (id, request, blob) => nativePreview?.playMedia(id, request, blob),
    box: () => nativePreview?.selectionBox() ?? undefined,
    frame: () => document.querySelector(".native-preview-frame")?.getBoundingClientRect(),
    watch: (listener) => appStore.selection.subscribe(listener),
  },
  openPage: openAfter,
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
async function applyMediaBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch, pin?: MediaPin) {
  const opened = appStore.openFile.value, module = await loadMediaBatch();
  await module.applyMediaBatch({
    appStore, editor: editorModule, mediaHistoryHome, site: () => nativeSite, load: loadMediaWorkspace, stamp: () => guardedEdits.stamp("repository"),
    listRepositoryFiles, nativeFiles, draftStore, bytes: uploadBytes, mediaTextSource, entryAt, findEntry, announce,
    refresh: () => { afterFileChanges(); updateNativePreviewSources(); if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
  }, scope, stamp, batch, pin, opened);
}

// After a successful save, the committed content becomes the new clean baseline.
// Without this, `reconcilePublished` drops each committed browser draft (a draft
// whose content equals its baseline is pruned), so a saved file that is not the
// open editor model would otherwise fall back to the stale pre-save
// `nativeBaseSources` and the preview would revert to the old content. Guarded so
// a repo/branch switch that superseded the in-flight save never leaks results.
function adoptNativeBaseSources(
  scope: { account: string; repoId: number; branch: string },
  result: PublishResult,
  submitted: SavedDraft[],
) {
  if (!nativeEngaged || !holdsDraftScope(shownScope(), scope)) return;
  const removed = new Set(result.deleted ?? []);
  for (const draft of submitted) {
    if (draft.deleted) {
      if (!removed.has(draft.path)) continue;
      nativeBaseSources.delete(draft.path);
      nativeBaseFiles = nativeBaseFiles.filter((path) => path !== draft.path);
      continue;
    }
    if (!draft.opaque) nativeBaseSources.set(draft.path, draft.content);
    if (!nativeBaseFiles.includes(draft.path)) nativeBaseFiles = [...nativeBaseFiles, draft.path];
  }
  if (nativeModeActive()) updateNativePreviewSources();
}

function deactivateNative() {
  pendingNativePageTitles = undefined;
  mediaController.disposeGallery();
  mediaController.closePicker();
  nativeSite = undefined;
  pagesController.updateTabs();
  nativeBaseFiles = [];
  nativeEngaged = false;
  nativeBaseSources.clear();
  mediaOpaqueText.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
  nativeStyleFiles.clear();
  nativeMissingStyleFiles.clear();
  nativeStyleFileRequests.clear();
  nativeUnreadableFiles.clear();
  nativeShownRequests.clear();
  nativeTextIndexing = undefined;
  nativeTextIndexed = false;
  releaseNativeTextIndex = undefined;
  nativeAssets.clear();
  nativeMissingAssets.clear();
  nativeAssetRequests.clear();
  nativeBodyStyles = undefined;
  nativeSourcesRequest++;
  nativePreview?.deactivate();
}

async function loadNativeComponentStyles(tags: string[]) {
  if (!nativeSite || !appStore.repository.value || !appStore.snapshot.value) return;
  const site = nativeSite;
  const repo = appStore.repository.value.full_name;
  const request = nativeSourcesRequest;
  const at = workspaceSession.begin();
  const wanted = tags.filter((tag) =>
    Object.hasOwn(site.components, tag) &&
    !nativeComponentStyles.has(tag) &&
    !nativeMissingComponentStyles.has(tag) &&
    !nativeComponentStyleRequests.has(tag),
  );
  if (!wanted.length) return;
  wanted.forEach((tag) => nativeComponentStyleRequests.add(tag));
  try {
    const found: { tag?: string; path: string; sha: string }[] = [];
    const scope = draftScope();
    const lookups: { tag?: string; path: string }[] = [];
    for (const tag of wanted) {
      const path = nativeComponentCssPath(site.components[tag]);
      // A stylesheet drafted here (new, or moved with its component) is its draft; a deleted one is missing.
      const draft = scope ? draftStore().get(scope, path) : undefined;
      // One that cannot be read as text is the component's all the same: it styles nothing.
      if ((draft && !draft.deleted) || (!draft && (nativeBaseSources.has(path) || nativeUnreadableFiles.has(path)))) nativeComponentStyles.set(tag, path);
      else if (draft?.deleted) nativeMissingComponentStyles.add(tag);
      else lookups.push({ tag, path });
      // A component the page made on the fly, before the text index read its template.
      const template = site.components[tag];
      if (!nativeBaseSources.has(template) && !nativeUnreadableFiles.has(template) && !(scope && draftStore().get(scope, template))) lookups.push({ path: template });
    }
    // Looked up together, read in one request.
    const entries = await Promise.all(lookups.map((lookup) => findEntry(lookup.path)));
    if (!at.holds() || request !== nativeSourcesRequest || nativeSite !== site) return;
    lookups.forEach((lookup, index) => {
      const entry = entries[index];
      if (entry) found.push({ ...lookup, sha: entry.sha });
      else if (lookup.tag) nativeMissingComponentStyles.add(lookup.tag);
    });
    const { texts, unreadable } = await readNativeTexts(repo, found);
    if (!at.holds() || request !== nativeSourcesRequest || nativeSite !== site) return;
    noteNativeUnreadable(unreadable);
    for (const file of found) {
      const text = texts.get(file.path);
      if (!nativeBaseSources.has(file.path) && text !== undefined) nativeBaseSources.set(file.path, text);
      if (file.tag) nativeComponentStyles.set(file.tag, file.path);
    }
  } finally {
    wanted.forEach((tag) => nativeComponentStyleRequests.delete(tag));
  }
  if (at.holds() && request === nativeSourcesRequest && nativeSite === site) updateNativePreviewSources();
}

// Every file on the branch, from the snapshot's recursive tree when it has
// one, else from one recursive listing per top-level folder.
async function listRepositoryFiles(repo: Repository, result: Snapshot): Promise<string[]> {
  return repositoryIndex.listRepositoryFiles(api, repo, result);
}

// The site as edited, for Download site and the site's address: every file
// of the repository with its drafts. Undefined when no native site is open.
async function nativeSiteFiles(): Promise<SiteFiles | undefined> {
  const repo = appStore.repository.value;
  const scope = draftScope();
  if (!repo || !scope || !nativeModeActive()) return undefined;
  const draftAt = (path: string) => draftStore().get(scope, path);
  return {
    repository: repo.full_name,
    paths: nativeFiles(scope),
    held: (path) => nativeEffectiveSource(path, scope),
    blob: async (path) => {
      const draft = draftAt(path);
      if (draft?.deleted) return undefined;
      if (draft?.opaque) return draft.sourceSha;
      return (await findEntry(path))?.sha;
    },
    readTexts: (shas) => readFiles(repo.full_name, shas),
    readBytes: async (sha) => new Uint8Array(await (await readBlob(repo.full_name, sha)).arrayBuffer()),
  };
}

// The files read with the site (pages, templates, stylesheets), so links
// to a page are found in all of them; at most 2000.
const isNativeTextFile = (path: string) => /\.(?:html|css)$/i.test(path) && !path.startsWith("node_modules/");

// Every file of the site as drafted: the branch's not deleted, renamed or
// moved away, and new files drafted in the browser in `scope`. Pages and
// components are found from these.
function nativeFiles(scope = draftScope(), base = nativeBaseFiles): string[] {
  const drafts = scope ? draftStore().list(scope) : [];
  const drafted = drafts.filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path);
  const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
  return [...new Set([...base.filter((path) => !gone.has(path)), ...drafted])];
}

// A repository with `index.html` at its root is a native site: its files
// are listed, what the page on show (`openPath`, else the home page) needs
// is read from the current snapshot, and the native preview activates; the
// rest of the site follows after the first paint (the text index). All async
// steps are guarded against a superseding navigation (`at`).
async function activateNativeSite(repo: Repository, result: Snapshot, at: SessionStamp, openPath?: string) {
  const request = ++nativeSourcesRequest;
  // A new read: until its text index lands, nothing counts as indexed.
  nativeTextIndexed = false;
  const live = () => at.holds() && request === nativeSourcesRequest;
  const placeholder: NativeSite = { routes: { "/": NATIVE_HOME_PAGE }, components: {} };
  const scope = draftScope();
  // The home page first. Without it the project opens as plain files; once
  // it is there, the project is native and every later failure surfaces as
  // a native error rather than silently hiding the preview.
  // A home page written as a draft (Start your site) counts: the site is native before its first save.
  const draftedHome = scope ? draftStore().get(scope, NATIVE_HOME_PAGE) : undefined;
  if (!result.entries.some((entry) => entry.path === NATIVE_HOME_PAGE && entry.type === "blob") && !(draftedHome && draftedHome.baseSha === null && !draftedHome.deleted)) return false;
  nativeEngaged = true;
  // Load the preview runtime, parked, alongside the file listing and page reads.
  nativePreview?.preload();
  nativeSite = undefined;
  try {
    nativeBaseFiles = await listRepositoryFiles(repo, result);
  } catch (error) {
    if (!live()) return true;
    // GitHub not answering fails the open itself (the snapshot load's failed state and Try again).
    if (unanswered(error)) throw error;
    nativePreview?.activate(placeholder);
    nativePreview?.setError(error instanceof Error ? error.message : "The site's files could not be listed.");
    return true;
  }
  if (!live()) return true;
  const parsed = resolveNativeProject(nativeFiles(scope));
  if (!parsed.ok) {
    nativePreview?.activate(placeholder);
    nativePreview?.setWarnings([]);
    nativePreview?.setError(parsed.error);
    return true;
  }
  const site = parsed.site;
  nativeBaseSources.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
  nativeStyleFiles.clear();
  nativeMissingStyleFiles.clear();
  nativeStyleFileRequests.clear();
  noteNativeUnreadable(undefined);
  nativeShownRequests.clear();
  nativeAssets.clear();
  nativeMissingAssets.clear();
  nativeAssetRequests.clear();
  try {
    // Only what the page on show needs renders first (src/native-boot.ts):
    // the page, its stylesheets with their imports and the components it
    // uses with theirs, a level at a time, each level's files in one read.
    // The site settings come too, for new pages' addresses. Every other
    // page and template is the text index, read after the first paint.
    const files = nativeFiles(scope);
    const opening = openPath && nativeSitePaths(site).includes(openPath) ? openPath : undefined;
    const currentFile = opening ?? (appStore.openFile.value && nativeSitePaths(site).includes(appStore.openFile.value) ? appStore.openFile.value : site.routes[nativeDefaultRoute(site)]);
    // A component shown alone is drawn in the home page.
    const shownPages = [...new Set([nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)], currentFile])];
    // Small sites' component templates (with their stylesheets) come with the page in its first read.
    const bootSize = (path: string) => {
      if (scope && draftStore().get(scope, path)) return 0;
      const entry = entryAt(path);
      return entry?.type === "blob" ? entry.size : undefined;
    };
    const extras = nativeBootExtras(site, files, bootSize);
    // So do the site's own stylesheets when small: the sheets the page links and
    // their imports then need no serial reads before the paint.
    const styleExtras = nativeBootStyleExtras(site, files, bootSize);
    await readNativeShownFiles(repo.full_name, site, shownPages, live, [...(files.includes(NATIVE_CONFIG_PATH) ? [NATIVE_CONFIG_PATH] : []), ...extras], styleExtras);
    if (!live()) return true;
    // A page or template the page on show needs that cannot be read as text
    // fails the load with its path (known only once the sources that use it
    // are read: an extra read with them may be unused).
    const needed = nativeUnreadableShown(site, shownPages);
    if (needed) throw new Error(needed);
    // The stylesheets the pages link, and the files those import, render
    // with the first update; one that cannot be read is reported by the
    // preview, not here.
    try {
      await readNativeStyleFiles(repo.full_name, site, live);
    } catch {
      // Reported by the preview as a missing stylesheet.
    }
    if (!live()) return true;
    // The page's fonts get a short head start so its text does not show in a
    // fallback font first; images never hold the page back: they are read
    // after it is drawn and shown in place (see nativeAssets).
    await Promise.race([
      loadNativeAssets(nativePageShownSources(site, nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)]), () => { if (nativeSite === site) updateNativePreviewAssets(); }, (path) => isFontType(assetType(path)), true).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, NATIVE_FONT_WAIT_MS)),
    ]);
    if (!live()) return true;
  } catch (error) {
    if (!live()) return true;
    if (unanswered(error)) throw error;
    nativePreview?.activate(site);
    nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
    return true;
  }
  if (!live()) return true;
  nativeSite = site;
  pageStructure?.refreshMeta();
  updateCurrentPageLabel();
  nativePreview?.setError(undefined);
  showNativeWarnings(parsed.warnings);
  nativePreview?.activate(site);
  nativePreview?.update({
    sources: withSiteConfig(nativeSources()),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    assets: Object.fromEntries(nativeAssets),
    unreadable: nativePreviewUnreadable(),
    // The page about to open shows at once (its file opens next).
    route: nativeRouteForPath(appStore.openFile.value ?? openPath) ?? nativeDefaultRoute(site),
    editableTemplatePath: previewSelection.editableTemplatePath(),
  });
  updateAgentContext();
  startNativeTextIndex(repo, site, scope, at, request, true);
  return true;
}

function nativeTextIndexScopeKey() {
  return appStore.repository.value && appStore.snapshot.value && nativeSite ? `${appStore.repository.value.full_name}\n${appStore.snapshot.value.branch}\n${appStore.snapshot.value.commit}\n${nativeSourcesRequest}` : "";
}

// The site's text index: every page, template and stylesheet (with the
// editor's page data), so links, search, shared sections and agents see the
// whole site. At boot (`deferred`) it is read once the preview has painted
// and the browser is idle; anything that needs it sooner asks for it
// (ensureNativeTextIndex, wantNativeTextIndex) and it is read at once.
let releaseNativeTextIndex: (() => void) | undefined;
let nativeTextIndexed = false;
function startNativeTextIndex(repo: Repository, site: NativeSite, scope: ReturnType<typeof draftScope>, at: SessionStamp, request: number, deferred = false) {
  nativeTextIndexScope = nativeTextIndexScopeKey();
  nativeTextIndexed = false;
  const commit = appStore.snapshot.value?.commit;
  const live = () => at.holds() && request === nativeSourcesRequest && appStore.snapshot.value?.commit === commit && nativeSite === site;
  let release!: () => void;
  const due = new Promise<void>((resolve) => { release = resolve; });
  releaseNativeTextIndex = release;
  if (deferred) afterNativePaint(request, release);
  else release();
  const indexing: Promise<boolean> = due.then(() => (live() ? indexNativeTextFiles(repo, site, scope, live) : false)).then((done) => {
    if (done && live() && nativeTextIndexing === indexing) nativeTextIndexed = true;
    if (live()) mediaController.refreshUsage();
    return done;
  }, (error) => {
    if (live() && nativeSite === site) nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
    return false;
  });
  nativeTextIndexing = indexing;
}
/** Starts the text index now, if it is waiting for the first paint. */
function wantNativeTextIndex() {
  releaseNativeTextIndex?.();
}
// The text index as a gate (src/native-boot.ts): waited for without being
// asked for sooner, and only a complete read for the open repository,
// branch and commit counts.
const nativeTextIndexGate: SiteIndexGate = {
  key: () => `${currentLoad()}\n${nativeTextIndexScopeKey()}`,
  indexed: () => !nativeSite || nativeTextIndexed,
  settled: () => (nativeTextIndexing ? nativeTextIndexing.catch(() => false) : Promise.resolve(nativeTextIndexed)),
  ensure: () => ensureNativeTextIndex(),
};

// Work that waits for a native site's first paint (the runtime reporting the
// page's structure), then for the browser to be idle. A preview that does
// not paint (an error) holds nothing back for long.
let nativePaintedRequest = -1;
// The files read for the last first paint, for the boot memory.
let nativePaintedPaths: string[] = [];
let nativePaintWaiters: { request: number; run: () => void }[] = [];
const whenIdle = (run: () => void) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => run(), { timeout: 300 });
  else setTimeout(run, 50);
};
function afterNativePaint(request: number, run: () => void) {
  if (nativePaintedRequest === request) { whenIdle(run); return; }
  nativePaintWaiters = nativePaintWaiters.filter((waiter) => waiter.request === nativeSourcesRequest);
  nativePaintWaiters.push({ request, run });
  setTimeout(run, 10_000);
}
function noteNativePainted() {
  if (nativePaintedRequest === nativeSourcesRequest) return;
  nativePaintedRequest = nativeSourcesRequest;
  nativePaintedPaths = [...nativeBaseSources.keys()];
  const due = nativePaintWaiters.filter((waiter) => waiter.request === nativePaintedRequest);
  nativePaintWaiters = [];
  // The runtime reports the structure just before the frame presents it:
  // two frames and a beat later the page is on screen.
  if (due.length) requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => due.forEach((waiter) => whenIdle(waiter.run)), 100)));
}

// Titles loaded while a row is being used wait until that interaction ends.
// The originating index and explorer must still be current when work resumes.
let pendingNativePageTitles: { host: HTMLElement; live(): boolean } | undefined;
let nativePageTitlePointer: { id: number } | undefined;
// Capture before a row menu's outside-pointer listener or an input's blur.
// The click may stop propagation, so observe it in capture but finish in a task
// after that click's target handlers have completed. Mouse pointerup also queues
// a no-click fallback. Touch/pen wait for their potentially delayed click, but
// only for a grace period: the gesture may end without a click, and the click
// need not carry the same pointerId.
const NATIVE_PAGE_TITLE_TAP_GRACE_MS = 1000;
document.addEventListener("pointerdown", event => {
  if (event.button === 0) nativePageTitlePointer = { id: event.pointerId };
}, true);
function finishNativePageTitlePointer(event?: Event) {
  const pointer = nativePageTitlePointer;
  if (pointer === undefined || event instanceof PointerEvent && event.pointerId !== pointer.id) return;
  setTimeout(() => {
    if (nativePageTitlePointer !== pointer) return;
    nativePageTitlePointer = undefined;
    flushPendingNativePageTitles();
  }, 0);
}
document.addEventListener("click", finishNativePageTitlePointer, true);
document.addEventListener("pointerup", event => {
  if (event.pointerType === "mouse") {
    finishNativePageTitlePointer(event);
    return;
  }
  const pointer = nativePageTitlePointer;
  if (pointer?.id !== event.pointerId) return;
  setTimeout(() => {
    if (nativePageTitlePointer === pointer) finishNativePageTitlePointer();
  }, NATIVE_PAGE_TITLE_TAP_GRACE_MS);
}, true);
document.addEventListener("pointercancel", finishNativePageTitlePointer, true);
document.addEventListener("dragend", finishNativePageTitlePointer, true);
window.addEventListener("blur", finishNativePageTitlePointer);

function pagesBusy(explorer: HTMLElement) {
  return nativePageTitlePointer !== undefined || Boolean(pagesTree?.busy()) || explorer.matches(":popover-open") &&
    Boolean(explorer.querySelector("[role=menu]:not([hidden]), input:focus, [popover]:popover-open:not(.editor-toast)"));
}
function flushPendingNativePageTitles() {
  const pending = pendingNativePageTitles;
  if (!pending) return;
  // A menu action can open Rename or a URL editor in the same turn.
  queueMicrotask(() => {
    if (pendingNativePageTitles !== pending) return;
    if (!pending.live() || pending.host !== element("explorer")) { pendingNativePageTitles = undefined; return; }
    if (pagesBusy(pending.host)) return;
    // render() closes row interactions itself: consume this work before rendering.
    pendingNativePageTitles = undefined;
    pagesController.renderTree();
  });
}

async function indexNativeTextFiles(repo: Repository, site: NativeSite, scope: ReturnType<typeof draftScope>, live: () => boolean) {
  const files = nativeFiles(scope).filter((path) => isNativeTextFile(path)).slice(0, 2000);
  const wanted = files.filter((path) => {
    const draft = scope ? draftStore().get(scope, path) : undefined;
    return !nativeBaseSources.has(path) && !nativeUnreadableFiles.has(path) && draft?.baseSha !== null && !draft?.deleted;
  });
  const entries = await Promise.all(wanted.map((path) => findEntry(path)));
  if (!live() || nativeSite !== site) return false;
  const sources = wanted.flatMap((path, index) => (entries[index] ? [{ path, sha: entries[index]!.sha }] : []));
  // A file GitHub cannot give as text is skipped: the index is complete
  // without it, and whatever needs its text says so where it is used.
  const { texts, unreadable } = await readNativeTexts(repo.full_name, sources);
  if (!live() || nativeSite !== site) return false;
  if (unreadable.length) { noteNativeUnreadable(unreadable); nativePreviewBehind = true; }
  const loaded: string[] = [];
  for (const source of sources) {
    const text = texts.get(source.path);
    if (nativeBaseSources.has(source.path) || !nativeBaseFiles.includes(source.path) || text === undefined) continue;
    nativeBaseSources.set(source.path, text);
    loaded.push(source.path);
  }
  if (loaded.length) {
    // The page on show is drawn again only when what it shows was read
    // (a template, its stylesheets): other pages reach the preview with the
    // next update, or when a link shows one (onRouteShown), so a text edit
    // under way is not interrupted by a redraw.
    const templates = new Set(Object.values(site.components));
    const shown = nativeShownPaths();
    if (loaded.some((path) => templates.has(path) || shown.has(path))) updateNativePreviewSources();
    else { nativePreviewBehind = true; nativePreview?.choicesChanged(); }
    // Titles, headings and templates of every page are known now.
    updateAgentContext();
    pageStructure?.refreshMeta();
    // An open Pages & files with a menu or a rename on a row keeps its rows
    // until the interaction ends; otherwise titles show at once (the pane mounts
    // before the index is read, so Pages may well be open by now).
    const explorer = element("explorer");
    if (pagesBusy(explorer)) pendingNativePageTitles = { host: explorer, live };
    else pagesController.renderTree();
    updateCurrentPageLabel();
    componentTools?.refresh();
  }
  return true;
}

async function ensureNativeTextIndex() {
  wantNativeTextIndex();
  const before = nativeTextIndexScopeKey();
  if (nativeTextIndexing && nativeTextIndexScope !== before) {
    if (!appStore.repository.value || !appStore.snapshot.value || !nativeSite) return "The repository changed meanwhile. Try again.";
    startNativeTextIndex(appStore.repository.value, nativeSite, draftScope(), workspaceSession.begin(), nativeSourcesRequest);
  }
  let ready = nativeTextIndexing ? await nativeTextIndexing : true;
  if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  if (!ready && appStore.repository.value && nativeSite) {
    const repo = appStore.repository.value, site = nativeSite, scope = draftScope(), at = workspaceSession.begin(), request = nativeSourcesRequest;
    nativeTextIndexing = undefined;
    startNativeTextIndex(repo, site, scope, at, request);
    ready = await nativeTextIndexing!;
    if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  }
  return ready ? undefined : "The site's links could not be fully read. Refresh the repository and try again.";
}

function updatePreview() {
  updateNativePreview();
}

function setCurrentPage(path?: string) {
  if (versions.view && versions.view.path !== path) versions.end(false);
  batch(() => {
    appStore.openFile.value = path;
    closeEditor();
  });
  updateAgentContext();
  updatePreview();
  // Another page re-links its own stylesheet once it opens; anything else closes the pane.
  if (linkedStyle && path !== linkedStyle.page) {
    linkedStyle = undefined;
    closeSecondary();
  }
  updateCurrentPageLabel();
  element("primary-title").textContent = path ?? "";
  componentTools?.refresh();
  element("explorer-toggle").title = path
    ? `Pages & files — ${path}`
    : "Pages & files";
}

// The top bar names the open file: a page of the native site as the Pages
// tab labels it (its `<title>`, else its first heading, else its URL;
// "Home" for the home page), anything else by
// its path, which the button's tooltip and `data-path` always give.
function updateCurrentPageLabel() {
  const path = appStore.openFile.value;
  const span = element("current-page");
  const route = nativeRouteForPath(path);
  const label = path && route && nativeSite
    ? nativePageLabel(path, {
      routes: nativeSite.routes,
      titles: { [route]: nativeRouteInfo(route).title },
      heading: (file) => firstHeadingText(nativeEffectiveSource(file)),
    })
    : undefined;
  const text = label ?? path ?? "Select a page";
  if (span.textContent !== text) span.textContent = text;
  if (path) span.dataset.path = path;
  else delete span.dataset.path;
}

function openExplorer() {
  explorerDropdown?.open();
}

let repositories: Repository[] = [];
// Unset until start() has read the session.
let info: SessionInfo;
let fileGeneration = 0;

// Immutable blobs share the tab's disposable byte budget with pinned baselines.
function readFile(repo: string, sha: string): Promise<string> {
  return readFileText(api, cleanSources, repo, sha);
}
// Reads many blobs in one request; anything already cached or in flight is
// reused rather than fetched twice.
async function readFiles(repo: string, shas: string[]): Promise<Record<string, string>> {
  return readFileTexts(api, cleanSources, repo, shas);
}
// The native site's reads: files GitHub cannot give as text are named, not thrown.
function readNativeTexts(repo: string, files: { path: string; sha: string }[]) {
  return readSiteTexts(files, (shas) => readFiles(repo, shas));
}
// Remembers files that cannot be read as text (none: forgets them all): the
// preview leaves them out quietly, and a stylesheet among them is a warning.
function noteNativeUnreadable(files: UnreadableFile[] | undefined) {
  if (!files) nativeUnreadableFiles.clear();
  else if (!files.length) return;
  for (const file of files ?? []) nativeUnreadableFiles.set(file.path, file.message);
  nativePreview?.setUnreadable(nativePreviewUnreadable());
  showNativeWarnings();
}
// The first page or template the pages `pages` show that cannot be read as
// text and has no draft in its place, as "path: why".
function nativeUnreadableShown(site: NativeSite, pages: string[]) {
  const scope = draftScope(), files = new Set(nativeFiles(scope));
  const source = (path: string) => nativeEffectiveSource(path, scope);
  return unreadableNeededFile(nativeShownFiles(site, pages, source, (path) => files.has(path), nativePrefix()).files, (path) => source(path) !== undefined, nativeUnreadableFiles);
}
// The unreadable files with no draft (or History's earlier version) in their
// place: the preview draws a page or template from that, and lets one without
// say why it cannot.
function nativePreviewUnreadable() {
  const scope = draftScope();
  return new Map([...nativeUnreadableFiles].filter(([path]) => path !== versions.view?.path && nativeEffectiveSource(path, scope) === undefined));
}
function showNativeWarnings(projectWarnings = nativeProjectWarnings) {
  nativeProjectWarnings = projectWarnings;
  const sheets = [...nativeUnreadableFiles].filter(([path]) => /\.css$/i.test(path))
    .map(([path, message]) => `${path}: ${message} The preview shows the site without it.`);
  nativePreview?.setWarnings([...projectWarnings, ...sheets]);
}

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

// Everything open goes before the login page shows (renderLogin, src/setup-host.ts).
function closeWorkspace() {
  workspaceBoot.dropGuess();
  paletteController.dispose();
  agentController.destroy();
  setupController.dispose();
  setupEntry.remove();
  versions.history.destroy();
  activeFileContext = null;
  explorerDropdown?.destroy();
  explorerDropdown = undefined;
  sidebarResize?.dispose();
  sidebarResize = undefined;
  blockRail?.dispose();
  blockRail = undefined;
  closeEditor();
  deactivateNative();
  nativePreview?.destroy();
  nativePreview = undefined;
  linkedStyleSourceByPath.clear();
  editorModule?.clearDrafts();
  mediaHistoryHome.clear();
  nextLoad();
  fileGeneration++;
  repositoryMenu?.destroy();
  repositoryMenu = undefined;
  siteActions?.destroy();
  siteActions = undefined;
  repositories = [];
  boot.reset();
  appStore.reset();
  repositoryIndex.clear();
  cleanSources.clear();
}

// Login, Start your site, the Setup checklist and wizard, and Get started (src/setup-host.ts).
const setup = createSetupHost({
  app, element, appStore, workspaceSession, closeWorkspace, setupScope, draftScope, draftStore, nativeEffectiveSource, api,
  get info() { return info; }, get repositories() { return repositories; }, get content() { return content; },
  get repositoryMenu() { return repositoryMenu; }, get nativeEngaged() { return nativeEngaged; },
  get agentPrompts() { return agentPrompts; }, get onboardingCopy() { return onboardingCopy; },
  get boot() { return boot; }, get agentController() { return agentController; },
  loadRepositories: (prefetched) => loadRepositories(prefetched),
  loadSetupActions, loadWizard, loadChecklist, loadSpotlight, loadGetStarted, loadStartSite, loadAgentPrompts,
  status, errorMessage, refuse,
});
const {
  renderLogin, startSitePanel, setupController, setupEntry, showGetStarted, checkNewRepositories,
  rememberRepositories, knownRepositories, rememberStartingPoint, takeStartingPoint,
  rememberPartialStart, readPartialStart, forgetPartialStart, offerFinishStarter, removeFinishStarter, writeStartingPoint,
} = setup;

/** Account, repository and branch the checklist is of. */
function setupScope() { return setupKeyOf(shownScope()); }

function showDirectory(directory: Directory, path = "") {
  fileGeneration++;
  setCurrentPage();
  if (!path && !nativeEngaged && appStore.repository.value && appStore.snapshot.value) {
    const host = content, at = workspaceSession.begin(), fileEpoch = fileGeneration;
    void startSitePanel().then((panel) => {
      if (host === content && at.holds() && fileGeneration === fileEpoch) host.replaceChildren(panel);
    }).catch(errorMessage);
    return;
  }
  const panel = node("section", "directory-summary");
  panel.append(
    node("span", "badge", nativeEngaged ? "✦ Native site" : "Explore this folder"),
    node(
      "h1",
      "",
      path.split("/").at(-1) || appStore.repository.value?.name || "Your project",
    ),
    node(
      "p",
      "intro",
      nativeEngaged
        ? `${directory.entries.length} entries. Pages, components and styles render live in the preview.`
        : `${directory.entries.length} entries. Add index.html at the top of the repository to preview this project in the browser.`,
    ),
  );
  const meta = node("dl", "project-meta");
  for (const [label, value] of [
    ["Repository", appStore.repository.value?.full_name ?? ""],
    ["Branch", appStore.snapshot.value?.branch ?? ""],
    ["Revision", appStore.snapshot.value?.commit.slice(0, 12) ?? ""],
    ["Folder", path || "/"],
  ]) {
    const row = node("div");
    row.append(node("dt", "", label), node("dd", "", value));
    meta.append(row);
  }
  panel.append(
    meta,
    node(
      "div",
      "next-step",
      "Open a file to edit it. Drafts are saved in this browser; publish selected files when they are ready.",
    ),
  );
  content.replaceChildren(panel);
}

// Paths of the new files (drafts with no base blob) in the current scope.
function newDraftPaths(scope = draftScope()) {
  return scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path) : [];
}

// The drafts as the tree shows them: each path's change (A, M, R, D), the
// deletions by path, and the new paths (new and renamed files).
interface TreeState {
  changes: Map<string, FileChange>;
  deleted: Map<string, SavedDraft>;
  drafted: string[];
}
function treeState(scope = draftScope()): TreeState {
  const drafts = scope ? draftStore().list(scope) : [];
  const changes = listChanges(drafts);
  return {
    changes: new Map(changes.map((change) => [change.path, change])),
    deleted: new Map(drafts.filter((draft) => draft.deleted).map((draft) => [draft.path, draft])),
    drafted: drafts.filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path),
  };
}
let filesTree: ReturnType<typeof createFilesTreeController> | undefined;
// Folder listings by tree SHA (content-addressed, so never stale) for path checks before the tree loads.
const spareListings = new Map<string, Directory["entries"]>();
// Files is on show: its tab, or the only panel of a repository with no site (its tab state stays "pages").
const filesShown = () => !!explorerDropdown?.isOpen() && (pagesController.explorerTab() === "files" || !element("explorer-files").hidden);
const filesTreeController = {
  refresh: () => filesTree ? filesTree.refresh() : mediaController.requestGalleryRefresh(), render: () => filesTree?.render(), reset: () => { spareListings.clear(); filesTree?.reset(); },
  shown: () => filesTree?.shown(), row: (path: string) => filesTree?.row(path),
  openFolder: (path: string) => filesTree?.openFolder(path), listings: () => filesTree?.listings() ?? spareListings, visible: filesShown,
};
let explorerMount: Promise<void> | undefined;
function ensureExplorer() {
  if (filesTree) return ensurePagesTree();
  if (explorerMount) return explorerMount;
  const host = element("explorer");
  const pending = loadExplorerModules().then(async ({ createCreateDialog, createFileRowActions, createConfirmDialog, createPagePicker, createFilesTreeController }) => {
    if (!host.isConnected || host !== document.getElementById("explorer")) return;
    createDialog = createCreateDialog({
      plan: (request) => {
        const planned = planCreation(request);
        return planned.ok ? { ok: true, summary: planned.value.summary } : planned;
      },
      create: createFromRequest,
    });
    element("explorer").append(createDialog.root);
    confirmDialog ??= createConfirmDialog();
    element("explorer").append(confirmDialog.root);
    pagePicker = createPagePicker();
    element("explorer").append(pagePicker.root);
    fileActions = createFileRowActions({
      host: element("explorer-files"),
      items: fileRowItems,
      checkRename: (target, name) => renameProblem(target, name),
      rename: renameFileTarget,
      remove: (target) => void fileOps!.deleteFileTarget(target),
      dropProblem: (source, folder) => dropProblem(source, folder),
      drop: (source, folder) => void dropFileTarget(source, folder),
      dropFiles: (files, folder) => void uploadFilesTo(folder, files),
      announce,
    });
    fileActions.attachRoot(files);
    fileActions.attachRoot(element("explorer-files").querySelector<HTMLElement>(".files-heading")!);
    filesTree = createFilesTreeController({
      ui: { node, button, setIcon },
      snapshot: () => appStore.snapshot.value, repo: () => appStore.repository.value,
      openFile: () => appStore.openFile.value, epoch: currentLoad, root: () => files,
      state: treeState, scope: draftScope, draft: (scope, path) => draftStore().get(scope, path),
      load: input => api<Directory>("tree", input), images: () => mediaController.requestGalleryRefresh(),
      clearError, error: errorMessage, status, announce, refuse, intent: (path) => previewSelection.recordIntent(path),
      openDraft: openNewDraft, openEntry: (entry, path, epoch) => openEntry(entry, path, stampOf(epoch)), restore: target => fileOps!.restoreFileTarget(target),
      create: openCreate, actions: () => fileActions,
      visible: filesShown,
      count: (total) => {
        // The commit the tree shows, in full (set on the hidden #revision before each draw).
        const count = element("files-count"), commit = element("revision").title;
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
const loadPagesTree = lazyModule(async () => (await Promise.all([import("./components/pages-tree"), loadPagesActions()]))[0]);
let pagesTreeMount: Promise<void> | undefined;
function ensurePagesTree() {
  if (pagesTree) return Promise.resolve();
  if (pagesTreeMount) return pagesTreeMount;
  const host = element("explorer-pages");
  const pending = loadPagesTree().then(({ createPagesTree }) => {
    if (!host.isConnected || host !== document.getElementById("explorer-pages")) return;
    pagesTree = createPagesTree({
      open: (file) => {
        // The open page chosen again shows in the preview, which a link may have taken elsewhere.
        if (file === appStore.openFile.value && editorModule?.isMounted(file)) { explorerDropdown?.close(); updatePreview(); }
        else void restoreFile(file, workspaceSession.begin());
      },
      plan: (request) => {
        const planned = pageActions!.planNew(request);
        return planned.ok ? { ok: true, value: { route: planned.value.route, file: planned.value.file, note: planned.value.note } } : planned;
      },
      create: (request) => pageActions!.createNew(request),
      announce,
      onInteractionEnd: flushPendingNativePageTitles,
      retitle: (file, title) => pageActions!.retitle(file, title),
      changed: (file) => Boolean(treeState().changes.get(file)),
      discard: (file) => void savePublish.discardFile(file),
      duplicate: (file) => void pageActions!.duplicate(file),
      remove: (target) => void pageActions!.remove(target),
      createPage: (route) => void pageActions!.createFolderPage(route),
      pageSettings: (path) => { element("explorer-toggle").focus(); void openNativePageSettings(path); },
      navigation: (path) => { element("explorer-toggle").focus(); void openNativeNavigation(path); },
      canAddToNavigation: () => Boolean(nativeNavigationTarget(nativeSite?.routes["/"])),
      planUrl: (target, value) => (target.file ? pageActions!.urlPlan(target.file, value) : { ok: false, error: "This row has no page." }),
      changeUrl: (target, value, keep) => (target.file ? pageActions!.changeUrl(target.file, value, keep) : Promise.resolve("This row has no page.")),
      moveTo: (target) => void pageActions!.moveTo(target),
      dropProblem: (source, parent) => pageActions!.dropProblem(source, parent),
      drop: (source, parent) => void pageActions!.confirmMove(source, parent),
      cardOffer: cardsController.cardOffer,
    });
    element("explorer-pages").replaceChildren(pagesTree.root);

    if (explorerDropdown?.isOpen()) pagesController.renderTree();
  }).finally(() => { if (pagesTreeMount === pending) pagesTreeMount = undefined; });
  pagesTreeMount = pending;
  return pending;
}


function imagesSignature() {
  const scope = draftScope();
  return JSON.stringify([currentLoad(), setupScope(), appStore.snapshot.value?.commit, scope ? draftStore().list(scope) : []]);
}

function mountExplorerTabs() {
  const explorer = element("explorer");
  explorer.addEventListener("toggle", () => {
    // Closing a popover queues its toggle; session expiry may detach it before dispatch.
    if (!explorer.isConnected) return;
    if (mediaController.galleryVisible() && pagesController.explorerTab() === "media") void ensureExplorer().then(() => mediaController.ensureGallery()).catch(errorMessage);
  });
  const tabs = { pages: element<HTMLButtonElement>("explorer-tab-pages"), media: element<HTMLButtonElement>("explorer-tab-media"), files: element<HTMLButtonElement>("explorer-tab-files") };
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
  element("explorer-tabs").hidden = !native;
  element("site-settings-toggle").hidden = !native;
  for (const name of explorerTabNames) {
    const button = element(`explorer-tab-${name}`);
    const panel = element(`explorer-${name}`);
    button.setAttribute("aria-selected", String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    panel.hidden = tab !== name;
    if (name === "files" && tab === name && explorerDropdown?.isOpen()) filesTreeController.shown();
    // Without tabs the files are the whole explorer, not a tab's panel.
    if (native) panel.setAttribute("role", "tabpanel");
    else panel.removeAttribute("role");
  }
}

// Whether the repository path (a file, or a folder something is in) is
// there, on the branch or drafted.
function nativePathExists(path: string) {
  return nativeFiles().some((file) => file === path || file.startsWith(`${path}/`));
}

// The whole site read for the repository open now: an error message, or nothing.
async function nativeSiteReadForCreate() {
  const at = workspaceSession.begin();
  const problem = await ensureNativeTextIndex();
  if (problem) return problem;
  if (!at.holds() || !nativeSite) return "The repository changed meanwhile. Try again.";
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

// ---- Card grids (src/page-builder/cards.ts, docs/page-builder/cards.md). ----
// Lifecycle and adapters live in the cards controller; every card write is a guarded edit (src/guarded-edit.ts).
const cardsController = createCardsController({
  edits: guardedEdits,
  siteRead: () => nativeSiteReadForCreate(),
  editable: path => Boolean(draftScope()) && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path) && editorModule.captureHistoryHost(path)),
  preview: () => nativePreview,
  openPage: file => void restoreFile(file, workspaceSession.begin()),
  pageLabel: (file) => pagesController.pageLabel(file),
  variantFiles: nativeVariantFiles,
  announce,
});

// Pages policy belongs to the controller; guarded writes remain host transactions.
const pagePorts = (): Parameters<typeof createPagesController>[0] => ({
  edits: guardedEdits,
  site: () => nativeSite,
  routeForPath: nativeRouteForPath,
  source: nativeEffectiveSource,
  files: nativeFiles,
  baseFiles: () => nativeBaseFiles,
  drafts: () => { const scope = draftScope(); return scope ? draftStore().list(scope) : []; },
  hasDraftScope: () => Boolean(draftScope()),
  routeInfo: nativeRouteInfo,
  titles: nativeTitles,
  siteUrl: () => nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH)).url,
  writeMeta: (file, field, value, flush) => writeNativePageMeta(file, field, value, flush),
  ensureIndex: ensureNativeTextIndex,
  readRedirects: readNativeRedirects,
  withMovedPageUrls,
  pageLinks: (...args) => fileOps!.pageLinks(...args),
  cardsLinkingTo: cardsController.cardsLinkingTo,
  confirmation: () => confirmDialog,
  picker: () => pagePicker,
  refreshMeta: () => pageStructure?.refreshMeta(),
  refreshLabel: updateCurrentPageLabel,
  tree: () => pagesTree,
  pagesHidden: () => Boolean(element("explorer-pages").hidden),
  openFile: () => appStore.openFile.value,
  clearPendingTitles: () => { pendingNativePageTitles = undefined; },
  tabsMounted: () => Boolean(document.getElementById("explorer-tabs")),
  paintTabs: paintExplorerTabs,
  resetExplorer: () => { pagesTree?.reset(); mediaController.disposeGallery(); },
  showMedia: () => { if (explorerDropdown?.isOpen()) void ensureExplorer().then(() => mediaController.ensureGallery()).catch(errorMessage); },
  siteReadForCreate: nativeSiteReadForCreate,
  createWithCard: cardsController.createWithCard,
  navigationTarget: nativeNavigationTarget,
  restoreDeleted: file => undoFileChanges({ restore: [file] }),
  announce,
  refuse,
  error: errorMessage,
});
const pagesController = createPagesState(pagePorts());

// Shared file operations use the same pure source/draft policy as Pages.
function onBranchHere(path: string) {
  const scope = draftScope();
  return pageOnBranchHere(path, nativeBaseFiles, scope ? draftStore().list(scope) : []);
}
// `_redirects` as it is now: its draft, or the branch's file.
async function readNativeRedirects(): Promise<string | undefined> {
  const repo = appStore.repository.value, at = workspaceSession.begin();
  const scope = draftScope();
  const draft = scope ? draftStore().get(scope, NATIVE_REDIRECTS_PATH) : undefined;
  if (draft) return draft.deleted ? undefined : draft.content;
  if (!nativeBaseFiles.includes(NATIVE_REDIRECTS_PATH) || !appStore.repository.value) return undefined;
  const entry = await findEntry(NATIVE_REDIRECTS_PATH);
  if (!at.holds() || !repo) throw new Error("The repository changed while reading redirects.");
  const text = entry ? await readFile(repo.full_name, entry.sha) : undefined;
  if (!at.holds()) throw new Error("The repository changed while reading redirects.");
  if (text !== undefined) nativeBaseSources.set(NATIVE_REDIRECTS_PATH, text);
  return text;
}

// A branch file's blob and text, for a draft of an edit to it.
async function branchText(path: string): Promise<{ sha: string; text: string } | undefined> {
  if (!appStore.repository.value) return undefined;
  const entry = await findEntry(path);
  if (!entry) return undefined;
  const text = nativeBaseSources.get(path) ?? await readFile(appStore.repository.value.full_name, entry.sha);
  return { sha: entry.sha, text };
}

// New page files discarded (Discard changes, an undo): routes are found
// again and the trees drawn.
function discardedNewPages(_paths: string[]) {
  if (!nativeSite) return;
  refreshNativeRoutes();
  filesTreeController.render();
  updateAgentContext();
}

let createDialog: ReturnType<typeof createCreateDialog> | undefined;

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

function planCreation({ kind, folder, name }: CreateRequest): Checked<Creation> {
  const scope = draftScope();
  if (!scope || !appStore.snapshot.value) return { ok: false, error: "Open a repository first." };
  const drafted = newDraftPaths(scope);
  const inFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);
  // A folder is there when the branch has it or a file is (drafted) in it.
  const folderExists = (folder: string) =>
    entryAt(folder)?.type === "tree" || nativeBaseFiles.some((path) => inFolder(path, folder)) || drafted.some((path) => inFolder(path, folder));
  // What stands in the way of a new file at `path`, as far as is known here;
  // without the whole-commit tree, GitHub is asked on confirm.
  const problem = (path: string) => {
    if (draftStore().get(scope, path)?.deleted) return `${path} is deleted in your changes. Restore it instead.`;
    if (draftStore().get(scope, path)) return `${path} already has a draft in this browser.`;
    if (folderExists(path)) return `There is a folder ${path} already.`;
    if (entryAt(path) || nativeBaseFiles.includes(path)) return `${path} already exists.`;
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (entryAt(parent)?.type === "blob" || draftStore().get(scope, parent)) return `${parent} is a file, so nothing can go in it.`;
    }
    return undefined;
  };
  const routes = nativeSite?.routes ?? {};
  const routeTaken = (route: string) => (Object.hasOwn(routes, route) ? `The URL ${route} already has a page, ${routes[route]}.` : undefined);
  const fail = (error: string): Checked<Creation> => ({ ok: false, error });

  if (kind === "file") {
    const path = newFilePath(folder, name);
    if (!path.ok) return path;
    const blocked = problem(path.value);
    if (blocked) return fail(blocked);
    const route = nativeSite ? nativePageRoute(path.value) : undefined;
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
  if (folderExists(path.value) || entryAt(path.value)) return fail(`${path.value} already exists.`);
  const keep = `${path.value}/.gitkeep`;
  const blocked = problem(keep);
  if (blocked) return fail(blocked);
  const pagesHint = nativeSite && !path.value.startsWith("components/") ? " To add pages and subpages, use the Pages tab." : "";
  return { ok: true, value: {
    files: [{ path: keep, content: "" }], folder: path.value,
    summary: `Creates ${keep}: git stores no empty folders, so the folder holds this empty file until it has others.${pagesHint}`,
    done: `Created the folder ${path.value}.`,
  } };
}

// Whether the branch has `path`, or a file where a folder of it would go,
// asked of GitHub a folder at a time; only needed without the whole-commit
// tree, which the plan already checked.
async function branchPathProblem(path: string) {
  if (!appStore.snapshot.value || appStore.snapshot.value.tree || !appStore.repository.value) return undefined;
  let entries = appStore.snapshot.value.entries;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const entry = entries.find((entry) => entry.path === parts[index]);
    if (!entry) return undefined;
    const at = parts.slice(0, index + 1).join("/");
    if (index === parts.length - 1) return `${at} already exists on GitHub.`;
    if (entry.type !== "tree") return `${at} is a file, so nothing can go in it.`;
    let listing = filesTreeController.listings().get(entry.sha);
    if (!listing) {
      listing = (await api<Directory>("tree", { repo: appStore.repository.value.full_name, sha: entry.sha })).entries;
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
  const scope = draftScope()!;
  const at = workspaceSession.begin();
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
  editorModule?.refreshDrafts();
  versions.history.refresh();
  if (nativeSite) refreshNativeRoutes();
  updateAgentContext();
  if (resyncNativeSite()) return undefined;
  if (creation.folder) {
    // The new folder shows open in the tree, with the dialog's focus returned to it.
    const parts = creation.folder.split("/");
    parts.forEach((_, index) => filesTreeController.openFolder(parts.slice(0, index + 1).join("/")));
    filesTreeController.render();
    const row = [...files.querySelectorAll<HTMLElement>(".file-row")].find((row) => row.dataset.path === creation.folder);
    if (row) createDialog?.returnFocusTo(row);
  } else filesTreeController.render();
  const opened = creation.open ? draftStore().get(scope, creation.open) : undefined;
  if (opened) await openNewDraft(opened);
  // Written as the user's own announcement, so a load finishing later keeps it.
  element("status").textContent = creation.done;
  return undefined;
}

// The "+" on a folder: a new file or folder in it.
function openCreate(folder: string, opener: HTMLElement) {
  if (!appStore.snapshot.value) return;
  const since = guardedEdits.stamp("repository");
  void ensureExplorer().then(() => { if (since.holds()) createDialog?.open({ in: folder, kinds: ["file", "folder"], first: "file", opener }); }).catch(errorMessage);
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

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

// The actions of a Files row.
function fileRowItems(target: FileRowTarget): MenuItem[] {
  if (target.gone) return [{ label: "Restore", run: () => void fileOps!.restoreFileTarget(target) }];
  const items: MenuItem[] = [];
  if (target.folder)
    items.push(
      { label: "New file…", run: () => openCreateKind(target.path, "file") },
      { label: "New folder…", run: () => openCreateKind(target.path, "folder") },
      { label: "Upload files…", run: () => void pickFiles().then((picked) => uploadFilesTo(target.path, picked)) },
    );
  items.push({ label: "Rename", shortcut: "F2", run: () => fileActions?.rename(files, target.path) });
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
  if (!appStore.snapshot.value) return;
  const opener = filesTreeController.row(folder) ?? element<HTMLButtonElement>("new-at-root");
  createDialog?.open({ in: folder, kinds: ["file", "folder"], first: kind, opener });
}

async function copyFilePath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
    announce(`Copied ${path}`);
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
  const entry = entryAt(path);
  if (entry?.type === "blob" || entry?.type === "commit" || nativeBaseFiles.includes(path)) return "file";
  const prefix = `${path}/`;
  if (state.drafted.some((file) => file.startsWith(prefix))) return "folder";
  const inside = appStore.snapshot.value?.tree
    ? appStore.snapshot.value.tree.filter((item) => item.type !== "tree" && item.path.startsWith(prefix)).map((item) => item.path)
    : nativeBaseFiles.filter((file) => file.startsWith(prefix));
  if (inside.some((file) => !state.deleted.has(file))) return "folder";
  if (inside.length) return "deleted";
  return entry?.type === "tree" ? "folder" : undefined;
}

const filePorts = (): Parameters<typeof createLazyFileOperationsController>[0] => ({
  edits: guardedEdits, draftScope,
  engaged: () => nativeEngaged, repository: () => appStore.repository.value,
  parentOf, treeState, pathNow, branchFilesUnder, findEntry, draftStore,
  baseSource: path => nativeBaseSources.get(path), readFiles, readFile,
  nativeFiles,
  ensureNativeTextIndex, branchPathProblem,
  readMediaText, origins: mediaOrigins,
  onBranchHere, withMovedPageUrls, readNativeRedirects, confirmDialog: () => confirmDialog,
  undoFileChanges,
  duplicateFile: (scope, file, to) => duplicateFile(draftStore(), scope, file, to),
  afterFileChanges, announce, refuse, errorMessage, requestAnimationFrame: callback => { requestAnimationFrame(callback); },
  openFolder: path => filesTreeController.openFolder(path), fileRow: path => filesTreeController.row(path), renderFileTree: () => filesTreeController.render(),
  filesTabOpen: () => filesTreeController.visible(),
});
// Files checks and actions load with the explorer, Pages actions or an agent's file command.
let fileOps: ReturnType<typeof createLazyFileOperationsController> | undefined;
const loadFileOps = lazyModule(async () => {
  const module = await import("./controllers/file-operation-checks");
  fileOps ??= module.createLazyFileOperationsController(filePorts(), lazyModule(() => import("./controllers/file-operations-controller")));
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
  if (!appStore.snapshot.value || !appStore.repository.value) return [];
  if (appStore.snapshot.value.tree) return appStore.snapshot.value.tree.filter((entry) => entry.type !== "tree" && entry.path.startsWith(`${folder}/`));
  let entries = appStore.snapshot.value.entries;
  let entry: TreeEntry | undefined;
  for (const part of folder.split("/")) {
    entry = entries.find((item) => item.path === part);
    if (!entry || entry.type !== "tree") return [];
    entries = (await api<Directory>("tree", { repo: appStore.repository.value.full_name, sha: entry.sha })).entries;
  }
  if (!entry) return [];
  const listed = await api<Directory>("tree", { repo: appStore.repository.value.full_name, sha: entry.sha, recursive: "1" });
  return listed.entries.filter((item) => item.type !== "tree").map((item) => ({ ...item, path: `${folder}/${item.path}` }));
}

// Closes what shows the files among `paths` (the editor, the style pane) and
// forgets the models kept for them. Returns the open file when it is one.
function releaseFiles(paths: Set<string>) {
  const scope = draftScope();
  const open = appStore.openFile.value && paths.has(appStore.openFile.value) ? appStore.openFile.value : undefined;
  if (open) {
    fileGeneration++;
    setCurrentPage();
  }
  if (secondaryPath && paths.has(secondaryPath)) {
    linkedStyle = undefined;
    closeSecondary();
  }
  if (scope) for (const path of paths) editorModule?.forgetDraftModel(scope, path);
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
  const scope = draftScope();
  if (!scope || !appStore.snapshot.value) return false;
  const home = draftStore().get(scope, NATIVE_HOME_PAGE);
  const drafted = Boolean(home && home.baseSha === null && !home.deleted);
  const committed = appStore.snapshot.value.entries.some((entry) => entry.path === NATIVE_HOME_PAGE && entry.type === "blob");
  const wanted = committed || drafted;
  if (wanted === nativeEngaged) return false;
  nativeResyncing = true;
  nativeResyncDone = new Promise<void>((resolve) => {
    queueMicrotask(() => {
      // Nothing is reopened when the home page went away; else the open file is.
      void loadSnapshot(wanted ? undefined : "").finally(() => { nativeResyncing = false; nativeResyncDone = undefined; resolve(); });
    });
  });
  return true;
}

function afterFileChanges() {
  forgetDraftedAssets();
  editorModule?.refreshDrafts();
  versions.history.refresh();
  if (nativeSite) {
    // Component stylesheets are found again where their components now are.
    nativeComponentStyles.clear();
    nativeMissingComponentStyles.clear();
    refreshNativeRoutes();
    void loadNativeComponentStyles(Object.keys(nativeSite.components));
  }
  filesTreeController.render();
  updateAgentContext();
  updateCurrentPageLabel();
  resyncNativeSite();
  mediaController.requestGalleryRefresh();
}

// Opens `path` after an operation, or the home page (else the folder summary)
// when it is gone. `keepExplorer`: the explorer stays open (true) or closes
// (false); by default a new file keeps it open and a branch file closes it.
async function openAfter(path: string | undefined, keepExplorer?: boolean, quietStatus = false) {
  const at = workspaceSession.begin();
  const scope = draftScope();
  const draft = path && scope ? draftStore().get(scope, path) : undefined;
  const keep = { keepExplorer: keepExplorer ?? false, quietStatus };
  if (draft && draft.baseSha === null && !draft.deleted) await openNewDraft(draft, { keepExplorer: keepExplorer ?? true });
  else if (path && !draft?.deleted) await restoreFile(path, at, keep);
  else if (nativeSite?.routes["/"]) await restoreFile(nativeSite.routes["/"], at, keep);
  else if (appStore.snapshot.value) showDirectory(appStore.snapshot.value);
}

/**
 * Restores deletions and moves renamed files back (Restore in the tree, the
 * Save panel's Restore and Move back, Discard changes on a renamed file).
 */
function undoFileChanges(what: { restore?: string[]; moveBack?: string[] }) {
  const scope = draftScope();
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
  announce(done.length === 1 ? (reversed.length ? `Moved ${reversed[0].from} back to ${reversed[0].to}.` : `Restored ${done[0]}.`) : `Restored ${done.length} files.`);
}

// A change's Restore (a deletion), Move back (a rename) or Discard (an edit, a new file) in the Save panel.
async function discardFileChange(change: FileChange) {
  if (change.kind === "A" && change.drafts[0]?.upload) await discardUpload(change.path);
  else if (change.kind === "D") undoFileChanges({ restore: [change.path] });
  else if (change.kind === "R") undoFileChanges({ moveBack: [change.path] });
  else if (savePublish.discard([change.path])) announce(`Discarded the changes to ${change.path}.`);
}

const savePublish = createSavePublishController({
  stamp: () => guardedEdits.stamp("repository"),
  snapshot: () => appStore.snapshot.value,
  scope: draftScope, drafts: draftStore, api, findEntry, changed: afterFileChanges, release: releaseFiles, openAfter, announce, status,
  fail: errorMessage, fallback: nativeFallbackPage, resync: resyncNativeSite,
  onWake: (check) => { document.addEventListener("visibilitychange", check); addEventListener("focus", check); return () => { document.removeEventListener("visibilitychange", check); removeEventListener("focus", check); }; },
  visible: () => document.visibilityState === "visible",
  reload: () => loadSnapshot(),
  forget: (scope, path) => editorModule?.forgetDraftModel(scope, path),
  redraw: () => {
    editorModule?.refreshDrafts();
    filesTreeController.render();
    if (nativeSite) updateNativePreviewSources();
  },
  saved: (scope, result, submitted, shown) => {
    if (shown) adoptNativeBaseSources(scope, result, submitted);
    // Saved uploads are GitHub's now; this browser lets their bytes go.
    void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
    if (nativeEngaged && !result.unchanged)
      siteActions?.track({ repo: scope.repo, commit: result.commit, url: result.url },
        () => holdsDraftScope(workspaceSession.current().scope, scope));
  },
  adopt: (result) => {
    appStore.snapshot.value = result;
    repositoryIndex.seed(appStore.repository.value!, result);
  },
  showSaved: (commit) => {
    updateAgentContext();
    element("revision").textContent = commit.slice(0, 7);
    element("revision").title = commit;
    filesTreeController.render();
    if (nativeEngaged && nativeSite) startNativeTextIndex(appStore.repository.value!, nativeSite, draftScope(), workspaceSession.begin(), nativeSourcesRequest);
  },
  change: (path) => treeState().changes.get(path),
  openFile: () => appStore.openFile.value,
  secondary: () => secondaryPath,
  drop: (scope, path) => Boolean(editorModule?.dropDraft(scope, path)),
  clearHistory: () => editorModule?.clearHistory(),
  reopen: (opened, back, styled) => {
    if (nativeModeActive()) updateNativePreviewSources();
    const page = appStore.openFile.value;
    if (opened) void openAfter(back);
    else if (styled && page && nativeModeActive()) {
      // The open page stays; its stylesheet opens again as GitHub has it.
      if (nativeComponentTagForPath(page)) void openComponentLinkedStyle(page);
      else void openDefaultLinkedStyle(page);
    }
  },
  confirm: async (question, all) => {
    const since = guardedEdits.stamp("repository");
    const { createConfirmDialog } = await loadConfirmDialog();
    if (!since.holds()) return false;
    if (all && !discardDialog) { discardDialog = createConfirmDialog("discard-dialog"); app.append(discardDialog.root); }
    if (!all && !confirmDialog) { confirmDialog = createConfirmDialog(); element("explorer").append(confirmDialog.root); }
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
  if (error) errorMessage(new Error(error));
}

async function openEntry(
  entry: TreeEntry,
  path: string,
  at: SessionStamp,
  options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean; retry?: () => void } = {},
) {
  const scope = draftScope();
  if (!at.holds() || !appStore.repository.value || !scope) return;
  // A file deleted in the drafts opens as a note with Restore; one renamed
  // or moved opens where it is now.
  const marker = draftStore().get(scope, path);
  if (marker?.deleted) {
    if (marker.movedTo) { await openAfter(marker.movedTo, options.keepExplorer, options.quietStatus); return; }
    ++fileGeneration;
    if (!options.keepExplorer) explorerDropdown?.close();
    setCurrentPage(path);
    showDeletedFile(path);
    return;
  }
  const selection = ++fileGeneration;
  if (!options.keepExplorer) explorerDropdown?.close();
  setCurrentPage(path);
  if (entry.type === "commit") {
    content.replaceChildren(
      node(
        "p",
        "empty-message",
        `Git submodule at ${entry.sha.slice(0, 12)}. Submodule contents are not loaded by this editor.`,
      ),
    );
    status("Submodule selected.");
    return;
  }
  if ((entry.size ?? 0) > 1024 * 1024) {
    content.replaceChildren(
      node(
        "p",
        "empty-message",
        "This file is larger than the 1 MB the editor opens as text.",
      ),
    );
    status("Large file selected.");
    return;
  }
  content.replaceChildren(node("p", "empty-message", "Loading source…"));
  if (!options.quietStatus) status(`Reading ${path}…`);
  try {
    const content = await readFile(appStore.repository.value.full_name, entry.sha);
    if (!at.holds() || selection !== fileGeneration) return;
    // A page the text index has not read yet: its text is the branch's, so
    // the preview draws it now, with what it shows (src/native-boot.ts).
    if (nativeSite && isNativeTextFile(path) && !nativeBaseSources.has(path) && entryAt(path)?.sha === entry.sha) {
      nativeBaseSources.set(path, content);
      updateNativePreviewSources();
    }
    await mountSource(
      path,
      content,
      entry.sha,
      entry.mode === "120000",
      at,
      selection,
      options,
    );
    // A file opened while this one's editor loaded has the last word.
    if (!options.quietStatus && selection === fileGeneration) settleStatus(`Viewing ${path} at ${appStore.snapshot.value?.commit.slice(0, 7)}.`);
  } catch (error) {
    if (at.holds() && selection === fileGeneration) {
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          error instanceof Error ? error.message : "Could not read this file.",
        ),
      );
      // A file that is not text (or too big) is said here, where it was asked for, not as a failed request.
      if (unreadableAsText(error)) status(`${path}: ${error instanceof Error ? error.message : "This file cannot be read as text."}`);
      else errorMessage(error, options.retry);
    }
  }
}

async function mountSource(
  path: string,
  source: string,
  baseSha: string | null,
  readOnly: boolean,
  at: SessionStamp,
  selection: number,
  options: { linkDefaultStyle?: boolean; beforeMount?: () => boolean } = {},
) {
  const scope = draftScope();
  if (!scope || !at.holds() || selection !== fileGeneration) return;
  const saveProof = savePublish.proof();
  await openCodeEditor({
    key: draftKey(scope, path),
    scope,
    baseSha: baseSha,
    onPublished: (result, submitted) => savePublish.published(saveProof, scope, result, submitted),
    onDiscardNew: () => {
      // A discarded page no longer routes; the site shows the page's parent
      // page, else home.
      const page = Boolean(nativeSite && (nativeRouteForPath(path) ?? nativePageRoute(path)));
      if (page) {
        discardedNewPages([path]);
        element("status").textContent = `Discarded the new page ${path}.`;
        const fallback = nativeFallbackPage(path);
        // Opened once the discard is done; what was announced (the discard,
        // or an undo's own words) outlasts the page's loading messages.
        if (fallback)
          queueMicrotask(reported(async () => {
            const said = element("status").textContent;
            const at = workspaceSession.begin();
            await restoreFile(fallback, at);
            if (at.holds() && said) element("status").textContent = said;
          }));
      }
      if (appStore.snapshot.value && info.user) {
        showDirectory(appStore.snapshot.value);
        rememberWorkspace(info.user.login, {
          repoId: scope.repoId,
          branch: scope.branch,
        });
        filesTreeController.refresh();
        updateAgentContext();
      }
    },
    onContextChange: (value) => {
      activeFileContext = value;
      if (value && appStore.openFile.value === value.path) syncLinkedStyles(value.path, value.content);
      updateAgentContext();
      filesTreeController.refresh();
      versions.history.refresh();
      if (nativeModeActive()) updateNativePreviewSources();
      // An open template's banner counts its instances again.
      componentTools?.refresh();
      // The Page fields follow the page's head (typed, undone or redone).
      if (value && nativeRouteForPath(value.path)) pageStructure?.refreshMeta();
      // A heading or title typed in the open file renames it in the top bar.
      updateCurrentPageLabel();
    },
    onHistory: () => void versions.history.open().catch(errorMessage),
    onDiscardAll: () => void savePublish.discardAll(),
    publishHead: () => savePublish.headFor(scope),
    onRefused: () => void savePublish.checkHead(true),
    onDiscardChange: reported(discardFileChange),
    deletedUpstream: savePublish.isDeleted,
    onSettleDeleted: savePublish.settleDeleted,
    cssWorkspace: nativeCssWorkspace, variants: nativeVariantFiles,
    ensureHistoryTarget: async (path) => {
      const opened = await openSecondary(path);
      if (opened) renderLinkedStyle();
      return opened;
    },
    path,
    source: source,
    readOnly: readOnly,
    onSessionExpired: () =>
      errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
  }, options.beforeMount);
  if (options.beforeMount && !editorModule?.isMounted(path)) return;
  // Another file opened over the selected page: its controls would edit the
  // wrong file, so the bar waits for the next preview click.
  if (nativeModeActive() && appStore.selection.value?.path !== path) {
    nativePreview?.hideEditBar();
    componentTools?.show(undefined);
  }
  componentTools?.refresh();
  // Checked before the file-generation guard: handling that click is what
  // superseded this open.
  previewSelection.replayPending(path);
  if (!at.holds() || selection !== fileGeneration || !info.user)
    return;
  rememberWorkspace(info.user.login, {
    repoId: scope.repoId,
    branch: scope.branch,
    path,
  });
  // Another page's linked stylesheet does not carry over; a click in the
  // preview links this page's own rules.
  if (linkedStyle?.page !== path) {
    linkedStyle = undefined;
    closeSecondary();
  }
  if (nativeModeActive() && !linkedStyle && options.linkDefaultStyle !== false) {
    // A component opens with its own stylesheet beside it; a page with the shared one.
    const release = editorModule?.holdHistoryRefresh(path);
    try {
      if (nativeComponentTagForPath(path)) await openComponentLinkedStyle(path);
      else await openDefaultLinkedStyle(path);
    } finally { release?.(); }
  }
}

// The component whose template is `path`.
function nativeComponentTagForPath(path: string) {
  if (!nativeSite) return undefined;
  return Object.entries(nativeSite.components).find(([, file]) => file === path)?.[0];
}

// The component's same-named `.css` in the secondary pane, with no rule chips
// until an element is selected; the shared stylesheet when it has none.
async function openComponentLinkedStyle(page: string) {
  const css = nativeComponentCssPath(page);
  const request = ++linkedStyleRequest;
  const at = workspaceSession.begin();
  const scope = draftScope();
  if (!scope) return false;
  const draft = draftStore().get(scope, css);
  // A new component's stylesheet may exist only in drafts, as openSecondary
  // already supports. A branch-tree miss must not hide that authored file.
  const created = draft && draft.baseSha === null && !draft.deleted && !draft.upload && !draft.opaque;
  const entry = created ? undefined : await findEntry(css);
  if (request !== linkedStyleRequest || !at.holds() || appStore.openFile.value !== page) return false;
  const latestDraft = draftStore().get(scope, css);
  if (latestDraft?.deleted || latestDraft?.upload || latestDraft?.opaque ||
      (!entry && !(latestDraft && latestDraft.baseSha === null))) return openDefaultLinkedStyle(page);
  nativeLinkedStyles = undefined;
  linkedStyle = { page, css, rules: linkedStyleIdle };
  const current = () => {
    const draft = draftStore().get(scope, css);
    return request === linkedStyleRequest && at.holds() && appStore.openFile.value === page &&
      linkedStyle?.page === page && linkedStyle.css === css && !draft?.deleted && !draft?.upload && !draft?.opaque &&
      Boolean(entry || (draft && draft.baseSha === null));
  };
  if (!(await openSecondary(css, current))) return false;
  if (request !== linkedStyleRequest || !at.holds() || linkedStyle?.page !== page) return false;
  renderLinkedStyle();
  return true;
}

function updateAgentContext() {
  agentController.changed();
  setupController.refresh();
}

// ---- Agents (src/agent-site.ts): the context shared, and changes applied through the editor's own actions. ----

// Agents see the whole site (its pages are read after the first paint):
// the context waits for the complete index of the repository open then.
function agentContext(): Promise<SharedContext | undefined> {
  return withSiteIndexed(nativeTextIndexGate, buildAgentSiteContext);
}
const agentSiteHost = createAgentSiteHost({
  files: () => appStore.repository.value && appStore.snapshot.value ? { repo: appStore.repository.value, snapshot: appStore.snapshot.value,
    api, read: readFile, batch: readFiles, has: (repo, sha) => Boolean(cleanSources.get(repo, sha)) } : undefined,
  stamp: () => guardedEdits.stamp("repository"),
  source: path => mediaPorts.source(path),
  load: loadAgentSite,
  input: () => {
    const scope = draftScope();
    if (!appStore.repository.value || !appStore.snapshot.value || !scope) return undefined;
    const site = nativeSite;
    return {
      repository: { id: appStore.repository.value.id, fullName: appStore.repository.value.full_name },
      branch: appStore.snapshot.value.branch,
      commit: appStore.snapshot.value.commit,
      file: activeFileContext,
      drafts: draftStore().list(scope),
      mountedSource: (path) => editorModule?.getMountedSource(path),
      native: site && {
        site,
        routeInfo: (route) => nativeRouteInfo(route, site),
        source: (path) => nativeEffectiveSource(path, scope),
        exists: (path) => pathNow(path) === "file",
        openFile: appStore.openFile.value,
        selection: appStore.selection.value && { ...appStore.selection.value, route: nativePreview?.route() },
      },
    };
  },
  dialog: () => confirmDialog,
  setDialog: dialog => { confirmDialog = dialog; },
});
function buildAgentSiteContext(): Promise<SharedContext | undefined> {
  return agentSiteHost.context();
}
// A Files-tab action run for an agent: its confirmation is answered as asked.
async function withAgentAnswers<T>(answers: { option?: boolean }, run: () => Promise<T>) {
  const since = guardedEdits.stamp("repository");
  const { createConfirmDialog } = await loadConfirmDialog();
  if (!since.holds()) throw new Error("The editor changed branch or revision.");
  if (!confirmDialog) { confirmDialog = createConfirmDialog(); element("explorer").append(confirmDialog.root); }
  return agentSiteHost.withAnswers(answers, run);
}
function agentFileTarget(path: string): FileRowTarget | undefined {
  const now = pathNow(path);
  return now === "file" || now === "folder" ? { path, name: path.slice(path.lastIndexOf("/") + 1), folder: now === "folder" } : undefined;
}
// Waits for a home page's resync, refusing when the user opened another
// account's, repository's or branch's site meanwhile: the agent's command
// was checked against the one it started on.
async function awaitNativeResync() {
  if (!nativeResyncDone) return;
  const at = workspaceSession.begin();
  await nativeResyncDone;
  if (at.changed() === "scope")
    throw new Error("The editor tab switched to another site meanwhile. Call get_site and try again.");
}
const agentSiteActions = makeAgentSiteActions();
function makeAgentSiteActions(edits: GuardedEdits = guardedEdits, atomic = false): AgentSiteActions { return {
  makeComponent: async (request) => componentTools?.makeFromAgent(request) ?? "The component tools are not ready.",
  async text(path) {
    await awaitNativeResync();
    const mounted = editorModule?.getMountedSource(path);
    if (mounted !== undefined) return mounted;
    const scope = draftScope();
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft?.deleted) return undefined;
    if (draft?.opaque) throw new Error(`${path} is not a text file.`);
    if (draft) return draft.content;
    return nativeBaseSources.get(path) ?? (await branchText(path))?.text;
  },
  isMounted: (path) => Boolean(editorModule?.isMounted(path)),
  edits,
  atomicText: () => atomic,
  loaderPlan: nativeComponentLoaderPlan,
  writeDraft: async (path, content, create, expected) => {
    if (!atomic && !nativeSite && !nativeEngaged && create) {
      const scope = draftScope(), repo = appStore.repository.value, snap = appStore.snapshot.value;
      if (!scope || !repo || !snap) return "Open a repository first.";
      const at = workspaceSession.begin(), store = draftStore(), editor = editorModule;
      // Snapshot/draft presence stays authoritative before native activation starts.
      const hasHome = () => {
        const home = store.get(scope, NATIVE_HOME_PAGE);
        return snap.entries.some(entry => entry.path === NATIVE_HOME_PAGE && entry.type === "blob") ||
          Boolean(home && home.baseSha === null && !home.deleted);
      };
      if (hasHome()) return "Open a native site first.";
      const graph = JSON.stringify(snap.tree ?? snap.entries);
      const before = new Map(store.list(scope).map(draft => [draft.path, draft]));
      const isCurrent = () => {
        const drafts = store.list(scope);
        return at.holds() && appStore.repository.value === repo && appStore.snapshot.value === snap &&
          !nativeSite && !nativeEngaged && !hasHome() && !versions.view && JSON.stringify(snap.tree ?? snap.entries) === graph &&
          drafts.length === before.size && drafts.every(draft => before.get(draft.path) === draft);
      };
      // Before a home page exists there is no mounted editor to anchor operation
      // history: the file is a new draft, all or nothing, then the site resyncs.
      const { writeNewDrafts } = await import("./new-drafts");
      if (!isCurrent()) return "The repository changed meanwhile. Try again.";
      const error = await writeNewDrafts([{ path, content }], {
        scope, store, isCurrent,
        exists: path => pathNow(path, treeState(scope)) !== undefined,
        checkPath: async path => {
          const parts = path.split("/");
          for (let index = 1; index < parts.length; index++) {
            const parent = parts.slice(0, index).join("/");
            if (pathNow(parent, treeState(scope)) === "file") return `${parent} is a file, so nothing can go in it.`;
          }
          return branchPathProblem(path);
        },
        drop: (scope, path) => editor?.dropDraft(scope, path) ?? store.remove(scope, path),
        refresh: afterFileChanges,
      });
      if (error) return error;
      await awaitNativeResync();
      return undefined;
    }
    // A plan of one write: the file's bytes now (the branch's read first) are what it replaces.
    const since = edits.stamp("repository");
    if (!create && edits.peek.source(path) === undefined) {
      const base = await branchText(path);
      if (!since.holds()) return "The repository changed meanwhile. Try again.";
      if (base) nativeBaseSources.set(path, base.text);
    }
    const done = `An agent ${create ? "created" : "changed"} ${path}.`, undone = `Undid the agent's change to ${path}.`;
    const outcome = await edits.run(r => create ? { creates: [{ path, content }], ...nativePageRoute(path) && !componentTools?.typingTemplate() || atomic && appStore.openFile.value === undefined ? { open: path } : {}, done, undone }
      : expected !== undefined && r.source(path) !== expected ? { refuse: `${path} changed in the editor since it was read. Read it again.` }
      : r.source(path) === undefined ? { refuse: `${path} does not exist.` }
      : { edits: new Map([[path, content]]), ...nativePageRoute(path) && (!atomic || !editorModule.isMounted(path)) && !componentTools?.typingTemplate() ? { open: path } : {},
        ...atomic ? { select: { historyOnly: true } } : {}, done, undone }, { since });
    // A home page just written switches the site on: the context is whole before the write is answered.
    await nativeResyncDone;
    return outcome.message;
  },
  async open(path) {
    if (appStore.openFile.value !== path || !editorModule?.isMounted(path)) await restoreFile(path, workspaceSession.begin(), { linkDefaultStyle: false });
    return appStore.openFile.value === path;
  },
  async createPage(request) {
    const since = edits.stamp("repository");
    await loadPagesActions();
    if (!since.holds()) return "The repository changed meanwhile. Try again.";
    const plan = pageActions!.planNew(request);
    if (!plan.ok) return plan.error;
    return (await pageActions!.createNew(request)) ?? { file: plan.value.file, route: plan.value.route };
  },
  async setPageDetail(path, field, value) {
    const error = await writeNativePageMeta(path, field, value, false);
    if (error) return error;
    pageStructure?.refreshMeta();
    pagesController.renderTree();
    updateCurrentPageLabel();
    updateAgentContext();
    return undefined;
  },
  sectionTags: () => new Set(nativeSectionChoices().map((choice) => choice.tag)),
  moveSection: (at, gap) => blockMoves.move(at, { gap, section: true }, { stale: "The page changed in the editor meanwhile. Read it again." }),
  moveFile: (path, to, keepOldUrl) =>
    withAgentAnswers({ option: keepOldUrl }, async () => {
      const target = agentFileTarget(path);
      if (!target) return `${path} does not exist.`;
      return fileOps!.moveFileTarget(target, to, parentOf(path) === parentOf(to) ? "rename" : "move", { keepOldAddress: keepOldUrl });
    }),
  deleteFile: (path) =>
    withAgentAnswers({}, async () => {
      const target = agentFileTarget(path);
      return target ? fileOps!.deleteFileTarget(target, undefined, true) : `${path} does not exist.`;
    }),
  inspect(request) {
    if (!nativePreview?.isActive()) throw new Error("The preview is not showing a page.");
    return nativePreview.inspect(request);
  },
  async listMedia(request) {
    const since = guardedEdits.stamp("repository");
    const media = await import("./agent-media");
    if (!since.holds()) throw new Error("The editor changed branch or revision.");
    const ctx = await mediaController.workspaceContext(media.isAgentMediaPath);
    return media.listWorkspaceMedia(ctx, request);
  },
  async previewMedia(path) {
    const [ctx, media] = await Promise.all([mediaController.workspaceContext(), import("./agent-media")]);
    return media.previewWorkspaceMedia(ctx, path, path => editorModule?.getMountedSource(path));
  },
  async media(command) {
    const since = guardedEdits.stamp("repository"), page = mediaPorts.source(command.path);
    const { runAgentMedia } = await import("./agent-media-actions");
    if (!since.holds()) throw new Error("The editor changed branch or revision.");
    return runAgentMedia(mediaController, mediaPorts, command, page);
  },
  legacy: applyAgentCommand,
}; }
async function applyAgentSiteCommand(command: AgentCommand) {
  const began = workspaceSession.begin(), revision = appStore.snapshot.value?.commit;
  const [{ applySiteCommand, prepareAgentText, atomicAgentCommand, agentStructuralActions, finishAgentTextElsewhere }, { createPagesController }, { createLazyFileOperationsController }] = await Promise.all([loadAgentSite(), loadPagesActions(), loadFileOps()]);
  // Ticket 23: an edit read from a site or branch no longer shown finishes there, on its files; on show the editor writes it. A named exception
  // to "Proofs survive awaits": only a new load of its branch since it arrived (left and shown again; not a version view) takes a new stamp, and
  // the revision it arrived on must still hold, as must the bytes its write reads (expectedHash in applySiteCommand; the guarded edit's own reads).
  const elsewhere = () => finishAgentTextElsewhere(command, draftScope, info.user?.login, draftStore(), (files, path) => repositoryIndex.find(api, files.repo, files.snapshot, path));
  const finished = await elsewhere(); if (finished) return finished;
  const scope = draftScope(), at = began.changed() === "generation" ? workspaceSession.begin() : began, current = () => at.holds() && revision === appStore.snapshot.value?.commit && !versions.view;
  if (!current() || !appStore.snapshot.value || command.branch !== appStore.snapshot.value.branch ||
    command.repoId !== undefined && command.repoId !== scope?.repoId) throw new Error("The editor changed repository or branch.");
  if (!atomicAgentCommand(command)) {
    if (command.commit !== appStore.snapshot.value.commit) throw new Error("The editor changed branch or revision.");
    return agentActing(() => applySiteCommand(agentSiteActions, command));
  }
  if (!scope) throw new Error("Open a repository first.");
  const prepared = await prepareAgentText(command, scope, draftStore(), current, (scope, paths) => editorModule.flushAgentTyping(scope, paths),
    () => { if (holdsDraftScope(shownScope(), scope)) afterFileChanges(); });
  if (prepared.duplicate) return prepared.duplicate;
  if (!current() || command.commit !== appStore.snapshot.value?.commit) throw new Error("The editor changed branch or revision.");
  const scoped = agentStructuralActions(editorWorkspace, prepared.context!, current, {
    actions: makeAgentSiteActions, pages: pagePorts(), files: filePorts(), components: componentPorts, loader: nativeComponentLoaderPlan,
    factories: { createGuardedEdits, createPagesController, createLazyFileOperationsController, createBlockMoves, withPageField },
  });
  try {
    const detail = await agentActing(() => applySiteCommand(scoped.actions, command));
    await prepared.finish!(() => scoped.current(), scoped.readDrafts);
    // The scoped page-details step skips writeNativePageMeta: its labels refresh here.
    if (command.operation === "set_page_details" && current()) {
      pageStructure?.refreshMeta(); pagesController.renderTree(); updateCurrentPageLabel(); updateAgentContext();
    }
    // The recorded reply wins (a duplicate delivery gets exactly it); live-only detail adds result fields.
    return { ...prepared.outcome, result: { ...detail.result, ...prepared.outcome.result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error), unchanged = "Nothing was changed; your drafts are as they were.";
    // Switched away before it was kept: it finishes where it was read.
    const late = !prepared.applied && at.changed() === "scope" ? await elsewhere() : undefined;
    if (late) return late;
    if (!prepared.applied) throw new Error(message.includes(unchanged) ? message : `${message} ${unchanged}`);
    await prepared.recover!();
    return prepared.outcome;
  } finally { scoped.dispose(); }
}
// While an agent's command runs, its guarded edits leave .github alone (src/guarded-edit/commit.ts).
let agentActingDepth = 0;
async function agentActing<T>(run: () => Promise<T>): Promise<T> {
  agentActingDepth++;
  try {
    return await run();
  } finally {
    agentActingDepth--;
  }
}
// The page shown after the page `path` is gone: the nearest page above it
// (by folder) that has one, else the home page.
function nativeFallbackPage(path: string) {
  if (!nativeSite) return undefined;
  const parts = path.split("/").slice(0, -1);
  for (let length = parts.length; length > 0; length--) {
    const file = nativeSite.routes[rootRoute(`${parts.slice(0, length).join("/")}/`)];
    if (file && file !== path) return file;
  }
  return nativeSite.routes["/"];
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
  if (!options.keepExplorer) explorerDropdown?.close();
  setCurrentPage(draft.path);
  // A binary or large file moved or copied here: its text is not held.
  if (draft.upload) {
    showUpload(draft);
    return;
  }
  if (draft.opaque) {
    content.replaceChildren(node("p", "empty-message", `${draft.path} is ${draft.movedFrom ? `${draft.movedFrom} moved here` : "a copy of another file"}. Its content is not shown in the editor; publish to keep the change.`));
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
  content.replaceChildren(panel);
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
  content.replaceChildren(panel);
  status(`${path} is deleted in your changes.`);
}
async function applyAgentCommand(command: AgentCommand) {
  if (
    !info.user ||
    !appStore.repository.value ||
    !appStore.snapshot.value ||
    command.branch !== appStore.snapshot.value.branch ||
    command.commit !== appStore.snapshot.value.commit
  )
    throw new Error("The editor context changed.");
  if (command.operation === "update_active_draft") {
    if (!editorModule) throw new Error("Open the file in the editor first.");
    await editorModule.applyAgentDraft(command);
    return;
  }
  const scope = {
    account: info.user.login,
    repoId: appStore.repository.value.id,
    repo: appStore.repository.value.full_name,
    branch: appStore.snapshot.value.branch,
  };
  const previous = draftStore().get(scope, command.path);
  if (previous) {
    if (previous.baseSha === null && previous.content === command.content)
      return;
    throw new Error(
      "This file already has a browser draft. Open it and read its current context first.",
    );
  }
  const draft: SavedDraft = {
    ...scope,
    version: 1,
    path: command.path,
    baseSha: null,
    original: "",
    content: command.content,
    updatedAt: Date.now(),
  };
  draftStore().save(draft); // The editor reports persistence failures and retains a downloadable in-memory draft.
  if (nativePageRoute(draft.path)) refreshNativeRoutes();
  filesTreeController.refresh();
  await openNewDraft(draft);
}

// Opening a repository, its snapshot and the remembered boot's guess (src/workspace-boot.ts).
const workspaceBoot = createWorkspaceBoot({
  appStore, savePublish, repositoryIndex, cleanSources, filesTreeController, pagesController, previewSelection, mediaHistoryHome,
  get user() { return info?.user; },
  get fileGeneration() { return fileGeneration; }, set fileGeneration(value) { fileGeneration = value; },
  get repositories() { return repositories; },
  get content() { return content; }, get files() { return files; }, get refreshButton() { return refreshButton; },
  get branchSelect() { return branchSelect; }, get repositorySelect() { return repositorySelect; },
  get repositoryMenu() { return repositoryMenu; }, get explorerDropdown() { return explorerDropdown; }, get siteActions() { return siteActions; },
  get nativeSite() { return nativeSite; }, get nativeSourcesRequest() { return nativeSourcesRequest; },
  get nativePaintedRequest() { return nativePaintedRequest; }, get nativePaintedPaths() { return nativePaintedPaths; },
  source: () => location.origin + location.pathname,
  sessionTag: () => boot.sessionTag(),
  draftsReady: () => boot.draftsReady(),
  nextLoad, api, apiResponse, readFile, storage, element, node, options, status, settleStatus, clearError, errorMessage,
  draftScope, entryAt, setCurrentPage, openNewDraft, openEntry, mountSource, deactivateNative, activateNativeSite, afterNativePaint,
  updateAgentContext, updatePreview, showDirectory, takeStartingPoint, writeStartingPoint, readPartialStart, offerFinishStarter,
  removeFinishStarter: () => removeFinishStarter(),
});
const { restoreFile, loadSnapshot, chooseRepository } = workspaceBoot;

// Coming back to the tab lists the repositories again for Get started (src/setup-host.ts).
window.addEventListener("focus", () => void checkNewRepositories());
document.addEventListener("visibilitychange", () => void checkNewRepositories());

async function loadRepositories(prefetched?: Repository[], hooks?: { onStarted(at: SessionStamp): void }) {
  boot.loading();
  removeFinishStarter();
  setup.waitingForRepositories = false;
  mediaHistoryHome.clear();
  workspaceBoot.abandonGuess();
  const at = nextLoad();
  hooks?.onStarted(at);
  fileGeneration++;
  appStore.reset();
  siteActions?.revalidate();
  repositoryMenu?.setRepository();
  setCurrentPage();
  repositoryIndex.clear();
  repositorySelect.disabled = true;
  branchSelect.disabled = true;
  refreshButton.disabled = true;
  options(repositorySelect, [{ value: "", label: "Loading repositories…" }]);
  repositoryMenu?.setRepositories([], "Loading repositories…");
  options(branchSelect, [{ value: "", label: "—" }]);
  files.replaceChildren();
  content.replaceChildren(
    node("p", "empty-message", "Finding your selected repositories…"),
  );
  clearError();
  status("Loading selected repositories…");
  try {
    const result = prefetched ?? (await boot.fetchList(boot.refreshPending()));
    if (!at.holds()) return;
    repositories = result;
    boot.ready();
    repositoryMenu?.setRepositories(repositories);
    // Back from GitHub: the repositories this browser knew before leaving, not the session's (already after the install).
    const knownBefore = boot.takeRefresh() ? knownRepositories() ?? [] : undefined;
    rememberRepositories(result);
    const plan = planRepositoryOpen({
      list: repositories,
      linked: readWorkspaceUrl(),
      hashPresent: Boolean(location.hash),
      knownBefore,
      remembered: info.user ? readWorkspace(info.user.login) : undefined,
    });
    if (plan.kind === "empty") {
      options(repositorySelect, [
        { value: "", label: "No selected repositories" },
      ]);
      if (setupEntry.dismissed()) void showGetStarted().catch(errorMessage);
      else {
        // A new user: the Setup wizard, full screen, in place of Get started.
        content.replaceChildren(node("p", "empty-message", "Create your first site to get started."));
        void setupEntry.open().catch(errorMessage);
      }
      return;
    }
    // A wizard that made a site and was interrupted: the checklist still follows it.
    const unfinished = readWizard(localStorage)?.repo;
    if (unfinished && repositories.some((repo) => repo.id === unfinished.id)) setupController.start(unfinished.id);
    if (!setupEntry.active()) clearWizard(localStorage);
    repositoryOptions();
    repositorySelect.disabled = false;
    if (plan.kind === "invalid-link") {
      errorMessage(
        new Error(
          "This workspace link is invalid. Choose a repository to continue.",
        ),
      );
      return;
    }
    if (plan.kind === "unavailable-link") {
      errorMessage(
        new Error(
          "The linked repository is not available to this GitHub account. Check repository access or choose another project.",
        ),
      );
      return;
    }
    if (plan.kind === "open") {
      repositorySelect.value = String(plan.id);
      await chooseRepository(plan.resume);
      return;
    }
    const panel = node("section", "welcome");
    panel.append(
      node("h1", "", "Open a project"),
      node(
        "p",
        "intro",
        "You’re connected to GitHub. Choose a repository to explore its pages and files.",
      ),
      button("Choose a project", openExplorer, "button primary"),
    );
    content.replaceChildren(panel);
    status("Connected to GitHub. Choose a project to start.");
  } catch (error) {
    if (at.holds()) {
      boot.failed();
      options(repositorySelect, [
        { value: "", label: "Repositories unavailable" },
      ]);
      repositoryMenu?.setRepositories(
        [],
        "Repositories could not be loaded. Use Reload to try again.",
      );
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          "Repositories could not be loaded. Use Reload to try again.",
        ),
      );
      errorMessage(error);
    }
  }
}

function repositoryOptions() {
  options(repositorySelect, [
    { value: "", label: "Select a repository…" },
    ...repositories.map((repo) => ({
      value: String(repo.id),
      label: `${repo.name}${repo.private ? " · private" : ""}`,
    })),
  ]);
}

// After a visit to GitHub's repository access page: list the repositories
// again, keeping the open one open unless it is no longer available.
async function refreshRepositoryList() {
  let next: Repository[];
  try {
    next = await boot.fetchList(true);
  } catch (error) {
    errorMessage(error);
    return;
  }
  if (await boot.recover(next)) return;
  boot.listed();
  if (
    next.length === repositories.length &&
    next.every((repo, index) => repo.id === repositories[index].id)
  )
    return;
  rememberRepositories(next);
  if (!appStore.repository.value || !next.some((repo) => repo.id === appStore.repository.value!.id)) {
    if (appStore.repository.value) history.replaceState(null, "", location.pathname);
    await loadRepositories(next);
    return;
  }
  const added = next.filter(
    (repo) => !repositories.some((known) => known.id === repo.id),
  ).length;
  const removed = repositories.length + added - next.length;
  repositories = next;
  repositoryOptions();
  repositorySelect.value = String(appStore.repository.value.id);
  repositoryMenu?.setRepositories(repositories);
  announce(
    [
      added ? `${added} ${added === 1 ? "repository" : "repositories"} added` : "",
      removed ? `${removed} removed` : "",
    ]
      .filter(Boolean)
      .join(", ") + ".",
  );
}

async function switchAccount(login: string) {
  try {
    const response = await fetch("/api/accounts/switch", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not switch accounts. Try again.");
    }
    location.assign("/");
  } catch (error) {
    errorMessage(error);
  }
}

/** localStorage or sessionStorage, or a store that keeps nothing where the browser refuses it. */
function storage(kind: "local" | "session"): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

async function disconnect() {
  cleanSources.clear();
  try {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Could not disconnect. Try again.");
    // 204: that was the last account on this browser, so nothing continues by itself next time.
    if (response.status === 204) forgetSignedIn(storage("local"));
    forgetBootMemory(storage("local"));
    location.assign("/");
  } catch (error) {
    errorMessage(error);
  }
}

// A draft written with GitHub's text of its file, as this tab holds it, is no change (src/drafts.ts).
draftStore().baseline = (scope, path) => {
  return nativeEngaged && holdsDraftScope(shownScope(), scope)
    ? nativeBaseSources.get(path)
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
    onCommand: applyAgentSiteCommand,
    reload: async snapshot => {
      const scope = draftScope(), open = appStore.openFile.value, at = workspaceSession.begin();
      if (scope) await (await import("./agent-transport")).reloadTakeover(snapshot, { open, key: path => draftKey(scope, path),
        keys: () => draftStore().list(scope).map(draft => draftKey(scope, draft.path)), settle: keys => draftStore().settleAgent(keys),
        draft: path => draftStore().get(scope, path), mounted: path => at.holds() && path === appStore.openFile.value ? editorModule?.getMountedSource(path) : undefined,
        restore: path => restoreFile(path, at) });
    },
    // Ask agent shows in the edit bar while an agent is connected.
    onConnection: (connected) => { setupController.noteAgent(connected); if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
    onRequests: (requests) => nativePreview?.setRequests(requests),
    onQuestions: (count) => repositoryMenu?.setQuestions(count),
    // A question in the selector's list: its pin, card open, answer box focused.
    onShowRequest: (id) => {
      repositoryMenu?.close();
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
  menu: () => repositoryMenu,
  applyList: (next) => {
    repositories = next;
    rememberRepositories(next);
    repositoryOptions();
    repositorySelect.disabled = !next.length;
    if (appStore.repository.value) repositorySelect.value = String(appStore.repository.value.id);
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
