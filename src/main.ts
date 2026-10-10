import { dismissRefusalNote, refuse } from "./components/refusal-note";
import "./components/refusal-note.css";
import { createRowMenu } from "./components/row-menu";
import { elementMenuItems as collectElementMenuItems, type ElementMenuTarget } from "./components/element-menu";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import { nativeChoiceMarkup } from "./page-builder/native-elements";
import { nativeDestinations, nativeMarkupInsertEdit, nativeMoveRefusal } from "./page-builder/native-operations";
import { INLINE_FORMATTING, TEXT_TAGS } from "./page-builder/rules/text-level";
import type { VariantFiles, VariantSite } from "../shared/variant-lookup";
import { createFilesTreeController } from "./controllers/files-tree-controller";
import { createPageStructureController } from "./controllers/page-structure-controller";
import { createMediaController } from "./controllers/media-controller";
import type { BlockInsertPorts } from "./controllers/block-insert-controller";
import { createCardsController } from "./controllers/cards-controller";
import { createPagesController, explorerTabNames, NATIVE_HOME_UNREAD, type ExplorerTab, pageOnBranchHere } from "./controllers/pages-controller";
import { readApiReceipt, type ApiReceipt } from "./boot-api-response";
import { createPreviewSelectionController } from "./controllers/preview-selection-controller";
import { createBootController, planRepositoryOpen } from "./controllers/boot-controller";
import { createHistoryController } from "./controllers/history-controller";
import { batch } from "@preact/signals-core";
import { createAppStore } from "./app-store";
import { handleChunkLoadFailure, hasEditableRecoveryState, installChunkRecovery } from "./chunk-recovery";
import "./utilities.css";
import "./style.css";
import "./theme.css";
import { node, link, button } from "./ui/dom";
import {
  readWorkspace,
  readWorkspaceUrl,
  retainWorkspaceLink,
  resumeWorkspaceLink,
  rememberWorkspace,
  type WorkspaceLocation,
} from "./workspace-state";
import { createSetupEntryController } from "./controllers/setup-entry-controller";
import { createAgentController } from "./controllers/agent-controller";
import type { AgentSiteActions, SharedContext } from "./agent-site";
import { type AgentCommand } from "../shared/agent";
import { draftStore, type DraftScope, type SavedDraft } from "./drafts";
import { nativeBootExtras, nativeBootStyleExtras, nativeShownFiles, readSiteTexts, withSiteIndexed, type SiteIndexGate, type UnreadableFile } from "./native-boot";
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
import type { DropContainer } from "./page-builder/drop-report";
import { createPageStructure, type PageMetaField } from "./components/page-structure";
import type { SiteSettingsValues, SiteLinkPreference } from "./components/site-settings";
import { escapeText, readHeadSettings, upsertHeadTag, withPageField, type HeadField } from "./page-builder/site-head";
import { readSiteIdentity, withSiteIdentityConfig, withSiteIdentityPage } from "./page-builder/site-identity";
import { editNavigation, readNavigation } from "./page-builder/site-navigation";
import { nativePageTemplate, newFilePath, newFolderPath, renamedPath, type Checked } from "./native-create";
import { createCreateDialog, type CreateKind, type CreateRequest } from "./components/create-dialog";
import { createPagesTree, type NativeNewRequest, type NativePagesTarget } from "./components/pages-tree";
import { createFileRowActions, type FileRowTarget } from "./components/file-row-actions";
import { createConfirmDialog } from "./components/confirm-dialog";
import type { FilesResult, OwnerInstallation } from "../shared/types";
import { forgetBootMemory, memoryMatches, provenFiles, readBootMemory, writeBootMemory, type BootMemory } from "./boot-memory";
import type { CreateChoice, CreateOutcome } from "./components/get-started";
import type { WizardCreateOutcome } from "./components/setup-wizard";
import { clearWizard, connectionFromOnboarding, readWizard, writeWizard, type Connection, type WizardRepo } from "./setup-wizard";
import { forgetSignedIn } from "./auto-signin";

import { AGENT_EXPLAINER, agentWhere } from "./onboarding-copy";
import { createSetupChecklistController } from "./controllers/setup-checklist-controller";
import { withSiteSettings, type SetupState } from "./setup-checklist";
import { blankSiteFiles, siteNameFromRepository, type StartingPoint } from "../shared/starting-point";
import { createPagePicker } from "./components/page-picker";
import type { UrlPlan } from "./components/url-change";
import type { MenuItem } from "./components/row-menu";
import { deleteFile, duplicateFile, listChanges, restoreFile as restoreDraftFile, type FileChange } from "./file-changes";
import { DEFAULT_IMAGE_FOLDER, addUpload, formatBytes, pickFiles, sweepUploads, uploadBytes, uploadDataUrl, uploadImageType, uploadKey } from "./uploads";
import { firstHeadingText, nativeLinkSuggestions, nativePageLabel } from "./native-pages";
import { elementPathAt, locateNativeElement, locateNativeElementRange, startTagAttribute, textRangeInSource, wrapperAround, type ElementRange } from "./native-source-location";
import { positionText } from "./page-builder/insert-target";
import { itemsSlotRule } from "./page-builder/block-insert";
import { createBlockMoves } from "./page-builder/block-move";
import { nativeElementKeyMove, nativeElementMoveMessage, templateKeyMove, templateMoveRefusal, templateMovePath, type NativeElementMoveResult, type NativeMoveDirection } from "./page-builder/block-move-rules";
import { componentLabel, nativeInsertEdit, isSectionTemplate } from "./native-insert";
import { isImagePath, structureLabel } from "./native-structure";
import { gridOfItem } from "./page-builder/card-source";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import * as sourceEditor from "./components/source-editor";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "./styles-index";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "./style-cascade";
import type { MediaWorkspaceBatch } from "./page-builder/media-workspace";
import { addGuardedUpload } from "./page-builder/guarded-upload";
import type { CssWorkspace } from "./page-builder/css-intelligence";
import type { DeclarationStatus, RuleStatus } from "../shared/cascade";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports";
import { nativePageRoute } from "../shared/native-routes";





import { descendants, parseSource } from "./page-builder/component-model";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, NATIVE_REDIRECTS_PATH, minimalTextEdit, nativeComponentCssPath, nativeDefaultRoute, nativePageBody, nativePageHead, nativePageStylesheets, nativePageMovedUrl, nativeSitePaths, nativeSiteSettings, resolveNativeProject, type NativeSite } from "../shared/native-project";
import { dataUrlOf, loadNativeAssetRequests } from "./native-assets";
import { assetType, blobUrl, isFontType } from "../shared/asset-types";
import { fetchWithReadRetry } from "./read-retry";
import { RepositoryIndex, fileKey, readFileText, readFileTexts, rememberFile } from "./repository-loading";
import { iconMarkup, setIcon } from "./icons";
import { createCommandPaletteController } from "./controllers/command-palette-controller";
import { createCodePanesController } from "./controllers/code-panes-controller";
import { createSavePublishController } from "./controllers/save-publish-controller";
import { createFileOperationsController } from "./controllers/file-operations-controller";
import { createComponentTools, type ComponentTools, type PreparedComponentLoader } from "./page-builder/components";
import { addSectionStep, type SectionPlanned } from "./page-builder/component-plans";
import { writeNewDrafts } from "./new-drafts";
import { createAgentSiteHost } from "./agent-site-host";
import { createGuardedEdits, type Reads, type PlanResult, type Stamp, type Outcome } from "./guarded-edit";
import { createEditorWorkspace } from "./editor-workspace";
import type {
  EditorContext,
  Directory,
  FileRevision,
  HistoryCommit,
  PublishResult,
  RestoreResult,
  Repository,
  SessionInfo,
  Snapshot,
  StarterFile,
  TreeEntry,
} from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
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
const appStore = createAppStore(editorModule.sourceStore());
installChunkRecovery({
  storage: () => window.sessionStorage,
  // Undo/Redo steps or unsaved text that live only in this tab's memory.
  unsafe: () => editorModule.hasMemoryState() || hasEditableRecoveryState(document),
  flush: () => draftStore().flush(),
  persistenceError: () => Boolean(draftStore().error),
  reload: () => window.location.reload(),
  notice: (message) => {
    const notice = document.getElementById("notice");
    if (notice) { notice.textContent = message; notice.hidden = false; }
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
const loadHistory = lazyModule(() => import("./components/commit-history"));
// The media picker and the media workspace behind it (its batches are staged by applyMediaBatch).
const loadMediaWorkspace = lazyModule(() => Promise.all([import("./page-builder/media-workspace"), import("./page-builder/media-draft-transaction")]));
const loadMedia = lazyModule(async () => {
  const [module, [{ createMediaWorkspace }]] = await Promise.all([import("./page-builder/media-picker"), loadMediaWorkspace()]);
  module.configureMediaPicker(createMediaWorkspace(mediaController.workspaceContext));
  return module;
});
const loadChecklist = lazyModule(() => import("./components/setup-checklist"));
// The prompt for a coding agent that sets the site up (src/agent-prompts.ts),
// loaded with the wizard and the start panel that offer it.
let agentPrompts: typeof import("./agent-prompts") | undefined;
const loadAgentPrompts = lazyModule(async () => agentPrompts = await import("./agent-prompts"));
const loadWizard = lazyModule(async () => (await Promise.all([import("./components/setup-wizard"), loadAgentPrompts()]))[0]);
const loadGetStarted = lazyModule(() => import("./components/get-started"));
const loadStartSite = lazyModule(() => import("./components/start-site"));
const loadSpotlight = lazyModule(() => import("./components/spotlight"));
const loadAgentMenu = lazyModule(() => import("./components/agent-menu"));
// The Site, Page and Navigation settings dialogs, loaded when one first opens.
const loadSiteSettings = lazyModule(() => import("./components/site-settings"));
// What agents are shown and how their commands run (src/agent-site.ts), loaded when one asks.
const loadAgentSite = lazyModule(() => import("./agent-site"));
// The code panes' Monaco load gate and resize handles (src/controllers/code-panes-controller.ts).
const codePanes = createCodePanesController({
  load: () => import("./components/code-editor"),
  onChunkFailure: (error) => void handleChunkLoadFailure(error),
  mountCodeResize,
  mountCodeWidthResize,
});
// Undo or Redo of a file no pane shows (a stylesheet whose pane closed) still redraws the preview.
editorModule.onUnmountedText(({ scope, path }) => {
  const live = draftScope();
  if (!live || draftKey(live, path) !== draftKey(scope, path)) return;
  renderDraftFiles();
  if (nativeModeActive()) updateNativePreviewSources();
});
// A pane that needs the code now (Review, focusing the code) asks for Monaco.
editorModule.setViewLoader(() => codePanes.want().then((module) => module.monacoView));
let disposeEditor: (() => void) | undefined;
// The live primary keeps its journal even when a completed operation releases its alias.
let primaryHistoryScope: { key: string; session: string; proof: { isCurrent(): boolean } } | undefined;
let activeFileContext: EditorContext["file"] = null;
let editorRequest = 0;

// A guarded edit's step binds only its own new and moved-in paths to the anchor page's journal.
const nativeHistoryAliases = new Map<string, { epoch: number; scope: string; session: string }>();
// The guarded edit module, told of each file a pane mounts (`pane`: the stylesheet pane, which follows the page opened).
let nativeMountListener: ((path: string, pane: boolean) => void) | undefined;
// Edit component's shares (components' shareHistory): a template records its steps in a page's journal, the latest share first.
const nativeHistoryShares = new Map<string, { epoch: number; scope: string; session: string }[]>();
function nativeHistorySession(scope: NonNullable<ReturnType<typeof draftScope>>, path: string) {
  const key = draftKey(scope, path), share = nativeHistoryShares.get(key)?.at(-1), alias = nativeHistoryAliases.get(key);
  const live = (bound: typeof alias): bound is NonNullable<typeof alias> => !!bound && bound.epoch === generation && bound.scope === setupScope();
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
      <div class="explorer-settings"><button type="button" id="site-settings-toggle" class="icon-button" aria-label="Site settings" title="Site settings">${iconMarkup("gear")}</button></div>
      <div id="explorer-tabs" class="explorer-tabs" role="tablist" aria-label="Pages, files or images" hidden>
        <button type="button" id="explorer-tab-pages" class="explorer-tab" role="tab" aria-controls="explorer-pages" aria-selected="true">Pages</button>
        <button type="button" id="explorer-tab-files" class="explorer-tab" role="tab" aria-controls="explorer-files" aria-selected="false" tabindex="-1">Files</button>
        <button type="button" id="explorer-tab-images" class="explorer-tab" role="tab" aria-controls="explorer-images" aria-selected="false" tabindex="-1">Images</button>
      </div>
      <div id="explorer-pages" class="explorer-panel" aria-labelledby="explorer-tab-pages" hidden></div>
      <div id="explorer-images" class="explorer-panel" aria-labelledby="explorer-tab-images" hidden></div>
      <div id="explorer-files" class="explorer-panel" aria-labelledby="explorer-tab-files">
        <div class="files-heading"><span>FILES</span><span class="files-heading__end"><span id="revision">—</span><button type="button" id="new-at-root" class="file-add" aria-label="New file or folder" title="New file or folder at the top of the repository" aria-haspopup="dialog">${iconMarkup("plus")}</button></span></div>
        <nav id="files" aria-label="Repository files"></nav>
      </div>
    </div>
    <div class="workspace">
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
    onSignOut: disconnect,
  });
  element("repository-menu").append(repositoryMenu.root);
  element("site-settings-toggle").addEventListener("click", () => void openNativeSiteSettings());
  disposeExplorerImages();
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
      const template = componentTools?.editModeTemplate();
      const block = { kind: "new", block: kind, ...(template ? { template: true } : {}) } as const;
      // In Edit component mode Page Structure takes it into the template edited, as the canvas does.
      return loadBlockDrag().then(drag => since.holds() ? nativePreview?.blockDrag(block, {
        tree: structureDrop(drag, block, template),
        drop: (target, where, painted, pointer) => {
          const place = { parent: target.container.path, index: target.index, where, ...(target.container.kind === "items" && !template ? { slot: target.container.slot } : {}) };
          const at = blockInsertPorts.target();
          if (template && at?.path !== template.path) { refuse("Edit component mode was left meanwhile: nothing was added.", { pointer }); return; }
          if (since.holds()) void finishRailTyping(() => since.holds()).then(async finished => {
            if (!since.holds()) return;
            if (!finished) { blockInsertPorts.refuse(STILL_UPDATING, pointer); return; }
            const blocks = await loadBlockInsert();
            if (since.holds()) await blocks.drop(kind, place, painted, at, pointer, since);
          }).catch(errorMessage);
        },
        announce,
      }, drag.createBlockDrag, template?.path) : undefined);
    },
  });
  sidebarResize = mountSidebarResize(
    app.querySelector<HTMLElement>(".workspace")!,
    app.querySelector<HTMLElement>(".sidebar")!,
  );
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
    anchor: "--explorer",
  });
  createDialog = createCreateDialog({
    plan: (request) => {
      const planned = planCreation(request);
      return planned.ok ? { ok: true, summary: planned.value.summary } : planned;
    },
    create: createFromRequest,
  });
  element("explorer").append(createDialog.root);
  confirmDialog = createConfirmDialog();
  element("explorer").append(confirmDialog.root);
  // Discard changes in the top bar asks outside the explorer, which may be closed.
  discardDialog = createConfirmDialog("discard-dialog");
  app.append(discardDialog.root);
  pagePicker = createPagePicker();
  element("explorer").append(pagePicker.root);
  const newAtRoot = element<HTMLButtonElement>("new-at-root");
  newAtRoot.addEventListener("click", () => openCreate("", newAtRoot));
  fileActions = createFileRowActions({
    host: element("explorer-files"),
    items: fileRowItems,
    checkRename: (target, name) => renameProblem(target, name),
    rename: renameFileTarget,
    remove: (target) => void deleteFileTarget(target),
    dropProblem: (source, folder) => dropProblem(source, folder),
    drop: (source, folder) => void dropFileTarget(source, folder),
    dropFiles: (files, folder) => void uploadFilesTo(folder, files),
    announce,
  });
  fileActions.attachRoot(files);
  fileActions.attachRoot(element("explorer-files").querySelector<HTMLElement>(".files-heading")!);
  pagesTree = createPagesTree({
    open: (file) => {
      if (file === appStore.openFile.value && editorModule?.isMounted(file)) explorerDropdown?.close();
      else void restoreFile(file, generation);
    },
    plan: (request) => {
      const planned = planNativeNew(request);
      return planned.ok ? { ok: true, value: { route: planned.value.route, file: planned.value.file, note: planned.value.note } } : planned;
    },
    create: createNativeNew,
    announce,
    onInteractionEnd: flushPendingNativePageTitles,
    retitle: retitleNativePage,
    changed: (file) => Boolean(treeState().changes.get(file)),
    discard: (file) => void savePublish.discardFile(file),
    duplicate: (file) => void duplicateNativePage(file),
    remove: (target) => void removeNativePagesTarget(target),
    createPage: (route) => void createNativeFolderPage(route),
    pageSettings: (path) => { element("explorer-toggle").focus(); void openNativePageSettings(path); },
    navigation: (path) => { element("explorer-toggle").focus(); void openNativeNavigation(path); },
    canAddToNavigation: () => Boolean(nativeNavigationTarget(nativeSite?.routes["/"])),
    planUrl: (target, value) => (target.file ? nativeUrlPlan(target.file, value) : { ok: false, error: "This row has no page." }),
    changeUrl: (target, value, keep) => (target.file ? changeNativeUrl(target.file, value, keep) : Promise.resolve("This row has no page.")),
    moveTo: (target) => void moveNativePageTo(target),
    dropProblem: nativeDropProblem,
    drop: (source, parent) => void confirmNativeMove(source, parent),
    cardOffer: cardsController.cardOffer,
  });
  element("explorer-pages").append(pagesTree.root);
  mountExplorerTabs();
  element("explorer").addEventListener("toggle", () => {
    if (explorerDropdown?.isOpen()) renderPagesTree();
    else {
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
    ...previewSelection.handlers(),
    onDismissContextMenu: () => previewElementMenu?.close(false),
    // The right-clicked element as the edit bar takes it (a shared template's part maps to its instance).
    onContextMenu: (point, anchor, selection) => {
      const target = componentTools?.instanceSelection(selection);
      const entries = target ? elementMenuItems(target) : [];
      if (entries.length) previewElementMenu?.open(anchor, entries, point, "Element actions");
    },
    // The images of a page shown by following a link are read when it shows.
    // A page the text index has not read yet is read when it shows.
    onRouteShown: (route) => {
      if (!nativeSite) return;
      if (nativePreviewBehind) updateNativePreviewSources();
      void loadNativeAssets(nativeRouteShownSources(route));
      void loadNativeShownFiles(route);
    },
    cards: cardsController.preview,
    onComponentStyles: (tags) => void loadNativeComponentStyles(tags),
    onDefaultStyles: (styles) => updateBodyStyles({ rules: styles.selectors, cascade: styles.cascade }),
    onFormat: (format) => pageStructureController.nativeFormatActions[format]?.(),
    onImageDrop: (target, files) => void chooseMediaForImage(target, files),
    onImageEdit: (target) => void chooseMediaForImage(target),
    onTextEdit: (edit) => void applyNativeTextEdit(edit),
    insertChoices: nativeSectionChoices,
    insertPointFor: nativeElementAddPoint,
    insertDestinationText: point => point ? nativeAddPoints.get(point)?.description ?? positionText(point) : "Choose a section destination.",
    onInsert: (point, choice) => void insertNativeComponent(point, choice),
    onNewComponent: (tag, point) => componentTools?.newComponent(tag, point) ?? Promise.resolve(false),
    onStructure: (structure) => {
      if (!structure) { pageStructure?.update(undefined); return; }
      codePanes.notePreviewPainted();
      noteNativePainted();
      const path = structure.path, source = structure.paintedSource, scope = draftScope(), epoch = generation, scopeKey = setupScope();
      const proof = scope && editorModule?.captureFileModelState(scope, path);
      const capture = (item: NativeStructureItem) => {
        nativeStructurePaintedSources.set(item, source);
        nativeStructureMoveActions.set(item, direction => {
          if (source === undefined || !proof?.isCurrent() || epoch !== generation || scopeKey !== setupScope() || versionView || appStore.openFile.value !== path || !editorModule?.isMounted(path) || nativeEffectiveSource(path) !== source) {
            refuse("The source changed or its editor is not open. Select the element again before moving it."); return "stayed";
          }
          return moveNativeBlock(path, source, item.node, direction);
        });
        item.children.forEach(capture);
      };
      const shown = structure;
      shown.items.forEach(capture);
      pageStructure?.update(shown);
    },
    onMove: (direction) => {
      if (direction !== "out" && direction !== "in") { pageStructureController.nativeElementMoveAction?.(direction); return; }
      const selection = appStore.selection.value;
      if (selection && !componentTools?.isTemplateRoot(selection)) moveNativeCanvasBlock(selection, direction);
    },
    onBlockPress: dragPageBlock,
    onDismissRequest: (id) => void agentController.dismiss(id),
    onAnswerRequest: async (id, text) => {
      await agentController.answer(id, text);
    },
    // The Add panel docks over the page structure sidebar.
    addPanelDock: () => {
      const area = app.querySelector<HTMLElement>(".workspace")?.getBoundingClientRect();
      const side = app.querySelector<HTMLElement>(".workspace > .sidebar")?.getBoundingClientRect();
      return area && { left: side?.left ?? area.left, top: side?.top ?? area.top, bottom: Math.min(area.bottom, innerHeight), width: side?.width ?? 320 };
    },
  });
  nativePreview.attachAddButton(element<HTMLButtonElement>("add-panel-toggle"));
  pageStructure = createPageStructure(element("structure"), {
    menuItems: (path, item, opening, template) => {
      const painted = template ? template.source : nativeStructurePaintedSources.get(item);
      const fresh = () => painted !== undefined && nativeEffectiveSource(path) === painted && !versionView;
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
    textRow: (path, node, tag) => nativeTextTags.has(tag) ? componentTools?.textRow(path, node) : undefined,
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
    planUrl: nativeUrlPlan,
    applyUrl: changeNativeUrl,
    onPageMetaClose: (path) => editorModule?.closeActiveEditGroup(path),
    // In Edit component mode a row of the template edited (`template`: the bytes it was painted from).
    onMove: (path, item, direction, template) => {
      if (template) {
        if (template.painted === undefined || nativeEffectiveSource(path) !== template.painted || componentTools?.editModeTemplate()?.path !== path || appStore.openFile.value !== path || !editorModule?.isMounted(path)) {
          refuse("The source changed. Wait for the preview before moving this element."); return "stayed";
        }
        return moveNativeTemplatePart(path, template.painted, item.node, direction);
      }
      const paintedSource = nativeStructurePaintedSources.get(item);
      if (paintedSource === undefined || nativeEffectiveSource(path) !== paintedSource) {
        refuse("The source changed. Wait for the preview before moving this element."); return "stayed";
      }
      if (direction === "out" || direction === "in" || !isNativeSectionTag(item.tag)) return nativeStructureMoveActions.get(item)?.(direction);
      const target = { path, node: item.node, tag: item.tag };
      if (appStore.openFile.value === path && editorModule?.isMounted(path)) return moveNativeSection(target, direction, { painted: paintedSource }) ?? "stayed";
      void moveNativeSectionAfterOpening(target, direction, paintedSource);
      return "pending";
    },
    // A row drags as its block does on the page: the same targets, in the tree as well.
    itemsSlots: nativeMoveItems,
    // In Edit component mode a row of the template edited (`template`: the bytes it was painted from).
    onRowDrag: (press, item, template) => dragPageBlock(press, {
      node: item.node, tag: item.tag, cls: item.className ?? "", band: !template && isNativeSectionTag(item.tag),
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
  beginNewPage: () => { openExplorer(); selectExplorerTab("pages"); },
  startNewPage: () => pagesTree?.startNew("/"),
  actions: {
    open: (path) => {
      if (path === appStore.openFile.value && editorModule?.isMounted(path)) return;
      recordNativeSourceIntent(path);
      void restoreFile(path, generation);
    },
    isSectionTag: isNativeSectionTag,
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
      if (nativeSite) selectExplorerTab("files");
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
  return createComponentTools({
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
      const epoch = generation, scope = draftScope();
      recordNativeSourceIntent(path);
      // A pane open on its own history when a share (shareHistory below) asks for another opens again on that.
      const shared = scope && nativeHistoryShares.has(draftKey(scope, path)) ? nativeHistorySession(scope, path) : undefined;
      if (appStore.openFile.value !== path || !editorModule?.isMounted(path) || (shared && editorModule.paneOf(path)?.session !== shared)) await restoreFile(path, epoch);
      return epoch === generation && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path));
    },
    announce,
    error: errorMessage,
    images: nativeImagePaths,
    upload: async (files) => {
      const [uploaded] = await uploadFilesTo(DEFAULT_IMAGE_FOLDER, files);
      return uploaded === undefined ? undefined : `/${uploaded}`;
    },
    links: () => (nativeSite ? nativeLinkSuggestions(Object.keys(nativeSite.routes), (route) => nativeRouteInfo(route).title) : []),
    pageLabel: nativePageLabelOf,
    panelHost: app.querySelector<HTMLElement>(".sidebar")!,
    canvasComponent: (parts) => nativePreview?.setCanvasComponent(parts),
    codeTitle: element("primary-title").parentElement!,
    previewPage: () => {
      const route = nativePreview?.route();
      return route && nativeSite ? nativeSite.routes[route] : undefined;
    },
    refreshBar: () => { if (appStore.selection.value) renderNativeEditBar(appStore.selection.value); },
    refreshStructure: () => pageStructure?.refresh(),
    // Joins the template to the page's journal, as the stylesheet pane follows the page's; an operation's alias stays under it.
    shareHistory: (path, owner) => {
      const scope = draftScope();
      if (!scope) return () => {};
      const key = draftKey(scope, path), share = { epoch: generation, scope: setupScope(), session: nativeHistorySession(scope, owner) };
      nativeHistoryShares.set(key, [...nativeHistoryShares.get(key) ?? [], share]);
      return () => {
        const rest = nativeHistoryShares.get(key)?.filter((each) => each !== share) ?? [];
        if (rest.length) nativeHistoryShares.set(key, rest); else nativeHistoryShares.delete(key);
      };
    },
  });
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
const nativeAddPoints = new WeakMap<InsertPoint, { source: string; epoch: number; scope: string; description: string }>();
function nativeElementAddPoint(choice: InsertChoice, fallback: InsertPoint | undefined, mode: "click" | "drop" | "gap" = "click"): InsertPoint | undefined {
  const markup = nativeChoiceMarkup(choice.tag);
  if (!markup) return fallback;
  if (versionView || !nativeSite) return;
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
  nativeAddPoints.set(point, { source, epoch: generation, scope: setupScope(), description: found.description });
  return point;
}
/** Plans from every indexed page and stylesheet, retaining the proof across lazy reads. */
async function nativeComponentLoaderPlan(path: string, nextPageText: string): Promise<PreparedComponentLoader | string | undefined> {
  const epoch = generation, scope = setupScope(), source = nativeEffectiveSource(path);
  const initial = () => generation === epoch && setupScope() === scope && nativeEffectiveSource(path) === source && !versionView;
  const error = await ensureNativeTextIndex();
  if (!initial()) return "The repository or source changed meanwhile. Review the latest files and try again.";
  if (error) return error;
  const sources = nativeSources(), files = nativeFiles().sort().join("\n");
  const expectedSources = new Map<string, string | undefined>(Object.entries(sources));
  const current = () => initial() && nativeFiles().sort().join("\n") === files &&
    [...expectedSources].every(([file, text]) => nativeEffectiveSource(file) === text);
  try {
    const { componentLoaderPlan } = await import("./page-builder/component-loader");
    if (!current()) return "The repository or source changed meanwhile. Review the latest files and try again.";
    const pages = Object.values(nativeSite?.routes ?? {});
    // The first pass avoids loading the vendored bytes when the site already has its loader.
    const input = { pages, sources: { ...sources, [path]: nextPageText }, exists: nativePathExists, loader: "" };
    const needed = componentLoaderPlan(input);
    if (!needed) return;
    if (!needed.creates.length) return { ...needed, expectedSources, current };
    const { starterLoader } = await import("./page-builder/starter-loader");
    if (!current()) return "The repository or source changed meanwhile. Review the latest files and try again.";
    const loader = await starterLoader();
    if (!current()) return "The repository or source changed meanwhile. Review the latest files and try again.";
    const plan = componentLoaderPlan({ ...input, loader });
    return plan && { ...plan, expectedSources, current };
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
  const native = nativeChoiceMarkup(choice.tag);
  // A destination planned against the page's bytes then (the Add panel's) holds only while they do.
  const captured = nativeAddPoints.get(point), moved = "The insertion source changed. Choose the destination again.";
  if (captured && (captured.epoch !== generation || captured.scope !== setupScope() || versionView)) { errorMessage(new Error(moved)); return; }
  if (!nativePreview || !nativeSite || !Object.values(nativeSite.routes).includes(path)) return;
  const selected = appStore.selection.value;
  const before = selected?.node ? { path: selected.path, node: [...selected.node] } : undefined;
  let planned: SectionPlanned | undefined;
  // The page opens first when another file is in the editor (Edit component mode on a template it
  // uses ends then): the repository and branch hold, as the page's bytes do.
  const since = guardedEdits.stamp("repository");
  const outcome = await guardedEdits.run(async r => {
    const plan = await addSectionStep(r, { path, select: [...point.parent, point.index], message: `${choice.label} added`, before,
      loader: native ? undefined : nativeComponentLoaderPlan,
      edit(page) {
        if (native && captured && page !== captured.source) return moved;
        const edit = native ? nativeMarkupInsertEdit(page, point.parent, point.index, native)
          : nativeInsertEdit(page, point.parent, point.index, choice.tag, r.template(choice.tag)?.source ?? "");
        return edit ? [edit] : `${choice.label} was not added: the HTML around that spot could not be located exactly in ${path}.`;
      } });
    if (!("refuse" in plan)) planned = plan;
    return plan;
  }, { since, anchor: path, guard: () => !versionView && (!planned?.loader || planned.loader.current()) });
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
const guardedEdits = createGuardedEdits(createEditorWorkspace({
  generation: () => generation,
  setupScope,
  draftScope,
  versionView: () => Boolean(versionView),
  route: () => nativePreview?.route(),
  editModeEntry: () => componentTools?.editModeEntry(),
  agentActing: () => agentActingDepth > 0,
  site: () => nativeSite,
  files: () => nativeFiles(),
  store: draftStore,
  source: path => nativeEffectiveSource(path),
  exists: path => nativePathExists(path) || (!nativeSite && (pathNow(path, treeState()) === "file" || pathNow(path, treeState()) === "folder")),
  base: path => nativeBaseSources.get(path),
  branchText,
  entry: async path => (await targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true))[0],
  createProblem: async path => (await findEntry(path)) ? `${path} already exists.` : branchPathProblem(path),
  openFile: () => appStore.openFile.value,
  restore: (path, epoch, beforeMount) => restoreFile(path, epoch, { linkDefaultStyle: false, beforeMount }),
  editor: editorModule,
  shareHistory(paths, anchor) {
    const scope = draftScope();
    if (!scope) return () => {};
    const alias = { epoch: generation, scope: setupScope(), session: nativeHistorySession(scope, anchor) };
    for (const path of paths) nativeHistoryAliases.set(draftKey(scope, path), alias);
    return () => { for (const [key, value] of nativeHistoryAliases) if (value === alias) nativeHistoryAliases.delete(key); };
  },
  onMount: listener => { nativeMountListener = listener; },
  paneFile: () => secondaryPath,
  closePane: closeSecondary,
  afterFileChanges,
  openAfter: (path, keepExplorer) => openAfter(path, keepExplorer, true),
  showRow: focus => { if (explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") renderPagesTree(focus); },
  status: () => element("status").textContent ?? "",
  select: (request, reveal) => nativePreview?.selectAfterUpdate(request, reveal ? { reveal: "center" } : undefined),
  flash: request => nativePreview?.flashInsert(request),
  announce,
  refuse: (message, history) => refuse(message, history ? { history } : {}),
  error: errorMessage,
}));
// The Block move module (src/page-builder/block-move.ts): what a press moves, where it may go,
// and the move as one guarded edit, on the page or the template edited. Its ways in arrive in
// sturdy-base slices 31-33.
const blockMoves = createBlockMoves({
  edits: guardedEdits,
  editing: () => componentTools?.editModeTemplate(),
  mounted: path => appStore.openFile.value === path && Boolean(editorModule?.isMounted(path)),
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
void blockMoves;
// The block rail's clicks and drags: one source edit per block, the new block selected.
// Loaded with the first click.
const blockInsertPorts: BlockInsertPorts = {
  target: () => {
    const route = nativePreview?.route();
    const path = route !== undefined && nativeSite && !versionView ? nativeSite.routes[route] : undefined;
    if (!path) return undefined;
    // Edit component mode builds in the template edited, a part of it selected.
    const template = componentTools?.editModeTemplate();
    if (template && template.page === path) {
      const selection = appStore.selection.value;
      return selection?.path === template.path ? { path: template.path, node: selection.node, painted: selection.paintedSource, template: template.tag } : { path: template.path, template: template.tag };
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
const structureDrop = (drag: Awaited<ReturnType<typeof loadBlockDrag>>, block: DraggedBlock, template?: { path: string; tag: string }) =>
  pageStructure && drag.structureDrop(pageStructure.dropView(template?.path), block, tag => guardedEdits.peek.template(tag)?.source, template?.tag);

// A page block dragged by its name in the edit bar (`pressed` none: the
// selection) or pressed in the page: moved where it is dropped, one undo
// step (the block-insert controller's `move`), anywhere HTML's content rules
// allow (slice 82). In Edit component mode the template's parts move the
// same way in the template (a named slot with its element), and the page's
// blocks stay put. The drag's targets load with the first one; the press's
// page, repository and session hold throughout.
function dragPageBlock(press: DragPress, pressed?: PressedBlock) {
  const at = blockInsertPorts.target(), selection = appStore.selection.value;
  const template = at?.template !== undefined ? componentTools?.editModeTemplate() : undefined;
  if (pressed && Boolean(pressed.template) !== Boolean(template)) return undefined;
  const from = pressed ?? (selection?.node && selection.path === at?.path
    ? { node: selection.node, tag: selection.tag, cls: "", band: !template && isNativeSectionTag(selection.tag), painted: selection.paintedSource } : undefined);
  if (!at || !from) return undefined;
  // A part a named slot holds alone moves with its slot.
  const node = template ? from.painted === undefined ? undefined : templateMovePath(from.painted, from.node) : from.node;
  if (!node) return undefined;
  // Another page shown meanwhile ends it too: its probes measure that page.
  const since = guardedEdits.stamp();
  const painted = from.painted, items = nativeMoveItems();
  // Why a container can't take it, by the bytes the press measured (the probe's paths are theirs).
  const fits = (container: DropContainer) => painted === undefined ? "The page is still updating. Try again in a moment."
    : template ? templateMoveRefusal(painted, node, container.path)
    : nativeMoveRefusal(painted, node, container.path, items, container.kind === "items" ? container.slot : undefined);
  const block: DraggedBlock = { kind: "move", path: node, band: from.band, fits, ...(template ? { template: true } : {}) };
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
        const place = { parent: target.container.path, index: target.index, where, ...(target.container.kind === "items" && !template ? { slot: target.container.slot } : {}) };
        const request = { from: node, name, pressed: from.painted, place, painted, inside: from.node.slice(node.length) };
        if (since.holds()) void loadBlockInsert().then(blocks => since.holds() ? blocks.move(request, at, since) : undefined).catch(errorMessage);
      },
      announce,
    }, drag.createBlockDrag, template?.path);
  }), true);
}
const loadBlockInsert = lazyModule(async () => (await import("./controllers/block-insert-controller")).createBlockInsertController(blockInsertPorts));

const historyController = createHistoryController({
  capture: () => {
    const account = info.user?.login, repo = appStore.repository.value, snapshot = appStore.snapshot.value;
    if (!account || !repo || !snapshot) return undefined;
    const epoch = generation, path = appStore.openFile.value;
    const scope = { account, repoId: repo.id, repo: repo.full_name, branch: snapshot.branch };
    return {
      key: JSON.stringify([epoch, account, repo.id, snapshot.commit, snapshot.branch, path]),
      repo: repo.full_name, branch: snapshot.branch, path, empty: Boolean(snapshot.empty),
      isCurrent: site => generation === epoch && info.user?.login === account && appStore.repository.value?.id === scope.repoId && appStore.snapshot.value?.branch === scope.branch && (site || appStore.openFile.value === path),
      hasDraft: () => Boolean(path && draftStore().get(scope, path)),
      viewing: () => { const view = versionView; return view && view.path === path && view.key === versionKey() ? view.commit.sha : undefined; },
    };
  },
  panel: () => document.getElementById("changes") ?? undefined,
  anchor: () => document.getElementById("history-button") ?? undefined,
  loadHistory,
  emptyMessage: () => node("p", "muted commit-history__message", "No commits yet. Save to GitHub makes the first one."),
  viewport: () => ({ width: innerWidth, height: innerHeight }),
  onResize: callback => { window.addEventListener("resize", callback); return () => window.removeEventListener("resize", callback); },
  openFile: (file, commit, head) => void openFileVersion(file, commit, head),
  view: (commit, head, latest) => latest ? endVersionView() : void viewVersion(commit, head),
  restored: async (path, result) => { endVersionView(false); await afterRestore(path, result); },
  restoreSkipped: (path, result, hasDraft) => status(`${result.unchanged
    ? "This file already matches that version; reload before saving."
    : `Restored ${path} in a new commit; reload before saving.`}${hasDraft ? " Your draft was kept." : ""}`),
  expired: () => errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
  onError: errorMessage,
});

// A file from the site's history: it opens, showing its version from that
// commit unless that is the branch's latest.
async function openFileVersion(path: string, commit: HistoryCommit, head: string) {
  const epoch = generation;
  if (appStore.openFile.value !== path) await restoreFile(path, epoch, { keepExplorer: false });
  if (epoch !== generation || appStore.openFile.value !== path) return;
  if (commit.sha === head) endVersionView();
  else await viewVersion(commit, head);
}

async function afterRestore(path: string, result: RestoreResult) {
  historyController.destroy();
  if (!result.unchanged) await loadSnapshot(path);
  status(result.unchanged ? "This file already matches that version." : `Restored ${path} in a new commit. Other files are unchanged.`);
}

// An earlier version of the open file on show, chosen in History: the
// preview renders it (nothing on it can be selected), the code pane shows
// it beside the current one, and a bar over the preview offers Back to
// latest and Restore. It ends there, on a restore, on another file or
// repository, or once the file's current source changes.
type VersionView = { key: string; path: string; commit: HistoryCommit; head: string; content: string; latest: string | undefined };
let versionView: VersionView | undefined;
let versionRequest = 0;
let versionDialog: ReturnType<typeof createConfirmDialog> | undefined;
const versionKey = () => `${generation}:${appStore.repository.value?.id}:${appStore.snapshot.value?.branch}`;
const versionLabel = (commit: HistoryCommit) => {
  const date = new Date(commit.date);
  return Number.isNaN(date.getTime())
    ? commit.sha.slice(0, 7)
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

async function viewVersion(commit: HistoryCommit, head: string) {
  const path = appStore.openFile.value;
  if (!path || !appStore.repository.value) return;
  const request = ++versionRequest;
  const key = versionKey();
  try {
    const revision = await api<FileRevision>("file-at", { repo: appStore.repository.value.full_name, commit: commit.sha, path });
    if (request !== versionRequest || key !== versionKey() || appStore.openFile.value !== path) return;
    nativePreview?.setViewing(undefined);
    versionView = { key, path, commit, head, content: revision.content, latest: nativeEffectiveSource(path) };
    nativePreview?.setViewing(versionBar(versionView));
    editorModule?.compareVersion(path, { content: revision.content, label: versionLabel(commit) });
    updateNativePreviewSources();
    historyController.mark();
  } catch (error) {
    if (request === versionRequest) status(error instanceof Error ? error.message : "That version could not be loaded. Try again.");
  }
}

function endVersionView(refresh = true) {
  versionRequest++;
  const view = versionView;
  if (!view) return;
  versionView = undefined;
  nativePreview?.setViewing(undefined);
  editorModule?.compareVersion(view.path, undefined);
  historyController.mark();
  if (refresh) updateNativePreviewSources();
}

// The version on show ends once it no longer belongs to what is open.
function checkVersionView() {
  const view = versionView;
  if (view && (view.key !== versionKey() || appStore.openFile.value !== view.path || nativeEffectiveSource(view.path) !== view.latest))
    endVersionView(false);
}

function versionBar(view: VersionView) {
  const bar = node("div", "version-bar");
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Earlier version");
  const text = node("p", "version-bar__text");
  text.append(node("strong", "", `Viewing ${versionLabel(view.commit)}`), node("span", "version-bar__message", view.commit.message));
  text.title = `${view.commit.message} (${view.commit.sha.slice(0, 7)})`;
  bar.append(
    text,
    button("Back to latest", () => endVersionView(), "button secondary"),
    button("Restore this version", () => void restoreVersion(view), "button primary"),
  );
  return bar;
}

async function restoreVersion(view: VersionView) {
  const scope = draftScope();
  if (!appStore.repository.value || !appStore.snapshot.value || versionView !== view) return;
  if (scope && draftStore().get(scope, view.path)) {
    refuse("Publish or discard this file’s draft before restoring. Other files’ drafts are kept.");
    return;
  }
  if (!versionDialog) {
    versionDialog = createConfirmDialog("version-dialog");
    document.body.append(versionDialog.root);
  }
  const confirmed = await versionDialog.ask({
    title: "Restore this version?",
    notes: [
      `${view.path} on ${appStore.snapshot.value.branch} goes back to how it was on ${versionLabel(view.commit)} (${view.commit.message}).`,
      "This creates a new commit. Other files stay unchanged.",
    ],
    action: "Restore version",
  });
  if (!confirmed || versionView !== view || !appStore.repository.value || !appStore.snapshot.value) return;
  status("Restoring file…");
  try {
    const result = await postApi<RestoreResult>("restore", { repo: appStore.repository.value.full_name }, {
      branch: appStore.snapshot.value.branch, path: view.path, target: view.commit.sha, expectedHead: view.head,
    });
    if (versionView !== view) return;
    endVersionView(false);
    await afterRestore(view.path, result);
  } catch (error) {
    if (versionView === view) status(error instanceof Error ? error.message : "Restore failed. Your files are unchanged.");
  }
}


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
  const epoch = generation;
  nativeLinkedStyles = nativeBodyStyles;
  linkedStyle = { page, css: found.css, rules: found.rules.length ? found.rules : linkedStyleIdle, isDefault: true };
  if (!(await openSecondary(found.css))) return false;
  if (request !== linkedStyleRequest || epoch !== generation || linkedStyle?.page !== page) return false;
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
          renderDraftFiles();
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
  const epoch = generation;
  const page = selection.path;
  // An element no rule matches shows what it inherits from: the <body> rules.
  const styles = selection.selectors.length
    ? { rules: selection.selectors, cascade: selection.cascade, node: selection.node }
    : nativeBodyStyles;
  if (!reveal && (!styles?.rules.length || !secondaryPath)) return;
  nativeLinkedStyles = styles;
  const rules = styles ? linkedRules(styles) : [];
  if (request !== linkedStyleRequest || epoch !== generation || page !== appStore.openFile.value) return;
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
    return request === linkedStyleRequest && epoch === generation && page === appStore.openFile.value &&
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
  generation: () => generation,
  scope: () => setupScope(),
  store: appStore,
  site: () => nativeSite,
  sources: () => nativeSources(),
  editableSource: (path) => nativeEditableSource(path),
  preview: () => nativePreview,
  editor: () => editorModule,
  componentTag: (path) => nativeComponentTagForPath(path),
  editingScopePath: () => componentTools?.editingScope()?.path,
  instanceContent: (source, node, tag) => nativeInstanceContent(source, node, tag),
  locateTag: (source, node) => locateNativeElement(source, node),
  tagName: (source, node) => locateNativeElementRange(source, [...node])?.tag.name,
  openFile: (path, epoch) => restoreFile(path, epoch, { linkDefaultStyle: false }),
  renderEditBar: (selection) => renderNativeEditBar(selection),
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
    if (!site || !draftScope() || versionView) return undefined;
    if (variantSite?.from !== site) variantSite = { from: site, site: { pages: Object.values(site.routes), components: site.components } };
    return variantSite.site;
  },
  read: (path) => {
    const scope = draftScope();
    if (!nativeSite || !scope || versionView) return undefined;
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
  if (!wanted || !nativeSite || !scope || !repo || versionView) return;
  const epoch = generation, scopeKey = setupScope();
  const key = (path: string) => JSON.stringify([epoch, scopeKey, path]);
  const files = new Set(nativeFiles(scope));
  const missing = [...wanted].filter(path => files.has(path) && nativeEffectiveSource(path, scope) === undefined && !variantReads.has(key(path)));
  if (!missing.length) return;
  missing.forEach(path => variantReads.add(key(path)));
  const live = () => epoch === generation && scopeKey === setupScope();
  void readNativePredicted(repo.full_name, missing, live).then((read) => {
    missing.forEach(path => variantReads.delete(key(path)));
    if (!live() || !read) return;
    editorModule?.refreshVariants();
    nativePreview?.refreshCardLooks();
    if (appStore.selection.value) renderNativeEditBar(appStore.selection.value);
  });
}

/** A fresh source appStore.snapshot.value for CSS code intelligence. */
function nativeCssWorkspace(): CssWorkspace | undefined {
  const scope = draftScope(), requester = appStore.openFile.value;
  if (!nativeSite || !scope || !requester || versionView || !editorModule?.isMounted(requester)) return;
  const epoch = generation, scopeKey = setupScope(), sources = nativeSources();
  const revision = JSON.stringify([epoch, scopeKey, requester, nativeSite.routes, nativeSite.components, appStore.selection.value?.path, appStore.selection.value?.node, sources]);
  const orderedPaths = [...new Set([...nativePageStyles(), ...Object.keys(sources).sort()])];
  return {
    revision, sources, orderedPaths,
    async openDefinition(path, start, end, expectedRevision) {
      if (expectedRevision !== revision || !/\.css$/i.test(path) || sources[path] === undefined || start < 0 || end < start || end > sources[path].length) return false;
      const requesterProof = editorModule!.captureFileModelState(scope, requester);
      const targetProof = editorModule!.captureFileModelState(scope, path);
      const current = () => generation === epoch && setupScope() === scopeKey && appStore.openFile.value === requester && !versionView &&
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

// Elements whose whole content the bar can make bold or italic.
const nativeTextTags = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "li", "button", "blockquote", "figcaption",
  "small", "label", "td", "th", "dt", "dd", "div", "summary", "legend", "caption",
]);

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
const nativeLinkParents = new Set([...nativeTextTags].filter((tag) => tag !== "a" && tag !== "button"));
const nativeStructurePaintedSources = new WeakMap<NativeStructureItem, string | undefined>();
const nativeStructureMoveActions = new WeakMap<NativeStructureItem, (direction: "up" | "down" | "out" | "in") => number[] | "stayed" | undefined>();

const pageStructureController = createPageStructureController({
  get nativePreview() { return nativePreview; },
  get editorModule() { return editorModule; },
  get appStore() { return appStore; },
  get componentTools() { return componentTools; },
  get nativeEditableSource() { return nativeEditableSource; },
  get nativeSite() { return nativeSite; },
  get element() { return element; },
  get generation() { return generation; },
  get setupScope() { return setupScope; },
  get draftScope() { return draftScope; },
  get openNativeNavigation() { return openNativeNavigation; },
  get nativeSources() { return nativeSources; },
  get nativePageStyles() { return nativePageStyles; },
  get nativeTextTags() { return nativeTextTags; },
  get previewSelection() { return previewSelection; },
  get wholeWrapper() { return wholeWrapper; },
  get nativeLinkParents() { return nativeLinkParents; },
  get errorMessage() { return errorMessage; },
  get nearestLink() { return nearestLink; },
  get nativeRouteInfo() { return nativeRouteInfo; },
  get versionView() { return versionView; },
  get nativeEffectiveSource() { return nativeEffectiveSource; },
  get nativeNamedDescendant() { return nativeNamedDescendant; },
  get chooseMediaForImage() { return chooseMediaForImage; },
  get nativePictureSources() { return nativePictureSources; },
  // cardsController is declared later in this module: read it at call time.
  cardControls: (selection, source) => cardsController.controls(selection, source),
  get agentController() { return agentController; },
  get announce() { return announce; },
  refuse,
  get restoreFile() { return restoreFile; },
  get updateNativePreviewSources() { return updateNativePreviewSources; },
  get nativeEditableTemplatePath() { return nativeEditableTemplatePath; },
  get nativePageLabelOf() { return nativePageLabelOf; },
  get pageStructure() { return pageStructure; },
  get locateNativeElementRange() { return locateNativeElementRange; },
  get startTagAttribute() { return startTagAttribute; },
  get elementPathAt() { return elementPathAt; },
  get textRangeInSource() { return textRangeInSource; },
  get wrapperAround() { return wrapperAround; },
  itemsSlots: nativeMoveItems,
  moveBlock: moveNativeCanvasBlock,
  edits: guardedEdits,
});
function renderNativeEditBar(...args: Parameters<typeof pageStructureController.renderNativeEditBar>) {
  return pageStructureController.renderNativeEditBar(...args);
}

const NATIVE_MOVE_STALE = "The source changed or its editor is not open. Select the element again before moving it.";

/**
 * One guarded move of the open file `path` from the bytes `painted` (the
 * guarded edit module, src/guarded-edit.ts): one history step, the moved
 * element selected. `from` is the element's path the message names.
 */
function moveNativeOpenFile(path: string, painted: string, move: (source: string) => NativeElementMoveResult, from: number[], direction: NativeMoveDirection): number[] | "stayed" {
  if (appStore.openFile.value !== path || !editorModule?.isMounted(path)) { refuse(NATIVE_MOVE_STALE); return "stayed"; }
  let moved: number[] | undefined;
  const outcome = guardedEdits.now(r => {
    if (r.source(path) !== painted) return { refuse: NATIVE_MOVE_STALE };
    const result = move(painted);
    if (result.status === "refused") return { refuse: result.error };
    // Already at the end: nothing to write, nothing said.
    if (result.status === "stayed") return { done: "", undone: "" };
    moved = result.selection;
    const message = nativeElementMoveMessage(painted, from, direction);
    return { edits: new Map([[path, [result.edit]]]), select: { after: { path, node: result.selection } }, done: message, undone: `Undid: ${message}` };
  }, { anchor: path });
  if (outcome.ok) return outcome.status === "applied" && moved ? moved : "stayed";
  // The editor would not take a move it was given: an error, as any failed write.
  if (outcome.reason === "refused" && moved) errorMessage(new Error(outcome.message));
  else refuse(outcome.reason === "stale" ? NATIVE_MOVE_STALE : outcome.message);
  return "stayed";
}

/** One guarded move and one history step, shared by canvas and Structure. */
function moveNativeBlock(path: string, source: string, node: number[], direction: NativeMoveDirection): number[] | "stayed" {
  return moveNativeOpenFile(path, source, painted => nativeElementKeyMove(painted, node, direction, nativeMoveItems()), node, direction);
}

/** In Edit component mode, Alt+arrows on a template's part (slice 82): one guarded move and one step on the template. */
function moveNativeTemplatePart(path: string, source: string, node: number[], direction: NativeMoveDirection): number[] | "stayed" {
  return moveNativeOpenFile(path, source, painted => templateKeyMove(painted, node, direction), templateMovePath(source, node) ?? node, direction);
}

function moveNativeCanvasBlock(selection: NativePreviewSelection, direction: NativeMoveDirection): "moved" | "stayed" {
  if (!selection.node || selection.paintedSource === undefined) { refuse(NATIVE_MOVE_STALE); return "stayed"; }
  // In Edit component mode the template's parts move in the template, by its drags' rules.
  const move = componentTools?.editModeTemplate()?.path === selection.path ? moveNativeTemplatePart : moveNativeBlock;
  return move(selection.path, selection.paintedSource, selection.node, direction) === "stayed" ? "stayed" : "moved";
}

function editOpenPage(...args: Parameters<typeof pageStructureController.editOpenPage>) {
  return pageStructureController.editOpenPage(...args);
}
function isNativeSectionTag(...args: Parameters<typeof pageStructureController.isNativeSectionTag>) {
  return pageStructureController.isNativeSectionTag(...args);
}
function moveNativeSection(...args: Parameters<typeof pageStructureController.moveNativeSection>) {
  return pageStructureController.moveNativeSection(...args);
}
function moveNativeSectionAfterOpening(...args: Parameters<typeof pageStructureController.moveNativeSectionAfterOpening>) {
  return pageStructureController.moveNativeSectionAfterOpening(...args);
}
function moveNativeSectionTo(...args: Parameters<typeof pageStructureController.moveNativeSectionTo>) {
  return pageStructureController.moveNativeSectionTo(...args);
}
function applyNativeTextEdit(...args: Parameters<typeof pageStructureController.applyNativeTextEdit>) {
  return pageStructureController.applyNativeTextEdit(...args);
}

// Components that fit between page sections: those whose template is a
// single <section>, read from their current source so a draft counts.
/** Instance content uses the same text/inline boundary as native canvas typing. */
function nativeInstanceContent(source: string, node: readonly number[], tag: string): boolean {
  const range = locateNativeElementRange(source, [...node]);
  if (!range || range.tag.name !== tag) return false;
  if (["img", "picture", "a", "button"].includes(tag)) return true;
  const route = nativePreview?.route();
  if (route && gridOfItem(source, [...node], { route, routes: nativeSite?.routes ?? {}, isSection: isNativeSectionTag })) return true;
  if (!range.close || !TEXT_TAGS.has(tag)) return false;
  const template = document.createElement("template");
  template.innerHTML = source.slice(range.tag.end, range.close.start);
  return Boolean(template.content.textContent?.trim()) && [...template.content.querySelectorAll("*")].every(element => INLINE_FORMATTING.has(element.localName));
}

function recordNativeSourceIntent(path: string) {
  previewSelection.recordIntent(path);
}
function nativeEditableTemplatePath() {
  return previewSelection.editableTemplatePath();
}
let nativeComponentFieldToken = 0;
let nativeComponentFieldSnapshot: { key: string; proofs: { isCurrent(): boolean }[] } | undefined;
function nativeComponentFieldsRevision() {
  const scope = draftScope();
  const sources = nativeSources();
  // Without a scope or the editor module there are no model proofs, so nothing would ever mark this
  // snapshot stale: whether proofs exist belongs to the key, or Structure keeps its pre-editor fields.
  const key = JSON.stringify([generation, setupScope(), appStore.openFile.value, nativeSite?.components, sources, Boolean(scope && editorModule)]);
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
const nativeBaseSources = new Map<string, string>();
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

function draftScope() {
  return appStore.repository.value && appStore.snapshot.value && info.user
    ? { account: info.user.login, repoId: appStore.repository.value.id, repo: appStore.repository.value.full_name, branch: appStore.snapshot.value.branch }
    : undefined;
}

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
  if (explorerDropdown?.isOpen() && pagesController.explorerTab() === "pages") renderPagesTree();
  if (outcome.ok && outcome.status === "applied") element("status").textContent = value.trim() ? `${field === "title" ? "Title" : "Description"} updated` : `${field === "title" ? "Title" : "Description"} removed`;
  return undefined;
}

// ---- Page-builder site controls. Kept together to isolate this slice's wiring. ----

function nativeSitePageChoices() {
  return Object.entries(nativeSite?.routes ?? {}).map(([route, file]) => ({ route, file, label: nativePageLabelOf(file) }));
}

function nativeNavigationTarget(pagePath: string | undefined, r: Reads = guardedEdits.peek) {
  const site = r.site();
  if (!site || !pagePath) return undefined;
  const page = r.source(pagePath) ?? "";
  // Only offer the header component actually used on this page.
  const headerPath = site.components["site-header"];
  if (headerPath && /<site-header(?:\s|>)/i.test(page)) {
    const source = r.source(headerPath);
    const list = source !== undefined ? readNavigation(source, true) : undefined;
    if (source !== undefined && list) return { path: headerPath, source, list, shared: true };
  }
  const list = readNavigation(page);
  return list ? { path: pagePath, source: page, list, shared: false } : undefined;
}

let siteLinkPreferenceScope = "";
let siteLinkPreferences = new Map<string, SiteLinkPreference>();

function nativeSettingsController({ createSiteSettings }: typeof import("./components/site-settings"), shown: string[] = []) {
  const scope = setupScope();
  let since = guardedEdits.stamp();
  if (siteLinkPreferenceScope !== scope) { siteLinkPreferenceScope = scope; siteLinkPreferences = new Map(); }
  let baseline = new Map(shown.map(path => [path, guardedEdits.peek.source(path)] as const));
  const changed = "The repository or source changed meanwhile. Reopen settings and try again.";
  const stale = () => !since.holds();
  const sourcesChanged = () => [...baseline].some(([path, source]) => guardedEdits.peek.source(path) !== source);
  const checkShown = (r: Reads) => [...baseline].some(([path, source]) => r.source(path) !== source);
  const applied = (outcome: Outcome) => {
    if (!outcome.ok) return outcome.reason === "stale" ? changed : outcome.message;
    since = guardedEdits.stamp();
    baseline = new Map(shown.map(path => [path, guardedEdits.peek.source(path)] as const));
    return outcome.message;
  };
  return createSiteSettings({
    async applyPage(path, fields) {
      // The element selected on the page as it was applied: its Undo and Redo select it again.
      const selected = appStore.selection.value;
      const at = selected?.path === path && selected.node ? { path, node: [...selected.node] } : undefined;
      return applied(await guardedEdits.run(r => {
        if (checkShown(r)) return { refuse: changed };
        const source = r.source(path), site = r.site();
        if (source === undefined || !site || !Object.values(site.routes).includes(path)) return { refuse: "The page could not be read." };
        let next = source;
        try { for (const [field, value] of Object.entries(fields)) next = upsertHeadTag(next, field as HeadField, value); }
        catch (error) { return { refuse: error instanceof Error ? error.message : "Page settings could not be changed." }; }
        return { edits: new Map([[path, next]]), ...at ? { select: { before: at, after: at } } : {}, done: "Page settings applied as a draft. Save to GitHub to keep them.", undone: "Undid page settings." };
      }, { since }));
    },
    planUrl: (path, value) => stale() || sourcesChanged() ? { ok: false, error: changed } : nativeUrlPlan(path, value),
    async applyUrl(path, value, keep) {
      const error = await changeNativeUrl(path, value, keep, since, baseline);
      if (!error) {
        since = guardedEdits.stamp();
        // The page may have moved: the settings panel closes on URL Apply.
        baseline = new Map(shown.map(file => [file, guardedEdits.peek.source(file)] as const));
      }
      return error;
    },
    async applySite(values) {
      return applied(await guardedEdits.run(r => checkShown(r) ? { refuse: changed } : applyNativeSiteSettings(values, r), { since }));
    },
    async open404() {
      if (stale() || sourcesChanged() || !nativeSite) return changed;
      if (nativeSite.routes["/404.html"]) { await restoreFile(nativeSite.routes["/404.html"], generation); return undefined; }
      return applied(await guardedEdits.run(async r => {
        if (checkShown(r)) return { refuse: changed };
        const site = r.site();
        if (!site) return { refuse: changed };
        const unread = await nativeSiteReadForCreate();
        if (unread) return { refuse: unread };
        const template = r.source(site.routes["/"]);
        if (template === undefined) return { refuse: NATIVE_HOME_UNREAD };
        r.exists("404.html");
        let source = nativePageTemplate(template, "Page not found");
        source = withPageField(source, "description", "There is nothing at this address. Try the home page.");
        source = upsertHeadTag(source, "robots", "noindex");
        source = source.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, '$1\n    <section>\n      <h1>Page not found</h1>\n      <p>There is nothing at this address. <a href="/">Go to the home page</a>.</p>\n    </section>\n  $2');
        return { creates: [{ path: "404.html", content: source }], open: "404.html", done: "Created the 404 page as a draft.", undone: "Undid creating the 404 page." };
      }, { since }));
    },
    async applyNavigation(path, original, links) {
      return applied(await guardedEdits.run(r => {
        const source = r.source(path);
        if (source !== original) return { refuse: "Navigation changed while this panel was open. Reopen it to review the latest links." };
        const list = readNavigation(source, path.startsWith("components/"));
        if (!list) return { refuse: "This header's navigation is not a simple list of links." };
        try { return { edits: new Map([[path, editNavigation(source, list, links)]]), done: "Navigation applied as a draft. Save to GitHub to keep it.", undone: "Undid changing navigation." }; }
        catch (error) { return { refuse: error instanceof Error ? error.message : "Navigation could not be changed." }; }
      }, { since }));
    },
    async uploadImage() {
      const picked = await pickFiles({ accept: "image/*", multiple: false });
      if (stale()) throw new Error(changed);
      const [path] = await uploadFilesTo(DEFAULT_IMAGE_FOLDER, picked);
      if (stale()) throw new Error(changed);
      return path ? `/${path}` : undefined;
    },
    async imageUrl(value) {
      if (stale() || !value.trim()) return undefined;
      // An absolute URL is previewed only when it is this site's own address (its canonical
      // origin), from the repository file at that path; the editor never loads other sites' images.
      const page = appStore.openFile.value ?? "index.html";
      let own: string | undefined;
      if (/^https?:\/\//i.test(value)) {
        let url: URL, origin: string | undefined;
        // Another site's image is not loaded: the preview says it is unavailable (the dialog shows that for a refusal).
        const unavailable = () => { throw new Error("Images from other sites are not previewed."); };
        try { url = new URL(value.trim()); origin = new URL(readHeadSettings(nativeEffectiveSource(page) ?? "").canonical || "x:").origin; } catch { return unavailable(); }
        if (!origin || origin === "null" || url.origin !== origin) return unavailable();
        try { own = decodeURIComponent(url.pathname).replace(/^\//, ""); } catch { return unavailable(); }
      }
      const path = own ?? resolveImportPath(page, value);
      if (!path || !isImagePath(path)) return undefined;
      await loadNativeAssets({ "index.html": `<img src="/${escapeText(path).replace(/"/g, "&quot;")}">` }, () => {});
      return stale() || sourcesChanged() ? undefined : nativeAssets.get(path);
    },
  }, siteLinkPreferences);
}

async function openNativePageSettings(path: string) {
  const epoch = generation, scope = setupScope();
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const source = nativeEffectiveSource(path), route = nativeRouteForPath(path);
  if (source === undefined || !route) return;
  try { nativeSettingsController(settings, [path]).page({ path, source, route, images: nativeImagePaths() }); }
  catch (error) { errorMessage(error); }
}

async function openNativeSiteSettings() {
  const epoch = generation, scope = setupScope();
  if (!nativeSite) { refuse("Open a native site first."); return; }
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem || !nativeSite) { if (problem) errorMessage(new Error(problem)); return; }
  try {
    nativeSettingsController(settings, [NATIVE_CONFIG_PATH, nativeSite.routes["/"]]).site({ values: readSiteIdentity(nativeEffectiveSource(NATIVE_CONFIG_PATH), nativeEffectiveSource(nativeSite.routes["/"]) ?? ""), pages: nativeSitePageChoices(), images: nativeImagePaths(), has404: Boolean(nativeSite.routes["/404.html"]) });
  } catch (error) { errorMessage(error); }
}

function applyNativeSiteSettings(values: SiteSettingsValues, r: Reads): PlanResult {
  const site = r.site();
  if (!site) return { refuse: "Open a native site first." };
  const config = r.source(NATIVE_CONFIG_PATH);
  const before = readSiteIdentity(config, r.source(site.routes["/"]) ?? "");
  const edits = new Map<string, string>();
  try {
    const nextConfig = withSiteIdentityConfig(config, values);
    if (config !== nextConfig) edits.set(NATIVE_CONFIG_PATH, nextConfig);
    for (const path of new Set(Object.values(site.routes))) {
      const source = r.source(path);
      if (source === undefined) return { refuse: `${path} could not be read. No settings were applied.` };
      const next = withSiteIdentityPage(source, before, values);
      if (next !== source) edits.set(path, next);
    }
  } catch (error) { return { refuse: error instanceof Error ? error.message : "Site settings could not be changed." }; }
  const creates: { path: string; content: string }[] = [];
  if (config === undefined && edits.has(NATIVE_CONFIG_PATH)) { creates.push({ path: NATIVE_CONFIG_PATH, content: edits.get(NATIVE_CONFIG_PATH)! }); edits.delete(NATIVE_CONFIG_PATH); }
  return { creates, edits, done: `Site settings applied to ${edits.size + creates.length} files as drafts. Save to GitHub to keep them.`, undone: "Undid site settings on all affected pages." };
}

async function openNativeNavigation(pagePath: string) {
  const epoch = generation, scope = setupScope();
  const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const target = nativeNavigationTarget(pagePath);
  if (!target) { refuse("No editable navigation found in this page's header. Navigation supports simple links, or a list of single-link items."); return; }
  nativeSettingsController(settings).navigation({ path: target.path, source: target.source, links: target.list.links, pages: nativeSitePageChoices(), shared: target.shared });
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
  renderPagesTree();
  updateCurrentPageLabel();
}

// Every page, component and style file to its effective source: a mounted
// editor model wins, then a saved/new browser draft, then the clean snapshot
// baseline.
function nativeSources(site = nativeSite): Record<string, string> {
  const out: Record<string, string> = {};
  if (!site) return out;
  const paths = new Set([...nativeSitePaths(site), ...nativeComponentStyles.values()]);
  const scope = draftScope();
  const effective = (path: string) => nativeEffectiveSource(path, scope);
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

// The stylesheets any page links, in page order: what the style loader reads.
function nativeLinkedSheets(site: NativeSite, sources: Record<string, string>) {
  const out = new Set<string>();
  for (const file of Object.values(site.routes))
    for (const path of nativePageStylesheets(sources[file] ?? "", file)) out.add(path);
  return [...out];
}

// The shared stylesheets of the page the preview shows (the home page's
// when it shows no page), with every file they import.
function nativePageStyles() {
  if (!nativeSite) return [];
  const sources = nativeSources();
  const route = nativeRouteForPath(appStore.openFile.value) ?? nativeDefaultRoute(nativeSite);
  const linked = routeStylesheets(nativeSite, sources, route);
  return [...new Set([...linked, ...expandStyleImports(linked, (path) => sources[path]).imported])];
}

// A page selection: the preview follows the newly opened page's route. Opening
// a non-page file (CSS, component) leaves the preview's current route untouched.
// The preview's sources: the effective ones, with History's earlier version
// of the open file in its place while one is on show.
function nativePreviewSources() {
  checkVersionView();
  const sources = nativeSources();
  if (versionView) sources[versionView.path] = versionView.content;
  return sources;
}

function updateNativePreview() {
  if (!nativeSite || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({
    sources: nativePreviewSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(appStore.openFile.value),
    component: appStore.openFile.value ? nativeComponentTagForPath(appStore.openFile.value) : undefined,
    editableTemplatePath: nativeEditableTemplatePath(),
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
  return new Set([...nativeShownFiles(site, pages, (path) => nativeEffectiveSource(path, scope), (path) => files.has(path)).files, ...nativePageStyles()]);
}
function updateNativePreviewSources() {
  if (!nativeSite || !nativePreview) return;
  nativePreviewBehind = false;
  nativePreview.update({ sources: nativePreviewSources(), componentStyles: Object.fromEntries(nativeComponentStyles), assets: Object.fromEntries(nativeAssets), editableTemplatePath: nativeEditableTemplatePath() });
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
async function readNativeStyleFiles(repo: string, site: NativeSite, live: () => boolean) {
  let loaded = false;
  for (let round = 0; round < 20; round++) {
    const sources = nativeSources(site);
    const linked = nativeLinkedSheets(site, sources);
    const wanted = [...new Set([...linked, ...expandStyleImports(linked.filter((path) => Object.hasOwn(sources, path)), (path) => sources[path]).imported])].filter((path) =>
      !Object.hasOwn(sources, path) && !nativeMissingStyleFiles.has(path) && !nativeUnreadableFiles.has(path) && !nativeStyleFileRequests.has(path));
    if (!wanted.length) break;
    wanted.forEach((path) => nativeStyleFileRequests.add(path));
    try {
      const found: { path: string; sha: string }[] = [];
      const scope = draftScope();
      // A level's files are looked up together and read in one request.
      const entries = await Promise.all(wanted.map((path) => {
        // A stylesheet drafted here (new, or moved) is its draft; one read with the site is there.
        const draft = scope ? draftStore().get(scope, path) : undefined;
        if ((draft && !draft.deleted) || (!draft && nativeBaseSources.has(path))) return "held" as const;
        return draft?.deleted ? undefined : findEntry(path);
      }));
      if (!live()) return false;
      wanted.forEach((path, index) => {
        const entry = entries[index];
        if (entry === "held") { nativeStyleFiles.add(path); loaded = true; }
        else if (entry) found.push({ path, sha: entry.sha });
        else nativeMissingStyleFiles.add(path);
      });
      const { texts, unreadable } = await readNativeTexts(repo, found);
      if (!live()) return false;
      // One that cannot be read as text is left out (with a warning), not reported as missing.
      if (unreadable.length) { noteNativeUnreadable(unreadable); loaded = true; }
      for (const file of found) {
        const text = texts.get(file.path);
        if (text === undefined) continue;
        nativeBaseSources.set(file.path, text);
        nativeStyleFiles.add(file.path);
        loaded = true;
      }
    } finally {
      wanted.forEach((path) => nativeStyleFileRequests.delete(path));
    }
  }
  return loaded;
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
    const shown = nativeShownFiles(site, pages, (path) => nativeEffectiveSource(path, scope), isFile);
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
      // A stylesheet that cannot be read as text is left out of the page; a
      // page or template the page needs cannot be, so it fails the read.
      const needed = unreadable.find((file) => !/\.css$/i.test(file.path) && shown.files.has(file.path));
      if (needed) throw new Error(`${needed.path}: ${needed.message}`);
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
  const epoch = generation;
  const live = () => epoch === generation && request === nativeSourcesRequest && nativeSite === site;
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
  const epoch = generation;
  const live = () => epoch === generation && request === nativeSourcesRequest && nativeSite === site;
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
// The repository images and fonts `sources` name: `<img src>` in pages
// (resolved against the page's path) and components (against the root, as a
// root path), and `url()`s in stylesheets (against the stylesheet's path).
function referencedAssets(sources: Record<string, string>) {
  const out = new Set<string>();
  const add = (from: string, url: string) => {
    const path = resolveImportPath(from, url);
    if (path && assetType(path)) out.add(path);
  };
  for (const [file, source] of Object.entries(sources)) {
    if (file.endsWith(".css")) {
      rewriteCssUrls(source, (url) => { add(file, url); return undefined; });
      continue;
    }
    const from = nativePageRoute(file) ? file : "index.html";
    for (const match of source.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi))
      add(from, (match[1] ?? match[2] ?? match[3] ?? "").trim());
  }
  return out;
}
// The sources of what the page `file` shows: the page, every component and
// component stylesheet, and the stylesheets it links with their imports.
function nativePageShownSources(site: NativeSite, file: string) {
  const sources = nativeSources(site);
  const linked = nativePageStylesheets(sources[file] ?? "", file);
  const shown = new Set([file, ...Object.values(site.components), ...nativeComponentStyles.values(), ...linked, ...expandStyleImports(linked, (path) => sources[path]).imported]);
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
async function loadNativeAssets(sources = nativeAssetSources(), onProgress = updateNativePreviewAssets, only: (path: string) => boolean = () => true) {
  if (!appStore.repository.value || !appStore.snapshot.value) return;
  const repo = appStore.repository.value.full_name;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const wanted = [...referencedAssets(sources)].filter((path) =>
    only(path) && !nativeAssets.has(path) && !nativeMissingAssets.has(path) && !nativeAssetRequests.has(path));
  if (!wanted.length) return;
  const assetRequest = ++nativeAssetRequestId;
  wanted.forEach((path) => nativeAssetRequests.set(path, assetRequest));
  const scope = draftScope();
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const load = async ({ path, type }: { path: string; type: string }) => {
    // A drafted image: an upload's bytes from this browser, a moved or
    // copied one's blob; a deleted one is missing.
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft) nativeDraftAssets.add(path);
    if (draft?.upload && scope) return uploadDataUrl(uploadBytes(), scope, draft).catch(() => undefined);
    // An SVG written as text here (the block placeholder, an edited one) shows its draft.
    if (draft && !draft.deleted && !draft.opaque && !draft.sourceSha && type === "image/svg+xml") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.content)}`;
    const entry = draft?.deleted ? undefined : draft?.sourceSha ? { sha: draft.sourceSha } : await findEntry(path);
    if (!live() || !entry) return undefined;
    try {
      return await dataUrlOf(await readBlob(repo, entry.sha, path), type);
    } catch {
      return undefined;
    }
  };
  try {
    await loadNativeAssetRequests({
      requests: wanted.map((path) => ({ path, type: assetType(path)! })),
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

// Files from the computer as new-file drafts in `folder` (src/uploads.ts),
// never over something that is there; resolves to the paths added.
async function uploadFilesTo(folder: string, files: File[]): Promise<string[]> {
  const captured = draftScope();
  if (!captured || !files.length) return [];
  const scope = { ...captured }, epoch = generation, key = setupScope(), drafts = draftStore(), bytes = uploadBytes();
  const isCurrent = () => epoch === generation && key === setupScope();
  const receipts: { undo(): Promise<boolean> }[] = [];
  const added: string[] = [], errors: string[] = [], warnings: string[] = [];
  const cleanup = async () => { for (const receipt of receipts) await receipt.undo(); };
  for (const file of files) {
    const result = await addGuardedUpload({
      drafts, bytes, scope, folder, file, isCurrent,
      exists: path => added.includes(path) || pathNow(path) !== undefined,
      checkPath: branchPathProblem,
    });
    if (!isCurrent()) { if (result.receipt) await result.receipt.undo(); await cleanup(); return []; }
    if (result.error !== undefined) { errors.push(result.error); continue; }
    receipts.push(result.receipt!);
    added.push(result.path!);
    if (result.warning) warnings.push(result.warning);
  }
  if (!isCurrent()) { await cleanup(); return []; }
  if (added.length) afterFileChanges();
  if (errors.length) errorMessage(new Error(errors.join(" ")));
  if (added.length) announce([`Uploaded ${added.join(", ")}.`, ...warnings].join(" "));
  return added;
}

// An upload's Discard: its draft goes, and its bytes with it.
function discardUpload(path: string) {
  const scope = draftScope();
  if (!scope || !draftStore().get(scope, path)?.upload) return;
  deleteFile(draftStore(), scope, { path });
  afterFileChanges();
  announce(`Discarded ${path}.`);
}

// Media context and UI lifecycle use live getters; binary/Undo writes stay here.
const mediaController = createMediaController({
  workspace: () => {
    const repo = appStore.repository.value, scope = draftScope();
    if (!repo || !scope || !appStore.snapshot.value) return undefined;
    return { repo: repo.full_name, scope, identity: mediaIdentity(), site: nativeSite,
      nativePaths: nativeSite ? nativeFiles(scope) : undefined, drafts: draftStore() };
  },
  identity: mediaIdentity,
  stamp: () => guardedEdits.stamp("repository"),
  generation: () => generation,
  source: nativeEffectiveSource,
  listPaths: async () => {
    const repo = appStore.repository.value, snapshot = appStore.snapshot.value;
    if (!repo || !snapshot) throw new Error("Choose a repository before opening Images.");
    return listRepositoryFiles(repo, snapshot);
  },
  findEntry,
  entry: entryAt,
  readText: readFile,
  rememberSource: (path, source) => { nativeBaseSources.set(path, source); },
  uploadedBlob: (scope, sha) => uploadBytes().get(uploadKey(scope, sha)),
  readBlob,
  applyBatch: applyMediaBatch,
  openPage: openAfter,
  load: loadMedia,
  openFile: () => appStore.openFile.value,
  viewingVersion: () => Boolean(versionView),
  restoreFile: (path, epoch) => restoreFile(path, epoch, { linkDefaultStyle: false }),
  change: editOpenPage,
  galleryHost: () => element("explorer-images"),
  galleryVisible: () => !element("explorer-images").hidden && element("explorer").matches(":popover-open"),
  imagesSelected: () => pagesController.explorerTab() === "images",
  gallerySignature: imagesSignature,
  announce,
  error: errorMessage,
});
function mediaIdentity() { return `${generation}:${setupScope()}`; }
function chooseMediaForImage(target: { path: string; node: number[]; width?: number }, files?: File[]) {
  return mediaController.chooseImage(target, files);
}

// Atomic staging, source receipts, upload rollback and one Undo remain host-owned.
async function applyMediaBatch(scope: DraftScope, stamp: Stamp, batch: MediaWorkspaceBatch) {
  const [{ applyMediaWorkspaceBatch }, { mediaDraftTransaction }] = await loadMediaWorkspace();
  const assertLive = () => { if (!stamp.holds()) throw new Error("The repository changed. Close Images and open it again."); };
  assertLive();
  const editor = editorModule;
  if (!editor || !appStore.openFile.value) throw new Error("Open a page before changing images.");
  const historyPath = appStore.openFile.value, historyHost = editor.captureHistoryHost(appStore.openFile.value);
  if (!historyHost) throw new Error("Open an editable page before changing images.");
  await applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
    scope, store: draftStore(), bytes: uploadBytes(), stamp,
    paths: () => nativeFiles(scope), source: path => nativeEffectiveSource(path, scope),
    assetVersion: path => { const record = draftStore().get(scope, path); return record ? JSON.stringify(record) : entryAt(path)?.sha; },
    entry: async path => { const entry = await findEntry(path); assertLive(); return entry ? { path, sha: entry.sha, mode: entry.mode, text: nativeEffectiveSource(path, scope) } : undefined; },
    modelState: path => editor.captureFileModelState(scope, path), evictModel: (path, proof) => editor.evictDraftModel(scope, path, proof), historyCurrent: historyHost.isCurrent,
    mounted: path => editor.isMounted(path), prepareSources: edits => editor.prepareHistorySources(edits),
    history: (undo, redo) => editor.recordHistoryAction(historyPath, undo, redo),
    refresh: () => { afterFileChanges(); updateNativePreviewSources(); },
    announce,
  }));
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
  if (
    !nativeEngaged ||
    !appStore.repository.value ||
    appStore.repository.value.id !== scope.repoId ||
    appStore.snapshot.value?.branch !== scope.branch ||
    info.user?.login !== scope.account
  )
    return;
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
  disposeExplorerImages();
  mediaController.closePicker();
  nativeSite = undefined;
  updateExplorerTabs();
  nativeBaseFiles = [];
  nativeEngaged = false;
  nativeBaseSources.clear();
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
  const epoch = generation;
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
    if (epoch !== generation || request !== nativeSourcesRequest || nativeSite !== site) return;
    lookups.forEach((lookup, index) => {
      const entry = entries[index];
      if (entry) found.push({ ...lookup, sha: entry.sha });
      else if (lookup.tag) nativeMissingComponentStyles.add(lookup.tag);
    });
    const { texts, unreadable } = await readNativeTexts(repo, found);
    if (epoch !== generation || request !== nativeSourcesRequest || nativeSite !== site) return;
    noteNativeUnreadable(unreadable);
    for (const file of found) {
      const text = texts.get(file.path);
      if (!nativeBaseSources.has(file.path) && text !== undefined) nativeBaseSources.set(file.path, text);
      if (file.tag) nativeComponentStyles.set(file.tag, file.path);
    }
  } finally {
    wanted.forEach((tag) => nativeComponentStyleRequests.delete(tag));
  }
  if (epoch === generation && request === nativeSourcesRequest && nativeSite === site) updateNativePreviewSources();
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
function nativeFiles(scope = draftScope()): string[] {
  const drafts = scope ? draftStore().list(scope) : [];
  const drafted = drafts.filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path);
  const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
  return [...new Set([...nativeBaseFiles.filter((path) => !gone.has(path)), ...drafted])];
}

// A repository with `index.html` at its root is a native site: its files
// are listed, what the page on show (`openPath`, else the home page) needs
// is read from the current snapshot, and the native preview activates; the
// rest of the site follows after the first paint (the text index). All async
// steps are guarded against a superseding navigation (`epoch`).
async function activateNativeSite(repo: Repository, result: Snapshot, epoch: number, openPath?: string) {
  const request = ++nativeSourcesRequest;
  // A new read: until its text index lands, nothing counts as indexed.
  nativeTextIndexed = false;
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const placeholder: NativeSite = { routes: { "/": NATIVE_HOME_PAGE }, components: {} };
  const scope = info.user ? { account: info.user.login, repoId: repo.id, repo: repo.full_name, branch: result.branch } : undefined;
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
      loadNativeAssets(nativePageShownSources(site, nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)]), () => { if (nativeSite === site) updateNativePreviewAssets(); }, (path) => isFontType(assetType(path))).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, NATIVE_FONT_WAIT_MS)),
    ]);
    if (!live()) return true;
  } catch (error) {
    if (!live()) return true;
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
    sources: nativeSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    assets: Object.fromEntries(nativeAssets),
    // The page about to open shows at once (its file opens next).
    route: nativeRouteForPath(appStore.openFile.value ?? openPath) ?? nativeDefaultRoute(site),
    editableTemplatePath: nativeEditableTemplatePath(),
  });
  updateAgentContext();
  startNativeTextIndex(repo, site, scope, epoch, request, true);
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
function startNativeTextIndex(repo: Repository, site: NativeSite, scope: ReturnType<typeof draftScope>, epoch: number, request: number, deferred = false) {
  nativeTextIndexScope = nativeTextIndexScopeKey();
  nativeTextIndexed = false;
  const commit = appStore.snapshot.value?.commit;
  const live = () => epoch === generation && request === nativeSourcesRequest && appStore.repository.value?.full_name === repo.full_name && appStore.snapshot.value?.commit === commit && nativeSite === site;
  let release!: () => void;
  const due = new Promise<void>((resolve) => { release = resolve; });
  releaseNativeTextIndex = release;
  if (deferred) afterNativePaint(request, release);
  else release();
  const indexing: Promise<boolean> = due.then(() => (live() ? indexNativeTextFiles(repo, site, scope, live) : false)).then((done) => {
    if (done && live() && nativeTextIndexing === indexing) nativeTextIndexed = true;
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
  key: () => `${generation}\n${nativeTextIndexScopeKey()}`,
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
    Boolean(explorer.querySelector("[role=menu]:not([hidden]), input:focus, [popover]:popover-open"));
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
    renderPagesTree();
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
    else renderPagesTree();
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
    startNativeTextIndex(appStore.repository.value, nativeSite, draftScope(), generation, nativeSourcesRequest);
  }
  let ready = nativeTextIndexing ? await nativeTextIndexing : true;
  if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  if (!ready && appStore.repository.value && nativeSite) {
    const repo = appStore.repository.value, site = nativeSite, scope = draftScope(), epoch = generation, request = nativeSourcesRequest;
    nativeTextIndexing = undefined;
    startNativeTextIndex(repo, site, scope, epoch, request);
    ready = await nativeTextIndexing!;
    if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  }
  return ready ? undefined : "The site's links could not be fully read. Refresh the repository and try again.";
}

function updatePreview() {
  updateNativePreview();
}

function setCurrentPage(path?: string) {
  if (versionView && versionView.path !== path) endVersionView(false);
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
let generation = 0;
let fileGeneration = 0;

let lastStatus = "";
function status(message: string) {
  const target = document.getElementById("status");
  if (target) target.textContent = lastStatus = message;
}
// A load-progress announcement ("Viewing…", "Up to date…") lands after async
// work; if the user has acted meanwhile (a field edit, a section move writes
// the live region directly) their announcement is newer and must stand.
function settleStatus(message: string) {
  const target = document.getElementById("status");
  if (target && target.textContent === lastStatus) status(message);
}
function clearError() {
  element("notice").hidden = true;
}
function placeNotice(notice: HTMLElement) {
  const explorer = document.getElementById("explorer") as HTMLElement | null;
  if (explorerDropdown?.isOpen() && explorer) explorer.prepend(notice);
  else if (!app.classList.contains("login-page"))
    app.insertBefore(notice, document.querySelector(".workspace"));
}
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    renderLogin("expired");
  }
  const notice = element("notice");
  placeNotice(notice);
  notice.replaceChildren(
    node(
      "span",
      "",
      error instanceof Error
        ? error.message
        : "The request failed. Please try again.",
    ),
  );
  if (error instanceof ApiError && error.status === 401)
    notice.append(link("Reconnect GitHub", "/auth/login", "text-link"));
  notice.hidden = false;
  status("The last request did not complete.");
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function apiResponse<T>(path: string, params?: Record<string, string>): Promise<ApiReceipt<T>> {
  return codePanes.trackRead(async () => {
    const response = await fetchWithReadRetry(`/api/${path}${params ? `?${new URLSearchParams(params)}` : ""}`, { credentials: "same-origin", cache: "no-store" });
    return await readApiReceipt<T>(response, (status, message) => new ApiError(status, message));
  });
}
async function api<T>(path: string, params?: Record<string, string>): Promise<T> {
  return (await apiResponse<T>(path, params)).value;
}
async function postApi<T>(
  path: string,
  params: Record<string, string>,
  body: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}?${new URLSearchParams(params)}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "Could not update GitHub data.",
    );
  return data as T;
}
// Blob contents are immutable per SHA, so a file read once in this tab is
// never requested again: reopening a page, switching back to a stylesheet or
// re-activating a native project all resolve from memory.
const fileContents = new Map<string, Promise<string>>();
const fileContentsLimit = 400;
function readFile(repo: string, sha: string): Promise<string> {
  return readFileText(api, fileContents, fileContentsLimit, repo, sha);
}
// Reads many blobs in one request; anything already cached or in flight is
// reused rather than fetched twice.
async function readFiles(repo: string, shas: string[]): Promise<Record<string, string>> {
  return readFileTexts(api, fileContents, fileContentsLimit, repo, shas);
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
  nativePreview?.setUnreadable([...nativeUnreadableFiles.keys()]);
  showNativeWarnings();
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

function renderLogin(
  mode: "loading" | "auto" | "ready" | "expired" | "error" = "ready",
) {
  dropBootGuess();
  paletteController.dispose();
  agentController.destroy();
  setupController.dispose();
  setupEntry.remove();
  historyController.destroy();
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
  generation++;
  fileGeneration++;
  repositoryMenu?.destroy();
  repositoryMenu = undefined;
  siteActions?.destroy();
  siteActions = undefined;
  repositories = [];
  boot.reset();
  appStore.reset();
  repositoryIndex.clear();
  app.className = "login-page";
  // One layout for every state, so nothing jumps when the answer arrives: the
  // loading and automatic states keep the card's size and hide what is below.
  app.innerHTML = `
    <main class="login-card" aria-labelledby="login-title" data-mode="${mode}">
      <a class="brand login-brand" href="/" aria-label="Native Site Editor home"><span class="brand-mark">n<span>✦</span></span><span>Native <strong>Site Editor</strong></span></a>
      <h1 id="login-title">Welcome to Native Site Editor</h1>
      <div id="login-action" class="login-action"></div>
      <div id="notice" class="login-notice" role="alert" hidden></div>
    </main>
  `;
  const action = element("login-action");
  if (mode === "loading" || mode === "auto") {
    const loading = node("p", "login-state login-busy");
    loading.setAttribute("role", "status");
    const spinner = node("span", "login-spinner");
    spinner.setAttribute("aria-hidden", "true");
    loading.append(spinner, node("span", "", mode === "auto" ? "Signing you in with GitHub…" : "Checking your account…"));
    action.append(loading);
    if (mode === "auto")
      action.append(button("Use the button instead", () => boot.cancelAutoSignIn(), "text-link login-cancel"));
  } else if (mode === "error") {
    action.append(
      button(
        "Retry connection",
        () => void boot.start(),
        "button primary login-button",
      ),
    );
  } else if (info?.configured) {
    // One button for everyone: the Worker decides where the sign-in leads
    // (the editor, GitHub's install page for an account without the App, or
    // the Setup wizard for a first site), so there is no choice to make here.
    action.append(link("Continue with GitHub", "/auth/login", "button primary login-button login-signin"));
  } else if (info?.ownerSetupOpen && info.ownerSetupUrl) {
    // A fresh self-hosted editor (Deploy to Cloudflare): its owner has one
    // thing left to do, which the Setup wizard's Connect step explains and
    // starts. Nothing leaves this page before that click.
    action.append(link("Connect your editor to GitHub", info.ownerSetupUrl, "button primary login-button"));
    if (mode === "ready") void setupEntry.openOwner(info.ownerSetupUrl).catch(errorMessage);
  } else {
    const disabled = button(
      "Continue with GitHub",
      () => {},
      "button primary login-button",
    );
    disabled.disabled = true;
    action.append(
      disabled,
      node("p", "login-state", "GitHub sign-in has not been configured for this editor yet."),
    );
    const details = node("details", "login-setup");
    details.append(
      node("summary", "", "Owner setup"),
      node(
        "p",
        "",
        "Is this your editor? In its GitHub repository, set OWNER_GITHUB in wrangler.jsonc to your GitHub username and commit. Cloudflare deploys it again within a minute or two; then reload this page. (An editor with an OWNER_SETUP_TOKEN uses its private setup link instead.)",
      ),
    );
    if (info?.ownerSetupUrl)
      details.append(link("Open owner setup", info.ownerSetupUrl, "text-link"));
    action.append(details);
  }
}

// Start your site: in place of the preview when the repository has nothing
// to show, because it is empty or has no index.html at its top.
let startDialog: ReturnType<typeof createConfirmDialog> | undefined;
async function startSitePanel() {
  const repo = appStore.repository.value!;
  const empty = Boolean(appStore.snapshot.value?.empty);
  const [{ createStartSite }, { setupPrompt }] = await Promise.all([loadStartSite(), loadAgentPrompts()]);
  return createStartSite({
    repository: repo.name,
    empty,
    start: writeStartingPoint,
    agent: async (about) => {
      const prompt = setupPrompt({ editor: location.origin, installUrl: info.installUrl, name: repo.name, private: repo.private, about, repository: repo.full_name });
      try {
        await navigator.clipboard.writeText(prompt);
        return "Copied. Paste it into Claude Code, Codex or another coding agent.";
      } catch {
        return "Clipboard access was denied. Allow it in your browser and copy again.";
      }
    },
  }).root;
}

// ---- Set up your site (src/setup-checklist.ts, components/setup-checklist.ts) ----
// A pill in the top bar for a repository that went through Get started or
// Start your site, and for any repository from the project menu. Its items
// are ticked from the state the editor holds, each time it may have changed.

/** Account, repository and branch the checklist is of. */
function setupScope() {
  const scope = draftScope();
  return scope ? JSON.stringify([scope.account, scope.repoId, scope.branch]) : "";
}

const setupController = createSetupChecklistController({
  account: () => info.user?.login,
  repository: () => appStore.repository.value,
  scope: setupScope,
  state: setupState,
  host: () => element("setup-checklist"),
  menu: () => repositoryMenu,
  connected: () => agentController.connected(),
  ensureAgent: () => agentController.ensure(),
  agentText: () => [AGENT_EXPLAINER.join(" "), agentWhere()],
  storage: localStorage,
  loadChecklist,
  loadSpotlight,
  onError: errorMessage,
  start: () => {
    const choice = content.querySelector<HTMLElement>(".start-site .onboard-choice");
    if (choice) choice.focus();
    else refuse("This repository has a home page already.");
  },
  save: () => {
    const trigger = document.querySelector<HTMLButtonElement>(".publish-menu__trigger");
    if (!trigger || trigger.disabled) { refuse("There is nothing to save yet."); return; }
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  },
  saveName: name => writeSiteSettings({ name }),
});

function setupState(): Omit<SetupState, "nameConfirmed" | "agent"> | undefined {
  const repo = appStore.repository.value;
  const scope = draftScope();
  if (!repo || !scope || !appStore.snapshot.value) return undefined;
  const home = draftStore().get(scope, NATIVE_HOME_PAGE);
  const drafted = Boolean(home && !home.deleted);
  const settings = nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH, scope));
  return {
    homePage: drafted || (nativeEngaged && !home?.deleted),
    committed: !appStore.snapshot.value.empty,
    homeUnsaved: drafted && home!.baseSha === null,
    siteName: settings.name,
    defaultName: siteNameFromRepository(repo.name),
  };
}

// The site's name or address into `.editor/config.json` as a draft (the
// rest of the file kept); Save to GitHub keeps it. Undo in the editor takes it back.
async function writeSiteSettings(change: { name?: string; url?: string }): Promise<string | undefined> {
  // The file is read for this repository and branch; if the user moves on meanwhile, nothing is
  // written (it would land in the other one). The branch's file is read first, so the plan reads it.
  const since = guardedEdits.stamp("repository"), changed = "The repository changed meanwhile. Try again.";
  if (guardedEdits.peek.source(NATIVE_CONFIG_PATH) === undefined) {
    try {
      const base = await branchText(NATIVE_CONFIG_PATH);
      if (!since.holds()) return changed;
      if (base) nativeBaseSources.set(NATIVE_CONFIG_PATH, base.text);
    } catch (error) {
      return error instanceof Error ? error.message : `${NATIVE_CONFIG_PATH} could not be read.`;
    }
  }
  const what = change.name !== undefined ? "name" : "address";
  const done = `Site ${what} set as a draft. Save to GitHub to keep it.`, undone = `Undid setting the site ${what}.`;
  const outcome = await guardedEdits.run(r => {
    const text = r.source(NATIVE_CONFIG_PATH), next = withSiteSettings(text, change);
    if ("error" in next) return { refuse: next.error };
    return text === undefined ? { creates: [{ path: NATIVE_CONFIG_PATH, content: next.text }], done, undone }
      : { edits: new Map([[NATIVE_CONFIG_PATH, next.text]]), done, undone };
  }, { since });
  return outcome.ok ? outcome.message : outcome.reason === "stale" ? changed : outcome.message;
}

// A starting point's files as drafts: the files of `point` (the blank page,
// or the Starter site the Worker fetches), new files as new drafts, images
// as uploads, then the project opened again so the preview shows the site.
// A file that is already there is replaced only when the user says so.
async function writeStartingPoint(point: StartingPoint, partial?: { committed: string[]; repoId: number }): Promise<string | undefined> {
  const repo = appStore.repository.value;
  const scope = draftScope();
  if (!repo || !scope) return "Open a repository first.";
  const epoch = generation;
  // Everything below reads and writes for this repository, branch and snapshot only.
  const snap = appStore.snapshot.value!;
  const bound = () => generation === epoch && appStore.snapshot.value === snap && appStore.repository.value === repo;
  const find = (path: string) => repositoryIndex.find(api, repo, snap, path);
  const siteName = siteNameFromRepository(repo.name);
  let starting: StarterFile[];
  try {
    starting = point === "blank" ? blankSiteFiles(siteName) : (await api<{ files: StarterFile[] }>("starter", { name: siteName })).files;
  } catch (error) {
    return error instanceof Error ? error.message : "The Starter site could not be loaded. Try again.";
  }
  if (epoch !== generation) return "The repository changed meanwhile. Try again.";
  // Finishing a starting point that stopped part way: the files already committed stay as they are, and nothing else is overwritten.
  if (partial) starting = starting.filter((file) => !partial.committed.includes(file.path));
  const state = new Map<string, "free" | "taken" | "folder">();
  // A file cannot go under a path that is a file: the folder it needs is taken by one.
  const blockedBy = new Map<string, string>();
  const isFile = async (path: string) => {
    const now = pathNow(path);
    if (now === "file") return true;
    if (now !== undefined) return false;
    const found = await find(path);
    return Boolean(found);
  };
  try {
    for (const file of starting) {
      const parts = file.path.split("/");
      for (let index = 1; index < parts.length; index++) {
        const ancestor = parts.slice(0, index).join("/");
        const blocked = await isFile(ancestor);
        if (!bound()) return "The repository changed meanwhile. Try again.";
        if (blocked) { blockedBy.set(file.path, ancestor); break; }
      }
      if (blockedBy.has(file.path)) continue;
      const now = pathNow(file.path);
      const found = now === undefined ? await find(file.path) : undefined;
      if (!bound()) return "The repository changed meanwhile. Try again.";
      state.set(file.path, now === "folder" ? "folder" : now !== undefined || found ? "taken" : "free");
    }
  } catch (error) {
    return error instanceof Error ? error.message : "GitHub could not be asked which files exist.";
  }
  if (!bound()) return "The repository changed meanwhile. Try again.";
  const taken = starting.filter((file) => state.get(file.path) === "taken");
  let replace = false;
  if (taken.length && !partial) {
    if (!startDialog) {
      startDialog = createConfirmDialog("start-dialog");
      document.body.append(startDialog.root);
    }
    const shown = taken.slice(0, 6).map((file) => file.path).join(", ") + (taken.length > 6 ? ` and ${taken.length - 6} more` : "");
    const answer = await startDialog.choose({
      title: taken.length === 1 ? "A file is already there" : `${taken.length} files are already there`,
      notes: [`${shown} ${taken.length === 1 ? "is" : "are"} in this repository already.`, "Keep yours and add only the rest, or replace them with the starting point's? A replaced text file stays a draft you can discard."],
      actions: [{ label: "Keep mine", value: "keep" }, { label: "Replace them", value: "replace" }],
    });
    if (!answer.value) return "Nothing was added.";
    replace = answer.value === "replace";
    if (!bound()) return "The repository changed meanwhile. Try again.";
  }
  const problems: string[] = [];
  const skipped = new Map<string, string[]>();
  for (const [path, ancestor] of blockedBy) skipped.set(ancestor, [...(skipped.get(ancestor) ?? []), path]);
  for (const [ancestor, paths] of skipped)
    problems.push(`${paths.join(", ")} ${paths.length === 1 ? "was" : "were"} skipped: ${ancestor} is a file here, so nothing can go in it.`);
  let added = 0;
  for (const file of starting) {
    if (!bound()) return "The repository changed meanwhile. Some files may have been added as drafts; the rest were not.";
    if (blockedBy.has(file.path)) continue;
    const here = state.get(file.path);
    if (here === "folder") { problems.push(`${file.path} is a folder here, so it was skipped.`); continue; }
    if (here === "taken" && !replace) continue;
    if ("base64" in file) {
      // Images and other bytes go the way an upload does; one in the way stays.
      if (here === "taken") continue;
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
      const result = await addUpload({
        drafts: draftStore(), bytes: uploadBytes(), scope, folder: "", exact: true,
        file: new File([bytes], file.path, { type: uploadImageType(file.path) }),
        taken: () => false,
      });
      if (!bound()) {
        // The upload went to the scope captured above; it is not left behind for another branch to see.
        if (result.ok) draftStore().remove(scope, result.path);
        return "The repository changed meanwhile. Try again.";
      }
      if (result.ok) added++;
      else problems.push(result.error);
      continue;
    }
    const drafted = draftStore().get(scope, file.path);
    if (drafted?.upload || drafted?.opaque) continue;
    let baseSha: string | null = null;
    let original = "";
    if (drafted) ({ baseSha, original } = drafted);
    else if (here === "taken") {
      try {
        const entry = await find(file.path);
        if (entry) { baseSha = entry.sha; original = await readFile(repo.full_name, entry.sha); }
      } catch {
        problems.push(`${file.path} could not be read, so it was left as it is.`);
        continue;
      }
      if (!bound()) return "The repository changed meanwhile. Try again.";
    }
    if (!bound()) return "The repository changed meanwhile. Try again.";
    draftStore().save({ ...scope, version: 1, path: file.path, baseSha, original, content: file.content, updatedAt: Date.now() });
    added++;
  }
  if (!bound()) return undefined;
  const failure = draftStore().error;
  if (failure) return failure;
  setupController.start(repo.id);
  // Finished: the recovery record and its banner go before the reload below, which would offer them again.
  if (partial) {
    forgetPartialStart(partial.repoId);
    removeFinishStarter();
  }
  // Opened again: the home page is a draft now, so the native preview takes over from this screen.
  await loadSnapshot();
  if (added) announce(`Added ${added} ${added === 1 ? "file" : "files"} as drafts. Save to GitHub to keep them.`);
  if (problems.length) errorMessage(new Error(problems.join(" ")));
  return undefined;
}

function showDirectory(directory: Directory, path = "") {
  fileGeneration++;
  setCurrentPage();
  if (!path && !nativeEngaged && appStore.repository.value && appStore.snapshot.value) {
    const host = content, epoch = generation, fileEpoch = fileGeneration;
    void startSitePanel().then((panel) => {
      if (host === content && generation === epoch && fileGeneration === fileEpoch) host.replaceChildren(panel);
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
const filesTreeController = createFilesTreeController({
  ui: { node, button, setIcon },
  snapshot: () => appStore.snapshot.value, repo: () => appStore.repository.value,
  openFile: () => appStore.openFile.value, epoch: () => generation, root: () => files,
  state: treeState, scope: draftScope, draft: (scope, path) => draftStore().get(scope, path),
  load: input => api<Directory>("tree", input), images: () => requestExplorerImagesRefresh(),
  clearError, error: errorMessage, status, announce, refuse, intent: recordNativeSourceIntent,
  openDraft: openNewDraft, openEntry, restore: target => restoreFileTarget(target),
  create: openCreate, actions: () => fileActions,
  visible: () => !!explorerDropdown?.isOpen() && pagesController.explorerTab() === "files",
});
function renderFileTree() { filesTreeController.render(); }
function renderDraftFiles() { filesTreeController.refresh(); }
function fileRow(path: string) { return filesTreeController.row(path); }

// The explorer's Pages | Files | Images tabs: tab state and tree rendering
// live in the Pages controller; the host mounts the DOM and paints the tabs.
let pagesTree: ReturnType<typeof createPagesTree> | undefined;

function imagesSignature() {
  const scope = draftScope();
  return JSON.stringify([generation, setupScope(), appStore.snapshot.value?.commit, scope ? draftStore().list(scope) : []]);
}
function disposeExplorerImages() { mediaController.disposeGallery(); }
function ensureExplorerImages() { return mediaController.ensureGallery(); }
function explorerImagesVisible() { return mediaController.galleryVisible(); }
function requestExplorerImagesRefresh() { mediaController.requestGalleryRefresh(); }

function mountExplorerTabs() {
  const explorer = element("explorer");
  explorer.addEventListener("toggle", () => {
    // Closing a popover queues its toggle; session expiry may detach it before dispatch.
    if (!explorer.isConnected) return;
    if (explorerImagesVisible() && pagesController.explorerTab() === "images") void ensureExplorerImages().catch(errorMessage);
  });
  const tabs = { pages: element<HTMLButtonElement>("explorer-tab-pages"), files: element<HTMLButtonElement>("explorer-tab-files"), images: element<HTMLButtonElement>("explorer-tab-images") };
  for (const [name, tab] of Object.entries(tabs) as [ExplorerTab, HTMLButtonElement][]) {
    tab.addEventListener("click", () => selectExplorerTab(name));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = explorerTabNames.indexOf(name);
      const next = event.key === "Home" ? "pages" : event.key === "End" ? "images" : explorerTabNames[(index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3];
      selectExplorerTab(next);
      tabs[next].focus();
    });
  }
}

function selectExplorerTab(name: ExplorerTab) { pagesController.selectTab(name); }
function updateExplorerTabs(reset = false) { pagesController.updateTabs(reset); }
function renderPagesTree(focus?: { file?: string; route?: string }) { pagesController.renderTree(focus); }
function paintExplorerTabs(tab: ExplorerTab, native: boolean) {
  element("explorer-tabs").hidden = !native;
  element("site-settings-toggle").hidden = !native;
  for (const name of explorerTabNames) {
    const button = element(`explorer-tab-${name}`);
    const panel = element(`explorer-${name}`);
    button.setAttribute("aria-selected", String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    panel.hidden = tab !== name;
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

// New-page planning and the home template belong to the Pages controller.
function planNativeNew(request: NativeNewRequest, create = false) { return pagesController.planNew(request, create); }
function nativeHomeTemplate() { return pagesController.homeTemplate(); }
// The whole site read for the repository open now: an error message, or nothing.
async function nativeSiteReadForCreate() {
  const epoch = generation, scope = setupScope();
  const problem = await ensureNativeTextIndex();
  if (problem) return problem;
  if (epoch !== generation || scope !== setupScope() || !nativeSite) return "The repository changed meanwhile. Try again.";
  return nativeHomeTemplate() === undefined ? NATIVE_HOME_UNREAD : undefined;
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

function nativePageLabelOf(file: string) { return pagesController.pageLabel(file); }
function createNativeNew(request: NativeNewRequest): Promise<string | undefined> { return pagesController.createNew(request); }
function createNativeFolderPage(route: string) { return pagesController.createFolderPage(route); }

// ---- Card grids (src/page-builder/cards.ts, docs/page-builder/cards.md). ----
// Lifecycle and adapters live in the cards controller; every card write is a guarded edit (src/guarded-edit.ts).
const cardsController = createCardsController({
  edits: guardedEdits,
  siteRead: () => nativeSiteReadForCreate(),
  editable: path => Boolean(draftScope()) && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path) && editorModule.captureHistoryHost(path)),
  preview: () => nativePreview,
  openPage: file => void restoreFile(file, generation),
  pageLabel: nativePageLabelOf,
  variantFiles: nativeVariantFiles,
  announce,
});

// Pages policy belongs to the controller; guarded writes remain host transactions.
const pagesController = createPagesController({
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
  pageLinks,
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
  resetExplorer: () => { pagesTree?.reset(); disposeExplorerImages(); },
  showImages: () => void ensureExplorerImages().catch(errorMessage),
  siteReadForCreate: nativeSiteReadForCreate,
  createWithCard: cardsController.createWithCard,
  navigationTarget: nativeNavigationTarget,
  restoreDeleted: file => undoFileChanges({ restore: [file] }),
  announce,
  refuse,
  error: errorMessage,
});

function retitleNativePage(file: string, title: string): Promise<string | undefined> { return pagesController.retitle(file, title); }
function duplicateNativePage(file: string) { return pagesController.duplicate(file); }
function removeNativePagesTarget(target: NativePagesTarget) { return pagesController.remove(target); }
function nativeUrlPlan(file: string, value: string): UrlPlan { return pagesController.urlPlan(file, value); }
function changeNativeUrl(file: string, value: string, keep: boolean, since?: Stamp, baseline?: ReadonlyMap<string, string | undefined>): Promise<string | undefined> {
  return pagesController.changeUrl(file, value, keep, since, baseline);
}
function nativeDropProblem(source: NativePagesTarget, parent: string): string | undefined { return pagesController.dropProblem(source, parent); }
function confirmNativeMove(source: NativePagesTarget, parent: string) { return pagesController.confirmMove(source, parent); }
function moveNativePageTo(target: NativePagesTarget) { return pagesController.moveTo(target); }

// Shared file operations use the same pure source/draft policy as Pages.
function onBranchHere(path: string) {
  const scope = draftScope();
  return pageOnBranchHere(path, nativeBaseFiles, scope ? draftStore().list(scope) : []);
}
// `_redirects` as it is now: its draft, or the branch's file.
async function readNativeRedirects(): Promise<string | undefined> {
  const repo = appStore.repository.value, epoch = generation, scopeKey = setupScope();
  const scope = draftScope();
  const draft = scope ? draftStore().get(scope, NATIVE_REDIRECTS_PATH) : undefined;
  if (draft) return draft.deleted ? undefined : draft.content;
  if (!nativeBaseFiles.includes(NATIVE_REDIRECTS_PATH) || !appStore.repository.value) return undefined;
  const entry = await findEntry(NATIVE_REDIRECTS_PATH);
  if (epoch !== generation || scopeKey !== setupScope() || !repo) throw new Error("The repository changed while reading redirects.");
  const text = entry ? await readFile(repo.full_name, entry.sha) : undefined;
  if (epoch !== generation || scopeKey !== setupScope()) throw new Error("The repository changed while reading redirects.");
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
  renderFileTree();
  updateAgentContext();
}

let createDialog: ReturnType<typeof createCreateDialog> | undefined;

// What a creation in the Files tab writes: new files (drafts with no base
// blob), and what to show after. Planned as the name is typed, so the dialog says the result
// live. Pages are made in the Pages tab (`createNativeNew`), where the URL is
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
  const epoch = generation;
  try {
    for (const file of creation.files) {
      const problem = await branchPathProblem(file.path);
      if (epoch !== generation) return "The repository changed meanwhile. Try again.";
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
  historyController.refresh();
  if (nativeSite) refreshNativeRoutes();
  updateAgentContext();
  if (resyncNativeSite()) return undefined;
  if (creation.folder) {
    // The new folder shows open in the tree, with the dialog's focus returned to it.
    const parts = creation.folder.split("/");
    parts.forEach((_, index) => filesTreeController.openFolder(parts.slice(0, index + 1).join("/")));
    renderFileTree();
    const row = [...files.querySelectorAll<HTMLElement>(".file-row")].find((row) => row.dataset.path === creation.folder);
    if (row) createDialog?.returnFocusTo(row);
  } else renderFileTree();
  const opened = creation.open ? draftStore().get(scope, creation.open) : undefined;
  if (opened) await openNewDraft(opened);
  // Written as the user's own announcement, so a load finishing later keeps it.
  element("status").textContent = creation.done;
  return undefined;
}

// The "+" on a folder: a new file or folder in it.
function openCreate(folder: string, opener: HTMLElement) {
  if (!appStore.snapshot.value) return;
  createDialog?.open({ in: folder, kinds: ["file", "folder"], first: "file", opener });
}

// ---- Deleting, renaming, moving and duplicating files. ----
//
// Each is a pending change in the browser drafts (src/file-changes.ts),
// saved with Save to GitHub in one commit. In a native site, pages and
// components are found again from the files after each, and a page whose
// URL changes has the links to it updated in the same operation. Undo
// right after (the open file's editor), Restore on a deletion
// and Move back on a rename take the whole operation back.
let fileActions: ReturnType<typeof createFileRowActions> | undefined;
let confirmDialog: ReturnType<typeof createConfirmDialog> | undefined;
let discardDialog: ReturnType<typeof createConfirmDialog> | undefined;
let pagePicker: ReturnType<typeof createPagePicker> | undefined;

function announce(text: string) {
  element("status").textContent = text;
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

// The actions of a Files row.
function fileRowItems(target: FileRowTarget): MenuItem[] {
  if (target.gone) return [{ label: "Restore", run: () => void restoreFileTarget(target) }];
  const items: MenuItem[] = [];
  if (target.folder)
    items.push(
      { label: "New file…", run: () => openCreateKind(target.path, "file") },
      { label: "New folder…", run: () => openCreateKind(target.path, "folder") },
      { label: "Upload files…", run: () => void pickFiles().then((picked) => uploadFilesTo(target.path, picked)) },
    );
  items.push({ label: "Rename", shortcut: "F2", run: () => fileActions?.rename(files, target.path) });
  if (!target.folder) items.push({ label: "Duplicate", run: () => void duplicateFileTarget(target) });
  const change = treeState().changes.get(target.path);
  if (change?.kind === "R" && change.from) items.push({ label: `Move back to ${change.from}`, run: () => undoFileChanges({ moveBack: [target.path] }) });
  if (change && !target.folder) items.push({ label: "Discard changes", run: () => void savePublish.discardFile(target.path) });
  items.push(
    { label: "Delete", shortcut: "Delete", run: () => void deleteFileTarget(target) },
    { label: "Copy path", run: () => void copyFilePath(target.path) },
  );
  return items;
}

// New file… and New folder… from a folder's menu: the + dialog, that kind chosen.
function openCreateKind(folder: string, kind: CreateKind) {
  if (!appStore.snapshot.value) return;
  const opener = fileRow(folder) ?? element<HTMLButtonElement>("new-at-root");
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

const fileOperationsController = createFileOperationsController({
  edits: guardedEdits, draftScope,
  engaged: () => nativeEngaged, repository: () => appStore.repository.value,
  parentOf, treeState, pathNow, branchFilesUnder, findEntry, draftStore,
  baseSource: path => nativeBaseSources.get(path), readFiles, readFile,
  nativeFiles,
  ensureNativeTextIndex, branchPathProblem,
  onBranchHere, withMovedPageUrls, readNativeRedirects, confirmDialog: () => confirmDialog,
  undoFileChanges,
  duplicateFile: (scope, file, to) => duplicateFile(draftStore(), scope, file, to),
  afterFileChanges, announce, refuse, errorMessage, requestAnimationFrame: callback => { requestAnimationFrame(callback); },
  openFolder: path => filesTreeController.openFolder(path), fileRow: path => filesTreeController.row(path), renderFileTree: () => filesTreeController.render(),
  filesTabOpen: () => filesTreeController.visible(),
});
const { moveProblem, moveFileTarget, deleteFileTarget, duplicateFileTarget, restoreFileTarget } = fileOperationsController;
function pageLinks(...args: Parameters<typeof fileOperationsController.pageLinks>) { return fileOperationsController.pageLinks(...args); }
function targetFiles(...args: Parameters<typeof fileOperationsController.targetFiles>) { return fileOperationsController.targetFiles(...args); }

function renameProblem(target: FileRowTarget, name: string) {
  const to = renamedPath(parentOf(target.path), name, target.folder ? "folder" : "file");
  return to.ok ? moveProblem(target, to.value, "rename") : to.error;
}

function dropProblem(source: FileRowTarget, folder: string) {
  if (source.gone) return "A deleted file cannot move.";
  if (parentOf(source.path) === folder) return "It is already there.";
  if (source.folder && (folder === source.path || folder.startsWith(`${source.path}/`))) return "A folder cannot go inside itself.";
  return moveProblem(source, folder ? `${folder}/${source.name}` : source.name, "move");
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
  historyController.refresh();
  if (nativeSite) {
    // Component stylesheets are found again where their components now are.
    nativeComponentStyles.clear();
    nativeMissingComponentStyles.clear();
    refreshNativeRoutes();
    void loadNativeComponentStyles(Object.keys(nativeSite.components));
  }
  renderFileTree();
  updateAgentContext();
  updateCurrentPageLabel();
  resyncNativeSite();
  requestExplorerImagesRefresh();
}

// Opens `path` after an operation, or the home page (else the folder summary)
// when it is gone. `keepExplorer`: the explorer stays open (true) or closes
// (false); by default a new file keeps it open and a branch file closes it.
async function openAfter(path: string | undefined, keepExplorer?: boolean, quietStatus = false) {
  const epoch = generation;
  const scope = draftScope();
  const draft = path && scope ? draftStore().get(scope, path) : undefined;
  const keep = { keepExplorer: keepExplorer ?? false, quietStatus };
  if (draft && draft.baseSha === null && !draft.deleted) await openNewDraft(draft, { keepExplorer: keepExplorer ?? true });
  else if (path && !draft?.deleted) await restoreFile(path, epoch, keep);
  else if (nativeSite?.routes["/"]) await restoreFile(nativeSite.routes["/"], epoch, keep);
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
function discardFileChange(change: FileChange) {
  if (change.kind === "A" && change.drafts[0]?.upload) discardUpload(change.path);
  else if (change.kind === "D") undoFileChanges({ restore: [change.path] });
  else if (change.kind === "R") undoFileChanges({ moveBack: [change.path] });
  else if (savePublish.discard([change.path])) announce(`Discarded the changes to ${change.path}.`);
}

const savePublish = createSavePublishController({
  stamp: () => guardedEdits.stamp("repository"),
  generation: () => generation,
  snapshot: () => appStore.snapshot.value,
  scope: draftScope, drafts: draftStore, api, findEntry, changed: afterFileChanges, release: releaseFiles, openAfter, announce, status,
  fail: errorMessage, fallback: nativeFallbackPage, resync: resyncNativeSite,
  onWake: (check) => {
    document.addEventListener("visibilitychange", check);
    addEventListener("focus", check);
    return () => { document.removeEventListener("visibilitychange", check); removeEventListener("focus", check); };
  },
  visible: () => document.visibilityState === "visible",
  reload: () => loadSnapshot(),
  forget: (scope, path) => editorModule?.forgetDraftModel(scope, path),
  redraw: () => {
    editorModule?.refreshDrafts();
    renderFileTree();
    if (nativeSite) updateNativePreviewSources();
  },
  saved: (scope, result, submitted) => {
    adoptNativeBaseSources(scope, result, submitted);
    // Saved uploads are GitHub's now; this browser lets their bytes go.
    void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
    if (nativeEngaged && !result.unchanged)
      siteActions?.track({ repo: scope.repo, commit: result.commit, url: result.url },
        () => appStore.repository.value?.id === scope.repoId && (appStore.snapshot.value?.branch ?? appStore.branch.value) === scope.branch && info.user?.login === scope.account);
  },
  adopt: (result) => {
    appStore.snapshot.value = result;
    repositoryIndex.seed(appStore.repository.value!, result);
  },
  showSaved: (commit) => {
    updateAgentContext();
    element("revision").textContent = commit.slice(0, 7);
    element("revision").title = commit;
    renderFileTree();
    if (nativeEngaged && nativeSite) startNativeTextIndex(appStore.repository.value!, nativeSite, draftScope(), generation, nativeSourcesRequest);
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
  confirm: (question, all) => (all ? discardDialog : confirmDialog)?.ask(question),
});

async function renameFileTarget(target: FileRowTarget, name: string): Promise<string | undefined> {
  const to = renamedPath(parentOf(target.path), name, target.folder ? "folder" : "file");
  if (!to.ok) return to.error;
  return moveFileTarget(target, to.value, "rename");
}

async function dropFileTarget(source: FileRowTarget, folder: string) {
  const problem = dropProblem(source, folder);
  if (problem) { refuse(problem); return; }
  const error = await moveFileTarget(source, folder ? `${folder}/${source.name}` : source.name, "move");
  if (error) errorMessage(new Error(error));
}

async function openEntry(
  entry: TreeEntry,
  path: string,
  epoch: number,
  options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean } = {},
) {
  if (epoch !== generation || !appStore.repository.value || !appStore.snapshot.value || !info.user) return;
  // A file deleted in the drafts opens as a note with Restore; one renamed
  // or moved opens where it is now.
  const marker = draftStore().get({ account: info.user.login, repoId: appStore.repository.value.id, repo: appStore.repository.value.full_name, branch: appStore.snapshot.value.branch }, path);
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
    if (epoch !== generation || selection !== fileGeneration) return;
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
      epoch,
      selection,
      options,
    );
    // A file opened while this one's editor loaded has the last word.
    if (!options.quietStatus && selection === fileGeneration) settleStatus(`Viewing ${path} at ${appStore.snapshot.value?.commit.slice(0, 7)}.`);
  } catch (error) {
    if (epoch === generation && selection === fileGeneration) {
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          error instanceof Error ? error.message : "Could not read this file.",
        ),
      );
      errorMessage(error);
    }
  }
}

async function mountSource(
  path: string,
  source: string,
  baseSha: string | null,
  readOnly: boolean,
  epoch: number,
  selection: number,
  options: { linkDefaultStyle?: boolean; beforeMount?: () => boolean } = {},
) {
  if (
    !appStore.repository.value ||
    !appStore.snapshot.value ||
    !info.user ||
    epoch !== generation ||
    selection !== fileGeneration
  )
    return;
  const scope = {
    account: info.user!.login,
    repoId: appStore.repository.value.id,
    repo: appStore.repository.value.full_name,
    branch: appStore.snapshot.value!.branch,
  };
  const saveProof = savePublish.proof();
  await openCodeEditor({
    key: draftKey(scope, path),
    scope,
    baseSha: baseSha,
    saveLabels: nativeEngaged,
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
          queueMicrotask(async () => {
            const said = element("status").textContent;
            const epoch = generation;
            await restoreFile(fallback, epoch);
            if (epoch === generation && said) element("status").textContent = said;
          });
      }
      if (appStore.snapshot.value && info.user) {
        showDirectory(appStore.snapshot.value);
        rememberWorkspace(info.user.login, {
          repoId: scope.repoId,
          branch: scope.branch,
        });
        renderDraftFiles();
        updateAgentContext();
      }
    },
    onContextChange: (value) => {
      activeFileContext = value;
      if (value && appStore.openFile.value === value.path) syncLinkedStyles(value.path, value.content);
      updateAgentContext();
      renderDraftFiles();
      historyController.refresh();
      if (nativeModeActive()) updateNativePreviewSources();
      // An open template's banner counts its instances again.
      componentTools?.refresh();
      // The Page fields follow the page's head (typed, undone or redone).
      if (value && nativeRouteForPath(value.path)) pageStructure?.refreshMeta();
      // A heading or title typed in the open file renames it in the top bar.
      updateCurrentPageLabel();
    },
    onHistory: () => void historyController.open().catch(errorMessage),
    onDiscardAll: () => void savePublish.discardAll(),
    publishHead: () => savePublish.headFor(scope),
    onRefused: () => void savePublish.checkHead(true),
    onDiscardChange: discardFileChange,
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
  if (epoch !== generation || selection !== fileGeneration || !info.user)
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
  const epoch = generation;
  const scope = draftScope();
  if (!scope) return false;
  const draft = draftStore().get(scope, css);
  // A new component's stylesheet may exist only in drafts, as openSecondary
  // already supports. A branch-tree miss must not hide that authored file.
  const created = draft && draft.baseSha === null && !draft.deleted && !draft.upload && !draft.opaque;
  const entry = created ? undefined : await findEntry(css);
  if (request !== linkedStyleRequest || epoch !== generation || appStore.openFile.value !== page) return false;
  const latestDraft = draftStore().get(scope, css);
  if (latestDraft?.deleted || latestDraft?.upload || latestDraft?.opaque ||
      (!entry && !(latestDraft && latestDraft.baseSha === null))) return openDefaultLinkedStyle(page);
  nativeLinkedStyles = undefined;
  linkedStyle = { page, css, rules: linkedStyleIdle };
  const current = () => {
    const draft = draftStore().get(scope, css);
    return request === linkedStyleRequest && epoch === generation && appStore.openFile.value === page &&
      linkedStyle?.page === page && linkedStyle.css === css && !draft?.deleted && !draft?.upload && !draft?.opaque &&
      Boolean(entry || (draft && draft.baseSha === null));
  };
  if (!(await openSecondary(css, current))) return false;
  if (request !== linkedStyleRequest || epoch !== generation || linkedStyle?.page !== page) return false;
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
  stamp: () => guardedEdits.stamp("repository"),
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
function withAgentAnswers<T>(answers: { option?: boolean }, run: () => Promise<T>) {
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
  const before = { account: info.user?.login, repoId: appStore.repository.value?.id, branch: appStore.snapshot.value?.branch };
  await nativeResyncDone;
  if (before.account !== info.user?.login || before.repoId !== appStore.repository.value?.id || (before.branch && before.branch !== appStore.snapshot.value?.branch))
    throw new Error("The editor tab switched to another site meanwhile. Call get_site and try again.");
}
const agentSiteActions: AgentSiteActions = {
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
  edits: guardedEdits,
  loaderPlan: nativeComponentLoaderPlan,
  writeDraft: async (path, content, create) => {
    if (!nativeSite && !nativeEngaged && create) {
      const scope = draftScope(), repo = appStore.repository.value, snap = appStore.snapshot.value;
      if (!scope || !repo || !snap) return "Open a repository first.";
      const epoch = generation, key = setupScope(), store = draftStore(), editor = editorModule;
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
        return epoch === generation && key === setupScope() && appStore.repository.value === repo && appStore.snapshot.value === snap &&
          !nativeSite && !nativeEngaged && !hasHome() && !versionView && JSON.stringify(snap.tree ?? snap.entries) === graph &&
          drafts.length === before.size && drafts.every(draft => before.get(draft.path) === draft);
      };
      // Before a home page exists there is no mounted editor to anchor operation
      // history: the file is a new draft, all or nothing, then the site resyncs.
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
    const since = guardedEdits.stamp("repository");
    if (!create && guardedEdits.peek.source(path) === undefined) {
      const base = await branchText(path);
      if (!since.holds()) return "The repository changed meanwhile. Try again.";
      if (base) nativeBaseSources.set(path, base.text);
    }
    const done = `An agent ${create ? "created" : "changed"} ${path}.`, undone = `Undid the agent's change to ${path}.`;
    const outcome = await guardedEdits.run(r => create ? { creates: [{ path, content }], ...nativePageRoute(path) ? { open: path } : {}, done, undone }
      : r.source(path) === undefined ? { refuse: `${path} does not exist.` }
      : { edits: new Map([[path, content]]), ...nativePageRoute(path) ? { open: path } : {}, done, undone }, { since });
    // A home page just written switches the site on: the context is whole before the write is answered.
    await nativeResyncDone;
    return outcome.message;
  },
  async open(path) {
    if (appStore.openFile.value !== path || !editorModule?.isMounted(path)) await restoreFile(path, generation, { linkDefaultStyle: false });
    return appStore.openFile.value === path;
  },
  async createPage(request) {
    const plan = planNativeNew(request);
    if (!plan.ok) return plan.error;
    return (await createNativeNew(request)) ?? { file: plan.value.file, route: plan.value.route };
  },
  async setPageDetail(path, field, value) {
    const error = await writeNativePageMeta(path, field, value, false);
    if (error) return error;
    pageStructure?.refreshMeta();
    renderPagesTree();
    updateCurrentPageLabel();
    updateAgentContext();
    return undefined;
  },
  sectionTags: () => new Set(nativeSectionChoices().map((choice) => choice.tag)),
  moveSection: moveNativeSectionTo,
  moveFile: (path, to, keepOldUrl) =>
    withAgentAnswers({ option: keepOldUrl }, async () => {
      const target = agentFileTarget(path);
      if (!target) return `${path} does not exist.`;
      return moveFileTarget(target, to, parentOf(path) === parentOf(to) ? "rename" : "move");
    }),
  deleteFile: (path) =>
    withAgentAnswers({}, async () => {
      const target = agentFileTarget(path);
      return target ? deleteFileTarget(target) : `${path} does not exist.`;
    }),
  inspect(request) {
    if (!nativePreview?.isActive()) throw new Error("The preview is not showing a page.");
    return nativePreview.inspect(request);
  },
  legacy: applyAgentCommand,
};
async function applyAgentSiteCommand(command: AgentCommand) {
  const { applySiteCommand } = await loadAgentSite();
  if (!appStore.snapshot.value || command.branch !== appStore.snapshot.value.branch || command.commit !== appStore.snapshot.value.commit)
    throw new Error("The editor changed branch or revision.");
  return agentActing(() => applySiteCommand(agentSiteActions, command));
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
    const file = nativeSite.routes[`/${parts.slice(0, length).join("/")}/`];
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
  const epoch = generation,
    selection = ++fileGeneration;
  if (!options.keepExplorer) explorerDropdown?.close();
  setCurrentPage(draft.path);
  // A binary or large file moved or copied here: its text is not held.
  if (draft.upload) {
    showUpload(draft);
    return;
  }
  if (draft.opaque) {
    content.replaceChildren(node("p", "empty-message", `${draft.path} is ${draft.movedFrom ? `${draft.movedFrom} moved here` : "a copy of another file"}. Its content is not shown in the editor; save to GitHub to keep the change.`));
    status(`Selected ${draft.path}.`);
    return;
  }
  await mountSource(draft.path, "", null, false, epoch, selection, options);
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
  const discard = button("Discard", () => { discardUpload(draft.path); void openAfter(undefined); }, "button secondary");
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
  renderDraftFiles();
  await openNewDraft(draft);
}

async function restoreFile(
  path: string,
  epoch: number,
  options: { linkDefaultStyle?: boolean; keepExplorer?: boolean; quietStatus?: boolean; beforeMount?: () => boolean } = {},
) {
  const selection = ++fileGeneration;
  const repo = appStore.repository.value!;
  const unavailable = () =>
    new Error("The previously open file is no longer available. Choose another file.");
  const nowFolder = () =>
    new Error("The previously open file is now a folder. Choose another file.");
  const savedDraft = () =>
    info.user && appStore.snapshot.value
      ? draftStore().get(
          {
            account: info.user.login,
            repoId: repo.id,
            repo: repo.full_name,
            branch: appStore.snapshot.value.branch,
          },
          path,
        )
      : undefined;
  try {
    let entry: TreeEntry | undefined;
    if (appStore.snapshot.value?.tree) {
      entry = entryAt(path);
    } else {
      let entries = appStore.snapshot.value!.entries;
      const parts = path.split("/");
      for (let index = 0; index < parts.length; index++) {
        if (epoch !== generation || selection !== fileGeneration) return;
        entry = entries.find((entry) => entry.path === parts[index]);
        if (!entry) break;
        if (index === parts.length - 1) break;
        if (entry.type !== "tree") throw unavailable();
        entries = (
          await api<Directory>("tree", { repo: repo.full_name, sha: entry.sha })
        ).entries;
      }
    }
    if (epoch !== generation || selection !== fileGeneration) return;
    if (!entry) {
      const saved = savedDraft();
      if (saved?.baseSha === null) {
        await openNewDraft(saved, options);
        return;
      }
      // An edit of a file GitHub deleted: opened to be settled.
      if (saved && !saved.deleted) await savePublish.checkDeleted(epoch);
      if (epoch !== generation || selection !== fileGeneration) return;
      if (saved && !saved.deleted && savePublish.isDeleted(path)) {
        if (!options.keepExplorer) explorerDropdown?.close();
        setCurrentPage(path);
        await mountSource(path, saved.original, saved.baseSha, false, epoch, selection, options);
        return;
      }
      throw unavailable();
    }
    if (entry.type === "tree") throw nowFolder();
    await openEntry(entry, path, epoch, options);
  } catch (error) {
    if (epoch === generation && selection === fileGeneration)
      errorMessage(error);
  }
}

async function loadSnapshot(
  resumePath?: string,
  prefetched?: Promise<Snapshot>,
) {
  if (!appStore.repository.value || !appStore.branch.value) return;
  removeFinishStarter();
  const reopen =
    resumePath ??
    (appStore.snapshot.value?.branch === appStore.branch.value ? appStore.openFile.value : undefined);
  // The head this tab saw on the branch: a lagging read never steps back from it.
  const known = appStore.snapshot.value && appStore.snapshot.value.branch === appStore.branch.value ? savePublish.trustedHead() : undefined;
  const epoch = ++generation;
  fileGeneration++;
  clearError();
  batch(() => {
    appStore.snapshot.value = undefined;
    repositoryIndex.clear();
    savePublish.resetDeleted();
    siteActions?.revalidate();
    filesTreeController.reset();
    deactivateNative();
    setCurrentPage();
    appStore.selection.value = undefined;
  });
  const repo = appStore.repository.value;
  const branch = appStore.branch.value;
  refreshButton.disabled = true;
  element("revision").textContent = "…";
  files.replaceChildren(node("p", "muted sidebar-hint", "Loading files…"));
  content.replaceChildren(
    node("p", "empty-message", "Opening your repository…"),
  );
  status(`Loading ${repo.name} / ${branch}…`);
  try {
    // The browser's drafts load alongside the snapshot (start()).
    const [result] = await Promise.all([
      prefetched ??
        api<Snapshot>("snapshot", {
          repo: repo.full_name,
          branch,
          ...(known ? { commit: known } : {}),
        }),
      boot.draftsReady(),
    ]);
    if (epoch !== generation) return;
    appStore.snapshot.value = result;
    repositoryIndex.seed(repo, result);
    savePublish.seeHead(result.commit);
    updateAgentContext();
    updatePreview();
    // Start reading the file to reopen now, alongside the native site's files.
    const reopenEntry = reopen ? entryAt(reopen) : undefined;
    if (reopenEntry?.type === "blob" && (reopenEntry.size ?? 0) <= 1024 * 1024)
      void readFile(repo.full_name, reopenEntry.sha).catch(() => {});
    const isNative = await activateNativeSite(repo, result, epoch, reopen);
    if (epoch !== generation) return;
    // Drafts of files GitHub deleted or now holds are looked for once the
    // page is on screen (a file opened before then that needs it waits).
    if (isNative && nativeSite) {
      afterNativePaint(nativeSourcesRequest, () => void savePublish.checkDeleted(epoch));
      const painted = nativeSourcesRequest;
      let remembered = false;
      afterNativePaint(painted, () => {
        const login = info.user?.login;
        // Only after a real paint (not the 10 s fallback), once.
        if (remembered || nativePaintedRequest !== painted) return;
        remembered = true;
        if (epoch !== generation || appStore.snapshot.value !== result || appStore.repository.value !== repo || appStore.branch.value !== branch || !login) return;
        writeBootMemory(storage("local"), { login, repoId: repo.id, fullName: repo.full_name, branch, commit: result.commit,
          files: nativePaintedPaths.flatMap((path) => { const sha = repositoryIndex.entry(repo, result, path)?.sha; return sha ? [{ path, sha }] : []; }) });
      });
    } else {
      forgetBootMemory(storage("local"), repo.id);
      void savePublish.checkDeleted(epoch);
    }
    // A native project opens on its home page when nothing else is selected;
    // its source is already in memory from the site's prefetch.
    const open = reopen ?? (isNative ? nativeSite?.routes["/"] : undefined);
    element("revision").textContent = result.empty ? "—" : result.commit.slice(0, 7);
    element("revision").title = result.empty ? "No commits yet" : result.commit;
    renderFileTree();
    updateExplorerTabs(true);
    showDirectory(result);
    // Agents see the site as it is now (pages found, or none yet).
    updateAgentContext();
    // A repository made on GitHub's own page for a chosen starting point gets it now.
    // Only an empty repository gets it unasked; for any other the remembered choice is dropped.
    const remembered = !isNative ? takeStartingPoint(repo) : undefined;
    const chosenPoint = result.empty ? remembered : undefined;
    if (chosenPoint) void writeStartingPoint(chosenPoint).then((problem) => { if (problem) errorMessage(new Error(problem)); });
    // A starting point that stopped part way is offered to be finished.
    const partialStart = result.empty ? undefined : readPartialStart(repo.id);
    if (partialStart) offerFinishStarter(repo, partialStart);
    if (info.user)
      rememberWorkspace(info.user.login, {
        repoId: repo.id,
        branch,
        path: open,
      });
    if (open) {
      recordNativeSourceIntent(open);
      const opening = restoreFile(open, epoch), selection = fileGeneration;
      await opening;
      // Its code pane waits for Monaco: a file opened meanwhile (a new page,
      // a rename) has said what happened, and that stands.
      if (selection !== fileGeneration) return;
    }
    if (epoch !== generation) return;
    if (result.empty) {
      settleStatus(`${repo.name} is empty. Choose how to start your site.`);
      return;
    }
    settleStatus(
      `Up to date with ${branch} · ${result.commit.slice(0, 7)}. Refresh to check for new commits.`,
    );
  } catch (error) {
    if (epoch === generation) {
      files.replaceChildren(
        node(
          "p",
          "muted sidebar-hint",
          "Files could not be loaded. Try refreshing.",
        ),
      );
      content.replaceChildren(
        node("p", "empty-message", "Your repository could not be opened."),
      );
      errorMessage(error);
    }
  } finally {
    if (epoch === generation) refreshButton.disabled = false;
  }
}

// Remember last boot (src/boot-memory.ts): the hash's repository, as its last
// first paint read it, is asked for before the session is known. Nothing of it
// shows until the adopted session, the verified listing and the fresh snapshot
// prove it; anything else falls back to the normal reads.
// How long a failed branch list waits for a guessed snapshot (the only read with a bound).
const GUESS_AFTER_FAILED_LIST_MS = 5000;
// A taken guess, until it is abandoned: then its files never enter the cache.
let takenGuess: { abandoned: boolean } | undefined;
function dropBootGuess() {
  bootGuess = undefined;
  if (takenGuess) takenGuess.abandoned = true;
  takenGuess = undefined;
}
let bootGuess: { memory: BootMemory; source: string; snapshot: Promise<ApiReceipt<Snapshot>>; files?: Promise<ApiReceipt<FilesResult>> } | undefined;
function startBootGuess() {
  const link = readWorkspaceUrl();
  const memory = link && readBootMemory(storage("local"), link.repoId);
  if (!memory || memory.branch !== link.branch) return;
  const quiet = <T,>(read: Promise<T>) => { void read.catch(() => {}); return read; };
  bootGuess = {
    memory,
    source: location.origin + location.pathname,
    snapshot: quiet(apiResponse<Snapshot>("snapshot", { repo: memory.fullName, branch: memory.branch })),
    files: memory.files.length ? quiet(apiResponse<FilesResult>("files", { repo: memory.fullName, shas: memory.files.map((file) => file.sha).join(",") })) : undefined,
  };
}
/** The guessed snapshot for `repo`/`branch`, once only, when this session and listing prove the memory. */
function takeBootGuess(repo: Repository, branch: string): { snapshot: Promise<Snapshot>; token: { abandoned: boolean } } | undefined {
  const guess = bootGuess;
  // A new repository choice makes any earlier guess irrelevant.
  dropBootGuess();
  const tag = boot.sessionTag();
  const link = readWorkspaceUrl();
  if (!guess || !tag || guess.source !== location.origin + location.pathname || link?.repoId !== repo.id || link.branch !== branch ||
    !memoryMatches(guess.memory, info.user?.login, repo, branch)) return undefined;
  // loadSnapshot drops the result if navigation supersedes it meanwhile.
  const fresh = () => api<Snapshot>("snapshot", { repo: repo.full_name, branch });
  const token = takenGuess = { abandoned: false };
  const snapshot = guess.snapshot.then((receipt) => {
    if (receipt.sessionTag !== tag || boot.sessionTag() !== tag || receipt.value.branch !== branch) return fresh();
    const snapshot = receipt.value;
    // Content is addressed by SHA: a path with the remembered SHA in this
    // fresh snapshot has exactly the remembered read's content.
    for (const { sha } of guess.files && !token.abandoned ? provenFiles(guess.memory, snapshot.tree ?? snapshot.entries) : []) {
      const key = fileKey(repo.full_name, sha);
      if (fileContents.has(key)) continue;
      rememberFile(fileContents, fileContentsLimit, key, guess.files!.then((files) => {
        const text = files.value.files[sha];
        if (files.sessionTag !== tag || typeof text !== "string") throw new Error();
        return text;
      }).catch(() => api<{ content: string }>("file", { repo: repo.full_name, sha }).then((file) => file.content)));
    }
    return snapshot;
  }, fresh);
  return { snapshot, token };
}

async function chooseRepository(resume?: WorkspaceLocation) {
  const epoch = ++generation;
  fileGeneration++;
  appStore.reset(repositories.find(
    (repo) => String(repo.id) === repositorySelect.value,
  ));
  repositoryMenu?.setRepository(appStore.repository.value);
  repositoryIndex.clear();
  setCurrentPage();
  branchSelect.disabled = true;
  refreshButton.disabled = true;
  options(branchSelect, [{ value: "", label: "Loading branches…" }]);
  files.replaceChildren();
  content.replaceChildren(node("p", "empty-message", "Loading branches…"));
  clearError();
  if (!appStore.repository.value) {
    options(branchSelect, [{ value: "", label: "—" }]);
    element("revision").textContent = "—";
    content.replaceChildren(
      node(
        "p",
        "empty-message",
        "Select a repository from Pages & files to open a project.",
      ),
    );
    status("Choose a project to continue.");
    return;
  }
  // Begin independent work together: the selected branch is already known from
  // the bookmark or repository metadata. Validate it before using its snapshot.
  const requestedBranch = resume?.branch ?? appStore.repository.value.default_branch;
  const taken = takeBootGuess(appStore.repository.value, requestedBranch);
  const guessed = taken?.snapshot;
  const opened = appStore.repository.value;
  const snapshotRead = () => api<Snapshot>("snapshot", { repo: opened.full_name, branch: requestedBranch });
  // A rejected guess has already tried a fresh read (takeBootGuess).
  const prefetched = guessed ?? snapshotRead();
  // A branch lookup may fail first or navigation may supersede this request.
  void prefetched.catch(() => {});
  try {
    const listing = api<string[]>("branches", {
      repo: appStore.repository.value.full_name,
    });
    void listing.catch(() => {});
    // The remembered branch opens once its snapshot is in, which proves the
    // branch exists; the branch list fills the selector when it comes. A
    // guess that fails (a deleted branch), or a branch list that comes
    // first, takes the normal path below. A failed branch list waits for
    // the guess, for a while only: past that the failure shows as before,
    // and a late guess is never used.
    let timer: ReturnType<typeof setTimeout> | undefined, decided = false;
    const guessedSnapshot = guessed && await Promise.race([guessed.catch(() => undefined), listing.then(() => undefined, () => decided ? undefined : Promise.race([
      guessed.catch(() => undefined),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => { taken!.token.abandoned = true; resolve(undefined); }, GUESS_AFTER_FAILED_LIST_MS); }),
    ]))]);
    decided = true;
    clearTimeout(timer);
    if (epoch !== generation) return;
    if (guessedSnapshot) {
      const branch = requestedBranch;
      options(branchSelect, [{ value: branch, label: `⑂ ${branch}` }]);
      appStore.branch.value = branch;
      branchSelect.value = branch;
      branchSelect.disabled = false;
      void listing.then((branches) => {
        if (appStore.repository.value !== opened || appStore.branch.value !== branch) return;
        options(branchSelect, [...new Set([branch, ...branches])].map((name) => ({ value: name, label: `⑂ ${name}` })));
        branchSelect.value = branch;
      }, () => {});
      await loadSnapshot(resume?.path, Promise.resolve(guessedSnapshot));
      return;
    }
    const branches = await listing;
    if (epoch !== generation) return;
    if (!branches.length) {
      // An empty repository opens on its default branch with no files, so
      // drafts work; its first save makes the branch.
      const branch = appStore.repository.value.default_branch || "main";
      options(branchSelect, [{ value: branch, label: `⑂ ${branch}` }]);
      appStore.branch.value = branch;
      branchSelect.value = branch;
      branchSelect.disabled = false;
      // The Worker answers for it with an empty snapshot at EMPTY_COMMIT.
      await loadSnapshot(undefined, branch === requestedBranch ? prefetched : undefined);
      return;
    }
    options(
      branchSelect,
      branches.map((name) => ({ value: name, label: `⑂ ${name}` })),
    );
    if (resume && !branches.includes(resume.branch)) {
      branchSelect.disabled = false;
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          "The linked branch is no longer available. Choose a branch from Pages & files.",
        ),
      );
      return;
    }
    appStore.branch.value =
      resume && branches.includes(resume.branch)
        ? resume.branch
        : branches.includes(appStore.repository.value.default_branch)
          ? appStore.repository.value.default_branch
          : branches[0];
    branchSelect.value = appStore.branch.value ?? "";
    branchSelect.disabled = false;
    await loadSnapshot(
      resume?.branch === appStore.branch.value ? resume.path : undefined,
      appStore.branch.value === requestedBranch ? prefetched : undefined,
    );
  } catch (error) {
    if (epoch === generation) {
      options(branchSelect, [{ value: "", label: "Branches unavailable" }]);
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          "Branches could not be loaded. Reload repositories to retry.",
        ),
      );
      errorMessage(error);
    }
  }
}

// ---- Setup wizard (src/setup-wizard.ts, components/setup-wizard.ts) ----
// A full-screen guide over the page for a signed-in account with no
// repository, in place of Get started: Connect GitHub, Create your site, then
// a page that celebrates the new site and opens the editor. Connect GitHub is its first
// step: done for an account with the App, and a retry for one that came back
// from GitHub's install page without installing it (the worker sends a new
// sign-in without the App to that page by itself). Its state is kept in
// localStorage so it survives a reload.
/** The repository the wizard made, for the editor to open at the end. */
let wizardCreated: Repository | undefined;

/** What this account's GitHub connection is: signed in without the App, or with it installed. */
async function wizardConnection(): Promise<Connection> {
  try {
    const response = await fetch("/api/owners", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) return "signed-out";
    if (!response.ok) return "not-installed";
    const owners = (await response.json()) as OwnerInstallation[];
    return owners.length ? "installed" : "not-installed";
  } catch {
    return "signed-out";
  }
}

const setupEntry = createSetupEntryController({
  login: () => info.user?.login,
  ownerSetupUrl: () => info.ownerSetupUrl ?? undefined,
  repositoryCount: () => repositories.length,
  connectionHint: () => connectionFromOnboarding(boot.onboarding()),
  connection: wizardConnection,
  readMemory: () => readWizard(localStorage),
  writeMemory: change => writeWizard(localStorage, change),
  clearMemory: () => clearWizard(localStorage),
  loadWizard,
  append: root => document.body.append(root),
  actions: {
    loadOwners: () => api<OwnerInstallation[]>("owners"),
    create: createSiteInWizard,
    findRepository: findWizardRepository,
    loadPreview: wizardPreview,
    // Loaded with the wizard (loadWizard).
    agentPrompt: (choice, about) => agentPrompts?.setupPrompt({ editor: location.origin, installUrl: info.installUrl, name: choice.name, private: choice.private, owner: choice.owner, about, repository: choice.repository }) ?? "",
    finish: repo => void finishWizard(repo),
  },
  onExit: () => { if (info.user && !repositories.length) void showGetStarted().catch(errorMessage); },
});

/** Create site: the repository, with its starting point already committed (POST /api/repositories). */
async function createSiteInWizard(choice: CreateChoice): Promise<WizardCreateOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/repositories", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: choice.name,
        ...(choice.owner ? { owner: choice.owner } : {}),
        private: choice.private,
        description: "A website edited with Native Site Editor",
        startingPoint: choice.point,
        siteName: siteNameFromRepository(choice.name),
      }),
    });
  } catch {
    return { ok: false, message: "GitHub could not be reached. Try again." };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 403 || response.status === 404) {
    rememberStartingPoint(choice.owner, choice.name, choice.point);
    return { ok: false, fallback: true, message: data.error || "The editor cannot create repositories on your account yet." };
  }
  if (response.status === 409) {
    // The name exists. When it is a repository this account can reach (a retry after making it by hand, say), it is the one wanted.
    const existing = await findWizardRepository(choice).catch(() => undefined);
    if (existing) return { ok: true, repo: existing };
  }
  if (!response.ok) return { ok: false, message: data.error || "The site could not be created. Try again." };
  const { commit, startingPointError, committed, ...plain } = data as Repository & { commit?: unknown; startingPointError?: string; committed?: string[]; missing?: string[] };
  const repository = plain as Repository & { missing?: undefined };
  delete (repository as { missing?: unknown }).missing;
  wizardCreated = repository;
  repositories = [...repositories.filter((known) => known.id !== repository.id), repository];
  rememberRepositories(repositories);
  let partial = false;
  if (startingPointError) {
    if (Array.isArray(committed) && committed.length) {
      // Some files are committed already: the editor offers to add the missing ones when the repository opens.
      partial = true;
      rememberPartialStart(repository.id, choice.point, committed);
    } else rememberStartingPoint(repository.owner.login, repository.name, choice.point);
  }
  return { ok: true, repo: wizardRepository(repository, Boolean(commit), partial), ...(startingPointError ? { error: startingPointError } : {}) };
}

/**
 * The new site's home page as one self-contained document for the wizard's preview, built with the
 * editor's own helpers: the linked stylesheets with their `@import` chains expanded (`expandStyleImports`)
 * and the repository images turned into data URLs (`rewriteCssUrls`, `resolveImportPath`, as the editor's
 * preview does). A page that needs scripts to render (shared components are custom elements) or that
 * cannot be completed has no preview: the wizard shows its card instead, never a half-styled page.
 */
async function wizardPreview(repo: WizardRepo): Promise<string | undefined> {
  try {
    const snap = await api<Snapshot>("snapshot", { repo: repo.fullName, branch: repo.defaultBranch });
    if (!snap.tree) return undefined;
    const byPath = new Map(snap.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
    const homeSha = byPath.get("index.html");
    if (!homeSha) return undefined;
    const home = (await readFiles(repo.fullName, [homeSha]))[homeSha];
    if (typeof home !== "string") return undefined;
    const body = nativePageBody(home);
    if (/<[a-z][a-z\d]*-[a-z\d-]*[\s/>]/i.test(home.slice(body.start, body.end))) return undefined;
    // Stylesheets: the linked ones, then every file they import, round by round.
    const sheets: Record<string, string> = {};
    const linked = nativePageStylesheets(home, "index.html");
    for (let round = 0; round < 20; round++) {
      const known = expandStyleImports(linked.filter((path) => path in sheets), (path) => sheets[path]);
      const wanted = [...new Set([...linked, ...known.imported])].filter((path) => !(path in sheets) && byPath.has(path));
      if (!wanted.length) break;
      const contents = await readFiles(repo.fullName, wanted.map((path) => byPath.get(path)!));
      for (const path of wanted) sheets[path] = contents[byPath.get(path)!] ?? "";
    }
    const expanded = expandStyleImports(linked.filter((path) => path in sheets), (path) => sheets[path]);
    if (expanded.errors.length || linked.some((path) => !(path in sheets))) return undefined;
    // Images the page and the sheets name, as data URLs (the frame cannot reach the repository).
    const imagePath = (from: string, url: string) => {
      const path = resolveImportPath(from, url);
      return path && assetType(path) && byPath.has(path) ? path : undefined;
    };
    const wanted = new Set<string>();
    for (const sheet of expanded.sheets)
      rewriteCssUrls(sheet.source, (url) => {
        const path = imagePath(sheet.path, url);
        if (path) wanted.add(path);
        return undefined;
      });
    for (const match of home.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const path = imagePath("index.html", match[1]);
      if (path) wanted.add(path);
    }
    const images = new Map<string, string>();
    for (const path of [...wanted].slice(0, 12)) {
      images.set(path, await dataUrlOf(await readBlob(repo.fullName, byPath.get(path)!, path), assetType(path)!));
    }
    const css = expanded.sheets
      .map((sheet) => rewriteCssUrls(sheet.source, (url) => {
        const path = imagePath(sheet.path, url);
        return path ? images.get(path) : undefined;
      }))
      .join("\n");
    let html = home.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    for (const tag of home.match(/<link\b[^>]*>/gi) ?? []) if (/rel\s*=\s*["']?stylesheet/i.test(tag)) html = html.replace(tag, "");
    html = html.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (whole, before: string, url: string, after: string) => {
      const path = imagePath("index.html", url);
      const data = path ? images.get(path) : undefined;
      return data ? `${before}${data}${after}` : whole;
    });
    const style = `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
    return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${style}</head>`) : `${style}${html}`;
  } catch {
    return undefined;
  }
}

function wizardRepository(repository: Repository, committed: boolean, partial = false): WizardRepo {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch || "main",
    owner: repository.owner.login,
    committed,
    ...(partial ? { partial: true } : {}),
  };
}

/** The repository the user was told to make on GitHub (or retried the name of), looked up afresh; its starting point waits for it to open. */
async function findWizardRepository(choice: CreateChoice): Promise<WizardRepo | undefined> {
  const owner = (choice.owner ?? info.user?.login ?? "").toLowerCase();
  const list = await boot.fetchList(true);
  const repository = list.find((candidate) => candidate.owner.login.toLowerCase() === owner && candidate.name.toLowerCase() === choice.name.toLowerCase());
  if (!repository) return undefined;
  wizardCreated = repository;
  repositories = [...repositories.filter((known) => known.id !== repository.id), repository];
  rememberRepositories(repositories);
  // Empty, it gets the starting point when it opens; one with files keeps them.
  rememberStartingPoint(repository.owner.login, repository.name, choice.point);
  return wizardRepository(repository, false);
}

// A starting point that stopped part way (the first file is committed, the rest is not): which files are in, kept
// (localStorage, by account and repository id) until the user finishes adding it or leaves it.
const partialStartKey = (repoId: number) => `native-site-editor:partial-start:${info.user?.login.toLowerCase() ?? ""}/${repoId}`;
function rememberPartialStart(repoId: number, point: StartingPoint, committed: string[]) {
  try { localStorage.setItem(partialStartKey(repoId), JSON.stringify({ point, committed })); } catch { /* Not kept. */ }
}
function readPartialStart(repoId: number): { point: StartingPoint; committed: string[] } | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(partialStartKey(repoId)) ?? "null");
    if (!value || (value.point !== "starter" && value.point !== "blank") || !Array.isArray(value.committed) || !value.committed.every((path: unknown) => typeof path === "string")) return undefined;
    return { point: value.point, committed: value.committed };
  } catch {
    return undefined;
  }
}
function forgetPartialStart(repoId: number) {
  try { localStorage.removeItem(partialStartKey(repoId)); } catch { /* Nothing kept. */ }
}

/** Says the starting point stopped part way and offers to add the files that are missing, as drafts that overwrite nothing. */
const removeFinishStarter = () => document.getElementById("finish-starter")?.remove();
function offerFinishStarter(repo: Repository, partial: { point: StartingPoint; committed: string[] }) {
  // Its own banner: an error notice replaces the shared one (a missing stylesheet is one here).
  removeFinishStarter();
  // The banner belongs to this repository, branch and load: it goes when any of them changes, and refuses if it was left behind.
  const branch = appStore.snapshot.value?.branch;
  const epoch = generation;
  const banner = node("div", "notice");
  banner.id = "finish-starter";
  banner.setAttribute("role", "status");
  const what = partial.point === "starter" ? "Starter site" : "blank page";
  const finish = button(`Finish adding the ${what}`, async () => {
    if (generation !== epoch || appStore.repository.value?.id !== repo.id || appStore.snapshot.value?.branch !== branch) {
      banner.remove();
      return;
    }
    finish.disabled = true;
    // writeStartingPoint forgets the recovery record and removes this banner once the drafts are written.
    const problem = await writeStartingPoint(partial.point, { ...partial, repoId: repo.id });
    if (problem) {
      finish.disabled = false;
      errorMessage(new Error(problem));
    }
  }, "text-link");
  banner.append(node("span", "", `Adding the ${what} to ${repo.name} stopped part way, so some of its files are missing. `), finish);
  app.insertBefore(banner, document.querySelector(".workspace"));
}

/** The last step: the editor opens on the new repository, and the Setup checklist takes over. */
async function finishWizard(repo: WizardRepo) {
  setupEntry.complete();
  setupController.start(repo.id);
  history.replaceState(null, "", `#repo=${repo.id}&branch=${encodeURIComponent(repo.defaultBranch)}`);
  // GitHub may not list a repository it has just made yet: the one made here is added.
  const listed = await boot.fetchList(true).catch(() => repositories);
  await loadRepositories(wizardCreated && !listed.some((known) => known.id === wizardCreated!.id) ? [...listed, wizardCreated] : listed);
}

// Get started: the screen of an account with no repository in the editor.
// Coming back to the tab (from GitHub, where access was given or a
// repository made) lists the repositories again.
let waitingForRepositories = false;
// The repository ids this browser last listed, kept (localStorage, as the
// install page opens in another tab) to tell which one is new on return.
const knownRepositoriesKey = () => `native-site-editor:repositories:${info.user?.login.toLowerCase() ?? ""}`;
function rememberRepositories(list: Repository[]) {
  try { localStorage.setItem(knownRepositoriesKey(), JSON.stringify(list.map((repo) => repo.id))); } catch { /* Not kept. */ }
}
function knownRepositories(): number[] | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(knownRepositoriesKey()) ?? "null");
    return Array.isArray(value) && value.every((id) => typeof id === "number") ? value : undefined;
  } catch {
    return undefined;
  }
}
async function showGetStarted() {
  const host = content, login = info.user?.login;
  const { createGetStarted } = await loadGetStarted();
  if (host !== content || login !== info.user?.login || repositories.length) return;
  const screen = createGetStarted({
    login: info.user?.login ?? "",
    installUrl: info.installUrl,
    editor: location.origin,
    create: createSite,
    reload: () => void loadRepositories(),
    loadOwners: () => api<OwnerInstallation[]>("owners"),
  });
  content.replaceChildren(screen.root);
  status("Connected. Create a site or choose a repository.");
  waitingForRepositories = true;
}
window.addEventListener("focus", () => void checkNewRepositories());
document.addEventListener("visibilitychange", () => void checkNewRepositories());
async function checkNewRepositories() {
  if (!waitingForRepositories || document.visibilityState !== "visible" || !content.querySelector(".get-started")) return;
  try {
    const next = await boot.fetchList(true);
    if (next.length && waitingForRepositories && content.querySelector(".get-started")) await loadRepositories(next);
  } catch {
    // Listed again on the next visit.
  }
}

// The starting point chosen on Get started when the repository was made on
// GitHub's own page: kept (localStorage, by account, owner and repository name, as
// the way back may be a new tab) until that repository opens.
const startingPointKey = (owner: string | undefined, name: string) => `native-site-editor:starting-point:${info.user?.login.toLowerCase() ?? ""}/${(owner ?? info.user?.login ?? "").toLowerCase()}/${name.toLowerCase()}`;
function rememberStartingPoint(owner: string | undefined, name: string, point: StartingPoint) {
  try { localStorage.setItem(startingPointKey(owner, name), point); } catch { /* Not kept: Start your site asks. */ }
}
function takeStartingPoint(repo: Repository): StartingPoint | undefined {
  try {
    const key = startingPointKey(repo.owner.login, repo.name);
    const point = localStorage.getItem(key);
    if (point === null) return undefined;
    localStorage.removeItem(key);
    return point === "starter" || point === "blank" ? point : undefined;
  } catch {
    return undefined;
  }
}

// Create a site: a new empty repository on the account (the Worker needs
// the App's Administration permission for it), opened with the chosen
// starting point written as drafts. When the editor may not create it,
// Get started offers GitHub's own New repository page instead.
async function createSite(choice: CreateChoice): Promise<CreateOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/repositories", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: choice.name, ...(choice.owner ? { owner: choice.owner } : {}), private: choice.private, description: "A website edited with Native Site Editor" }),
    });
  } catch {
    return { ok: false, message: "GitHub could not be reached. Try again." };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 403 || response.status === 404) {
    rememberStartingPoint(choice.owner, choice.name, choice.point);
    return { ok: false, fallback: true, message: data.error || "The editor cannot create repositories on your account yet." };
  }
  if (!response.ok) return { ok: false, message: data.error || "The repository could not be created. Try again." };
  const repo = data as Repository;
  waitingForRepositories = false;
  repositories = [...repositories.filter((known) => known.id !== repo.id), repo];
  rememberRepositories(repositories);
  repositoryOptions();
  repositorySelect.disabled = false;
  repositorySelect.value = String(repo.id);
  repositoryMenu?.setRepositories(repositories);
  await chooseRepository();
  if (appStore.repository.value?.id === repo.id) {
    const problem = await writeStartingPoint(choice.point);
    if (problem) errorMessage(new Error(problem));
  }
  return { ok: true };
}

async function loadRepositories(prefetched?: Repository[], hooks?: { onStarted(epoch: number): void }) {
  boot.loading();
  removeFinishStarter();
  waitingForRepositories = false;
  const epoch = ++generation;
  hooks?.onStarted(epoch);
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
    if (epoch !== generation) return;
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
    if (epoch === generation) {
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
  const current = draftScope();
  return nativeEngaged && current && current.repoId === scope.repoId && current.branch === scope.branch && current.account === scope.account
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
    onCommand: applyAgentSiteCommand,
    // Ask agent shows in the edit bar while an agent is connected.
    onConnection: (connected) => { setupController.noteAgent(connected); if (appStore.selection.value) renderNativeEditBar(appStore.selection.value); },
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
  generation: () => generation,
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
  adoptSession: (session) => { info = session; },
  enterWorkspace: () => {
    resumeWorkspaceLink();
    mountWorkspace();
    agentController.start();
  },
  // A guess not taken by the boot's listing is not kept for a later Reload.
  loadRepositories: (prefetched, hooks) => loadRepositories(prefetched, hooks).finally(() => { bootGuess = undefined; }),
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
  if ((event.target as Element).closest?.('a[href="/auth/login"]'))
    retainWorkspaceLink();
});
// A fragment change before the session has loaded is not lost: once signed
// in, the repositories load from the location as it is then.
window.addEventListener("hashchange", () => { dropBootGuess(); boot.onHashChange(); });
renderLogin("loading");
startBootGuess();
void boot.start();
