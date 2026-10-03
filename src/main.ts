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
import { createAgentMenu, setupPrompt } from "./components/agent-menu";
import { touchesGithubConfig, splitProtectedEdits, GITHUB_CONFIG_REFUSED } from "../shared/protected-paths";
import { agentAnswers, agentElement, applySiteCommand, buildAgentContext, type AgentSiteActions, type SharedContext } from "./agent-site";
import { REQUEST_TEXT_LIMIT, type AgentCommand } from "../shared/agent";
import { draftStore, type SavedDraft } from "./drafts";
import { draftKey } from "./drafts";
import { mountDropdown } from "./components/dropdown";
import { createRepositoryMenu } from "./components/repository-menu";
import { mountSiteActions } from "./components/site-actions";
import type { SiteFiles } from "./site-download";
import { mountSidebarResize, type SidebarResize } from "./components/sidebar-resize";
import { createNativePreview, routeStylesheets, type NativeFormat, type NativePreviewSelection, type NativeTextEdit, type NativeTextSelection } from "./components/native-preview";
import { createPageStructure, type PageMetaField } from "./components/page-structure";
import { createSiteSettings, type SiteSettingsValues, type SiteLinkPreference } from "./components/site-settings";
import { escapeText, upsertHeadTag, withPageField, type HeadField } from "./page-builder/site-head";
import { readSiteIdentity, withSiteIdentityConfig, withSiteIdentityPage } from "./page-builder/site-identity";
import { editNavigation, readNavigation } from "./page-builder/site-navigation";
import { nativePageTemplate, newFilePath, newFolderPath, normalizeRoute, renamedPath, routeHeading, type Checked } from "./native-create";
import { createCreateDialog, type CreateKind, type CreateRequest } from "./components/create-dialog";
import { createPagesTree, type NativeNewRequest, type NativePagesTarget } from "./components/pages-tree";
import { createFileRowActions, type FileRowTarget } from "./components/file-row-actions";
import { createConfirmDialog } from "./components/confirm-dialog";
import { EMPTY_COMMIT, type OwnerInstallation } from "../shared/types";
import { createGetStarted, type CreateChoice, type CreateOutcome } from "./components/get-started";
import { createStartSite } from "./components/start-site";
import { createSetupWizard, type WizardCreateOutcome } from "./components/setup-wizard";
import { clearWizard, connectionFromOnboarding, openingStep, readWizard, writeWizard, type Connection, type WizardRepo } from "./setup-wizard";
import { autoSignInPlan, AUTO_SIGNIN_DELAY_MS, forgetSignedIn, markAutoSignInTried, rememberSignedIn } from "./auto-signin";
import { spotlight } from "./components/spotlight";
import { AGENT_EXPLAINER, agentWhere } from "./onboarding-copy";
import { createSetupChecklist } from "./components/setup-checklist";
import { readSetupMemory, setupProgress, setupVisible, withSiteSettings, writeSetupMemory, type SetupMemory, type SetupState } from "./setup-checklist";
import { blankSiteFiles, siteNameFromRepository, type StartingPoint } from "../shared/starting-point";
import { createPagePicker, type PagePickerItem } from "./components/page-picker";
import type { UrlPlan } from "./components/url-change";
import { editNativeRedirects, groupRouteChanges, isRouteWithin, movedRoute, parentRoute, planPageMove, rewriteRouteLinks, routeFolder, routeSlug, type FileMove, type PageMovePlan, type RouteChange } from "./native-page-moves";
import type { MenuItem } from "./components/row-menu";
import { CHANGE_WORDS, deleteFile, duplicateFile, keepAsNewFile, listChanges, moveFile, pruneUnchanged, restoreFile as restoreDraftFile, settleDeletedUpstream, type ChangeKind, type FileChange, type MovableFile } from "./file-changes";
import { DEFAULT_IMAGE_FOLDER, addUpload, formatBytes, pickFiles, sweepUploads, uploadBytes, uploadDataUrl, uploadImageType, uploadKey } from "./uploads";
import { copyPath, filesLinkingTo, linkNote, movedPath, protectedPathProblem, type FileOperation } from "./native-files";
import { buildNativePagesTree, firstHeadingText, nativeLinkSuggestions, nativeNewTarget, nativePageLabel, type NativeNewTarget, type NativePageNode } from "./native-pages";
import { elementPathAt, locateNativeElement, locateNativeElementRange, startTagAttribute, textRangeInSource, wrapperAround, type ElementRange, type StartTag } from "./native-source-location";
import type { EditBarControl, EditBarModel } from "./components/edit-bar";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import { componentLabel, isSectionTemplate, nativeInsertEdit } from "./native-insert";
import { altFromPath, duplicateEdit, isImagePath, linkWrapEdit, moveEdit, nativeElementLabel, nativeKindLabel, newTabEdit, opensInNewTab, previousHeadingLevel, removeEdit, setAttributeEdit, structureLabel, swapEdits, unwrapEdits } from "./native-structure";
import { currentTextSize, textSizeEdit, textSizeScale } from "./native-text-size";
import { createCommitHistory } from "./components/commit-history";
import { createCards, type Cards } from "./page-builder/cards";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "./styles-index";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "./style-cascade";
import { configureMediaPicker, mountMediaLibrary, openMediaPicker, closeMediaPicker } from "./page-builder/media-picker";
import { createMediaWorkspace, applyMediaWorkspaceBatch, type MediaWorkspaceContext } from "./page-builder/media-workspace";
import { mediaDraftTransaction } from "./page-builder/media-draft-transaction";
import { mediaImageMarkup, type MediaImage } from "./page-builder/media-markup";
import { addGuardedUpload } from "./page-builder/guarded-upload";
import { decodeHtmlEntities } from "./page-builder/html-entities";
import { createStylePanel, type StylePanelContext } from "./components/style-panel";
import type { CssWorkspace } from "./page-builder/css-intelligence";
import { locateClassRule, locateWriteRule, writeCssProperties, scanCss } from "./page-builder/css-write";
import { nativeImageAsset, singleBackgroundAsset } from "./page-builder/style-image-source";
import { breakpointWidths } from "./page-builder/breakpoints";
import type { DeclarationStatus, RuleStatus } from "../shared/cascade";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports";
import { isFolderRoute, nativePageRoute, nativeRouteFile } from "../shared/native-routes";
import { NATIVE_CONFIG_PATH, NATIVE_HOME_PAGE, NATIVE_REDIRECTS_PATH, minimalTextEdit, nativeComponentCssPath, nativeDefaultRoute, nativePageBody, nativePageHead, nativePageStylesheets, nativePageUrl, nativePageMovedUrl, nativePageWithDetail, nativePageWithUrl, nativeSitePaths, nativeSiteSettings, resolveNativeProject, type NativeSite } from "../shared/native-project";
import { loadNativeAssetRequests } from "./native-assets";
import { fetchWithReadRetry } from "./read-retry";
import { RepositoryIndex, readFileText, readFileTexts } from "./repository-loading";
import { iconMarkup, setIcon } from "./icons";
import { mountEditorPalette } from "./page-builder/palette";
import { createComponentTools, type ComponentTools } from "./page-builder/components";
import { createComponentFileDrafts } from "./page-builder/component-draft-transaction";
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
let editorModule: typeof import("./components/code-editor") | undefined;
let editorLoading:
  | Promise<typeof import("./components/code-editor")>
  | undefined;
function loadEditorModule() {
  return (editorLoading ??= import("./components/code-editor").catch(
    (error) => {
      editorLoading = undefined;
      throw error;
    },
  ));
}
let stylePanel: ReturnType<typeof createStylePanel> | undefined;
let disposeEditor: (() => void) | undefined;
let agentMenu: ReturnType<typeof createAgentMenu> | undefined;
let activeFileContext: EditorContext["file"] = null;
let editorRequest = 0;
let currentPath: string | undefined;

function closeEditor() {
  editorRequest++;
  disposeEditor?.();
  disposeEditor = undefined;
}

async function openCodeEditor(
  file: import("./components/code-editor").SourceFile,
) {
  closeEditor();
  const request = editorRequest;
  content.replaceChildren(node("p", "empty-message", "Opening editor…"));
  try {
    editorModule = await loadEditorModule();
    if (request !== editorRequest || !info.user) return;
    disposeEditor = editorModule.mountCodeEditor(
      content,
      file,
      element("editor-toolbar-host"),
    );
  } catch (error) {
    if (request !== editorRequest) return;
    content.replaceChildren(
      node("p", "empty-message", "The editor could not load."),
      button("Retry editor", () => void openCodeEditor(file)),
    );
    errorMessage(error);
  }
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
      <div id="explorer-pages" class="explorer-panel" aria-labelledby="explorer-tab-pages" hidden><div class="pages-settings" role="group" aria-label="Page"><button type="button" id="page-settings-toggle" class="text-button">Page settings</button><button type="button" id="navigation-settings-toggle" class="text-button">Navigation</button></div></div>
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
    onReload: () => void loadRepositories(),
    onAccessChanged: () => void refreshRepositoryList(),
    onSwitchAccount: (login) => void switchAccount(login),
    onSignOut: disconnect,
  });
  element("repository-menu").append(repositoryMenu.root);
  element("site-settings-toggle").addEventListener("click", () => void openNativeSiteSettings());
  const settingsPage = () => currentPath && nativeRouteForPath(currentPath) ? currentPath : nativeSite?.routes["/"];
  element("page-settings-toggle").addEventListener("click", () => { const path = settingsPage(); if (path) void openNativePageSettings(path); });
  element("navigation-settings-toggle").addEventListener("click", () => { const path = settingsPage(); if (path) void openNativeNavigation(path); });
  disposeExplorerImages();
  configureMediaPicker(createMediaWorkspace(mediaWorkspaceContext));
  siteActions = mountSiteActions({ statusHost: element("change-status"), menuHost: element("site-actions"), siteFiles: nativeSiteFiles, announce });
  mountSetupChecklist();
  repositorySelect = element<HTMLSelectElement>("repository");
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
    void loadSnapshot();
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
      if (file === currentPath && editorModule?.isMounted(file)) explorerDropdown?.close();
      else void restoreFile(file, generation);
    },
    plan: (request) => {
      const planned = planNativeNew(request);
      return planned.ok ? { ok: true, value: { route: planned.value.route, file: planned.value.file, note: planned.value.note } } : planned;
    },
    create: createNativeNew,
    announce: (text) => { element("status").textContent = text; },
    retitle: retitleNativePage,
    changed: (file) => Boolean(treeState().changes.get(file)),
    discard: (file) => void discardOneFile(file),
    duplicate: (file) => void duplicateNativePage(file),
    remove: (target) => void removeNativePagesTarget(target),
    createPage: (route) => void createNativeFolderPage(route),
    pageSettings: (path) => void openNativePageSettings(path),
    canAddToNavigation: () => Boolean(nativeNavigationTarget(nativeSite?.routes["/"])),
    planUrl: (target, value) => (target.file ? nativeUrlPlan(target.file, value) : { ok: false, error: "This row has no page." }),
    changeUrl: (target, value, keep) => (target.file ? changeNativeUrl(target.file, value, keep) : Promise.resolve("This row has no page.")),
    moveTo: (target) => void moveNativePageTo(target),
    dropProblem: nativeDropProblem,
    drop: (source, parent) => void confirmNativeMove(source, parent),
    cardOffer: (parent) => cards?.cardOffer(parent),
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
  codeResize = mountCodeResize(element("main"), element("code-split"));
  codeWidthResize = mountCodeWidthResize(
    element("code-split"),
    element("code-split").querySelector<HTMLElement>(".code-pane")!,
    element("secondary-pane"),
  );
  cards = mountCards();
  // A selection inside a component's template gets Select card once the runtime says which card.
  let selectedGrid = "";
  nativePreview = createNativePreview(element("main"), {
    cards: {
      describe: (grid) => cards?.describe(grid),
      plan: (grid, title) => cards?.plan(grid, title) ?? { ok: false, error: "Open a native site first." },
      addCard: (grid) => void cards?.addCard(grid),
      addPage: (grid, title) => cards?.addPage(grid, title) ?? Promise.resolve("Open a native site first."),
    },
    onItemGrids: (report) => {
      const key = JSON.stringify(report.selected && [report.selected.path, report.selected.parent, report.selected.index, report.selected.row]);
      if (key === selectedGrid) return;
      selectedGrid = key;
      if (lastNativeSelection) renderNativeEditBar(lastNativeSelection);
    },
    onSelect: (selection) => void selectNativeSource(selection),
    onComponentStyles: (tags) => void loadNativeComponentStyles(tags),
    onDefaultStyles: (styles) => updateBodyStyles({ rules: styles.selectors, cascade: styles.cascade }),
    onTextSelection: (text) => {
      const next = text && lastNativeSelection?.node ? { ...text, path: lastNativeSelection.path, node: lastNativeSelection.node } : undefined;
      if (JSON.stringify(next) === JSON.stringify(nativeTextSelection)) return;
      nativeTextSelection = next;
      if (lastNativeSelection) renderNativeEditBar(lastNativeSelection);
    },
    onFormat: (format) => nativeFormatActions[format]?.(),
    onImageDrop: (target, files) => void chooseMediaForImage(target, files),
    onTextEdit: (edit) => void applyNativeTextEdit(edit),
    insertChoices: nativeSectionChoices,
    onInsert: (point, choice) => void insertNativeComponent(point, choice),
    onStructure: (structure) => pageStructure?.update(structure),
    onMove: (direction) => { if (lastNativeSelection && !moveNativeSection(lastNativeSelection, direction)) cards?.move(lastNativeSelection, direction); },
    onSectionDrag: (gap) => {
      const outcome = gap && lastNativeSelection ? moveNativeSectionTo(lastNativeSelection, gap.parent, gap.index) : undefined;
      if (!outcome) element("status").textContent = "Section drag cancelled";
    },
    onDismissRequest: (id) => void agentMenu?.dismiss(id),
    onAnswerRequest: async (id, text) => {
      if (!agentMenu) throw new Error("No agent is connected.");
      await agentMenu.answer(id, text);
    },
    // The Add panel docks over the page structure sidebar.
    addPanelDock: () => {
      const area = app.querySelector<HTMLElement>(".workspace")?.getBoundingClientRect();
      const side = app.querySelector<HTMLElement>(".workspace > .sidebar")?.getBoundingClientRect();
      return area && { left: area.left, top: area.top, bottom: Math.min(area.bottom, innerHeight), width: side?.width ?? 320 };
    },
  });
  nativePreview.attachAddButton(element<HTMLButtonElement>("add-panel-toggle"));
  pageStructure = createPageStructure(element("structure"), {
    label: (item) => {
      const component = Boolean(nativeSite && Object.hasOwn(nativeSite.components, item.tag));
      return { ...structureLabel(item, component), component };
    },
    onSelect: (path, node) => nativePreview?.selectNode({ path, node }),
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
    onMove: (path, item, direction) => {
      if (!isNativeSectionTag(item.tag)) return undefined;
      const target = { path, node: item.node, tag: item.tag };
      if (currentPath === path && editorModule?.isMounted(path)) return moveNativeSection(target, direction) ?? "stayed";
      void moveNativeSectionAfterOpening(target, direction);
      return "pending";
    },
    canDrag: (item) => isNativeSectionTag(item.tag),
    onMoveTo: (path, item, index) => moveNativeSectionTo({ path, node: item.node, tag: item.tag }, item.node.slice(0, -1), index),
    announce: (text) => { element("status").textContent = text; },
  });
  stylePanel?.dispose();
  const staleStyle = () => status("The style target or source changed. Select it again and make a fresh edit.");
  const styleContextMatches = (expected: StylePanelContext | undefined, current: StylePanelContext | undefined) =>
    !!expected && !!current && expected.modelProof?.isCurrent() !== false && expected.key === current.key &&
    expected.target?.path === current.target?.path && expected.target?.selector === current.target?.selector && expected.target?.start === current.target?.start &&
    Object.keys(expected.files).length === Object.keys(current.files).length &&
    Object.entries(expected.files).every(([path, source]) => current.files[path] === source);
  stylePanel = createStylePanel({
    context: nativeStylePanelContext,
    write: async (properties, breakpoint, state, expected) => {
      const context = nativeStylePanelContext(), epoch = generation;
      const target = context?.target, source = target && context?.files[target.path];
      if (versionView || !target || source === undefined || !styleContextMatches(expected, context)) { staleStyle(); throw new Error("The style target or source changed. Select it again and retry."); }
      const scope = draftScope(), requester = currentPath;
      if (!scope || !editorModule || !requester) throw new Error("The style editor is unavailable. Retry after opening the source.");
      const originProof = editorModule.captureFileModelState(scope, requester);
      const targetProof = editorModule.captureFileModelState(scope, target.path);
      const targetMounted = editorModule.isMounted(target.path);
      const current = () => generation === epoch && !versionView && currentPath === requester && originProof.isCurrent() && styleContextMatches(context, nativeStylePanelContext());
      if (!(await openSecondary(target.path, () => current() && targetProof.isCurrent()))) throw new Error("The CSS source could not be opened. Retry the style change.");
      if (!current() || targetMounted && !targetProof.isCurrent() || editorModule.getMountedSource(target.path) !== source) { staleStyle(); throw new Error("The style target or source changed. Select it again and retry."); }
      const next = writeCssProperties(source, { selector: target.selector, baseStart: target.start, breakpoint: breakpointWidths[breakpoint], state, expectedSource: source }, properties);
      const edit = minimalTextEdit(source, next);
      if (edit) {
        if (!applyNativeChange(target.path, source, [edit], undefined, "Style updated")) throw new Error("The CSS change was not applied. Retry the style change.");
        editorModule?.revealRange(target.path, edit.start, edit.start + edit.text.length);
      }
    },
    variable: async (variable, value, expected) => {
      const context = nativeStylePanelContext(), epoch = generation, source = context?.files[variable.path];
      if (versionView || source === undefined || !styleContextMatches(expected, context)) { staleStyle(); return; }
      if (!(await openSecondary(variable.path))) return;
      if (generation !== epoch || versionView || !styleContextMatches(context, nativeStylePanelContext())) { staleStyle(); return; }
      const next = writeCssProperties(source, { selector: variable.selector, baseStart: variable.ruleStart, expectedSource: source }, { [variable.name]: value });
      const edit = minimalTextEdit(source, next);
      if (edit) applyNativeChange(variable.path, source, [edit], undefined, "Global style updated");
    },
    selectClass: (name, expected) => {
      const context = nativeStylePanelContext();
      if (!context || !styleContextMatches(expected, context) || !context.classes?.includes(name)) { staleStyle(); return; }
      nativeStyleClass = { selectionKey: context.selectionKey!, name };
      stylePanel?.update();
    },
    addClass: async (name, expected) => {
      if (!name || /[\t\n\f\r \x00-\x1f]/.test(name)) throw new Error("Enter one class name without spaces.");
      const selected = lastNativeSelection, context = nativeStylePanelContext();
      if (!selected?.node || versionView || currentPath !== selected.path || !styleContextMatches(expected, context)) { staleStyle(); return; }
      const source = context!.files[selected.path];
      const range = locateNativeElementRange(source, selected.node);
      if (!range) return;
      const classes = context?.classes ?? [];
      if (classes.includes(name)) return;
      const attribute = startTagAttribute(source, range.tag, "class");
      let edit;
      if (!attribute) edit = setAttributeEdit(source, range.tag, "class", name);
      else {
        const quote = source[attribute.valueStart - 1];
        const quoted = quote === "'" || quote === '"';
        const escaped = name.replace(/&/g, "&amp;").replace(quoted && quote === "'" ? /'/g : /"/g, quoted && quote === "'" ? "&#39;" : "&quot;");
        const raw = source.slice(attribute.valueStart, attribute.valueEnd);
        if (quoted) edit = { start: attribute.valueEnd, end: attribute.valueEnd, text: (raw ? " " : "") + escaped };
        else if (!raw) edit = { start: attribute.valueEnd, end: attribute.valueEnd, text: `${source.slice(attribute.start, attribute.valueStart).includes("=") ? "" : "="}"${escaped}"` };
        else edit = { start: attribute.valueStart, end: attribute.valueEnd, text: `"${raw.replace(/"/g, "&quot;")} ${escaped}"` };
      }
      if (applyNativeChange(selected.path, source, [edit], selected.node, "Class added")) {
        nativeStyleClass = { selectionKey: context!.selectionKey!, name };
        stylePanel?.update();
      }
    },
    focalAsset: async expected => {
      const context = nativeStylePanelContext(), selected = lastNativeSelection, scope = draftScope();
      if (!scope || !selected || !styleContextMatches(expected, context)) return;
      const epoch = generation, scopeKey = setupScope(), path = nativeStyleImageSource(selected, expected.files);
      if (!path) return;
      const proof = editorModule?.captureFileModelState(scope, selected.path);
      const assetBefore = nativeAssets.get(path.path);
      const current = () => generation === epoch && setupScope() === scopeKey && !versionView && proof?.isCurrent() &&
        expected.modelProof?.isCurrent() !== false && nativeStylePanelContext()?.key === expected.key &&
        Object.keys(nativeSources()).length === Object.keys(expected.files).length && Object.entries(expected.files).every(([file, source]) => nativeSources()[file] === source);
      if (!current()) return;
      await loadNativeAssets({ "index.html": `<img src="/${escapeText(path.path).replace(/"/g, "&quot;")}">` }, () => {});
      if (!current()) return;
      const dataURL = nativeAssets.get(path.path);
      if (!dataURL) return;
      if (assetBefore !== dataURL || nativeStylePanelContext()?.assetRevision !== expected.assetRevision) { stylePanel?.update(); return; }
      return { mode: path.mode, asset: { dataURL, hostTrusted: true } };
    },
    showCode: async expected => {
      const context = nativeStylePanelContext();
      if (!styleContextMatches(expected, context) || !context?.target || !context.workspace) { staleStyle(); return; }
      const target = context.target, source = context.files[target.path];
      if (source === undefined) { staleStyle(); return; }
      const rule = locateWriteRule(source, { selector: target.selector, baseStart: target.start });
      if (!rule || target.start === undefined) { staleStyle(); return; }
      if (!(await context.workspace.openDefinition(target.path, rule.start, rule.open, context.workspace.revision))) staleStyle();
    },
    history: (direction) => { void editorModule?.runVisualHistory(direction, currentPath); },
    error: (message) => errorMessage(new Error(message)),
  }, element("main"));
  element("main").append(stylePanel.root);
  componentTools?.destroy();
  componentTools = mountComponentTools();
  mountPalette();
}

// The command palette (⌘K, ⌘P) and the keyboard shortcuts sheet (?), with
// the editor's commands calling what its own controls call
// (src/page-builder/palette.ts, docs/page-builder/palette.md).
let editorPalette: ReturnType<typeof mountEditorPalette> | undefined;
function mountPalette() {
  editorPalette?.dispose();
  editorPalette = mountEditorPalette(app, {
    pages: () => {
      const site = nativeSite;
      if (!site) return [];
      const routes = Object.entries(site.routes);
      const titles = Object.fromEntries(routes.map(([route]) => [route, nativeRouteInfo(route).title]));
      return routes.map(([route, file]) => ({
        file,
        route,
        label: nativePageLabel(file, { routes: site.routes, titles, heading: (path) => firstHeadingText(nativeEffectiveSource(path)) }) ?? route,
      }));
    },
    files: () => (nativeSite ? nativeFiles() : []),
    components: () => {
      if (!nativeSite) return [];
      const sources = nativeSources();
      return Object.entries(nativeSite.components).map(([tag, file]) => ({ tag, file, label: componentLabel(tag), section: isSectionTemplate(sources[file] ?? "") }));
    },
    currentPath: () => currentPath,
    revision: () => `${setupScope()}:${generation}`,
    open: (path) => {
      if (path === currentPath && editorModule?.isMounted(path)) return;
      void restoreFile(path, generation);
    },
    source: (path) => nativeSources()[path],
    isSectionTag: isNativeSectionTag,
    insert: (point, component) => insertNativeComponent({ ...point, top: 0, left: 0, width: 0, before: "" }, component),
    selection: () => (lastNativeSelection && lastNativeSelection.path === currentPath ? lastNativeSelection : undefined),
    editBar: () => (document.querySelector(".edit-bar[data-model]") ? nativeEditBarModel : undefined),
    select: (path, node) => nativePreview?.selectNode({ path, node }),
    textSelected: () => Boolean(nativeTextSelection && !nativeTextSelection.caret && nativeTextSelection.text),
    history: (direction) => void editorModule?.runVisualHistory(direction, currentPath),
    editing: () => Boolean(currentPath && editorModule?.isMounted(currentPath)),
    toggleCode: () => codeResize?.toggle(),
    codeHidden: () => element("main").classList.contains("code-collapsed"),
    toggleStructure: () => sidebarResize?.toggle(),
    structureHidden: () => Boolean(app.querySelector(".workspace--sidebar-collapsed")),
    newPage: async () => {
      openExplorer();
      selectExplorerTab("pages");
      // Opening the popover queues a toggle that renders its pages tree.
      // Start the title field after that render, so it keeps focus.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      pagesTree?.startNew("/");
    },
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
  });
}

// Components as first-class page builder objects (src/page-builder/components.ts).
let componentTools: ComponentTools | undefined;
function mountComponentTools() {
  return createComponentTools({
    site: () => nativeSite,
    sources: () => nativeSources(),
    editor: () => editorModule,
    preview: () => nativePreview,
    currentPath: () => currentPath,
    selection: () => lastNativeSelection,
    revision: () => `${generation}:${setupScope()}`,
    openFile: async (path) => {
      const epoch = generation;
      if (currentPath !== path || !editorModule?.isMounted(path)) await restoreFile(path, epoch);
      return epoch === generation && currentPath === path && Boolean(editorModule?.isMounted(path));
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
    // New files as drafts (a component made from the page), as the Files tab's New file writes them.
    createFiles: async (made) => {
      const scope = draftScope(), epoch = generation, key = setupScope(), store = draftStore(), editor = editorModule;
      if (!scope || !snapshot) return { error: "Open a repository first." };
      return createComponentFileDrafts(made, {
        scope, store,
        isCurrent: () => epoch === generation && key === setupScope(),
        exists: path => Boolean(pathNow(path)),
        checkPath: branchPathProblem,
        drop: (scope, path) => editor?.dropDraft(scope, path) ?? store.remove(scope, path),
        refresh: afterFileChanges,
        announce,
      });
    },
    panelHost: app.querySelector<HTMLElement>(".sidebar")!,
    addStrip: (strip) => nativePreview?.addStrip(strip),
    codeTitle: element("primary-title").parentElement!,
    previewPage: () => {
      const route = nativePreview?.route();
      return route && nativeSite ? nativeSite.routes[route] : undefined;
    },
  });
}

let commitHistory: ReturnType<typeof createCommitHistory> | undefined;
function positionHistory(panel: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const top = Math.max(16, Math.min(rect.bottom + 6, innerHeight - 100));
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `min(70vh, ${Math.max(0, innerHeight - top - 16)}px)`;
  panel.showPopover();
  const maxRight = Math.max(16, innerWidth - panel.getBoundingClientRect().width - 16);
  panel.style.right = `${Math.min(maxRight, Math.max(16, innerWidth - rect.right))}px`;
}
window.addEventListener("resize", () => {
  const panel = document.getElementById("changes");
  const anchor = document.getElementById("history-button");
  if (panel?.matches(":popover-open") && anchor) positionHistory(panel, anchor);
});
// History shows the open file's commits, or the whole site's (the tab
// chosen last).
let historyScope: "file" | "site" = "file";
function openHistory(force = false) {
  const panel = element("changes");
  const anchor = document.getElementById("history-button");
  if (!anchor || !info.user || !currentRepo || !snapshot) return;
  if (!force && panel.matches(":popover-open")) { panel.hidePopover(); return; }
  commitHistory?.destroy();
  commitHistory = undefined;
  // Before the first save there is no commit to list: the Worker is not asked.
  if (snapshot.empty) {
    panel.replaceChildren(node("p", "muted commit-history__message", "No commits yet. Save to GitHub makes the first one."));
    positionHistory(panel, anchor);
    return;
  }
  const epoch = generation;
  const path = currentPath;
  const site = historyScope === "site" || !path;
  const scope = { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch };
  const isCurrent = () => generation === epoch && info.user?.login === scope.account &&
    currentRepo?.id === scope.repoId && snapshot?.branch === scope.branch && (site || currentPath === path);
  commitHistory = createCommitHistory({
    repo: scope.repo, branch: scope.branch, path, isCurrent,
    scope: site ? "site" : "file",
    onScope: (next) => { historyScope = next; openHistory(true); },
    onOpenFile: (file, commit, head) => void openFileVersion(file, commit, head),
    hasDraft: () => Boolean(path && draftStore().get(scope, path)),
    onExpired: () => errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
    onRestored: async (result) => {
      if (!isCurrent() || !path) return;
      endVersionView(false);
      await afterRestore(path, result);
    },
    onView: (commit, head, latest) => (latest ? endVersionView() : void viewVersion(commit, head)),
    viewing: () => {
      const view = versionView;
      return view && view.path === path && view.key === versionKey() ? view.commit.sha : undefined;
    },
  });
  panel.replaceChildren(commitHistory.root);
  positionHistory(panel, anchor);
}

// A file from the site's history: it opens, showing its version from that
// commit unless that is the branch's latest.
async function openFileVersion(path: string, commit: HistoryCommit, head: string) {
  const epoch = generation;
  if (currentPath !== path) await restoreFile(path, epoch, { keepExplorer: false });
  if (epoch !== generation || currentPath !== path) return;
  if (commit.sha === head) endVersionView();
  else await viewVersion(commit, head);
}

async function afterRestore(path: string, result: RestoreResult) {
  const panel = element("changes");
  if (panel.matches(":popover-open")) panel.hidePopover();
  commitHistory?.destroy();
  commitHistory = undefined;
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
const versionKey = () => `${generation}:${currentRepo?.id}:${snapshot?.branch}`;
const versionLabel = (commit: HistoryCommit) => {
  const date = new Date(commit.date);
  return Number.isNaN(date.getTime())
    ? commit.sha.slice(0, 7)
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

async function viewVersion(commit: HistoryCommit, head: string) {
  const path = currentPath;
  if (!path || !currentRepo) return;
  const request = ++versionRequest;
  const key = versionKey();
  try {
    const revision = await api<FileRevision>("file-at", { repo: currentRepo.full_name, commit: commit.sha, path });
    if (request !== versionRequest || key !== versionKey() || currentPath !== path) return;
    nativePreview?.setViewing(undefined);
    versionView = { key, path, commit, head, content: revision.content, latest: nativeEffectiveSource(path) };
    nativePreview?.setViewing(versionBar(versionView));
    editorModule?.compareVersion(path, { content: revision.content, label: versionLabel(commit) });
    updateNativePreviewSources();
    commitHistory?.mark();
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
  commitHistory?.mark();
  if (refresh) updateNativePreviewSources();
}

// The version on show ends once it no longer belongs to what is open.
function checkVersionView() {
  const view = versionView;
  if (view && (view.key !== versionKey() || currentPath !== view.path || nativeEffectiveSource(view.path) !== view.latest))
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
  if (!currentRepo || !snapshot || versionView !== view) return;
  if (scope && draftStore().get(scope, view.path)) {
    status("Publish or discard this file’s draft before restoring. Other files’ drafts are kept.");
    return;
  }
  if (!versionDialog) {
    versionDialog = createConfirmDialog("version-dialog");
    document.body.append(versionDialog.root);
  }
  const confirmed = await versionDialog.ask({
    title: "Restore this version?",
    notes: [
      `${view.path} on ${snapshot.branch} goes back to how it was on ${versionLabel(view.commit)} (${view.commit.message}).`,
      "This creates a new commit. Other files stay unchanged.",
    ],
    action: "Restore version",
  });
  if (!confirmed || versionView !== view || !currentRepo || !snapshot) return;
  status("Restoring file…");
  try {
    const result = await postApi<RestoreResult>("restore", { repo: currentRepo.full_name }, {
      branch: snapshot.branch, path: view.path, target: view.commit.sha, expectedHead: view.head,
    });
    if (versionView !== view) return;
    endVersionView(false);
    await afterRestore(view.path, result);
  } catch (error) {
    if (versionView === view) status(error instanceof Error ? error.message : "Restore failed. Your files are unchanged.");
  }
}

async function showCodeChanges(path: string) {
  if (currentPath !== path) {
    const epoch = generation;
    await restoreFile(path, epoch);
    if (epoch !== generation || currentPath !== path) return;
  }
  editorModule?.setReviewMode(path, true);
}

// Side by side with the page: its stylesheet, and after a click in the
// preview, every rule that styles the selected element in the order the
// cascade applies them (shared/cascade.ts): rules that decide the element's
// look first, rules whose declarations all lose last. An edit to either file
// re-maps the rules to their source.
const linkedStyleSourceByPath = new Map<string, string>();
let linkedStyleContext = "";
function syncLinkedStyles(path: string, content: string) {
  const context = `${info.user?.login}:${currentRepo?.id}:${snapshot?.branch}`;
  if (linkedStyleContext !== context) {
    linkedStyleSourceByPath.clear();
    linkedStyleContext = context;
  }
  const previous = linkedStyleSourceByPath.get(path);
  linkedStyleSourceByPath.set(path, content);
  if (previous !== content) stylePanel?.update();
  if (previous !== content && linkedStyle && (path === linkedStyle.page || path === secondaryPath)) void refreshLinkedStyleRules();
}
// A rule in the style panel: its range in its file and how the cascade treats it.
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
async function openDefaultLinkedStyle(page = currentPath) {
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
  if (!linkedStyle?.isDefault || linkedStyle.page !== currentPath) return;
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
  codeWidthResize?.apply();
}
// With the whole commit listed in the snapshot, any path resolves without a
// request; otherwise directories are walked one `/api/tree` call at a time.
const repositoryIndex = new RepositoryIndex();
function entryAt(path: string): TreeEntry | undefined {
  return currentRepo && snapshot ? repositoryIndex.entry(currentRepo, snapshot, path) : undefined;
}
function findEntry(path: string) {
  return currentRepo && snapshot ? repositoryIndex.find(api, currentRepo, snapshot, path) : Promise.resolve(undefined);
}
// Opens `css` in the secondary pane (or keeps it if already there), then resolves.
async function openSecondary(css: string, guard: () => boolean = () => true) {
  if (!currentRepo || !snapshot || !info.user || !guard()) return false;
  const request = ++secondaryRequest;
  const historyScope = currentPath ? draftKey({ account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }, currentPath) : undefined;
  if (secondaryPath === css && secondaryHistoryScope === historyScope && disposeSecondary) return true;
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
  };
  try {
    // A stylesheet only in the drafts (a new component's) opens from its draft.
    const draft = draftStore().get(scope, css);
    const created = draft && draft.baseSha === null && !draft.deleted && !draft.upload && !draft.opaque;
    const entry = created ? undefined : await findEntry(css);
    if (!guard() || request !== secondaryRequest) return false;
    if (!created && (!entry || (entry.size ?? 0) > 1024 * 1024)) throw new Error(`Could not open ${css}.`);
    const [source, editor] = await Promise.all([
      entry ? readFile(scope.repo, entry.sha) : "",
      loadEditorModule(),
    ]);
    if (request !== secondaryRequest || !guard()) return false;
    disposeSecondary?.();
    element("secondary-pane").hidden = false;
    element("main").classList.add("has-secondary");
    codeWidthResize?.apply();
    disposeSecondary = editor.mountCodeEditor(
      element("content-secondary"),
      { key: draftKey(scope, css), historyScope, cssWorkspace: nativeCssWorkspace, scope, baseSha: entry?.sha ?? null, path: css, source, readOnly: entry?.mode === "120000",
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
  if (currentPath && currentPath !== secondaryPath) editorModule?.highlightRanges(currentPath, inPane(currentPath));
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
  if (rule.path === currentPath) {
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
  if (!currentRepo || !snapshot || !linkedStyle || !nativeLinkedStyles?.rules.length || !nativeModeActive()) return;
  const page = linkedStyle.page;
  if (page !== currentPath) return;
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
  if (request !== linkedStyleRequest || epoch !== generation || page !== currentPath) return;
  const css = rules.find((rule) => rule.path !== page)?.path ??
    styles?.rules.find((rule) => rule.path !== page)?.path ?? defaultLinkedStyle()?.css ?? secondaryPath;
  if (!reveal && css !== secondaryPath) return;
  linkedStyle = { page, css, rules };
  if (css && !(await openSecondary(css))) return;
  if (request !== linkedStyleRequest || epoch !== generation || page !== currentPath) return;
  if (!css) closeSecondary();
  renderLinkedStyle();
  // The first rule in the pane's file, which decides the most; the page's
  // own caret stays on the selected element.
  const top = rules.find((rule) => rule.path === css);
  if (reveal && top && top.path !== page) editorModule?.revealRange(top.path, top.start, top.end);
}

// A preview click that arrived before its file's editor was mounted; replayed
// by `mountSource` once that file opens in the same generation.
let pendingNativeSelection: { selection: NativePreviewSelection; epoch: number } | undefined;

// Marks the selected element's start tag in its open source file.
function markNativeElement(selection: NativePreviewSelection, reveal: boolean) {
  if (!selection.path || currentPath !== selection.path || !editorModule?.isMounted(selection.path)) return;
  if (reveal) pendingNativeSelection = undefined;
  const source = nativeSources()[selection.path];
  const tag = source !== undefined && selection.node ? locateNativeElement(source, selection.node) : undefined;
  editorModule?.markElement(selection.path, tag, reveal);
}

let nativeStyleClass: { selectionKey: string; name: string } | undefined;

// The Style panel reads the same source and matched rules as the CSS pane.
function nativeStylePanelContext(): StylePanelContext | undefined {
  if (!nativeSite) return undefined;
  const selection = lastNativeSelection, sources = nativeSources();
  const source = selection ? sources[selection.path] : undefined;
  const tag = selection?.node && source !== undefined ? locateNativeElement(source, selection.node) : undefined;
  const classes = tag && source !== undefined ? [...new Set(decodeHtmlEntities(startTagAttribute(source, tag, "class")?.value ?? "", true).split(/[\t\n\f\r ]+/).filter(Boolean))] : [];
  const selectionKey = selection ? `${generation}:${setupScope()}:${selection.path}:${selection.node?.join(".")}` : `${generation}:${setupScope()}`;
  const className = nativeStyleClass?.selectionKey === selectionKey && classes.includes(nativeStyleClass.name) ? nativeStyleClass.name : classes[0];
  const fallback = nativePageStyles().find((path) => /\.css$/.test(path) && sources[path] !== undefined)
    ?? Object.keys(sources).find((path) => /\.css$/.test(path) && !path.startsWith("components/")) ?? "styles/site.css";
  const target = className ? locateClassRule(sources, selection?.selectors ?? [], className, fallback) : undefined;
  const focalPath = selection ? nativeStyleImageSource(selection, sources)?.path : undefined;
  const scope = draftScope();
  const proofs = scope && editorModule ? [...new Set([selection?.path, target?.path].filter((path): path is string => !!path && editorModule!.isMounted(path)))].map(path => editorModule!.captureFileModelState(scope, path)) : [];
  return {
    key: `${selectionKey}:${JSON.stringify(classes)}:${className ?? ""}`, selectionKey,
    tag: selection?.tag ?? "", className, classes,
    target, modelProof: { isCurrent: () => proofs.every(proof => proof.isCurrent()) },
    assetRevision: focalPath ? String(nativeAssetVersions.get(focalPath) ?? 0) : "0", files: sources, workspace: nativeCssWorkspace(), computed: selection?.cascade?.computed ?? {}, readOnly: !!versionView,
  };
}

/** Resolve an authored asset; computed URLs alone do not identify repository provenance. */
function nativeStyleImageSource(selection: NativePreviewSelection, sources: Record<string, string>): { path: string; mode: "object-position" | "background-position" } | undefined {
  const source = sources[selection.path], tag = source !== undefined && selection.node ? locateNativeElement(source, selection.node) : undefined;
  if (selection.tag.toLowerCase() === "img" && tag) {
    const raw = startTagAttribute(source, tag, "src")?.value;
    const path = raw && nativeImageAsset(nativePageRoute(selection.path) ? selection.path : "index.html", decodeHtmlEntities(raw, true));
    return path ? { path, mode: "object-position" } : undefined;
  }
  const result = resolveSelectedRules(selection.selectors, selection.cascade);
  const winner = result.winners["background-image"];
  if (!winner) return;
  const rule = selection.selectors[winner.rule];
  if (rule.kind === "inline" || !/\.css$/i.test(rule.path)) return;
  const located = findStyleRulesInSources(sources, [rule])[0];
  const block = located && scanCss(sources[rule.path] ?? "").find(block => block.start === located.start);
  if (!block) return;
  // The native parser keeps earlier !important declarations over later normal ones.
  const style = document.createElement("div").style;
  style.cssText = block.declarations.map(item => `${item.property}:${item.value};`).join("");
  const path = singleBackgroundAsset(style.getPropertyValue("background-image"), rule.path);
  return path ? { path, mode: "background-position" } : undefined;
}

/** A fresh source snapshot shared by code intelligence and Style variable controls. */
function nativeCssWorkspace(): CssWorkspace | undefined {
  const scope = draftScope(), requester = currentPath;
  if (!nativeSite || !scope || !requester || versionView || !editorModule?.isMounted(requester)) return;
  const epoch = generation, scopeKey = setupScope(), sources = nativeSources();
  const revision = JSON.stringify([epoch, scopeKey, requester, nativeSite.routes, nativeSite.components, lastNativeSelection?.path, lastNativeSelection?.node, nativeStyleClass, sources]);
  const orderedPaths = [...new Set([...nativePageStyles(), ...Object.keys(sources).sort()])];
  return {
    revision, sources, orderedPaths,
    async openDefinition(path, start, end, expectedRevision) {
      if (expectedRevision !== revision || !/\.css$/i.test(path) || sources[path] === undefined || start < 0 || end < start || end > sources[path].length) return false;
      const requesterProof = editorModule!.captureFileModelState(scope, requester);
      const targetProof = editorModule!.captureFileModelState(scope, path);
      const current = () => generation === epoch && setupScope() === scopeKey && currentPath === requester && !versionView &&
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

let lastNativeSelection: NativePreviewSelection | undefined;
// Text selected inside the selected element, bound to that element.
let nativeTextSelection: (NativeTextSelection & { path: string; node: number[] }) | undefined;
// What B, I and Link do for the current selection, for the keyboard shortcuts.
let nativeFormatActions: Partial<Record<NativeFormat, () => void>> = {};
// The edit bar last shown, whose controls the command palette offers while it shows.
let nativeEditBarModel: EditBarModel | undefined;
// A link just made from the bar around selected text (`node` is the text
// element, `link` the new link's index path): its Address opens at once
// (`shown` once asked), and closing it with the address still empty takes
// the link away again. The wrap and what is typed are one undo step.
let nativeNewLink: { path: string; node: number[]; link: number[]; text: { start: number; end: number }; shown?: boolean } | undefined;
// Elements a link inside can be removed from, keeping its text.
const nativeLinkParents = new Set([...nativeTextTags].filter((tag) => tag !== "a" && tag !== "button"));

// Controls for the selected element. Structural actions need the element's
// exact outer source range; when that cannot be told (implied end tags,
// stray markup) they stay out rather than edit the wrong HTML.
function renderNativeEditBar(selection: NativePreviewSelection) {
  const preview = nativePreview;
  const editor = editorModule;
  const { path, node, rect } = selection;
  // The page's `main` container has nothing the bar can do; it stays out of the way.
  if (!preview || !editor || !path || !rect || currentPath !== path || !editor.isMounted(path) || selection.tag === "main") {
    nativeFormatActions = {};
    preview?.hideEditBar();
    componentTools?.show(undefined);
    return;
  }
  const source = nativeSources()[path] ?? "";
  const range = node ? locateNativeElementRange(source, node) : undefined;
  const kind = nativeElementLabel(selection.tag, Boolean(nativeSite && Object.hasOwn(nativeSite.components, selection.tag)));
  // A new link whose Address never opened (the selection moved on first) keeps its empty href; its undo group ends.
  if (nativeNewLink && !nativeNewLink.shown && (nativeNewLink.path !== path || nativeNewLink.node.join(".") !== node?.join("."))) {
    editor.closeActiveEditGroup(nativeNewLink.path);
    nativeNewLink = undefined;
  }
  const announce = (text: string) => { element("status").textContent = text; };
  const change = (edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) =>
    applyNativeChange(path, source, edits, next, message);
  const controls: EditBarControl[] = [];
  if (range && node && nativeSite) {
    if (selection.tag === "site-header" || selection.tag === "header" || selection.tag === "nav")
      controls.push({ kind: "button", label: "Navigation", onPress: () => void openNativeNavigation(path) });
  }
  nativeFormatActions = {};
  if (/^h[1-6]$/.test(selection.tag) && range?.close && range.tag.name === selection.tag) {
    const close = range.close;
    const length = range.tag.name.length;
    controls.push({
      kind: "select",
      label: "Heading level",
      options: [1, 2, 3, 4, 5, 6].map((level) => ({ label: `H${level}`, value: `h${level}` })),
      value: selection.tag,
      onChange: (value) => change([
        { start: range.tag.start + 1, end: range.tag.nameEnd, text: value },
        { start: close.start + 2, end: close.start + 2 + length, text: value },
      ], node, `Heading level ${value.toUpperCase()}`),
    });
  }
  // Text size is for elements that carry text themselves, not page containers or components.
  const containers = new Set(["main", "section", "header", "footer", "nav", "article", "aside", "slot"]);
  const textual = range?.close && !selection.tag.includes("-") && !containers.has(selection.tag);
  if (range && textual && nativeSite) {
    // The site's own sizes (classes, else variables) when its stylesheets define them (`src/native-text-size.ts`).
    const sources = nativeSources();
    const scale = textSizeScale(nativePageStyles().map((sheet) => sources[sheet] ?? ""));
    const value = currentTextSize(source, range.tag, scale);
    const options = [{ label: "Default", value: "default" }, ...scale.sizes.map((size) => ({ label: size.label, value: size.value }))];
    if (value === "custom") options.push({ label: "Custom", value: "custom" });
    controls.push({
      kind: "select",
      label: "Text size",
      options,
      value,
      onChange: (next) => {
        const edit = textSizeEdit(source, range.tag, scale, next);
        const size = scale.sizes.find((item) => item.value === next);
        if (edit) change([edit], node, size ? `Text size ${size.label}` : "Default text size");
      },
    });
  }
  // The link the selected text sits in, inside the selected text element.
  let textLink: { node: number[]; text: NativeTextSelection } | undefined;
  if (range?.close && nativeTextTags.has(selection.tag)) {
    const close = range.close;
    const inner = source.slice(range.tag.end, close.start);
    const reported = nativeTextSelection && nativeTextSelection.path === path && node &&
      nativeTextSelection.node.join(".") === node.join(".") ? nativeTextSelection : undefined;
    // The caret (reported only inside a link) is no text to format.
    const text = reported?.caret ? undefined : reported;
    const caret = reported?.caret ? reported : undefined;
    for (const format of [
      { label: "B", name: "Bold", tag: "strong" as const, also: ["strong", "b"] },
      { label: "I", name: "Italic", tag: "em" as const, also: ["em", "i"] },
    ]) {
      // Offsets inside `inner` to insert or delete, keeping the same text selected.
      const changeInner = (edits: { start: number; end: number; text: string }[], message: string) => {
        if (text) preview.selectTextAfterUpdate({ start: text.start, end: text.end });
        change(edits.map((edit) => ({ ...edit, start: range.tag.end + edit.start, end: range.tag.end + edit.end })), node, message);
      };
      let pressed: boolean;
      let action: () => void;
      if (text) {
        // Selected text: wrap just that range, or unwrap the wrapper it sits in.
        const enclosing = text.wrappers.find((name) => format.also.includes(name));
        pressed = Boolean(enclosing);
        action = () => {
          if (enclosing) {
            const wrapper = wrapperAround(inner, text.start, format.also);
            if (!wrapper?.close) { announce(`${format.name} could not be removed here.`); return; }
            changeInner([
              { start: wrapper.tag.start, end: wrapper.tag.end, text: "" },
              { start: wrapper.close.start, end: wrapper.close.end, text: "" },
            ], `${format.name} off`);
            return;
          }
          const span = textRangeInSource(inner, text.start, text.end, text.text);
          if (!span) { announce(`Select text within one element to make it ${format.name.toLowerCase()}.`); return; }
          changeInner([
            { start: span.start, end: span.start, text: `<${format.tag}>` },
            { start: span.end, end: span.end, text: `</${format.tag}>` },
          ], `${format.name} on`);
        };
      } else {
        // No text selected: the whole element's content.
        const wrapper = wholeWrapper(inner, format.also);
        pressed = Boolean(wrapper);
        action = () => wrapper
          ? changeInner([
            { start: wrapper.open, end: wrapper.openEnd, text: "" },
            { start: wrapper.closeAt, end: wrapper.closeEnd, text: "" },
          ], `${format.name} off`)
          : changeInner([
            { start: 0, end: 0, text: `<${format.tag}>` },
            { start: inner.length, end: inner.length, text: `</${format.tag}>` },
          ], `${format.name} on`);
      }
      nativeFormatActions[format.tag] = action;
      controls.push({
        kind: "button",
        label: format.label,
        ariaLabel: format.name,
        title: `${format.name} (Ctrl+${format.label})`,
        pressed,
        className: `edit-bar__format edit-bar__format--${format.tag}`,
        onPress: action,
      });
    }
    // Link: selected text in a text element that is not in a link already is
    // wrapped in `<a href="">` (the Address then opens for it); selected text
    // inside a link gets that link's Address and Remove link below.
    if (node && selection.link === undefined && nativeLinkParents.has(selection.tag)) {
      const span = text ? textRangeInSource(inner, text.start, text.end, text.text) : undefined;
      const around = text && span ? wrapperAround(inner, text.start, ["a"]) : undefined;
      const inLink = around?.close && span && span.start >= around.tag.end && span.end <= around.close.start ? around : undefined;
      // The caret in a link: the link on either side of it.
      const caretLink = caret ? wrapperAround(inner, caret.start, ["a"]) ?? (caret.start > 0 ? wrapperAround(inner, caret.start - 1, ["a"]) : undefined) : undefined;
      const found = inLink ?? caretLink;
      const at = found ? elementPathAt(inner, found.tag.start) : undefined;
      if ((text || caret) && at) {
        textLink = { node: [...node, ...at], text: (text ?? caret)! };
      } else if (text) {
        const wrap = linkWrapEdit(inner, text.start, text.end, text.text);
        const linkIt = () => {
          if (!("edit" in wrap)) {
            announce(wrap.refused === "nested" ? "The selection already holds a link." : "Select text within one element to link it.");
            return;
          }
          const next = inner.slice(0, wrap.edit.start) + wrap.edit.text + inner.slice(wrap.edit.end);
          const within = elementPathAt(next, wrap.link);
          if (!within) { announce("Select text within one element to link it."); return; }
          const start = range.tag.end + wrap.edit.start;
          const end = range.tag.end + wrap.edit.end;
          // One undo group from the wrap through the address typed for it.
          nativeNewLink = { path, node, link: [...node, ...within], text: { start: text.start, end: text.end } };
          preview.selectTextAfterUpdate({ start: text.start, end: text.end });
          preview.selectAfterUpdate({ path, node });
          try {
            editor.closeActiveEditGroup(path);
            editor.replaceActiveRange({ path, start, end, text: wrap.edit.text, expected: source.slice(start, end) }, true);
            announce("Link added");
          } catch (error) {
            nativeNewLink = undefined;
            preview.selectAfterUpdate(undefined);
            preview.selectTextAfterUpdate(undefined);
            errorMessage(error);
          }
        };
        nativeFormatActions.link = linkIt;
        // No button where it cannot apply (a span cutting through a tag, or
        // holding a link); Ctrl/⌘+K there says why.
        if ("edit" in wrap) controls.push({ kind: "button", icon: "link", label: "Link", title: "Link (Ctrl+K)", onPress: linkIt });
      } else {
        nativeFormatActions.link = () => announce("Select the text to link first.");
      }
    }
  }
  // Edits sorted by position, as one undo step.
  const ordered = (edits: { start: number; end: number; text: string }[]) => [...edits].sort((a, b) => a.start - b.start);
  const attribute = (name: string) => (range ? startTagAttribute(source, range.tag, name) : undefined);
  // Links: the selected link, or the nearest link around the selection in
  // this file, takes an address as it is typed: a page of the site picked
  // from the suggestions, or any address. Each keystroke rewrites the href
  // from the source as it is now, in one undo step until the field closes.
  // (Ctrl/⌘+click in the preview follows a link.)
  // A live edit from an address field: each keystroke rewrites attributes on
  // the element at `target` (found again in the source as it is now), grouped
  // into one undo step until the field closes.
  const live = (target: number[], tagName: string, build: (latest: string, tag: StartTag) => { start: number; end: number; text: string }[], message: string) => {
    if (!node) return;
    const latest = nativeSources()[path] ?? "";
    const tag = locateNativeElementRange(latest, target)?.tag;
    if (!tag || tag.name !== tagName) { announce("The element could not be found in the source."); return; }
    preview.selectAfterUpdate({ path, node });
    try {
      // Later edits first, so earlier offsets stay valid.
      for (const edit of ordered(build(latest, tag)).reverse())
        editor.replaceActiveRange({ path, ...edit, expected: latest.slice(edit.start, edit.end) }, true);
      announce(message);
    } catch (error) {
      preview.selectAfterUpdate(undefined);
      errorMessage(error);
    }
  };
  const textLinkRange = textLink ? locateNativeElementRange(source, textLink.node) : undefined;
  const link = selection.link !== undefined && node ? nearestLink(source, node, range)
    : textLink && textLinkRange?.tag.name === "a" ? { range: textLinkRange, node: textLink.node } : undefined;
  if (link && node && nativeSite) {
    const href = startTagAttribute(source, link.range.tag, "href");
    const current = href?.value.trim() ?? "";
    const site = nativeSite;
    // The link just made: its Address opens now, once.
    const fresh = nativeNewLink && nativeNewLink.path === path && nativeNewLink.link.join(".") === link.node.join(".") ? nativeNewLink : undefined;
    const open = Boolean(fresh && !fresh.shown);
    if (fresh) fresh.shown = true;
    // Text selected in the link stays selected while the address is typed.
    const keepText = textLink?.text;
    controls.push({
      kind: "address",
      icon: "link",
      label: "Address",
      warning: current ? undefined : "No address",
      value: href?.value ?? "",
      placeholder: "Page or web address",
      suggestions: nativeLinkSuggestions(Object.keys(site.routes), (route) => nativeRouteInfo(route).title),
      open,
      // Beside the address: a new tab (target and rel) and an optional title.
      extras: [
        { kind: "checkbox", label: "Open in new tab", checked: opensInNewTab(source, link.range.tag), onChange: (on) => {
          if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
          live(link.node, "a", (latest, tag) => [newTabEdit(latest, tag, on)], on ? "Link opens in a new tab" : "Link opens in the same tab");
        } },
        { kind: "text", label: "Title (optional)", value: startTagAttribute(source, link.range.tag, "title")?.value ?? "", placeholder: "Shown when the pointer rests on the link", onInput: (value) => {
          if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
          live(link.node, "a", (latest, tag) => [setAttributeEdit(latest, tag, "title", value || undefined)], value ? "Link title changed" : "Link title removed");
        } },
      ],
      onInput: (value) => {
        if (keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
        live(link.node, "a", (latest, tag) => [setAttributeEdit(latest, tag, "href", value)], "Link changed");
      },
      onClose: () => {
        editor.closeActiveEditGroup(path);
        if (fresh && nativeNewLink === fresh) removeEmptyNewLink(fresh);
      },
    });
    // Remove link: a link inside a text element (the one the selected text
    // sits in, or the selected link itself) loses its tags, keeping its text
    // and formatting, as one undo step.
    const parent = link.node.length > 1 ? locateNativeElementRange(source, link.node.slice(0, -1)) : undefined;
    const unwrap = link.range.tag.name === "a" && parent && nativeLinkParents.has(parent.tag.name) ? unwrapEdits(link.range) : undefined;
    if (unwrap) {
      const inText = Boolean(textLink);
      controls.push({
        kind: "button",
        icon: "unlink",
        label: "Remove link",
        onPress: () => {
          if (inText && keepText) preview.selectTextAfterUpdate({ start: keepText.start, end: keepText.end });
          change(unwrap, inText ? node : link.node.slice(0, -1), "Link removed");
        },
      });
    }
  }
  // Heading levels that skip (H2 to H4): one press puts the heading in order.
  if (range && /^h[2-6]$/.test(selection.tag) && range.close && range.tag.name === selection.tag) {
    const level = Number(selection.tag[1]);
    const previous = previousHeadingLevel(source, range.tag.start);
    if (previous > 0 && level > previous + 1) {
      const close = range.close;
      const fixed = `h${previous + 1}`;
      controls.push({
        kind: "button",
        label: `Use ${fixed.toUpperCase()}`,
        title: `Heading levels skip from H${previous} to H${level}; the next level after H${previous} is H${previous + 1}.`,
        className: "edit-bar__warning",
        onPress: () => change([
          { start: range.tag.start + 1, end: range.tag.nameEnd, text: fixed },
          { start: close.start + 2, end: close.start + 2 + 2, text: fixed },
        ], node, `Heading level ${fixed.toUpperCase()}`),
      });
    }
  }
  // Images: a live Address (images of the repository suggested) and alt text.
  if (range && selection.tag === "img") {
    const tag = range.tag;
    const src = attribute("src");
    const alt = attribute("alt");
    controls.push({ kind: "button", label: "Choose image…", onPress: () => { if (node) void chooseMediaForImage({ path, node, width: selection.rect?.width }); } });
    // Address: an image of this repository suggested as typed, or any address,
    // applied live. An alt that was never written or still equals the previous
    // file's name follows the new file's name; a written or empty one stays.
    const images = nativeImagePaths();
    controls.push({
      kind: "address",
      icon: "link",
      label: "Address",
      warning: src?.value.trim() ? undefined : "No image",
      value: src?.value ?? "",
      placeholder: "Image in this repository or web address",
      // As root paths, which work from every page.
      suggestions: images.map((image) => ({ label: `/${image}`, value: `/${image}` })),
      // An image from the computer, uploaded beside the site's images.
      upload: { label: "Upload image…", accept: "image/*", onFiles: async (files) => {
        const [uploaded] = await uploadFilesTo(DEFAULT_IMAGE_FOLDER, files);
        return uploaded === undefined ? undefined : `/${uploaded}`;
      } },
      onInput: (value) => { if (node) live(node, "img", (latest, tag) => {
        const before = startTagAttribute(latest, tag, "src");
        const written = startTagAttribute(latest, tag, "alt");
        const edits = [setAttributeEdit(latest, tag, "src", value)];
        const previousName = altFromPath(before?.value ?? "");
        if (!written || (written.value && written.value === previousName)) edits.push(setAttributeEdit(latest, tag, "alt", altFromPath(value)));
        return edits;
      }, "Image replaced"); },
      onClose: () => editor.closeActiveEditGroup(path),
    });
    // Alt text applies as typed; opening with no alt written applies the
    // file's name at once; emptied, the image is decorative (alt="").
    controls.push({
      kind: "address",
      label: "Alt text",
      warning: alt ? undefined : "Alt text missing",
      value: alt?.value ?? "",
      initial: alt ? undefined : altFromPath(src?.value ?? ""),
      placeholder: "What the image shows; empty for decorative",
      onInput: (value) => { if (node) live(node, "img", (latest, tag) => [setAttributeEdit(latest, tag, "alt", value)], value ? "Alt text updated" : "Image marked decorative"); },
      onClose: () => editor.closeActiveEditGroup(path),
    });
  }
  // Links and buttons need a name; containers get a label when they carry no heading.
  if (range && (selection.tag === "a" || selection.tag === "button") && !selection.text.trim() && !attribute("aria-label")) {
    controls.push({
      kind: "address",
      label: "Name",
      warning: "Needs a name",
      value: "",
      placeholder: `What this ${nativeKindLabel(selection.tag).toLowerCase()} does`,
      onInput: (value) => { if (node) live(node, selection.tag, (latest, tag) => [setAttributeEdit(latest, tag, "aria-label", value || undefined)], value ? "Name added" : "Name removed"); },
      onClose: () => editor.closeActiveEditGroup(path),
    });
  }
  if (range?.close && ["section", "nav", "aside"].includes(selection.tag)) {
    const label = attribute("aria-label");
    const hasHeading = /<h[1-6][\s>]/i.test(source.slice(range.tag.end, range.close.start));
    controls.push({
      kind: "address",
      label: "Label",
      warning: !label && !hasHeading ? "No heading or label" : undefined,
      value: label?.value ?? "",
      placeholder: `What this ${nativeKindLabel(selection.tag).toLowerCase()} is about`,
      onInput: (value) => { if (node) live(node, selection.tag, (latest, tag) => [setAttributeEdit(latest, tag, "aria-label", value || undefined)], value ? "Label updated" : "Label removed"); },
      onClose: () => editor.closeActiveEditGroup(path),
    });
  }
  // Whole sections (a <section> or a section component) move, duplicate and
  // remove from icon buttons always in the bar, as one undo step each.
  // Nothing else can be removed this way. Alt+Up/Down move the section too,
  // from the bar, the preview or the page structure (`moveNativeSection`),
  // as do plain Up/Down on the bar's grip, whose drag moves it in the page.
  let onMove: EditBarModel["onMove"];
  let draggable = false;
  if (range && node && isNativeSectionTag(selection.tag)) {
    const parent = node.slice(0, -1);
    const index = node[node.length - 1];
    const before = index > 0 ? locateNativeElementRange(source, [...parent, index - 1]) : undefined;
    const after = locateNativeElementRange(source, [...parent, index + 1]);
    onMove = (direction) => moveNativeSection(selection, direction);
    draggable = true;
    controls.push({
      kind: "button",
      icon: "up",
      label: "Move up",
      disabled: !before,
      onPress: () => moveNativeSection(selection, "up"),
    });
    controls.push({
      kind: "button",
      icon: "down",
      label: "Move down",
      disabled: !after,
      onPress: () => moveNativeSection(selection, "down"),
    });
    controls.push({
      kind: "button",
      icon: "duplicate",
      label: "Duplicate",
      onPress: () => change([duplicateEdit(source, range)], [...parent, index + 1], `${kind} duplicated`),
    });
    controls.push({
      kind: "button",
      icon: "remove",
      label: "Remove",
      // The previous sibling is selected next, else the next one, which takes this index.
      onPress: () => change([removeEdit(source, range)], index > 0 ? [...parent, index - 1] : after ? node : undefined, `${kind} removed`),
    });
  }
  // An item of a card grid, or anything inside one: Move, Duplicate, Remove, Add card, Open page, Select card.
  if (cards && !isNativeSectionTag(selection.tag)) {
    const items = cards.controls(selection, source);
    controls.push(...items);
    if (!onMove && items.some((control) => control.kind === "button" && control.icon === "duplicate"))
      onMove = (direction) => { cards?.move(selection, direction); };
  }
  // Edit component, Make component… (src/page-builder/components.ts).
  if (componentTools) controls.push(...componentTools.controls(selection));
  // Ask agent: a request about this element for a connected agent, pinned on it.
  const menu = agentMenu;
  if (node && menu?.connected() && nativeSite) {
    const site = nativeSite;
    controls.push({
      kind: "prompt",
      label: "Ask agent",
      placeholder: "Ask the agent…",
      maxLength: REQUEST_TEXT_LIMIT,
      onSend: async (text) => {
        const about = agentElement({ ...selection, route: preview.route() }, site, nativeSources()[path]);
        if (!about) return "This element cannot be pointed out to an agent.";
        try {
          await menu.ask(text, about);
        } catch (error) {
          return (error as Error).message;
        }
        announce("Sent to the agent");
        return undefined;
      },
    });
  }
  const model: EditBarModel = { origin: { path, source, revision: `${setupScope()}:${generation}`, node: node?.slice() }, kind, controls, onFormat: (format) => nativeFormatActions[format]?.(), onMove, draggable, ...componentTools?.identity(selection) };
  nativeEditBarModel = model;
  preview.showEditBar(model, rect, nativeTextSelection);
  componentTools?.show(selection);
}

// The Address of a link just made closed with no address: the link goes
// again, by undoing its undo group (the wrap and anything typed), so the
// source is as it was before Link and no empty undo step is left behind.
function removeEmptyNewLink(fresh: NonNullable<typeof nativeNewLink>) {
  nativeNewLink = undefined;
  const editor = editorModule;
  const latest = nativeSources()[fresh.path] ?? "";
  const found = locateNativeElementRange(latest, fresh.link);
  if (!editor || found?.tag.name !== "a" || startTagAttribute(latest, found.tag, "href")?.value.trim()) return;
  const selected = lastNativeSelection?.path === fresh.path && lastNativeSelection.node?.join(".") === fresh.node.join(".");
  if (selected) nativePreview?.selectTextAfterUpdate(fresh.text);
  void editor.runVisualHistory("undo", fresh.path).then((undone) => {
    element("status").textContent = undone ? "Empty link removed" : "The empty link could not be removed; undo removes it.";
  });
}

// One verified source change to the mounted page `path`, as one undo step;
// `next` is the element to select once the preview has rendered it.
function applyNativeChange(path: string, source: string, edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) {
  const preview = nativePreview;
  const editor = editorModule;
  if (!preview || !editor) return false;
  if (nativeSources()[path] !== source) {
    announce("The source changed. Select the element again and try again.");
    return false;
  }
  preview.selectAfterUpdate(next ? { path, node: next } : undefined);
  try {
    editor.replaceActiveRanges(edits.map((edit) => ({ path, ...edit, expected: source.slice(edit.start, edit.end) })));
    element("status").textContent = message;
    return true;
  } catch (error) {
    preview.selectAfterUpdate(undefined);
    errorMessage(error);
    return false;
  }
}

// A whole section: a <section>, or a component whose template is one.
function isNativeSectionTag(tag: string) {
  return tag === "section" || (tag.includes("-") && isSectionTemplate(nativeSources()[nativeSite?.components[tag] ?? ""] ?? ""));
}

// Moves a whole section one sibling position, as one undo step, keeping it
// selected: the Move up/down buttons and Alt+Up/Down from the bar, the
// preview and the page structure all come here. "stayed" at the first or
// last position; nothing for anything but a section, when the page is not
// the mounted file, or when the edit could not be made.
function moveNativeSection(target: { path: string; node?: number[]; tag: string }, direction: "up" | "down"): "moved" | "stayed" | undefined {
  const { path, node } = target;
  if (!path || !node?.length || currentPath !== path || !editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
  const source = nativeSources()[path] ?? "";
  const range = locateNativeElementRange(source, node);
  if (!range) return undefined;
  const parent = node.slice(0, -1);
  const index = node[node.length - 1] + (direction === "up" ? -1 : 1);
  const other = index >= 0 ? locateNativeElementRange(source, [...parent, index]) : undefined;
  if (!other) return "stayed";
  const edits = direction === "up" ? swapEdits(source, other, range) : swapEdits(source, range, other);
  return applyNativeChange(path, source, edits, [...parent, index], direction === "up" ? "Moved up" : "Moved down") ? "moved" : undefined;
}

// Alt+Up/Down on a page structure row while another file is open (a
// component chosen in the preview, a file from the explorer): the page
// file opens first, as an insert does, then the section moves. A move that
// still cannot be made is said so rather than passed off as the end of the
// list.
async function moveNativeSectionAfterOpening(target: { path: string; node: number[]; tag: string }, direction: "up" | "down") {
  const epoch = generation;
  await restoreFile(target.path, epoch, { linkDefaultStyle: false });
  if (epoch !== generation) return;
  if (!moveNativeSection(target, direction)) element("status").textContent = "The section could not be moved";
}

// Moves a whole section to another gap among its siblings (`index` counted
// as the insert points are: before the sibling at that index, or the count
// for the end), as one undo step, keeping it selected: a drag in the page
// structure or the canvas ends here. "stayed" when the gap is the one the
// section already fills (announced, nothing recorded); nothing for another
// parent, for anything but a section, or when the ranges cannot be told.
function moveNativeSectionTo(target: { path: string; node?: number[]; tag: string }, parent: number[], index: number): "moved" | "stayed" | undefined {
  const { path, node } = target;
  if (!path || !node?.length || currentPath !== path || !editorModule?.isMounted(path) || !isNativeSectionTag(target.tag)) return undefined;
  const own = node.slice(0, -1);
  if (own.length !== parent.length || own.some((step, at) => step !== parent[at])) return undefined;
  const source = nativeSources()[path] ?? "";
  const range = locateNativeElementRange(source, node);
  if (!range) return undefined;
  const from = node[node.length - 1];
  if (index === from || index === from + 1) {
    element("status").textContent = "Section stayed in place";
    return "stayed";
  }
  const edits = moveEdit(source, range, from, index, (at) => locateNativeElementRange(source, [...parent, at]));
  if (!edits.length) return undefined;
  return applyNativeChange(path, source, edits, [...parent, index > from ? index - 1 : index], "Section moved") ? "moved" : undefined;
}

// Writes text typed into a preview element into its source, as one undo
// step: only the changed stretch of text is replaced, so formatting around
// it stays. A change that cannot be placed exactly (it crosses a tag) is
// dropped and the preview shows the source again.
async function applyNativeTextEdit({ path, node, before, after }: NativeTextEdit) {
  if (!nativePreview) return;
  // The click that selected the element may still be opening its file.
  for (let waited = 0; currentPath === path && !editorModule?.isMounted(path) && waited < 10_000; waited += 50)
    await new Promise((done) => setTimeout(done, 50));
  if (currentPath !== path || !editorModule?.isMounted(path)) {
    const epoch = generation;
    await restoreFile(path, epoch, { linkDefaultStyle: false });
    if (epoch !== generation || currentPath !== path || !editorModule?.isMounted(path)) return;
  }
  const editor = editorModule;
  const preview = nativePreview;
  if (!editor || !preview) return;
  const source = nativeSources()[path] ?? "";
  const range = locateNativeElementRange(source, node);
  // Common prefix and suffix; the rest of `before` becomes the rest of `after`.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  // A pure insertion takes one neighbouring character along, so the source
  // range is never empty and lands beside that character.
  if (endBefore === start) {
    if (start > 0) start--;
    else { endBefore++; endAfter++; }
  }
  const inner = range?.close ? source.slice(range.tag.end, range.close.start) : undefined;
  const span = inner !== undefined ? textRangeInSource(inner, start, endBefore, before.slice(start, endBefore)) : undefined;
  if (!range || !span) {
    preview.refresh();
    errorMessage(new Error("That text change could not be placed in the source. Change text within one formatting at a time."));
    return;
  }
  // Typed spaces arrive as no-break spaces where the browser needs them to stay visible.
  const text = after.slice(start, endAfter).replace(/\u00a0/g, " ")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const edit = { start: range.tag.end + span.start, end: range.tag.end + span.end, text };
  preview.selectAfterUpdate({ path, node });
  try {
    editor.replaceActiveRanges([{ path, ...edit, expected: source.slice(edit.start, edit.end) }]);
    element("status").textContent = "Text changed";
  } catch (error) {
    preview.selectAfterUpdate(undefined);
    preview.refresh();
    errorMessage(error);
  }
}

// Components that fit between page sections: those whose template is a
// single <section>, read from their current source so a draft counts.
function nativeSectionChoices(): InsertChoice[] {
  if (!nativeSite) return [];
  const sources = nativeSources();
  return Object.entries(nativeSite.components)
    .filter(([, path]) => isSectionTemplate(sources[path] ?? ""))
    .map(([tag]) => ({ tag, label: componentLabel(tag) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Puts a new instance of a section component into the page at `point`, as
// one undo step, and selects it. The page file opens first when another
// file is in the editor, since edits go through the mounted editor.
async function insertNativeComponent(point: InsertPoint, choice: InsertChoice) {
  const path = point.path;
  if (!nativePreview || !nativeSite || !Object.values(nativeSite.routes).includes(path)) return;
  if (currentPath !== path || !editorModule?.isMounted(path)) {
    const epoch = generation;
    await restoreFile(path, epoch, { linkDefaultStyle: false });
    if (epoch !== generation || currentPath !== path || !editorModule?.isMounted(path)) return;
  }
  const editor = editorModule;
  const preview = nativePreview;
  if (!editor || !preview) return;
  const template = nativeSources()[nativeSite.components[choice.tag] ?? ""] ?? "";
  const source = nativeSources()[path] ?? "";
  const edit = nativeInsertEdit(source, point.parent, point.index, choice.tag, template);
  if (!edit) {
    errorMessage(new Error(`${choice.label} was not added: the HTML around that spot could not be located exactly in ${path}.`));
    return;
  }
  preview.selectAfterUpdate({ path, node: [...point.parent, point.index] });
  try {
    editor.replaceActiveRanges([{ path, ...edit, expected: source.slice(edit.start, edit.end) }]);
    element("status").textContent = `${choice.label} added`;
  } catch (error) {
    preview.selectAfterUpdate(undefined);
    errorMessage(error);
  }
}

async function selectNativeSource(selection: NativePreviewSelection) {
  const reveal = selection.reason !== "refresh";
  lastNativeSelection = selection.path ? selection : undefined;
  stylePanel?.update();
  // Agents see the selection (get_selection).
  if (reveal) updateAgentContext();
  pageStructure?.select(selection.path && selection.node ? { path: selection.path, node: selection.node } : undefined);
  if (!selection.path) {
    nativePreview?.hideEditBar();
    componentTools?.show(undefined);
  }
  if (!reveal) {
    if (!selection.path || currentPath !== selection.path) {
      nativePreview?.hideEditBar();
      return;
    }
    markNativeElement(selection, false);
    renderNativeEditBar(selection);
    void linkNativeStyles(selection, false);
    return;
  }
  if (currentPath) editorModule?.markElement(currentPath, undefined, false);
  pendingNativeSelection = selection.path ? { selection, epoch: generation } : undefined;
  const request = ++linkedStyleRequest;
  fileGeneration++;
  secondaryRequest++;
  if (!selection.path) {
    nativeLinkedStyles = undefined;
    linkedStyle = undefined;
    void openDefaultLinkedStyle();
    return;
  }
  if (!snapshot || !nativeSite || !nativeSitePaths(nativeSite).includes(selection.path)) return;
  const epoch = generation;
  if (currentPath !== selection.path) {
    await restoreFile(selection.path, epoch, { linkDefaultStyle: false });
    if (request !== linkedStyleRequest || epoch !== generation || currentPath !== selection.path) return;
  }
  markNativeElement(selection, true);
  renderNativeEditBar(selection);
  void linkNativeStyles(selection, reveal);
}

let nativePreview: ReturnType<typeof createNativePreview> | undefined;
let pageStructure: ReturnType<typeof createPageStructure> | undefined;
// Card grids: Add card, New page and card, and their edit bar (src/page-builder/cards.ts).
let cards: Cards | undefined;
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
  return currentRepo && snapshot && info.user
    ? { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }
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
  if (!nativeRouteForPath(path)) return "This page has no URL in the site.";
  const source = nativeEffectiveSource(path);
  if (source === undefined) return "The page could not be read.";
  const next = withPageField(source, field, value);
  const edit = minimalTextEdit(source, next);
  if (!edit) return undefined;
  const label = field === "title" ? "Title" : "Description";
  const done = value.trim() ? `${label} updated` : `${label} removed`;
  if (editorModule?.isMounted(path)) {
    try {
      editorModule.replaceActiveRange({ path, ...edit, expected: source.slice(edit.start, edit.end) }, group);
    } catch (error) {
      return error instanceof Error ? error.message : "The page could not be changed.";
    }
    updateCurrentPageLabel();
    if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree();
    element("status").textContent = done;
    return undefined;
  }
  return applyNativeOperation({
    edits: new Map([[path, next]]),
    done,
    undone: `Undid changing the ${field} of ${nativePageLabelOf(path)}.`,
    focus: { file: path },
  });
}

// ---- Page-builder site controls. Kept together to isolate this slice's wiring. ----

function nativeSitePageChoices() {
  return Object.entries(nativeSite?.routes ?? {}).map(([route, file]) => ({ route, file, label: nativePageLabelOf(file) }));
}

function nativeNavigationTarget(pagePath: string | undefined) {
  if (!nativeSite || !pagePath) return undefined;
  const page = nativeEffectiveSource(pagePath) ?? "";
  // Only offer the header component actually used on this page.
  const headerPath = nativeSite.components["site-header"];
  if (headerPath && /<site-header(?:\s|>)/i.test(page)) {
    const source = nativeEffectiveSource(headerPath);
    const list = source !== undefined ? readNavigation(source, true) : undefined;
    if (source !== undefined && list) return { path: headerPath, source, list, shared: true };
  }
  const list = readNavigation(page);
  return list ? { path: pagePath, source: page, list, shared: false } : undefined;
}

let siteLinkPreferenceScope = "";
let siteLinkPreferences = new Map<string, SiteLinkPreference>();

function nativeSettingsController() {
  const scope = setupScope(), epoch = generation;
  if (siteLinkPreferenceScope !== scope) { siteLinkPreferenceScope = scope; siteLinkPreferences = new Map(); }
  const expectedSources = new Map([...nativeSitePaths(nativeSite!), NATIVE_CONFIG_PATH].map((path) => [path, nativeEffectiveSource(path)] as const));
  const routes = JSON.stringify(nativeSite?.routes);
  const sourcesChanged = () => routes !== JSON.stringify(nativeSite?.routes) || [...expectedSources].some(([path, source]) => nativeEffectiveSource(path) !== source);
  const stale = () => scope !== setupScope() || epoch !== generation;
  const changed = "The repository or source changed meanwhile. Reopen settings and try again.";
  return createSiteSettings({
    async applyPage(path, fields) {
      if (stale() || sourcesChanged()) return changed;
      const source = nativeEffectiveSource(path);
      if (source === undefined || !nativeRouteForPath(path)) return "The page could not be read.";
      let next = source;
      try { for (const [field, value] of Object.entries(fields)) next = upsertHeadTag(next, field as HeadField, value); }
      catch (error) { return error instanceof Error ? error.message : "Page settings could not be changed."; }
      if (next === source) return undefined;
      return applyNativeOperation({ expectedSources, edits: new Map([[path, next]]), done: "Page settings applied as a draft. Save to GitHub to keep them.", undone: "Undid page settings." });
    },
    planUrl: (path, value) => stale() || sourcesChanged() ? { ok: false, error: changed } : nativeUrlPlan(path, value),
    applyUrl: (path, value, keep) => stale() || sourcesChanged() ? Promise.resolve(changed) : changeNativeUrl(path, value, keep, expectedSources),
    async applySite(values) {
      if (stale() || sourcesChanged()) return changed;
      return applyNativeSiteSettings(values, expectedSources);
    },
    async open404() {
      if (stale() || sourcesChanged() || !nativeSite) return changed;
      if (nativeSite.routes["/404.html"]) { await restoreFile(nativeSite.routes["/404.html"], generation); return undefined; }
      let source = nativePageTemplate(nativeEffectiveSource(nativeSite.routes["/"]), "Page not found");
      source = withPageField(source, "description", "There is nothing at this address. Try the home page.");
      source = upsertHeadTag(source, "robots", "noindex");
      source = source.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, '$1\n    <section>\n      <h1>Page not found</h1>\n      <p>There is nothing at this address. <a href="/">Go to the home page</a>.</p>\n    </section>\n  $2');
      return applyNativeOperation({ expectedSources, creates: [{ path: "404.html", content: source }], open: "404.html", done: "Created the 404 page as a draft.", undone: "Undid creating the 404 page." });
    },
    async applyNavigation(path, original, links) {
      if (stale() || sourcesChanged()) return changed;
      const source = nativeEffectiveSource(path);
      if (source !== original) return "Navigation changed while this panel was open. Reopen it to review the latest links.";
      const list = readNavigation(source, path.startsWith("components/"));
      if (!list) return "This header's navigation is not a simple list of links.";
      let next: string;
      try { next = editNavigation(source, list, links); }
      catch (error) { return error instanceof Error ? error.message : "Navigation could not be changed."; }
      return applyNativeOperation({ expectedSources, edits: new Map([[path, next]]), done: "Navigation applied as a draft. Save to GitHub to keep it.", undone: "Undid changing navigation." });
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
      if (/^https?:\/\//i.test(value)) return value;
      const path = resolveImportPath(currentPath ?? "index.html", value);
      if (!path || !isImagePath(path)) return undefined;
      await loadNativeAssets({ "index.html": `<img src="/${escapeText(path).replace(/"/g, "&quot;")}">` }, () => {});
      return stale() || sourcesChanged() ? undefined : nativeAssets.get(path);
    },
  }, siteLinkPreferences);
}

async function openNativePageSettings(path: string) {
  const epoch = generation, scope = setupScope();
  const problem = await ensureNativeTextIndex();
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const source = nativeEffectiveSource(path), route = nativeRouteForPath(path);
  if (source === undefined || !route) return;
  try { nativeSettingsController().page({ path, source, route, images: nativeImagePaths() }); }
  catch (error) { errorMessage(error); }
}

async function openNativeSiteSettings() {
  const epoch = generation, scope = setupScope();
  if (!nativeSite) { announce("Open a native site first."); return; }
  const problem = await ensureNativeTextIndex();
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem || !nativeSite) { if (problem) errorMessage(new Error(problem)); return; }
  try {
    nativeSettingsController().site({ values: readSiteIdentity(nativeEffectiveSource(NATIVE_CONFIG_PATH), nativeEffectiveSource(nativeSite.routes["/"]) ?? ""), pages: nativeSitePageChoices(), images: nativeImagePaths(), has404: Boolean(nativeSite.routes["/404.html"]) });
  } catch (error) { errorMessage(error); }
}

async function applyNativeSiteSettings(values: SiteSettingsValues, expectedSources: Map<string, string | undefined>) {
  if (!nativeSite) return "Open a native site first.";
  const config = nativeEffectiveSource(NATIVE_CONFIG_PATH);
  const before = readSiteIdentity(config, nativeEffectiveSource(nativeSite.routes["/"]) ?? "");
  const edits = new Map<string, string>();
  try {
    const nextConfig = withSiteIdentityConfig(config, values);
    if (config !== nextConfig) edits.set(NATIVE_CONFIG_PATH, nextConfig);
    for (const path of new Set(Object.values(nativeSite.routes))) {
      const source = nativeEffectiveSource(path);
      if (source === undefined) return `${path} could not be read. No settings were applied.`;
      const next = withSiteIdentityPage(source, before, values);
      if (next !== source) edits.set(path, next);
    }
  } catch (error) { return error instanceof Error ? error.message : "Site settings could not be changed."; }
  if (!edits.size) return undefined;
  return applyNativeOperation({ expectedSources, edits, done: `Site settings applied to ${edits.size} files as drafts. Save to GitHub to keep them.`, undone: "Undid site settings on all affected pages." });
}

async function openNativeNavigation(pagePath: string) {
  const epoch = generation, scope = setupScope();
  const problem = await ensureNativeTextIndex();
  if (epoch !== generation || scope !== setupScope()) return;
  if (problem) { errorMessage(new Error(problem)); return; }
  const target = nativeNavigationTarget(pagePath);
  if (!target) { announce("No editable navigation found in this page's header. Navigation supports simple links, or a list of single-link items."); return; }
  nativeSettingsController().navigation({ path: target.path, source: target.source, links: target.list.links, pages: nativeSitePageChoices(), shared: target.shared });
}

// Pages and components are found from the files when the project loads. A
// file created, moved or discarded here finds them again with the files
// now, so a new page routes (and a new component renders) at once.
function refreshNativeRoutes() {
  if (!nativeSite) return;
  const parsed = resolveNativeProject(nativeFiles());
  if (!parsed.ok) { errorMessage(new Error(parsed.error)); return; }
  nativeSite = parsed.site;
  nativePreview?.setWarnings(parsed.warnings);
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
  const route = nativeRouteForPath(currentPath) ?? nativeDefaultRoute(nativeSite);
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
  nativePreview.update({
    sources: nativePreviewSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(currentPath),
    component: currentPath ? nativeComponentTagForPath(currentPath) : undefined,
  });
}

// A source edit: push new sources but never change the route, so an edit while
// the preview is on About (with a different file open) does not snap it Home.
function updateNativePreviewSources() {
  if (!nativeSite || !nativePreview) return;
  nativePreview.update({ sources: nativePreviewSources(), componentStyles: Object.fromEntries(nativeComponentStyles), assets: Object.fromEntries(nativeAssets) });
  void loadNativeAssets();
  void loadNativeStyleFiles();
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
      !Object.hasOwn(sources, path) && !nativeMissingStyleFiles.has(path) && !nativeStyleFileRequests.has(path));
    if (!wanted.length) break;
    wanted.forEach((path) => nativeStyleFileRequests.add(path));
    try {
      const found: { path: string; sha: string }[] = [];
      const scope = draftScope();
      for (const path of wanted) {
        // A stylesheet drafted here (new, or moved) is its draft; one read with the site is there.
        const draft = scope ? draftStore().get(scope, path) : undefined;
        if ((draft && !draft.deleted) || (!draft && nativeBaseSources.has(path))) { nativeStyleFiles.add(path); loaded = true; continue; }
        const entry = draft?.deleted ? undefined : await findEntry(path);
        if (!live()) return false;
        if (entry) found.push({ path, sha: entry.sha });
        else nativeMissingStyleFiles.add(path);
      }
      const contents = found.length ? await readFiles(repo, found.map((file) => file.sha)) : {};
      if (!live()) return false;
      for (const file of found) {
        nativeBaseSources.set(file.path, contents[file.sha]);
        nativeStyleFiles.add(file.path);
        loaded = true;
      }
    } finally {
      wanted.forEach((path) => nativeStyleFileRequests.delete(path));
    }
  }
  return loaded;
}

async function loadNativeStyleFiles() {
  if (!nativeSite || !currentRepo || !snapshot) return;
  const site = nativeSite;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const live = () => epoch === generation && request === nativeSourcesRequest && nativeSite === site;
  let loaded = false;
  try {
    loaded = await readNativeStyleFiles(currentRepo.full_name, site, live);
  } catch {
    // The preview reports the stylesheet as missing.
  }
  if (loaded && live()) updateNativePreviewSources();
}

// Images and fonts the pages, components and stylesheets refer to, read once
// per path as data URLs so the sandboxed frame can show them; a path that is
// not in the branch (or not an image or font) is remembered as missing and
// left as written.
const nativeAssetVersions = new Map<string, number>();
const nativeAssets = new class extends Map<string, string> {
  override set(path: string, value: string) {
    if (this.get(path) !== value) nativeAssetVersions.set(path, (nativeAssetVersions.get(path) ?? 0) + 1);
    return super.set(path, value);
  }
  override delete(path: string) {
    const deleted = super.delete(path);
    if (deleted) nativeAssetVersions.set(path, (nativeAssetVersions.get(path) ?? 0) + 1);
    return deleted;
  }
  override clear() { for (const path of this.keys()) nativeAssetVersions.set(path, (nativeAssetVersions.get(path) ?? 0) + 1); super.clear(); }
}();
const nativeMissingAssets = new Set<string>();
const nativeAssetRequests = new Map<string, number>();
let nativeAssetRequestId = 0;
const ASSET_TYPES: Record<string, string> = {
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf",
};
const assetType = (path: string) => ASSET_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
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
// Reads the assets `sources` name that are not read yet; `onProgress` runs
// as each arrives.
async function loadNativeAssets(sources = nativeSite ? nativeSources() : {}, onProgress = updateNativePreviewSources) {
  if (!currentRepo || !snapshot) return;
  const repo = currentRepo.full_name;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const wanted = [...referencedAssets(sources)].filter((path) =>
    !nativeAssets.has(path) && !nativeMissingAssets.has(path) && !nativeAssetRequests.has(path));
  if (!wanted.length) return;
  const assetRequest = ++nativeAssetRequestId;
  wanted.forEach((path) => nativeAssetRequests.set(path, assetRequest));
  const scope = draftScope();
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const load = async (path: string) => {
    // A drafted image: an upload's bytes from this browser, a moved or
    // copied one's blob; a deleted one is missing.
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft) nativeDraftAssets.add(path);
    if (draft?.upload && scope) {
      const url = await uploadDataUrl(uploadBytes(), scope, draft).catch(() => undefined);
      return url?.replace(/^data:[^;]+;base64,/, "");
    }
    const entry = draft?.deleted ? undefined : draft?.sourceSha ? { sha: draft.sourceSha } : await findEntry(path);
    if (!live() || !entry) return undefined;
    try {
      const blob = await api<{ content: string }>("raw", { repo, sha: entry.sha });
      return blob.content;
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
    ...(snapshot?.tree ?? []).filter((entry) => entry.type === "blob" && isImagePath(entry.path)).map((entry) => entry.path),
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

// Media's repository seam: binary uploads retain the existing IndexedDB/Save path.
async function mediaWorkspaceContext(): Promise<MediaWorkspaceContext> {
  const repo = currentRepo, scope = draftScope(), epoch = generation, workspace = setupScope();
  if (!repo || !scope || !snapshot) throw new Error("Choose a repository before opening Images.");
  const assertLive = () => { if (epoch !== generation || workspace !== setupScope()) throw new Error("The repository changed. Close Images and open it again."); };
  const branchPaths = nativeSite ? nativeFiles(scope) : await listRepositoryFiles(repo, snapshot);
  assertLive();
  const gone = new Set(draftStore().list(scope).filter((draft) => draft.deleted).map((draft) => draft.path));
  const paths = [...new Set([...branchPaths, ...draftStore().list(scope).filter((draft) => !draft.deleted).map((draft) => draft.path)])].filter((path) => !gone.has(path));
  const read = async (path: string) => {
    assertLive();
    const held = nativeEffectiveSource(path, scope);
    if (held !== undefined) return held;
    if (draftStore().get(scope, path)?.deleted) return undefined;
    const entry = await findEntry(path); assertLive();
    if (!entry) return undefined;
    const text = await readFile(repo.full_name, entry.sha); assertLive();
    nativeBaseSources.set(path, text); return text;
  };
  return {
    key: `${scope.account}:${scope.repoId}`, scope, drafts: draftStore(), paths,
    items: paths.filter(isImagePath).map((path) => {
      const draft = draftStore().get(scope, path), entry = entryAt(path);
      return { path, size: draft?.upload?.size ?? entry?.size, date: draft?.updatedAt, draft: Boolean(draft) };
    }),
    pages: nativeSite ? Object.values(nativeSite.routes) : paths.filter((path) => /(?:^|\/)index\.html$/i.test(path) && !path.startsWith("components/")),
    components: nativeSite?.components ?? {}, assertLive, read,
    blob: async (path) => {
      assertLive();
      const draft = draftStore().get(scope, path);
      if (draft?.deleted) throw new Error(`${path} is deleted.`);
      if (draft?.upload && draft.sourceSha) {
        const blob = await uploadBytes().get(uploadKey(scope, draft.sourceSha)); assertLive();
        if (!blob) throw new Error(`${path} is missing from this browser's storage. Upload it again.`);
        return blob;
      }
      const entry = draft?.sourceSha ? { sha: draft.sourceSha } : await findEntry(path); assertLive();
      if (!entry) throw new Error(`${path} is unavailable.`);
      const raw = await api<{ content: string }>("raw", { repo: repo.full_name, sha: entry.sha }); assertLive();
      return new Blob([Uint8Array.from(atob(raw.content), (char) => char.charCodeAt(0))], { type: uploadImageType(path) });
    },
    assetVersion: path => {
      const record = draftStore().get(scope, path);
      return record ? JSON.stringify(record) : entryAt(path)?.sha;
    },
    applyBatch: async batch => {
      const editor = editorModule;
      if (!editor || !currentPath) throw new Error("Open a page before changing images.");
      const historyPath = currentPath, historyHost = editor.captureHistoryHost(currentPath);
      if (!historyHost) throw new Error("Open an editable page before changing images.");
      await applyMediaWorkspaceBatch(batch, mediaDraftTransaction({
        scope, store: draftStore(), bytes: uploadBytes(), assertLive,
        paths: () => nativeFiles(scope), source: path => nativeEffectiveSource(path, scope),
        assetVersion: path => { const record = draftStore().get(scope, path); return record ? JSON.stringify(record) : entryAt(path)?.sha; },
        entry: async path => { const entry = await findEntry(path); assertLive(); return entry ? { path, sha: entry.sha, mode: entry.mode, text: nativeEffectiveSource(path, scope) } : undefined; },
        modelState: path => editor.captureFileModelState(scope, path), evictModel: (path, proof) => editor.evictDraftModel(scope, path, proof), historyCurrent: historyHost.isCurrent,
        mounted: path => editor.isMounted(path), prepareSources: edits => editor.prepareHistorySources(edits),
        history: (undo, redo) => editor.recordHistoryAction(historyPath, undo, redo),
        refresh: () => { afterFileChanges(); updateNativePreviewSources(); },
        announce,
      }));
    },
    write: async () => { throw new Error("Use the atomic image transaction."); },
    changed: () => {},
    rename: async () => { throw new Error("Use the atomic image transaction."); },
    remove: async () => { throw new Error("Use the atomic image transaction."); },
    openPage: async (path) => { assertLive(); await openAfter(path); },
  };
}

async function chooseMediaForImage(target: { path: string; node: number[]; width?: number }, files?: File[]) {
  const epoch = generation, workspace = setupScope();
  const source = nativeEffectiveSource(target.path);
  const initial = source === undefined ? undefined : locateNativeElementRange(source, target.node);
  if (!initial || initial.tag.name !== "img" || versionView) return;
  const expected = source!.slice(initial.tag.start, initial.tag.end);
  await openMediaPicker({ files, accept: "image/*", onPick: async (image: MediaImage) => {
    if (epoch !== generation || workspace !== setupScope()) throw new Error("The repository changed. Choose an image again.");
    if (currentPath !== target.path) await restoreFile(target.path, epoch, { linkDefaultStyle: false });
    const latest = nativeEffectiveSource(target.path);
    const range = latest === undefined ? undefined : locateNativeElementRange(latest, target.node);
    if (epoch !== generation || workspace !== setupScope() || latest !== source || !range || range.tag.name !== "img" || latest!.slice(range.tag.start, range.tag.end) !== expected) throw new Error("This image changed while the picker was open. Select it again.");
    const markup = mediaImageMarkup(image, expected, target.width);
    if (!applyNativeChange(target.path, latest!, [{ start: range.tag.start, end: range.tag.end, text: markup }], target.node, "Image replaced")) throw new Error("The image could not be replaced.");
  } }).catch(errorMessage);
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
    !currentRepo ||
    currentRepo.id !== scope.repoId ||
    snapshot?.branch !== scope.branch ||
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
  disposeExplorerImages();
  configureMediaPicker(createMediaWorkspace(mediaWorkspaceContext));
  closeMediaPicker();
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
  nativeTextIndexing = undefined;
  nativeAssets.clear();
  nativeMissingAssets.clear();
  nativeAssetRequests.clear();
  nativeBodyStyles = undefined;
  nativeSourcesRequest++;
  nativePreview?.deactivate();
}

async function loadNativeComponentStyles(tags: string[]) {
  if (!nativeSite || !currentRepo || !snapshot) return;
  const site = nativeSite;
  const repo = currentRepo.full_name;
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
    const found: { tag: string; path: string; sha: string }[] = [];
    const scope = draftScope();
    for (const tag of wanted) {
      const path = nativeComponentCssPath(site.components[tag]);
      // A stylesheet drafted here (new, or moved with its component) is its draft; a deleted one is missing.
      const draft = scope ? draftStore().get(scope, path) : undefined;
      if (draft && !draft.deleted) { nativeComponentStyles.set(tag, path); continue; }
      if (draft?.deleted) { nativeMissingComponentStyles.add(tag); continue; }
      const entry = await findEntry(path);
      if (epoch !== generation || request !== nativeSourcesRequest || nativeSite !== site) return;
      if (!entry) nativeMissingComponentStyles.add(tag);
      else found.push({ tag, path, sha: entry.sha });
    }
    const contents = await readFiles(repo, found.map((file) => file.sha));
    if (epoch !== generation || request !== nativeSourcesRequest || nativeSite !== site) return;
    for (const file of found) {
      nativeBaseSources.set(file.path, contents[file.sha]);
      nativeComponentStyles.set(file.tag, file.path);
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
  const repo = currentRepo;
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
    readBase64: async (sha) => (await api<{ content: string }>("raw", { repo: repo.full_name, sha })).content,
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
// are listed, every page, component template and CSS file is read from the
// current snapshot, and the native preview activates. All async steps are
// guarded against a superseding navigation (`epoch`).
async function activateNativeSite(repo: Repository, result: Snapshot, epoch: number) {
  const request = ++nativeSourcesRequest;
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
  nativeAssets.clear();
  nativeMissingAssets.clear();
  nativeAssetRequests.clear();
  try {
    // Required page, component and config sources render first; the rest of
    // the repository's html/css link index follows in the background.
    // A file drafted as new has no blob; its draft is its source.
    const drafted = new Set(scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path) : []);
    // The site settings too, for new pages' addresses and the agent context.
    const files = nativeFiles(scope);
    const currentFile = currentPath && nativeSitePaths(site).includes(currentPath) ? currentPath : site.routes[nativeDefaultRoute(site)];
    const primary = new Set([currentFile, ...nativePageStylesheets(nativeEffectiveSource(currentFile, scope) ?? "", currentFile), ...(files.includes(NATIVE_CONFIG_PATH) ? [NATIVE_CONFIG_PATH] : [])]);
    // Each component's own stylesheet renders with the first update too, so
    // the page never shows before its components are styled.
    const componentCss = new Map<string, string>();
    for (const [tag, template] of Object.entries(site.components)) {
      const path = nativeComponentCssPath(template);
      if (files.includes(path)) componentCss.set(path, tag);
      else nativeMissingComponentStyles.add(tag);
    }
    const wanted = new Set([...nativeSitePaths(site), ...primary, ...componentCss.keys()]);
    const sources: { path: string; sha: string }[] = [];
    for (const path of wanted) {
      if (drafted.has(path)) continue;
      const entry = await findEntry(path);
      if (!live()) return true;
      if (entry) sources.push({ path, sha: entry.sha });
      else if (nativeSitePaths(site).includes(path)) throw new Error(`The site's ${path} is missing from this branch.`);
    }
    const contents = sources.length ? await readFiles(repo.full_name, sources.map((source) => source.sha)) : {};
    if (!live()) return true;
    for (const source of sources) nativeBaseSources.set(source.path, contents[source.sha]);
    for (const [path, tag] of componentCss)
      if (drafted.has(path) || nativeBaseSources.has(path)) nativeComponentStyles.set(tag, path);
      else nativeMissingComponentStyles.add(tag);
    // The stylesheets the pages link, and the files those import, render
    // with the first update; one that cannot be read is reported by the
    // preview, not here.
    try {
      await readNativeStyleFiles(repo.full_name, site, live);
    } catch {
      // Reported by the preview as a missing stylesheet.
    }
    if (!live()) return true;
    // The images and fonts the page shows render with it too, so it does
    // not show with empty image boxes and fallback fonts first; one still
    // loading after a moment renders when it arrives.
    await Promise.race([
      loadNativeAssets(nativePageShownSources(site, nativePageRoute(currentFile) ? currentFile : site.routes[nativeDefaultRoute(site)]), () => { if (nativeSite === site) updateNativePreviewSources(); }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
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
  nativePreview?.setWarnings(parsed.warnings);
  nativePreview?.activate(site);
  nativePreview?.update({
    sources: nativeSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    assets: Object.fromEntries(nativeAssets),
    route: nativeRouteForPath(currentPath) ?? nativeDefaultRoute(site),
  });
  updateAgentContext();
  void loadNativeAssets();
  startNativeTextIndex(repo, site, scope, epoch, request);
  return true;
}

function nativeTextIndexScopeKey() {
  return currentRepo && snapshot && nativeSite ? `${currentRepo.full_name}\n${snapshot.branch}\n${snapshot.commit}\n${nativeSourcesRequest}` : "";
}

function startNativeTextIndex(repo: Repository, site: NativeSite, scope: ReturnType<typeof draftScope>, epoch: number, request: number) {
  nativeTextIndexScope = nativeTextIndexScopeKey();
  const commit = snapshot?.commit;
  const live = () => epoch === generation && request === nativeSourcesRequest && currentRepo?.full_name === repo.full_name && snapshot?.commit === commit && nativeSite === site;
  nativeTextIndexing = indexNativeTextFiles(repo, site, scope, live).catch((error) => {
    if (live() && nativeSite === site) nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
    return false;
  });
}

async function indexNativeTextFiles(repo: Repository, site: NativeSite, scope: ReturnType<typeof draftScope>, live: () => boolean) {
  const files = nativeFiles(scope).filter(isNativeTextFile).slice(0, 2000);
  const wanted = files.filter((path) => !nativeBaseSources.has(path) && !(scope && draftStore().get(scope, path)?.baseSha === null));
  const sources: { path: string; sha: string }[] = [];
  for (const path of wanted) {
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft?.baseSha === null || draft?.deleted) continue;
    const entry = draft?.deleted ? undefined : await findEntry(path);
    if (!live() || nativeSite !== site) return false;
    if (entry) sources.push({ path, sha: entry.sha });
  }
  const contents = sources.length ? await readFiles(repo.full_name, sources.map((source) => source.sha)) : {};
  if (!live() || nativeSite !== site) return false;
  let loaded = false;
  for (const source of sources) {
    if (nativeBaseSources.has(source.path) || !nativeBaseFiles.includes(source.path)) continue;
    nativeBaseSources.set(source.path, contents[source.sha]);
    loaded = true;
  }
  if (loaded) updateNativePreviewSources();
  return true;
}

async function ensureNativeTextIndex() {
  const before = nativeTextIndexScopeKey();
  if (nativeTextIndexing && nativeTextIndexScope !== before) {
    if (!currentRepo || !snapshot || !nativeSite) return "The repository changed meanwhile. Try again.";
    startNativeTextIndex(currentRepo, nativeSite, draftScope(), generation, nativeSourcesRequest);
  }
  let ready = nativeTextIndexing ? await nativeTextIndexing : true;
  if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  if (!ready && currentRepo && nativeSite) {
    const repo = currentRepo, site = nativeSite, scope = draftScope(), epoch = generation, request = nativeSourcesRequest;
    nativeTextIndexing = undefined;
    startNativeTextIndex(repo, site, scope, epoch, request);
    ready = await nativeTextIndexing!;
    if (before !== nativeTextIndexScopeKey()) return "The repository changed meanwhile. Try again.";
  }
  return ready ? undefined : "The site's links could not be fully read. Refresh the repository and try again.";
}


let codeResize: ReturnType<typeof mountCodeResize> | undefined;
let codeWidthResize: ReturnType<typeof mountCodeWidthResize> | undefined;
function updatePreview() {
  updateNativePreview();
}

function setCurrentPage(path?: string) {
  if (versionView && versionView.path !== path) endVersionView(false);
  currentPath = path;
  closeEditor();
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
  const path = currentPath;
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
let info: SessionInfo;
let currentRepo: Repository | undefined;
let snapshot: Snapshot | undefined;
// Paths whose drafts are edits of files GitHub deleted since they began.
let deletedUpstream = new Set<string>();
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
async function api<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const response = await fetchWithReadRetry(
    `/api/${path}${params ? `?${new URLSearchParams(params)}` : ""}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "Could not load GitHub data.",
    );
  return data as T;
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

/** Cancels the automatic continue to GitHub while its message is showing. */
let cancelAutoSignIn: (() => void) | undefined;

function renderLogin(
  mode: "loading" | "auto" | "ready" | "expired" | "error" = "ready",
) {
  editorPalette?.dispose();
  editorPalette = undefined;
  agentMenu?.destroy();
  agentMenu = undefined;
  activeFileContext = null;
  explorerDropdown?.destroy();
  explorerDropdown = undefined;
  sidebarResize?.dispose();
  sidebarResize = undefined;
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
  currentRepo = undefined;
  snapshot = undefined;
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
      action.append(button("Use the button instead", () => cancelAutoSignIn?.(), "text-link login-cancel"));
  } else if (mode === "error") {
    action.append(
      button(
        "Retry connection",
        () => void start(),
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
    // thing left to do, so go there.
    location.replace(info.ownerSetupUrl);
    action.append(link("Connect your editor to GitHub", info.ownerSetupUrl, "button primary login-button"));
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
function startSitePanel() {
  const repo = currentRepo!;
  return createStartSite({
    repository: repo.name,
    empty: Boolean(snapshot?.empty),
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

let setupChecklist: ReturnType<typeof createSetupChecklist> | undefined;
/** The repository the user asked the checklist for from the menu, for this page load. */
let setupAsked: number | undefined;
let setupFinishing: { timer: ReturnType<typeof setTimeout>; scope: string } | undefined;
/** Account, repository and branch the checklist is of. */
function setupScope() {
  const scope = draftScope();
  return scope ? JSON.stringify([scope.account, scope.repoId, scope.branch]) : "";
}

/**
 * Connect an agent (the checklist): says what an agent is for and spotlights
 * the project menu's tile, where the agent connection lives. "Show me" opens
 * the menu with Connect with MCP lit; "Got it" just closes.
 */
function spotlightAgentConnection() {
  spotlight(repositoryMenu?.trigger, {
    title: "Connect an agent",
    text: [AGENT_EXPLAINER.join(" "), agentWhere()],
    actions: [
      { label: "Show me", primary: true, run: showAgentConnection },
      { label: "Got it" },
    ],
  });
}

let litEntry: AbortController | undefined;
function showAgentConnection() {
  litEntry?.abort();
  repositoryMenu?.open();
  const entry = document.querySelector<HTMLElement>(".agent-menu__action");
  if (!entry) return;
  entry.classList.add("is-spotlit");
  // The highlight goes when the menu closes.
  const panel = document.getElementById("repository-actions");
  litEntry = new AbortController();
  litEntry.signal.addEventListener("abort", () => entry.classList.remove("is-spotlit"));
  panel?.addEventListener("toggle", () => !panel.matches(":popover-open") && litEntry?.abort(), { signal: litEntry.signal });
  requestAnimationFrame(() => entry.focus());
}

function mountSetupChecklist() {
  const checklist = createSetupChecklist({
    start: () => {
      const choice = content.querySelector<HTMLElement>(".start-site .onboard-choice");
      if (choice) choice.focus();
      else announce("This repository has a home page already.");
    },
    save: () => {
      const trigger = document.querySelector<HTMLButtonElement>(".publish-menu > button");
      if (!trigger || trigger.disabled) { announce("There is nothing to save yet."); return; }
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    },
    saveName: async (name) => {
      const problem = await writeSiteSettings({ name });
      if (!problem) setupRemember({ named: true });
      return problem;
    },
    connect: spotlightAgentConnection,
    dismiss: () => {
      setupAsked = undefined;
      setupRemember({ dismissed: true });
    },
  });
  setupChecklist = checklist;
  element("setup-checklist").append(checklist.root);
  // The project menu's item, above the agent's.
  // Setup remains available through its progress control.
  checklist.onRequest(() => {
    setupAsked = currentRepo?.id;
    refreshSetup();
    // After the menu has closed and given its focus back.
    setTimeout(() => checklist.open(), 0);
  });
}

function setupRemember(change: SetupMemory) {
  if (!info.user || !currentRepo) return undefined;
  const memory = writeSetupMemory(localStorage, info.user.login, currentRepo.id, change);
  refreshSetup();
  return memory;
}

/** A starting point was applied to repository `repoId`: the checklist shows by itself. */
function startSetupChecklist(repoId: number) {
  if (info.user) writeSetupMemory(localStorage, info.user.login, repoId, { auto: true, dismissed: false, finished: false });
}

function noteSetupAgent(connected: boolean) {
  if (connected && info.user && currentRepo) writeSetupMemory(localStorage, info.user.login, currentRepo.id, { agent: true });
  refreshSetup();
}

function setupState(): Omit<SetupState, "nameConfirmed" | "agent"> | undefined {
  const repo = currentRepo;
  const scope = draftScope();
  if (!repo || !scope || !snapshot) return undefined;
  const home = draftStore().get(scope, NATIVE_HOME_PAGE);
  const drafted = Boolean(home && !home.deleted);
  const settings = nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH, scope));
  return {
    homePage: drafted || (nativeEngaged && !home?.deleted),
    committed: !snapshot.empty,
    homeUnsaved: drafted && home!.baseSha === null,
    siteName: settings.name,
    defaultName: siteNameFromRepository(repo.name),
  };
}

function refreshSetup() {
  const checklist = setupChecklist;
  if (!checklist) return;
  const repo = currentRepo;
  const state = setupState();
  const account = info.user?.login;
  const idle = { progress: setupProgress({ homePage: false, committed: false, homeUnsaved: false, defaultName: "", agent: false }), defaultName: "", visible: false, scope: "" };
  if (!repo || !account || !state) { checklist.update(idle); return; }
  let memory = readSetupMemory(localStorage, account, repo.id);
  if (agentMenu?.connected() && !memory.agent) memory = writeSetupMemory(localStorage, account, repo.id, { agent: true });
  const progress = setupProgress({ ...state, nameConfirmed: memory.named, agent: Boolean(memory.agent) });
  // Done by itself: "Your site is set up" for a moment, then gone for good.
  const finishing = progress.complete && memory.auto && !memory.finished && setupAsked !== repo.id;
  const scopeKey = setupScope();
  if (setupFinishing && (!finishing || setupFinishing.scope !== scopeKey)) {
    clearTimeout(setupFinishing.timer);
    setupFinishing = undefined;
  }
  if (finishing && !setupFinishing) {
    const timer = setTimeout(() => {
      setupFinishing = undefined;
      // Still this repository and branch, and still done (an undo may have undone it).
      const again = setupState();
      if (setupScope() === scopeKey && again && setupProgress({ ...again, nameConfirmed: readSetupMemory(localStorage, account, repo.id).named, agent: true }).complete)
        setupRemember({ finished: true });
    }, 4000);
    setupFinishing = { timer, scope: scopeKey };
  }
  checklist.update({ progress, siteName: state.siteName, defaultName: state.defaultName, visible: setupVisible(memory, setupAsked === repo.id), scope: setupScope() });
}

// The site's name or address into `.editor/config.json` as a draft (the
// rest of the file kept); Save to GitHub keeps it. Undo in the editor takes it back.
async function writeSiteSettings(change: { name?: string; url?: string }): Promise<string | undefined> {
  // The file is read for this repository, branch and snapshot; if the user
  // moves on meanwhile, nothing is written (it would land in the other one).
  const epoch = generation, snap = snapshot, repo = currentRepo, where = setupScope();
  const stale = () => generation !== epoch || snapshot !== snap || currentRepo !== repo || setupScope() !== where;
  let text = nativeEffectiveSource(NATIVE_CONFIG_PATH);
  if (text === undefined) {
    try {
      text = (await branchText(NATIVE_CONFIG_PATH))?.text;
    } catch (error) {
      return error instanceof Error ? error.message : `${NATIVE_CONFIG_PATH} could not be read.`;
    }
  }
  if (stale()) return "The repository changed meanwhile. Try again.";
  const next = withSiteSettings(text, change);
  if ("error" in next) return next.error;
  const what = change.name !== undefined ? "name" : "address";
  return applyNativeOperation({
    edits: new Map([[NATIVE_CONFIG_PATH, next.text]]),
    done: `Site ${what} set as a draft. Save to GitHub to keep it.`,
    undone: `Undid setting the site ${what}.`,
  });
}

// A starting point's files as drafts: the files of `point` (the blank page,
// or the Starter site the Worker fetches), new files as new drafts, images
// as uploads, then the project opened again so the preview shows the site.
// A file that is already there is replaced only when the user says so.
async function writeStartingPoint(point: StartingPoint, partial?: { committed: string[]; repoId: number }): Promise<string | undefined> {
  const repo = currentRepo;
  const scope = draftScope();
  if (!repo || !scope) return "Open a repository first.";
  const epoch = generation;
  // Everything below reads and writes for this repository, branch and snapshot only.
  const snap = snapshot!;
  const bound = () => generation === epoch && snapshot === snap && currentRepo === repo;
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
  startSetupChecklist(repo.id);
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
  if (!path && !nativeEngaged && currentRepo && snapshot) {
    content.replaceChildren(startSitePanel());
    return;
  }
  const panel = node("section", "directory-summary");
  panel.append(
    node("span", "badge", nativeEngaged ? "✦ Native site" : "Explore this folder"),
    node(
      "h1",
      "",
      path.split("/").at(-1) || currentRepo?.name || "Your project",
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
    ["Repository", currentRepo?.full_name ?? ""],
    ["Branch", snapshot?.branch ?? ""],
    ["Revision", snapshot?.commit.slice(0, 12) ?? ""],
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

// Folders open in the file tree, by path, so drawing it again (a file
// created or discarded, a save) keeps them open; and the folder listings
// read, by tree sha.
const openFolders = new Set<string>();
const folderListings = new Map<string, TreeEntry[]>();
// The changes the tree was last drawn with.
let drawnNewFiles = "";

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
const treeSignature = (state: TreeState) => [...state.changes.values()].map((change) => `${change.kind} ${change.from ?? ""} ${change.path}`).join("\n");
// A file renamed or moved away in the drafts: its new path shows it.
function movedAway(state: TreeState, path: string) {
  const marker = state.deleted.get(path);
  return Boolean(marker?.movedTo && state.changes.get(marker.movedTo)?.from === path);
}
// A folder on the branch every file of which is deleted ("deleted") or moved
// away ("moved") in the drafts, with no new file in it; known with the
// whole-commit tree only.
function folderGone(state: TreeState, folder: string): "deleted" | "moved" | undefined {
  if (!snapshot?.tree) return undefined;
  const prefix = `${folder}/`;
  if (state.drafted.some((path) => path.startsWith(prefix))) return undefined;
  const inside = snapshot.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix));
  if (!inside.length) return undefined;
  let moved = true;
  for (const entry of inside) {
    if (!state.deleted.has(entry.path)) return undefined;
    if (!movedAway(state, entry.path)) moved = false;
  }
  return moved ? "moved" : "deleted";
}

// A tree row: an entry of the branch, or a new file drafted in this browser,
// or a folder only such files are in; neither of the last two has a sha.
type FileTreeEntry = TreeEntry & { isNew?: boolean };

// The folder `parentPath`'s entries with the new files drafted under it: one
// directly in it as a file, one deeper as the folder it is in.
function withNewFiles(entries: TreeEntry[], parentPath: string, drafted: string[]): FileTreeEntry[] {
  const prefix = parentPath ? `${parentPath}/` : "";
  const names = new Set(entries.map((entry) => entry.path));
  const added = new Map<string, FileTreeEntry>();
  for (const path of drafted) {
    if (!path.startsWith(prefix)) continue;
    const [name, ...rest] = path.slice(prefix.length).split("/");
    if (names.has(name) || added.has(name)) continue;
    added.set(name, rest.length
      ? { path: name, type: "tree", mode: "040000", sha: "", isNew: true }
      : { path: name, type: "blob", mode: "100644", sha: "", isNew: true });
  }
  if (!added.size) return entries;
  return [...entries, ...added.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Draws the file tree from the snapshot, new files in place, each change marked.
function renderFileTree() {
  if (!snapshot) return;
  const state = treeState();
  drawnNewFiles = treeSignature(state);
  const focused = document.activeElement instanceof HTMLElement && files.contains(document.activeElement)
    ? document.activeElement.closest<HTMLElement>(".file-row")?.dataset.path
    : undefined;
  files.replaceChildren(renderEntries(snapshot.entries, "", generation, state));
  if (focused) fileRow(focused)?.focus();
}

// Draws the tree again when a change appeared, went, or was saved.
function renderDraftFiles() {
  requestExplorerImagesRefresh();
  if (snapshot && treeSignature(treeState()) !== drawnNewFiles) renderFileTree();
}

// The Files tree's row for `path`, when it is drawn.
function fileRow(path: string) {
  return [...files.querySelectorAll<HTMLButtonElement>(".file-row")].find((row) => row.dataset.path === path);
}

// The explorer's Pages | Files tabs: a native site shows both, Pages first
// when the project loads; any other project shows only its files, no tabs.
type ExplorerTab = "pages" | "files" | "images";
const explorerTabNames: ExplorerTab[] = ["pages", "files", "images"];
let explorerTab: ExplorerTab = "pages";
let pagesTree: ReturnType<typeof createPagesTree> | undefined;

let explorerImages: ReturnType<typeof mountMediaLibrary> | undefined;
let explorerImagesScope = "", explorerImagesSignature = "", explorerImagesRefreshNeeded = false;
let explorerImagesObserver: MutationObserver | undefined;
function disposeExplorerImages() {
  explorerImagesObserver?.disconnect(); explorerImagesObserver = undefined;
  explorerImages?.dispose(); explorerImages = undefined;
  explorerImagesScope = ""; explorerImagesSignature = ""; explorerImagesRefreshNeeded = false;
}
function imagesSignature() {
  const scope = draftScope();
  return JSON.stringify([generation, setupScope(), snapshot?.commit, scope ? draftStore().list(scope) : []]);
}
function ensureExplorerImages() {
  if (!nativeSite || !snapshot || !draftScope()) return;
  const scope = `${generation}:${setupScope()}`;
  if (explorerImages && explorerImagesScope === scope) { requestExplorerImagesRefresh(); return; }
  disposeExplorerImages(); explorerImagesScope = scope;
  explorerImagesSignature = imagesSignature();
  explorerImages = mountMediaLibrary(element("explorer-images"), { refreshKey: imagesSignature });
}
function explorerImagesVisible() { return !element("explorer-images").hidden && element("explorer").matches(":popover-open"); }
function requestExplorerImagesRefresh() {
  if (!explorerImages) return;
  if (explorerImagesScope !== `${generation}:${setupScope()}`) { disposeExplorerImages(); return; }
  if (!explorerImagesVisible()) { explorerImagesRefreshNeeded = true; return; }
  const signature = imagesSignature();
  if (signature === explorerImagesSignature) { if (explorerImagesRefreshNeeded) queueMicrotask(flushExplorerImagesRefresh); return; }
  explorerImagesSignature = signature; explorerImagesRefreshNeeded = true;
  queueMicrotask(flushExplorerImagesRefresh);
}
function flushExplorerImagesRefresh() {
  const view = explorerImages;
  if (!view || !explorerImagesRefreshNeeded || !explorerImagesVisible()) return;
  if (explorerImagesScope !== `${generation}:${setupScope()}`) { disposeExplorerImages(); return; }
  if (view.element.getAttribute("aria-busy") === "true") {
    if (!explorerImagesObserver) {
      explorerImagesObserver = new MutationObserver(() => {
        if (view.element.getAttribute("aria-busy") === "true") return;
        explorerImagesObserver?.disconnect(); explorerImagesObserver = undefined;
        if (explorerImages === view) flushExplorerImagesRefresh();
      });
      explorerImagesObserver.observe(view.element, { attributes: true, attributeFilter: ["aria-busy"] });
    }
    return;
  }
  explorerImagesRefreshNeeded = false;
  // A successful operation may already have loaded this exact source revision.
  if (view.refreshedKey === imagesSignature()) return;
  void view.refresh();
}

function mountExplorerTabs() {
  element("explorer").addEventListener("toggle", () => { if (explorerImagesVisible() && explorerTab === "images") ensureExplorerImages(); });
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

function selectExplorerTab(name: ExplorerTab) {
  explorerTab = name;
  updateExplorerTabs();
  if (name === "pages") renderPagesTree();
  if (name === "images") ensureExplorerImages();
}

function updateExplorerTabs(reset = false) {
  if (!document.getElementById("explorer-tabs")) return;
  const native = Boolean(nativeSite);
  if (reset) explorerTab = "pages";
  const tab = native ? explorerTab : "files";
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
  if (!native) { pagesTree?.reset(); disposeExplorerImages(); }
}

// The site's pages as a tree, from its routes (new drafts included); labels
// read each page's `<title>`, else its first heading, from its source.
function renderPagesTree(focus?: { file?: string; route?: string }) {
  if (!pagesTree || !nativeSite || element("explorer-pages").hidden) return;
  const site = nativeSite;
  const scope = draftScope();
  // New pages are marked; a renamed or moved one is the same page.
  const drafted = new Set(scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null && !draft.deleted && !draft.movedFrom).map((draft) => draft.path) : []);
  const tree = buildNativePagesTree({
    routes: site.routes,
    titles: nativeTitles(site),
    heading: (file) => firstHeadingText(nativeEffectiveSource(file, scope)),
    isNew: (file) => drafted.has(file),
  });
  pagesTree.render(tree, currentPath, focus);
}

// Whether the repository path (a file, or a folder something is in) is
// there, on the branch or drafted.
function nativePathExists(path: string) {
  return nativeFiles().some((file) => file === path || file.startsWith(`${path}/`));
}

// What a new page typed in the Pages tab writes: `<parent>/<slug>/index.html`,
// the home page's document with the new title and an empty `<main>`
// (`nativePageTemplate`); or why it cannot.
interface NativeNewPlan extends NativeNewTarget {
  title: string;
  content: string;
  note?: string;
}
function planNativeNew(request: NativeNewRequest): Checked<NativeNewPlan> {
  const site = nativeSite;
  if (!site || !draftScope()) return { ok: false, error: "Open a native site first." };
  const title = request.title.trim();
  if (!title) return { ok: false, error: "Enter the page's title." };
  if (!request.slug.trim()) return { ok: false, error: "The title gives no URL: add letters or digits, or change the URL." };
  const target = nativeNewTarget(request.parent, request.slug, {
    route: (route) => site.routes[route],
    exists: nativePathExists,
  });
  if (!target.ok) return target;
  return { ok: true, value: { ...target.value, title, content: nativePageTemplate(nativeEffectiveSource(site.routes["/"]), title, nativeAddress(target.value.route)) } };
}

// The address of the page at `route` on the live site, from
// `.editor/config.json`'s `site.url`; none without one.
function nativeAddress(route: string) {
  return nativePageUrl(nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH)).url, route);
}

// Pages whose URL changes keep their own address: the canonical link and
// og:url of each (`file`, at `moved` after the move) follow it from `from`
// to `to`, written into `edits` (by the path after the move) on top of the
// link updates there.
function withMovedPageUrls(edits: Map<string, string>, pages: { file: string; moved?: string; from: string; to: string }[]) {
  const siteUrl = nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH)).url;
  for (const page of pages) {
    const path = page.moved ?? page.file;
    const text = edits.get(path) ?? nativeEffectiveSource(page.file);
    if (text === undefined) continue;
    const next = nativePageMovedUrl(text, page.from, page.to, siteUrl);
    if (next !== text) edits.set(path, next);
  }
}

// The Pages tab's label of the page file `file`.
function nativePageLabelOf(file: string) {
  const site = nativeSite;
  const route = nativeRouteForPath(file);
  if (!site || !route) return file;
  return nativePageLabel(file, {
    routes: site.routes,
    titles: { [route]: nativeRouteInfo(route, site).title },
    heading: (path) => firstHeadingText(nativeEffectiveSource(path)),
  }) ?? file;
}

// A page created in the Pages tab, for its undo.
interface NativeCreation {
  kind: "page";
  file: string;
  route: string;
  title: string;
}

// Creates a new page as a new draft; routes are found again, the tree drawn
// and the page opened (the explorer closes). Undo in the editor right after
// takes it back, as Discard changes on the new file does.
async function createNativeNew(request: NativeNewRequest): Promise<string | undefined> {
  const planned = planNativeNew(request);
  if (!planned.ok) return planned.error;
  const plan = planned.value;
  const epoch = generation, scope = setupScope();
  const expectedSources = new Map([...nativeSitePaths(nativeSite!)].map((path) => [path, nativeEffectiveSource(path)] as const));
  // With its card in the grid that lists its siblings: the page made from a sibling's, as one operation.
  if (request.addCard && cards) return cards.createWithCard(request);
  if (request.addToNavigation && request.parent === "/") {
    const problem = await ensureNativeTextIndex();
    if (problem) return problem;
    if (epoch !== generation || scope !== setupScope() || [...expectedSources].some(([path, source]) => nativeEffectiveSource(path) !== source)) return "The page template or repository changed. Create the page again.";
    const nav = nativeNavigationTarget(nativeSite?.routes["/"]);
    if (!nav) return "No editable header navigation found. Uncheck Add to navigation to create only the page.";
    let navigation: string;
    try { navigation = editNavigation(nav.source, nav.list, [...nav.list.links, { href: plan.route, label: plan.title }]); }
    catch (error) { return error instanceof Error ? error.message : "Navigation could not be changed."; }
    // For a plain header, copy its updated navigation to the new page as well.
    let page = plan.content;
    if (!nav.shared) {
      const list = readNavigation(page);
      if (list) page = editNavigation(page, list, [...nav.list.links, { href: plan.route, label: plan.title }]);
    }
    return applyNativeOperation({ expectedSources, creates: [{ path: plan.file, content: page }], edits: new Map([[nav.path, navigation]]), open: plan.file, done: `Created ${plan.title} and added it to navigation as drafts.`, undone: `Undid creating ${plan.title} and adding it to navigation.` });
  }
  return commitNativePage({ file: plan.file, route: plan.route, title: plan.title, content: plan.content, done: `Created the page ${plan.title} at ${plan.route}.` });
}

// A URL with subpages and no page of its own gets its page, `index.html` in
// its folder, made like a new page.
async function createNativeFolderPage(route: string) {
  const site = nativeSite;
  if (!site || !draftScope()) return;
  const file = nativeRouteFile(route);
  // Its page deleted in the drafts: Create page brings it back.
  const scope = draftScope();
  if (scope && draftStore().get(scope, file)?.deleted) { undoFileChanges({ restore: [file] }); return; }
  if (site.routes[route] || nativePathExists(file)) { errorMessage(new Error(`The URL ${route} has a page already.`)); return; }
  const title = routeHeading(route);
  const content = nativePageTemplate(nativeEffectiveSource(site.routes["/"]), title, nativeAddress(route));
  const error = await commitNativePage({ file, route, title, content, done: `Created the page ${title} at ${route}.` });
  if (error) errorMessage(new Error(error));
}

// Writes a new page (a creation or a copy) as a new draft; then routes are
// found again, the trees drawn, the page opened, and Undo right after takes
// it back.
async function commitNativePage(page: {
  file: string;
  route: string;
  title: string;
  content: string;
  done: string;
}): Promise<string | undefined> {
  const scope = draftScope();
  if (!scope) return "Open a repository first.";
  const draft: SavedDraft = { ...scope, version: 1, path: page.file, baseSha: null, original: "", content: page.content, updatedAt: Date.now() };
  draftStore().save(draft);
  const failure = draftStore().error;
  if (failure) {
    draftStore().remove(scope, page.file);
    return failure;
  }
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
  refreshNativeRoutes();
  renderFileTree();
  updateAgentContext();
  const creation: NativeCreation = { kind: "page", file: page.file, route: page.route, title: page.title };
  const epoch = generation;
  await openNewDraft(draft);
  if (epoch === generation && currentPath === page.file)
    editorModule?.recordHistoryAction(page.file, () => undoNativeCreation(creation));
  element("status").textContent = page.done;
  return undefined;
}

// ---- Card grids (src/page-builder/cards.ts, docs/page-builder/cards.md). ----

function mountCards() {
  return createCards({
    site: () => nativeSite,
    source: (path) => nativeEffectiveSource(path),
    isSection: isNativeSectionTag,
    editor: () => editorModule,
    preview: () => nativePreview,
    ensureOpen: async (path) => {
      if (currentPath === path && editorModule?.isMounted(path)) return true;
      const epoch = generation;
      await restoreFile(path, epoch, { linkDefaultStyle: false });
      return epoch === generation && currentPath === path && Boolean(editorModule?.isMounted(path));
    },
    openPage: (file) => void restoreFile(file, generation),
    change: applyNativeChange,
    exists: nativePathExists,
    siteUrl: () => nativeSiteSettings(nativeEffectiveSource(NATIVE_CONFIG_PATH)).url,
    saveNewDraft: (path, content) => {
      const scope = draftScope();
      if (!scope) return "Open a repository first.";
      draftStore().save({ ...scope, version: 1, path, baseSha: null, original: "", content, updatedAt: Date.now() });
      const failure = draftStore().error;
      if (failure) {
        draftStore().remove(scope, path);
        return failure;
      }
      afterFileChanges();
      return undefined;
    },
    dropNewDraft: (path) => {
      const scope = draftScope();
      if (!scope || draftStore().get(scope, path)?.baseSha !== null) return;
      if (!editorModule?.discardNewFile(path)) editorModule?.dropDraft(scope, path);
      afterFileChanges();
    },
    operation: applyNativeOperation,
    pageLabel: nativePageLabelOf,
    announce,
  });
}

// ---- The Pages tab's Rename, Duplicate and Delete. ----

// A page's title in its head, as the Page block's Title field sets it.
async function retitleNativePage(file: string, title: string): Promise<string | undefined> {
  if (!nativeSite || !nativeRouteForPath(file)) return "This page has no URL in the site.";
  const error = await writeNativePageMeta(file, "title", title, false);
  if (error) return error;
  pageStructure?.refreshMeta();
  renderPagesTree();
  updateCurrentPageLabel();
  return undefined;
}

// A copy of a page beside it: `<slug>-copy/index.html` (then `-copy-2`, …),
// its content as it is now, titled "… (copy)".
async function duplicateNativePage(file: string) {
  const site = nativeSite;
  const route = nativeRouteForPath(file);
  if (!site || !route) return;
  const name = route === "/" ? "home" : routeSlug(route).replace(/\.html$/, "");
  const parent = route === "/" ? "/" : parentRoute(route);
  let target: Checked<NativeNewTarget> | undefined;
  for (let n = 1; n < 100; n++) {
    target = nativeNewTarget(parent, `${name}-copy${n > 1 ? `-${n}` : ""}`, { route: (r) => site.routes[r], exists: nativePathExists });
    if (target.ok) break;
  }
  if (!target?.ok) { errorMessage(new Error(target?.error ?? "No name is free for the copy.")); return; }
  const original = nativeEffectiveSource(file);
  if (original === undefined) { errorMessage(new Error("The page could not be read.")); return; }
  const label = nativeRouteInfo(route, site).title?.trim() || (route === "/" ? "Home" : firstHeadingText(original)) || routeHeading(route);
  const title = `${label} (copy)`;
  const error = await commitNativePage({
    file: target.value.file, route: target.value.route, title,
    content: nativePageWithUrl(nativePageWithDetail(original, "title", title), nativeAddress(target.value.route)),
    done: `Duplicated ${label} as ${title} at ${target.value.route}.`,
  });
  if (error) errorMessage(new Error(error));
}

// Delete in the Pages tab. A page with subpages asks whether they go too
// ("Delete About and its 2 subpages", with everything in its folder) or
// stay ("Delete only this page": its folder is then a URL with no page).
async function removeNativePagesTarget(target: NativePagesTarget) {
  const site = nativeSite;
  if (!target.file || !site || !confirmDialog) return;
  const indexed = await ensureNativeTextIndex();
  if (indexed) { errorMessage(new Error(indexed)); return; }
  const files = nativeFiles();
  const folder = isFolderRoute(target.route) ? routeFolder(target.route) : undefined;
  const inside = folder === undefined ? [] : files.filter((path) => path.startsWith(folder) && path !== target.file);
  const everything = [target.file, ...inside];
  const onGitHub = (paths: string[]) => paths.some((path) => nativeBaseFiles.includes(path));
  const links = pageLinks(everything, new Map(), "deleted");
  const saveNote = (paths: string[]) => onGitHub(paths)
    ? "It is removed from GitHub when you save. Until then, Restore brings it back."
    : "It is not on GitHub yet, so this discards it.";
  let paths = [target.file];
  // Its card in a grid listing pages (src/page-builder/cards.ts) can go with it.
  const card = cards?.cardsLinkingTo(target.route, new Set(everything));
  const cardOption = card ? { label: card.label, checked: true } : undefined;
  let removeCard = false;
  if (target.subpages > 0) {
    const count = `${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`;
    const answer = await confirmDialog.choose({
      title: `Delete ${target.label}?`,
      notes: [
        `${target.label} (${target.route}) has ${count}. Delete them too, with everything in ${folder}, or only this page: its subpages then stay at their URLs, under ${target.route} with no page of its own.`,
        ...(links ? [links] : []),
        saveNote(everything),
      ],
      actions: [
        { label: "Delete only this page", value: "only" },
        { label: `Delete ${target.label} and its ${count}`, value: "all" },
      ],
      option: cardOption,
    });
    if (!answer.value) { announce(`Cancelled deleting ${target.label}`); return; }
    if (answer.value === "all") paths = everything;
    removeCard = answer.option;
  } else {
    const question = {
      title: `Delete the page ${target.label} (${target.file})?`,
      notes: [...(links ? [links] : []), ...(inside.length ? [`Everything else in ${folder} goes with it.`] : []), saveNote(everything)],
      action: "Delete",
    };
    const answer = cardOption
      ? await confirmDialog.choose({ ...question, actions: [{ label: question.action, value: "confirm" }], option: cardOption })
      : { value: (await confirmDialog.ask(question)) ? "confirm" : undefined, option: false };
    if (answer.value !== "confirm") { announce(`Cancelled deleting ${target.file}`); return; }
    if (inside.length) paths = everything;
    removeCard = answer.option;
  }
  const parent = parentRoute(target.route);
  const what = paths.length > 1 && target.subpages
    ? `${target.label} and its ${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`
    : `the page ${target.label}`;
  const error = await applyNativeOperation({
    deletes: paths,
    ...(removeCard && card ? { edits: card.edits } : {}),
    done: `Deleted ${what}${removeCard && card ? " and its card" : ""}.`,
    undone: `Undid deleting ${what}.`,
    focus: { route: parent === "/" ? undefined : parent },
  });
  if (error) errorMessage(new Error(error));
}

// ---- Changing a page's URL, Move to… and dragging in the Pages tab. ----

interface NativeUrlChange {
  from: string;
  to: string;
  label: string;
  move: PageMovePlan;
  /** Files whose links change, by the path they have after the move. */
  links: { path: string; from: string; text: string; count: number }[];
  /** Whether every page, template and stylesheet was read (else the count is a lower bound). */
  complete: boolean;
  /** The moved routes on the live site: an old URL to keep working. */
  redirect: string[];
  /** The page itself is on the live site (not new in this browser). */
  live: boolean;
}

// Whether the file is on GitHub at this path (not a new or moved draft).
function onBranchHere(path: string) {
  const scope = draftScope();
  if (!nativeBaseFiles.includes(path)) return false;
  const draft = scope ? draftStore().get(scope, path) : undefined;
  return !draft || (draft.baseSha !== null && !draft.deleted);
}

const UNCHANGED_URL = "That is the page's URL now.";

// Every HTML and CSS file of the site with its text as edited (undefined
// when it was not read): where links to a page are looked for.
function nativeLinkSources(): Record<string, string | undefined> {
  const scope = draftScope();
  const out: Record<string, string | undefined> = {};
  for (const path of nativeFiles(scope)) if (isNativeTextFile(path)) out[path] = nativeEffectiveSource(path, scope);
  return out;
}

// What changing the URL of the page `file` to the typed `value` does: the
// files that move (the page, and for a folder page its whole folder), the
// links that change, the old URLs that could redirect; or why it cannot.
function planNativeUrlChange(file: string, value: string): Checked<NativeUrlChange> {
  const site = nativeSite;
  const from = nativeRouteForPath(file);
  if (!site || !from || !draftScope()) return { ok: false, error: "This page has no URL in the site." };
  const normalized = normalizeRoute(value);
  if (!normalized.ok) return normalized;
  const to = normalized.value;
  if (to === from) return { ok: false, error: UNCHANGED_URL };
  const planned = planPageMove({ files: nativeFiles(), routes: site.routes, from, to });
  if (!planned.ok) return planned;
  const move = planned.value;
  const moved = new Map(move.moves.map((item) => [item.from, item.to]));
  const links: NativeUrlChange["links"] = [];
  let complete = true;
  for (const [path, source] of Object.entries(nativeLinkSources())) {
    if (source === undefined) { complete = false; continue; }
    const rewritten = rewriteRouteLinks(source, from, to);
    if (rewritten.count) links.push({ path: moved.get(path) ?? path, from: path, text: rewritten.text, count: rewritten.count });
  }
  const redirect = move.routes.filter(([route]) => onBranchHere(site.routes[route])).map(([route]) => route);
  return { ok: true, value: { from, to, label: nativePageLabelOf(file), move, links, complete, redirect, live: onBranchHere(file) } };
}

// A change's summary, as the URL field and the confirmation say it.
function describeUrlChange(change: NativeUrlChange) {
  const { move } = change;
  const subpages = move.routes.length - 1;
  const others = move.moves.length - move.routes.length;
  const along = [
    subpages ? `its ${subpages} ${subpages === 1 ? "subpage" : "subpages"}` : "",
    others > 0 ? `${others} other ${others === 1 ? "file" : "files"} in its folder` : "",
  ].filter(Boolean).join(" and ");
  const parts = [`Moves ${move.file} to ${move.target}${along ? ` with ${along}` : ""}`];
  const count = change.links.reduce((sum, item) => sum + item.count, 0);
  const least = change.complete ? "" : "at least ";
  parts.push(count
    ? `updates ${least}${count} ${count === 1 ? "link" : "links"} in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}`
    : change.complete ? "no links to update" : "no links found in the files read");
  return `${parts.join("; ")}.`;
}

function nativeUrlPlan(file: string, value: string): UrlPlan {
  const planned = planNativeUrlChange(file, value);
  if (!planned.ok) return planned.error === UNCHANGED_URL ? { ok: false, error: "", unchanged: true } : planned;
  const change = planned.value;
  return {
    ok: true,
    route: change.to,
    message: describeUrlChange(change),
    warnings: change.move.warnings,
    redirect: change.redirect.length ? { checked: change.live, label: `Keep the old URL working (${change.from} redirects to ${change.to})` } : undefined,
  };
}

// `_redirects` as it is now: its draft, or the branch's file.
async function readNativeRedirects(): Promise<string | undefined> {
  const repo = currentRepo, epoch = generation, scopeKey = setupScope();
  const scope = draftScope();
  const draft = scope ? draftStore().get(scope, NATIVE_REDIRECTS_PATH) : undefined;
  if (draft) return draft.deleted ? undefined : draft.content;
  if (!nativeBaseFiles.includes(NATIVE_REDIRECTS_PATH) || !currentRepo) return undefined;
  const entry = await findEntry(NATIVE_REDIRECTS_PATH);
  if (epoch !== generation || scopeKey !== setupScope() || !repo) throw new Error("The repository changed while reading redirects.");
  return entry ? readFile(repo.full_name, entry.sha) : undefined;
}

// Changes the URL of the page `file` to `value` as one operation, all as
// drafts: the files move (a folder page's whole folder along), every root
// link to the old URL and under it, in every page, template and stylesheet,
// points at the new one, and with `keep` the old URLs redirect there
// (`_redirects`, which is also kept free of chains to the old URLs and of
// redirects away from the new ones). The open page stays open where it
// went. Undo right after takes it all back.
async function changeNativeUrl(file: string, value: string, keep: boolean, openingSources?: Map<string, string | undefined>): Promise<string | undefined> {
  const epoch = generation, scope = setupScope(), paths = JSON.stringify(nativeFiles().sort()), routes = JSON.stringify(nativeSite?.routes);
  const expectedSources = new Map(openingSources ?? Object.entries(nativeLinkSources()).filter(([, source]) => source !== undefined));
  const stale = () => epoch !== generation || scope !== setupScope() || paths !== JSON.stringify(nativeFiles().sort()) || routes !== JSON.stringify(nativeSite?.routes) ||
    [...expectedSources].some(([path, source]) => nativeEffectiveSource(path) !== source);
  const changed = "The repository or source changed while preparing the URL change. Review it and try again.";
  if (stale()) return changed;
  const indexed = await ensureNativeTextIndex();
  if (stale()) return changed;
  if (indexed) return indexed;
  for (const [path, source] of Object.entries(nativeLinkSources())) if (!expectedSources.has(path)) expectedSources.set(path, source);
  expectedSources.set(NATIVE_REDIRECTS_PATH, nativeEffectiveSource(NATIVE_REDIRECTS_PATH));
  const planned = planNativeUrlChange(file, value);
  if (!planned.ok) return planned.error === UNCHANGED_URL ? undefined : planned.error;
  const change = planned.value;
  const edits = new Map(change.links.map((item) => [item.path, item.text]));
  const moved = new Map(change.move.moves.map((item) => [item.from, item.to]));
  withMovedPageUrls(edits, change.move.routes.map(([from, to]) => ({ file: nativeSite!.routes[from], moved: moved.get(nativeSite!.routes[from]), from, to })));
  let redirects: string | undefined;
  try {
    redirects = await readNativeRedirects();
    if (stale()) return changed;
  } catch (error) {
    return error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.`;
  }
  const redirected = keep ? change.redirect : [];
  if (redirects !== undefined || redirected.length) {
    const next = editNativeRedirects(redirects, change.from, change.to, redirected);
    if (next !== (redirects ?? "")) edits.set(NATIVE_REDIRECTS_PATH, next);
  }
  const count = change.links.reduce((sum, item) => sum + item.count, 0);
  const summary = count
    ? `${count} ${count === 1 ? "link" : "links"} updated in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}`
    : "no links to update";
  if (stale()) return changed;
  return applyNativeOperation({
    expectedSources,
    moves: change.move.moves,
    edits,
    done: `URL changed to ${change.to} — ${summary}${redirected.length ? `; ${change.from} redirects there` : ""}.`,
    undone: `Undid changing the URL of ${change.label} to ${change.to}.`,
    focus: { file: change.move.target },
  });
}

// The rows of Move to…: the top level, then every folder URL of the site,
// the page itself, its subpages and where it is now not chosen.
function nativeMoveChoices(target: NativePagesTarget): PagePickerItem[] {
  const site = nativeSite;
  if (!site) return [];
  const tree = buildNativePagesTree({ routes: site.routes, titles: nativeTitles(site), heading: (file) => firstHeadingText(nativeEffectiveSource(file)) });
  const parent = parentRoute(target.route);
  const items: PagePickerItem[] = [{ route: "/", label: "Top level", level: 1, disabled: parent === "/" ? "It is there now." : undefined }];
  const walk = (page: NativePageNode, level: number) => {
    const disabled = isRouteWithin(page.route, target.route) ? "It is this page or one of its subpages."
      : page.route === parent ? "It is there now."
      : !isFolderRoute(page.route) ? "A single-file page has no subpages." : undefined;
    items.push({ route: page.route, label: page.file ? page.label : `${page.label} (no page)`, level, disabled });
    for (const child of page.children) walk(child, level + 1);
  };
  for (const page of tree.children) walk(page, 2);
  return items;
}

// Why a dragged page cannot go under `parent`, said as it is dragged.
function nativeDropProblem(source: NativePagesTarget, parent: string): string | undefined {
  if (!source.file || source.home) return "This page cannot move.";
  if (isRouteWithin(parent, source.route)) return "A page cannot go under itself or its own subpages.";
  if (parent === parentRoute(source.route)) return "It is already there.";
  if (!isFolderRoute(parent)) return "A single-file page has no subpages.";
  const to = movedRoute(parent, source.route);
  const taken = nativeSite?.routes[to];
  return taken ? `The URL ${to} is taken by ${taken}.` : undefined;
}

// Moves a page under `parent` ("/" the top level) after a confirmation that
// says its new URL, what else moves, the links updated, and offers to keep
// the old URL working: Move to… and a drop in the Pages tab.
async function confirmNativeMove(source: NativePagesTarget, parent: string) {
  if (!source.file || !confirmDialog) return;
  const indexed = await ensureNativeTextIndex();
  if (indexed) { announce(indexed); errorMessage(new Error(indexed)); return; }
  const to = movedRoute(parent, source.route);
  const planned = planNativeUrlChange(source.file, to);
  if (!planned.ok) { announce(planned.error); errorMessage(new Error(planned.error)); return; }
  const change = planned.value;
  const answer = await confirmDialog.choose({
    title: `Move ${change.label} to ${to}?`,
    notes: [`Its URL changes from ${change.from} to ${to}.`, describeUrlChange(change), ...change.move.warnings],
    actions: [{ label: "Move", value: "move" }],
    option: change.redirect.length ? { label: `Keep the old URL working (${change.from} redirects to ${to})`, checked: change.live } : undefined,
  });
  if (!answer.value) { announce(`Cancelled moving ${change.label}`); return; }
  const error = await changeNativeUrl(source.file, to, answer.option);
  if (error) errorMessage(new Error(error));
}

async function moveNativePageTo(target: NativePagesTarget) {
  if (!pagePicker || !target.file) return;
  const parent = await pagePicker.pick({ title: `Move ${target.label} to…`, items: nativeMoveChoices(target) });
  if (parent === undefined) { announce(`Cancelled moving ${target.label}`); return; }
  await confirmNativeMove(target, parent);
}

// ---- One undoable operation over several files. ----

interface NativeOperation {
  /** Exact sources used to plan this operation, including unchanged inputs. */
  expectedSources?: Map<string, string | undefined>;
  moves?: FileMove[];
  deletes?: string[];
  /** New files. */
  creates?: { path: string; content: string }[];
  /** New text for files (by the path they have after the moves). */
  edits?: Map<string, string>;
  /** The file to open after; else the open file where it went (the home page when it went). */
  open?: string;
  done: string;
  undone: string;
  /** The Pages tab's row to show and focus after, when it is open. */
  focus?: { file?: string; route?: string };
}

interface NativeOperationRecord {
  scope: NonNullable<ReturnType<typeof draftScope>>;
  epoch: number;
  /** Every path it touched, as its draft was before (none: no draft). */
  before: Map<string, SavedDraft | undefined>;
  /** The file open before. */
  opened?: string;
  undone: string;
}

// A branch file's blob and text, for a draft of an edit to it.
async function branchText(path: string): Promise<{ sha: string; text: string } | undefined> {
  if (!currentRepo) return undefined;
  const entry = await findEntry(path);
  if (!entry) return undefined;
  const text = nativeBaseSources.get(path) ?? await readFile(currentRepo.full_name, entry.sha);
  return { sha: entry.sha, text };
}

/**
 * Moves, deletes, creates and edits files as one operation: drafts written, routes found again,
 * the trees drawn, the file that was open open where it went. Undo in the
 * open file's editor right after puts every draft back as it was. Resolves
 * to an error message, or nothing.
 */
async function applyNativeOperation(op: NativeOperation): Promise<string | undefined> {
  const scope = draftScope();
  if (!scope || !currentRepo) return "Open a repository first.";
  const store = draftStore();
  const epoch = generation, scopeKey = setupScope();
  const moves = op.moves ?? [];
  const deletes = op.deletes ?? [];
  const creates = op.creates ?? [];
  let edits = op.edits ?? new Map<string, string>();
  let done = op.done;
  // An agent's operation, as expanded (the moves of a folder, the links rewritten in other files, the
  // redirects), never reaches .github: a protected file in the moves, deletes or creations refuses it,
  // and link rewrites in protected files are left out.
  if (agentActingDepth > 0) {
    const protectedPath = [...moves.flatMap((move) => [move.from, move.to]), ...deletes, ...creates.map((file) => file.path)].find(touchesGithubConfig);
    if (protectedPath) return GITHUB_CONFIG_REFUSED;
    const { kept, left } = splitProtectedEdits(edits);
    if (left.length) {
      edits = kept;
      done += ` (${left.length} ${left.length === 1 ? "file" : "files"} in .github left unchanged.)`;
    }
  }
  const expectedSources = new Map(op.expectedSources ?? []);
  for (const path of [...moves.flatMap((move) => [move.from, move.to]), ...deletes, ...creates.map((file) => file.path), ...edits.keys()])
    if (!expectedSources.has(path)) expectedSources.set(path, nativeEffectiveSource(path));
  const staleOperation = () => epoch !== generation || scopeKey !== setupScope() ||
    [...expectedSources].some(([path, source]) => nativeEffectiveSource(path) !== source);
  const changedOperation = "The repository or source changed meanwhile. Review the latest files and try again.";
  if (staleOperation()) return changedOperation;
  // The files moved and deleted, with their blobs and text; the base of each file edited.
  const movable = new Map<string, MovableFile>();
  const bases = new Map<string, { sha: string; text: string } | undefined>();
  try {
    const vacated = new Set([...moves.map((move) => move.from), ...deletes]);
    const createdPaths = new Set<string>();
    for (const file of creates) {
      if (createdPaths.has(file.path)) return `${file.path} is created twice. No files were changed.`;
      createdPaths.add(file.path);
      if (!vacated.has(file.path) && (nativePathExists(file.path) || await findEntry(file.path))) return `${file.path} already exists. No files were changed.`;
      if (staleOperation()) return changedOperation;
    }
    for (const path of [...moves.map((move) => move.from), ...deletes]) {
      const [found] = await targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true);
      if (staleOperation()) return changedOperation;
      if (!found) return `${path} is not there any more.`;
      movable.set(path, found);
    }
    const arriving = new Set([...moves.map((move) => move.to), ...creates.map((file) => file.path)]);
    for (const path of edits.keys()) {
      if (!arriving.has(path) && !store.get(scope, path)) bases.set(path, await branchText(path));
      if (staleOperation()) return changedOperation;
    }
  } catch (error) {
    return error instanceof Error ? error.message : "The files could not be read.";
  }
  if (staleOperation()) return changedOperation;

  const touched = new Set<string>([...moves.flatMap((move) => [move.from, move.to]), ...deletes, ...creates.map((file) => file.path), ...edits.keys()]);
  for (const path of [...touched]) {
    const from = store.get(scope, path)?.movedFrom;
    if (from) touched.add(from);
  }
  const before = new Map([...touched].map((path) => [path, store.get(scope, path)] as const));
  const record: NativeOperationRecord = { scope: { ...scope }, epoch, before, opened: currentPath, undone: op.undone };
  const opened = releaseFiles(touched);

  const now = Date.now();
  for (const move of moves) moveFile(store, scope, movable.get(move.from)!, move.to, now);
  for (const path of deletes) deleteFile(store, scope, movable.get(path)!, now);
  for (const file of creates) store.save({ ...scope, version: 1, path: file.path, baseSha: null, original: "", content: file.content, updatedAt: now });
  for (const [path, text] of edits) {
    const draft = store.get(scope, path);
    const base = bases.get(path);
    // An edit back to GitHub's text leaves no draft.
    if (draft && !draft.deleted && draft.baseSha !== null && !draft.movedFrom && text === draft.original) store.remove(scope, path);
    else if (draft && !draft.deleted) store.save({ ...draft, content: text, updatedAt: now });
    else if (base && text === base.text) continue;
    else if (draft?.deleted) store.save({ ...scope, version: 1, path, baseSha: draft.baseSha, original: draft.original, content: text, updatedAt: now });
    else if (base) store.save({ ...scope, version: 1, path, baseSha: base.sha, original: base.text, content: text, updatedAt: now });
    else store.save({ ...scope, version: 1, path, baseSha: null, original: "", content: text, updatedAt: now });
  }
  const failure = store.error;
  if (failure) {
    for (const [path, draft] of before) draft ? store.save(draft) : store.remove(scope, path);
    afterFileChanges();
    await openAfter(opened, true);
    return failure;
  }
  afterFileChanges();
  const moved = new Map(moves.map((move) => [move.from, move.to]));
  const next = op.open ?? (opened ? (moved.get(opened) ?? (deletes.includes(opened) ? undefined : opened)) : undefined);
  if (op.open || opened) await openAfter(next, !op.open);
  if (epoch !== generation || scopeKey !== setupScope()) return undefined;
  // Undo in the open file's editor takes the whole operation back.
  if (currentPath && editorModule?.isMounted(currentPath)) editorModule.recordHistoryAction(currentPath, () => undoNativeOperation(record));
  if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree(op.focus ?? {});
  announce(done);
  return undefined;
}

async function undoNativeOperation(record: NativeOperationRecord) {
  const scope = record.scope;
  const current = draftScope();
  if (!current || record.epoch !== generation || current.account !== scope.account || current.repoId !== scope.repoId || current.branch !== scope.branch) return;
  const store = draftStore();
  releaseFiles(new Set(record.before.keys()));
  if (currentPath && !record.before.has(currentPath)) releaseFiles(new Set([currentPath]));
  for (const [path, draft] of record.before) draft ? store.save(draft) : store.remove(scope, path);
  afterFileChanges();
  await openAfter(record.opened, true);
  if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree(record.opened ? { file: record.opened } : undefined);
  announce(record.undone);
}

// Undo right after a creation: the new file is discarded. Nothing is undone
// once the page is on GitHub.
function undoNativeCreation(creation: NativeCreation) {
  const scope = draftScope();
  const what = `${creation.kind} ${creation.title}`;
  if (!scope || draftStore().get(scope, creation.file)?.baseSha !== null) {
    element("status").textContent = `The ${what} is saved to GitHub; it is not undone.`;
    return;
  }
  if (!editorModule?.discardNewFile(creation.file)) {
    editorModule?.dropDraft(scope, creation.file);
    discardedNewPages([creation.file]);
  }
  element("status").textContent = `Undid creating the ${what}.`;
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
  if (!scope || !snapshot) return { ok: false, error: "Open a repository first." };
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
  if (!snapshot || snapshot.tree || !currentRepo) return undefined;
  let entries = snapshot.entries;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const entry = entries.find((entry) => entry.path === parts[index]);
    if (!entry) return undefined;
    const at = parts.slice(0, index + 1).join("/");
    if (index === parts.length - 1) return `${at} already exists on GitHub.`;
    if (entry.type !== "tree") return `${at} is a file, so nothing can go in it.`;
    let listing = folderListings.get(entry.sha);
    if (!listing) {
      listing = (await api<Directory>("tree", { repo: currentRepo.full_name, sha: entry.sha })).entries;
      folderListings.set(entry.sha, listing);
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
  commitHistory?.refresh();
  if (nativeSite) refreshNativeRoutes();
  updateAgentContext();
  if (resyncNativeSite()) return undefined;
  if (creation.folder) {
    // The new folder shows open in the tree, with the dialog's focus returned to it.
    const parts = creation.folder.split("/");
    parts.forEach((_, index) => openFolders.add(parts.slice(0, index + 1).join("/")));
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
  if (!snapshot) return;
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

// The change marker a tree row carries: the letter shown, the word read.
function statusMarker(kind: ChangeKind) {
  // A new file's name says New, as before; the other kinds are in the row's
  // description (the row's title says each in words).
  const marker = node("span", `file-status is-${kind}`);
  const letter = node("span", "", kind);
  letter.setAttribute("aria-hidden", "true");
  marker.append(letter);
  if (kind === "A") marker.append(node("span", "sr-only", "New"));
  else marker.setAttribute("aria-hidden", "true");
  return marker;
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
  if (change && !target.folder) items.push({ label: "Discard changes", run: () => void discardOneFile(target.path) });
  items.push(
    { label: "Delete", shortcut: "Delete", run: () => void deleteFileTarget(target) },
    { label: "Copy path", run: () => void copyFilePath(target.path) },
  );
  return items;
}

// New file… and New folder… from a folder's menu: the + dialog, that kind chosen.
function openCreateKind(folder: string, kind: CreateKind) {
  if (!snapshot) return;
  const opener = fileRow(folder) ?? element<HTMLButtonElement>("new-at-root");
  createDialog?.open({ in: folder, kinds: ["file", "folder"], first: kind, opener });
}

async function copyFilePath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
    announce(`Copied ${path}`);
  } catch {
    announce(`The path could not be copied: ${path}`);
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
  const inside = snapshot?.tree
    ? snapshot.tree.filter((item) => item.type !== "tree" && item.path.startsWith(prefix)).map((item) => item.path)
    : nativeBaseFiles.filter((file) => file.startsWith(prefix));
  if (inside.some((file) => !state.deleted.has(file))) return "folder";
  if (inside.length) return "deleted";
  return entry?.type === "tree" ? "folder" : undefined;
}

// The protected file a target takes: the home page.
function protectedProblem(target: FileRowTarget, operation: FileOperation) {
  const home = nativeEngaged ? NATIVE_HOME_PAGE : undefined;
  const inside = (path: string | undefined) => path !== undefined && (path === target.path || (target.folder && path.startsWith(`${target.path}/`)));
  return protectedPathProblem([home].filter(inside) as string[], operation, home, nativeEngaged);
}

// Why `source` cannot be renamed or moved to `to`, as known without asking GitHub.
function moveProblem(source: FileRowTarget, to: string, operation: FileOperation): string | undefined {
  if (to === source.path) return undefined;
  const guarded = protectedProblem(source, operation);
  if (guarded) return guarded;
  if (source.folder && to.startsWith(`${source.path}/`)) return `A folder cannot go inside itself.`;
  const state = treeState();
  const now = pathNow(to, state);
  if (now === "file" || now === "folder") return `${to} already exists.`;
  if (now === "deleted") {
    // Only what was renamed away from there may go back.
    const back = source.folder
      ? [...state.deleted.values()].filter((draft) => draft.path.startsWith(`${to}/`)).every((draft) => draft.movedTo?.startsWith(`${source.path}/`))
      : state.deleted.get(to)?.movedTo === source.path;
    if (!back) return `${to} is deleted in your changes. Restore it, or choose another name.`;
  }
  const parts = to.split("/");
  for (let index = 1; index < parts.length; index++) {
    const parent = parts.slice(0, index).join("/");
    if (pathNow(parent, state) === "file") return `${parent} is a file, so nothing can go in it.`;
  }
  return undefined;
}

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
  if (!snapshot || !currentRepo) return [];
  if (snapshot.tree) return snapshot.tree.filter((entry) => entry.type !== "tree" && entry.path.startsWith(`${folder}/`));
  let entries = snapshot.entries;
  let entry: TreeEntry | undefined;
  for (const part of folder.split("/")) {
    entry = entries.find((item) => item.path === part);
    if (!entry || entry.type !== "tree") return [];
    entries = (await api<Directory>("tree", { repo: currentRepo.full_name, sha: entry.sha })).entries;
  }
  if (!entry) return [];
  const listed = await api<Directory>("tree", { repo: currentRepo.full_name, sha: entry.sha, recursive: "1" });
  return listed.entries.filter((item) => item.type !== "tree").map((item) => ({ ...item, path: `${folder}/${item.path}` }));
}

const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|tar|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|webm|mov|wav|ogg)$/i;

// The files a target takes: its branch files not deleted in the drafts and
// its new ones; with `withText`, the text of each branch file that has no
// draft (a binary or large one goes as its blob).
async function targetFiles(target: FileRowTarget, withText: boolean): Promise<MovableFile[]> {
  const state = treeState();
  const scope = draftScope();
  if (!scope || !currentRepo) return [];
  const branch = target.folder ? await branchFilesUnder(target.path) : await (async () => {
    const entry = await findEntry(target.path);
    return entry ? [{ ...entry, path: target.path }] : [];
  })();
  const odd = branch.find((entry) => entry.type === "commit" || entry.mode === "120000");
  if (odd) throw new Error(`${odd.path} is a ${odd.type === "commit" ? "submodule" : "symbolic link"}; change it on GitHub.`);
  const live = branch.filter((entry) => !state.deleted.has(entry.path));
  const out: MovableFile[] = live.map((entry) => ({ path: entry.path, sha: entry.sha, mode: entry.mode }));
  const known = new Set(out.map((file) => file.path));
  for (const path of state.drafted)
    if (!known.has(path) && (target.folder ? path.startsWith(`${target.path}/`) : path === target.path)) out.push({ path });
  if (!withText) return out;
  const wanted = live.filter((entry) => !draftStore().get(scope, entry.path) && (entry.size ?? 0) <= 1024 * 1024 && !BINARY_FILE.test(entry.path));
  const texts = new Map<string, string>();
  for (const entry of wanted) {
    const loaded = nativeBaseSources.get(entry.path);
    if (loaded !== undefined) texts.set(entry.sha, loaded);
  }
  const unread = wanted.filter((entry) => !texts.has(entry.sha));
  if (unread.length) {
    try {
      const read = await readFiles(currentRepo.full_name, unread.map((entry) => entry.sha));
      for (const [sha, text] of Object.entries(read)) texts.set(sha, text);
    } catch {
      // One unreadable file (binary, not UTF-8) fails the batch: read each alone.
      const results = await Promise.allSettled(unread.map((entry) => readFile(currentRepo!.full_name, entry.sha)));
      results.forEach((result, index) => { if (result.status === "fulfilled") texts.set(unread[index].sha, result.value); });
    }
  }
  for (const file of out) if (file.sha && texts.has(file.sha)) file.text = texts.get(file.sha);
  return out;
}

// For a confirmation: the pages, components and stylesheets that link to
// the pages among `paths` whose URL goes away.
function pageLinks(paths: string[], moves: Map<string, string | undefined>, action: "deleted" | "moved") {
  if (!nativeSite) return undefined;
  const routes = paths.flatMap((path) => {
    const route = nativeRouteForPath(path);
    if (!route) return [];
    const to = moves.get(path);
    return to && (nativeRouteForPath(to) ?? nativePageRoute(to)) === route ? [] : [route];
  });
  if (!routes.length) return undefined;
  return linkNote(filesLinkingTo(nativeLinkSources(), routes, new Set(paths)), routes, action);
}

interface FileOperationRecord {
  /** The drafts of every path it touched, as they were before. */
  before: Map<string, SavedDraft | undefined>;
  moves: { from: string; to?: string }[];
  /** The file open before, and where it went. */
  opened?: { from: string; to?: string };
}

// Closes what shows the files among `paths` (the editor, the style pane) and
// forgets the models kept for them. Returns the open file when it is one.
function releaseFiles(paths: Set<string>) {
  const scope = draftScope();
  const open = currentPath && paths.has(currentPath) ? currentPath : undefined;
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
  if (!scope || !snapshot) return false;
  const home = draftStore().get(scope, NATIVE_HOME_PAGE);
  const drafted = Boolean(home && home.baseSha === null && !home.deleted);
  const committed = snapshot.entries.some((entry) => entry.path === NATIVE_HOME_PAGE && entry.type === "blob");
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
  commitHistory?.refresh();
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
async function openAfter(path: string | undefined, keepExplorer?: boolean) {
  const epoch = generation;
  const scope = draftScope();
  const draft = path && scope ? draftStore().get(scope, path) : undefined;
  const keep = { keepExplorer: keepExplorer ?? false };
  if (draft && draft.baseSha === null && !draft.deleted) await openNewDraft(draft, { keepExplorer: keepExplorer ?? true });
  else if (path && !draft?.deleted) await restoreFile(path, epoch, keep);
  else if (nativeSite?.routes["/"]) await restoreFile(nativeSite.routes["/"], epoch, keep);
  else if (snapshot) showDirectory(snapshot);
}

/**
 * Renames, moves (`to`) or deletes (no `to`) files as one operation: the
 * drafts, routes found again, the trees drawn, and the open file kept open
 * where it went (or the home page opened when it is gone). Resolves to an
 * error message, or nothing.
 */
async function applyFileOperation(ops: { file: MovableFile; to?: string }[]): Promise<string | undefined> {
  const scope = draftScope();
  if (!scope || !ops.length) return "Open a repository first.";
  const store = draftStore();
  const moves = ops.map((op) => (op.to ? { from: op.file.path, to: op.to } : { from: op.file.path }));
  const before = new Map<string, SavedDraft | undefined>();
  const remember = (path: string) => { if (!before.has(path)) before.set(path, store.get(scope, path)); };
  for (const op of ops) {
    remember(op.file.path);
    if (op.to) remember(op.to);
    const from = store.get(scope, op.file.path)?.movedFrom;
    if (from) remember(from);
  }
  const opened = releaseFiles(new Set(ops.map((op) => op.file.path)));
  for (const op of ops) {
    if (op.to) moveFile(store, scope, op.file, op.to);
    else deleteFile(store, scope, op.file);
  }
  const failure = store.error;
  if (failure) {
    for (const [path, draft] of before) draft ? store.save(draft) : store.remove(scope, path);
    afterFileChanges();
    await openAfter(opened);
    return failure;
  }
  afterFileChanges();
  const record: FileOperationRecord = { before, moves };
  if (opened) {
    const to = ops.find((op) => op.file.path === opened)?.to;
    record.opened = { from: opened, to };
    await openAfter(to);
  }
  // Undo in the open file's editor takes the whole operation back.
  if (currentPath && editorModule?.isMounted(currentPath)) editorModule.recordHistoryAction(currentPath, () => undoFileOperation(record));
  return undefined;
}

// Undo right after an operation: the drafts as they were, and the file that
// was open open again.
async function undoFileOperation(record: FileOperationRecord) {
  const scope = draftScope();
  if (!scope) return;
  const store = draftStore();
  const opened = releaseFiles(new Set([...record.before.keys()]));
  for (const [path, draft] of record.before) draft ? store.save(draft) : store.remove(scope, path);
  afterFileChanges();
  const back = record.opened?.from ?? (opened && record.moves.find((move) => move.to === opened)?.from) ?? opened;
  if (back) await openAfter(back);
  announce(`Undid ${describeMoves(record.moves)}.`);
}

function describeMoves(moves: { from: string; to?: string }[]) {
  if (moves.length !== 1) return moves.some((move) => move.to) ? `moving ${moves.length} files` : `deleting ${moves.length} files`;
  const [move] = moves;
  if (!move.to) return `deleting ${move.from}`;
  return parentOf(move.from) === parentOf(move.to) ? `renaming ${move.from} to ${move.to}` : `moving ${move.from} to ${move.to}`;
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

function restoreFileTarget(target: FileRowTarget) {
  const state = treeState();
  const paths = target.folder
    ? [...state.deleted.keys()].filter((path) => path.startsWith(`${target.path}/`))
    : [target.path];
  undoFileChanges({ restore: paths });
  requestAnimationFrame(() => fileRow(target.path)?.focus());
}

// A change's Restore (a deletion), Move back (a rename) or Discard (an edit, a new file) in the Save panel.
function discardFileChange(change: FileChange) {
  if (change.kind === "A" && change.drafts[0]?.upload) discardUpload(change.path);
  else if (change.kind === "D") undoFileChanges({ restore: [change.path] });
  else if (change.kind === "R") undoFileChanges({ moveBack: [change.path] });
  else if (discardDrafts([change.path])) announce(`Discarded the changes to ${change.path}.`);
}

/**
 * Drops the drafts of `paths`, each with the other half of its rename, or
 * every draft of the branch: the files are GitHub's again. The open file
 * and the style pane close when among them, and the open file opens again
 * as GitHub has it (a new page's parent page, a renamed file at its old
 * path). Returns how many drafts went.
 */
function discardDrafts(paths?: string[]): number {
  const scope = draftScope();
  if (!scope) return 0;
  const store = draftStore();
  const all = store.list(scope);
  const chosen = new Set(paths ?? all.map((draft) => draft.path));
  for (const draft of all) {
    if (!chosen.has(draft.path)) continue;
    if (draft.movedFrom && store.get(scope, draft.movedFrom)?.movedTo === draft.path) chosen.add(draft.movedFrom);
    if (draft.movedTo && store.get(scope, draft.movedTo)?.movedFrom === draft.path) chosen.add(draft.movedTo);
  }
  const openDraft = currentPath && chosen.has(currentPath) ? store.get(scope, currentPath) : undefined;
  const styled = Boolean(secondaryPath && chosen.has(secondaryPath));
  const opened = releaseFiles(chosen);
  let count = 0;
  for (const path of chosen) {
    if (!store.get(scope, path)) continue;
    // The model kept for the file goes with its draft.
    if (!editorModule?.dropDraft(scope, path)) store.remove(scope, path);
    deletedUpstream.delete(path);
    count++;
  }
  // Undo would replay edits into files that are GitHub's again.
  editorModule?.clearHistory();
  afterFileChanges();
  // The new site's home page was discarded: the project opens again as site-less.
  if (resyncNativeSite()) return count;
  if (nativeModeActive()) updateNativePreviewSources();
  if (opened) {
    const back = openDraft?.movedFrom && chosen.has(openDraft.movedFrom) ? openDraft.movedFrom
      : openDraft?.baseSha === null ? nativeFallbackPage(opened) : opened;
    void openAfter(back);
  } else if (styled && currentPath && nativeModeActive()) {
    // The open page stays; its stylesheet opens again as GitHub has it.
    if (nativeComponentTagForPath(currentPath)) void openComponentLinkedStyle(currentPath);
    else void openDefaultLinkedStyle(currentPath);
  }
  return count;
}

// Discard changes on one file (its row menu in Pages & files).
async function discardOneFile(path: string) {
  const change = treeState().changes.get(path);
  if (!change) return;
  const asked = await confirmDialog?.ask({
    title: `Discard the changes to ${change.from ? `${change.from} → ${path}` : path}?`,
    notes: [change.kind === "A" ? "It is not on GitHub yet, so this removes it." : "It goes back to GitHub's version. This cannot be undone."],
    action: "Discard",
  });
  if (!asked) return;
  discardDrafts([path]);
  announce(`Discarded the changes to ${path}.`);
}

// Discard changes in the top bar: every draft of the branch, after a question naming them.
async function discardAllChanges() {
  const scope = draftScope();
  if (!scope || !discardDialog) return;
  const changes = listChanges(draftStore().list(scope));
  if (!changes.length) return;
  const n = changes.length;
  const names = changes.map((change) => (change.from ? `${change.from} → ${change.path}` : change.path));
  const shown = names.length > 12 ? `${names.slice(0, 10).join(", ")} and ${names.length - 10} more` : names.join(", ");
  const words = `${n} unsaved ${n === 1 ? "change" : "changes"}`;
  const asked = await discardDialog.ask({
    title: `Discard ${words}?`,
    notes: [shown, `Every file goes back to GitHub's version on ${scope.branch}, including changes agents made. This cannot be undone.`],
    action: "Discard all",
  });
  if (!asked || draftScope()?.branch !== scope.branch) return;
  discardDrafts();
  announce(`Discarded ${words}.`);
}

// Drafts of files GitHub deleted since they began, found when a snapshot
// loads (src/file-changes.ts): a deletion is dropped, an edit waits in Save
// to GitHub and the code editor for Discard draft or Keep as new file.
// Drafts that are GitHub's version now (a merge, a save elsewhere, an agent
// writing the same text) are no change and go too, compared by blob SHA.
async function findDeletedUpstream(epoch: number) {
  deletedUpstream = new Set();
  const scope = draftScope();
  if (!scope) return;
  const all = draftStore().list(scope);
  const drafts = all.filter((draft) => draft.baseSha !== null);
  const missing = new Set<string>();
  const entries = new Map<string, TreeEntry | undefined>();
  try {
    // New files are looked for only when the whole tree is at hand.
    for (const draft of snapshot?.tree ? all : drafts) {
      const entry = await findEntry(draft.path);
      if (epoch !== generation) return;
      entries.set(draft.path, entry);
      if (!entry && draft.baseSha !== null) missing.add(draft.path);
    }
  } catch {
    // Unknown: a save reports it instead.
    return;
  }
  deletedUpstream = new Set(settleDeletedUpstream(draftStore(), scope, drafts, missing));
  const left = draftStore().list(scope).filter((draft) => entries.has(draft.path) && !deletedUpstream.has(draft.path));
  const dropped = await pruneUnchanged(draftStore(), scope, left, (path) => entries.get(path)).catch(() => []);
  if (epoch !== generation || !dropped.length) return;
  for (const path of dropped) editorModule?.forgetDraftModel(scope, path);
  editorModule?.refreshDrafts();
}

// Discard draft (`keep` false) or Keep as new file, for an edit of a file
// GitHub deleted.
function settleDeletedDraft(path: string, keep: boolean) {
  const scope = draftScope();
  if (!scope) return;
  const opened = releaseFiles(new Set([path]));
  if (keep) keepAsNewFile(draftStore(), scope, path);
  else draftStore().remove(scope, path);
  deletedUpstream.delete(path);
  afterFileChanges();
  if (opened) void openAfter(keep ? path : undefined);
  announce(keep ? `Kept ${path} as a new file. Saving creates it again.` : `Discarded the draft of ${path}.`);
}

async function renameFileTarget(target: FileRowTarget, name: string): Promise<string | undefined> {
  const to = renamedPath(parentOf(target.path), name, target.folder ? "folder" : "file");
  if (!to.ok) return to.error;
  return moveFileTarget(target, to.value, "rename");
}

async function dropFileTarget(source: FileRowTarget, folder: string) {
  const problem = dropProblem(source, folder);
  if (problem) { announce(problem); return; }
  const error = await moveFileTarget(source, folder ? `${folder}/${source.name}` : source.name, "move");
  if (error) errorMessage(new Error(error));
}

// Renames or moves a file or folder to `to`: the pages among them that other
// pages link to are named in a confirmation first.
async function moveFileTarget(source: FileRowTarget, to: string, operation: "rename" | "move"): Promise<string | undefined> {
  const problem = moveProblem(source, to, operation);
  if (problem) return problem;
  if (to === source.path) return undefined;
  const indexed = await ensureNativeTextIndex();
  if (indexed) return indexed;
  const epoch = generation;
  let found: MovableFile[];
  try {
    const taken = await branchPathProblem(to);
    if (taken) return taken;
    found = await targetFiles(source, true);
  } catch (error) {
    return error instanceof Error ? error.message : "The files could not be read.";
  }
  if (epoch !== generation) return "The repository changed meanwhile. Try again.";
  if (!found.length) return `${source.path} has no files to ${operation}.`;
  const ops = found.map((file) => ({ file, to: movedPath(file.path, source.path, to) }));
  // Pages whose URL changes: their links are updated, as Change URL does.
  const urls = planFileMoveUrls(ops);
  if (urls && confirmDialog) return moveFilesWithUrls(source, to, operation, ops, urls);
  const links = pageLinks(found.map((file) => file.path), new Map(ops.map((op) => [op.file.path, op.to])), "moved");
  if (links && confirmDialog) {
    const verb = operation === "rename" ? "Rename" : "Move";
    const ok = await confirmDialog.ask({
      title: `${verb} ${source.path} to ${to}?`,
      notes: [`Its URL changes. ${links}`],
      action: verb,
    });
    if (!ok) { announce(`Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`); return undefined; }
  }
  const error = await applyFileOperation(ops);
  if (error) return error;
  const what = source.folder ? `the folder ${source.path}` : source.path;
  announce(operation === "rename" ? `Renamed ${what} to ${to}.` : `Moved ${what} to ${parentOf(to) || "the top of the repository"}.`);
  requestAnimationFrame(() => {
    for (let part = parentOf(to); part; part = parentOf(part)) openFolders.add(part);
    if (!fileRow(to)) renderFileTree();
    if (explorerDropdown?.isOpen() && explorerTab === "files") fileRow(to)?.focus();
  });
  return undefined;
}

// What a Files-tab rename or move does to the site's URLs: each page among
// the files whose route is different where it lands (a page moved with all
// its subpages is one change of the subtree), the links that then point at
// the new URLs, and the old URLs on GitHub that could redirect. Undefined
// when no page's URL changes.
interface FileMoveUrls {
  changes: RouteChange[];
  links: { path: string; text: string; count: number }[];
  complete: boolean;
  /** Per change, the old URLs on GitHub to keep working. */
  redirect: Map<RouteChange, string[]>;
  live: boolean;
  /** Pages among the files that stop being pages (their links lead nowhere). */
  gone: string[];
  /** Pages whose URL changes: the file, where it goes, its old and new URL. */
  pages: { file: string; moved: string; from: string; to: string }[];
}
function planFileMoveUrls(ops: { file: MovableFile; to: string }[]): FileMoveUrls | undefined {
  const site = nativeSite;
  if (!site) return undefined;
  const moved = new Map(ops.map((op) => [op.file.path, op.to]));
  const files = nativeFiles().map((path) => moved.get(path) ?? path);
  const after = resolveNativeProject(files);
  if (!after.ok) return undefined;
  const routeOf = new Map(Object.entries(after.site.routes).map(([route, file]) => [file, route]));
  const pairs: [string, string][] = [];
  const gone: string[] = [];
  const pages: FileMoveUrls["pages"] = [];
  for (const [route, file] of Object.entries(site.routes)) {
    const to = moved.get(file);
    if (!to) continue;
    const next = routeOf.get(to);
    if (!next) gone.push(file);
    else if (next !== route) {
      pairs.push([route, next]);
      pages.push({ file, moved: to, from: route, to: next });
    }
  }
  if (!pairs.length) return undefined;
  const changes = groupRouteChanges(Object.keys(site.routes), pairs);
  const links: FileMoveUrls["links"] = [];
  let complete = true;
  for (const [path, source] of Object.entries(nativeLinkSources())) {
    let text = source;
    if (text === undefined) { complete = false; continue; }
    let count = 0;
    for (const change of changes) {
      const rewritten = rewriteRouteLinks(text, change.from, change.to, change.subtree);
      count += rewritten.count;
      text = rewritten.text;
    }
    if (count) links.push({ path: moved.get(path) ?? path, text, count });
  }
  const redirect = new Map<RouteChange, string[]>();
  for (const change of changes) {
    const routes = change.subtree ? Object.keys(site.routes).filter((route) => isRouteWithin(route, change.from)) : [change.from];
    redirect.set(change, routes.filter((route) => pairs.some(([from]) => from === route) && onBranchHere(site.routes[route])));
  }
  const live = pairs.some(([route]) => onBranchHere(site.routes[route]));
  return { changes, links, complete, redirect, live, gone, pages };
}

// A Files-tab rename or move that changes pages' URLs: a confirmation that
// says the new URLs and the links updated, with Keep the old URL working;
// then one operation (the files, the links, `_redirects`) that Undo takes
// back.
async function moveFilesWithUrls(source: FileRowTarget, to: string, operation: "rename" | "move", ops: { file: MovableFile; to: string }[], urls: FileMoveUrls): Promise<string | undefined> {
  const verb = operation === "rename" ? "Rename" : "Move";
  const [first] = urls.changes;
  const single = urls.changes.length === 1;
  const count = urls.links.reduce((sum, item) => sum + item.count, 0);
  const least = urls.complete ? "" : "at least ";
  const linkText = count
    ? `Updates ${least}${count} ${count === 1 ? "link" : "links"} in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}.`
    : urls.complete ? "No links to update." : "No links found in the pages read.";
  const redirected = [...urls.redirect.values()].flat();
  const gone = urls.gone.length ? pageLinks(urls.gone, new Map(), "moved") : undefined;
  const answer = await confirmDialog!.choose({
    title: `${verb} ${source.path} to ${to}?`,
    notes: [
      single ? `Its URL changes from ${first.from} to ${first.to}.` : `URLs change: ${urls.changes.map((change) => `${change.from} → ${change.to}`).join(", ")}.`,
      linkText,
      ...(gone ? [gone] : []),
    ],
    actions: [{ label: verb, value: "go" }],
    option: redirected.length
      ? { label: single ? `Keep the old URL working (${first.from} redirects to ${first.to})` : "Keep the old URLs working (they redirect to the new ones)", checked: urls.live }
      : undefined,
  });
  if (!answer.value) { announce(`Cancelled ${operation === "rename" ? "renaming" : "moving"} ${source.path}`); return undefined; }
  const edits = new Map(urls.links.map((item) => [item.path, item.text]));
  withMovedPageUrls(edits, urls.pages);
  let redirects: string | undefined;
  try {
    redirects = await readNativeRedirects();
  } catch (error) {
    return error instanceof Error ? error.message : `${NATIVE_REDIRECTS_PATH} could not be read.`;
  }
  if (redirects !== undefined || (answer.option && redirected.length)) {
    let next = redirects ?? "";
    for (const change of urls.changes)
      next = editNativeRedirects(next, change.from, change.to, answer.option ? urls.redirect.get(change) ?? [] : [], change.subtree);
    if (next !== (redirects ?? "")) edits.set(NATIVE_REDIRECTS_PATH, next);
  }
  const what = source.folder ? `the folder ${source.path}` : source.path;
  const summary = count ? `${count} ${count === 1 ? "link" : "links"} updated in ${urls.links.length} ${urls.links.length === 1 ? "file" : "files"}` : "no links to update";
  const error = await applyNativeOperation({
    moves: ops.map((op) => ({ from: op.file.path, to: op.to })),
    edits,
    done: `${operation === "rename" ? "Renamed" : "Moved"} ${what} to ${to} — ${summary}${answer.option && redirected.length ? `; ${single ? `${first.from} redirects` : "the old URLs redirect"} there` : ""}.`,
    undone: `Undid ${operation === "rename" ? "renaming" : "moving"} ${what} to ${to}.`,
  });
  if (error) return error;
  requestAnimationFrame(() => {
    for (let part = parentOf(to); part; part = parentOf(part)) openFolders.add(part);
    if (!fileRow(to)) renderFileTree();
    if (explorerDropdown?.isOpen() && explorerTab === "files") fileRow(to)?.focus();
  });
  return undefined;
}

// Deletes a file or folder after a confirmation naming it (and how many
// pages link to the pages it takes).
async function deleteFileTarget(target: FileRowTarget, wording?: { title: string; pages?: boolean }): Promise<string | undefined> {
  if (target.gone) return `${target.path} is deleted already.`;
  const guarded = protectedProblem(target, "delete");
  if (guarded) { errorMessage(new Error(guarded)); announce(guarded); return guarded; }
  const indexed = await ensureNativeTextIndex();
  if (indexed) { errorMessage(new Error(indexed)); return indexed; }
  const epoch = generation;
  let found: MovableFile[];
  try {
    found = await targetFiles(target, false);
  } catch (error) {
    errorMessage(error);
    return error instanceof Error ? error.message : "The files could not be read.";
  }
  if (epoch !== generation) return "The repository changed meanwhile. Try again.";
  if (!found.length) return `${target.path} has no files to delete.`;
  const count = found.length;
  const onGitHub = found.some((file) => file.sha);
  const links = pageLinks(found.map((file) => file.path), new Map(), "deleted");
  const title = wording?.title ?? (target.folder ? `Delete the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}?` : `Delete ${target.path}?`);
  const ok = await confirmDialog?.ask({
    title,
    notes: [
      ...(links ? [links] : []),
      onGitHub
        ? count === 1 ? "It is removed from GitHub when you save. Until then, Restore brings it back." : "They are removed from GitHub when you save. Until then, Restore brings them back."
        : count === 1 ? "It is not on GitHub yet, so this discards it." : "They are not on GitHub yet, so this discards them.",
    ],
    action: "Delete",
  });
  if (!ok) { announce(`Cancelled deleting ${target.path}`); return "Cancelled."; }
  const error = await applyFileOperation(found.map((file) => ({ file })));
  if (error) { errorMessage(new Error(error)); return error; }
  announce(target.folder ? `Deleted the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}.` : `Deleted ${target.path}.`);
  requestAnimationFrame(() => { if (explorerDropdown?.isOpen() && explorerTab === "files") (fileRow(target.path) ?? fileRow(parentOf(target.path)))?.focus(); });
  return undefined;
}

// A copy of a file beside it, `name-copy.ext`, as a new file.
async function duplicateFileTarget(target: FileRowTarget) {
  const scope = draftScope();
  if (!scope || target.folder || target.gone) return;
  let found: MovableFile[];
  try {
    found = await targetFiles(target, true);
  } catch (error) {
    errorMessage(error);
    return;
  }
  const [file] = found;
  if (!file) return;
  const state = treeState();
  const to = copyPath(target.path, (path) => pathNow(path, state) !== undefined);
  if (!duplicateFile(draftStore(), scope, file, to)) { errorMessage(new Error(`${target.path} could not be copied.`)); return; }
  if (draftStore().error) { errorMessage(new Error(draftStore().error!)); return; }
  afterFileChanges();
  announce(`Duplicated ${target.path} as ${to}.`);
  requestAnimationFrame(() => fileRow(to)?.focus());
}

function renderEntries(
  entries: TreeEntry[],
  parentPath: string,
  epoch: number,
  state = treeState(),
): HTMLUListElement {
  const list = node("ul", "file-list");
  for (const entry of withNewFiles(entries, parentPath, state.drafted)) {
    const path = parentPath ? `${parentPath}/${entry.path}` : entry.path;
    const directory = entry.type === "tree";
    // Renamed or moved away: the file shows where it went.
    const gone = entry.isNew ? undefined : directory ? folderGone(state, path) : state.deleted.has(path) ? (movedAway(state, path) ? "moved" : "deleted") : undefined;
    if (gone === "moved") continue;
    const item = node("li");
    const row = button("", () => {}, "file-row");
    const icon = node("span", `file-icon ${directory ? "folder" : ""}`);
    setIcon(icon, directory ? "folder" : entry.type === "commit" ? "package" : entry.mode === "120000" ? "link-simple" : "file", 14);
    icon.setAttribute("aria-hidden", "true");
    row.append(icon, node("span", "filename", entry.path));
    // A new file, or a folder only new files are in, is not on GitHub yet;
    // a renamed, edited or deleted one is marked as git marks it.
    const change = directory ? undefined : state.changes.get(path);
    const kind: ChangeKind | undefined = gone ? "D"
      : entry.isNew ? (directory ? (state.drafted.filter((file) => file.startsWith(`${path}/`)).every((file) => state.changes.get(file)?.kind === "R") ? "R" : "A") : change?.kind === "R" ? "R" : "A")
      : change?.kind;
    if (kind) row.append(statusMarker(kind));
    if (gone) row.classList.add("is-deleted");
    row.title = kind === "R" && change?.from ? `${path} (renamed from ${change.from}, not saved to GitHub yet)`
      : kind === "A" ? `${path} (new, not saved to GitHub yet)`
      : kind === "D" ? `${path} (deleted, not saved to GitHub yet)`
      : kind === "M" ? `${path} (changed, not saved to GitHub yet)` : path;
    if (kind) row.setAttribute("aria-description", kind === "R" && change?.from ? `renamed from ${change.from}, not saved to GitHub yet` : `${CHANGE_WORDS[kind].toLowerCase()}, not saved to GitHub yet`);
    row.dataset.path = path;
    if (!directory && path === currentPath) row.classList.add("selected");
    if (directory) row.setAttribute("aria-expanded", "false");
    let childList: HTMLUListElement | undefined;
    const show = (children: TreeEntry[]) => {
      childList = renderEntries(children, path, epoch, state);
      if (!childList.children.length)
        childList.append(node("li", "muted empty-folder", "Empty folder"));
      item.append(childList);
      setIcon(icon, "folder-open", 14);
      row.setAttribute("aria-expanded", "true");
      openFolders.add(path);
    };
    // A folder's listing: none for a folder only new files are in, else read once.
    const cached = () => (entry.sha ? folderListings.get(entry.sha) : []);
    const load = async () => {
      if (!currentRepo) return undefined;
      const result = await api<Directory>("tree", {
        repo: currentRepo.full_name,
        sha: entry.sha,
      });
      folderListings.set(entry.sha, result.entries);
      return result.entries;
    };
    row.addEventListener("click", async () => {
      if (epoch !== generation || !currentRepo) return;
      clearError();
      // A folder only opens or closes in the tree; the open file, the preview
      // and the linked stylesheet stay as they are.
      if (directory) {
        if (childList) {
          childList.hidden = !childList.hidden;
          setIcon(icon, childList.hidden ? "folder" : "folder-open", 14);
          row.setAttribute("aria-expanded", String(!childList.hidden));
          if (childList.hidden) openFolders.delete(path);
          else openFolders.add(path);
          return;
        }
        const known = cached();
        if (known) {
          show(known);
          status(`Opened ${path}.`);
          return;
        }
        row.disabled = true;
        status(`Loading ${path}…`);
        try {
          const children = await load();
          if (epoch !== generation || !children) return;
          show(children);
          status(`Opened ${path}.`);
        } catch (error) {
          if (epoch === generation) errorMessage(error);
        } finally {
          row.disabled = false;
        }
      } else {
        if (gone) {
          announce(`${path} is deleted. Restore it to open it.`);
          return;
        }
        files
          .querySelectorAll(".selected")
          .forEach((el) => el.classList.remove("selected"));
        row.classList.add("selected");
        const scope = draftScope();
        const draft = entry.isNew && scope ? draftStore().get(scope, path) : undefined;
        if (draft) await openNewDraft(draft);
        else if (!entry.isNew) await openEntry(entry, path, epoch);
      }
    });
    const line = node("div", `file-row-line${directory ? " is-folder" : ""}`);
    line.append(row);
    if (gone) {
      const restore = button("Restore", () => void restoreFileTarget({ path, name: entry.path, folder: directory, gone: true }), "file-restore");
      restore.setAttribute("aria-label", `Restore ${path}`);
      line.append(restore);
    }
    if (directory && !gone) {
      const add = node("button", "file-add");
      setIcon(add, "plus");
      add.type = "button";
      add.setAttribute("aria-label", `New in ${path}`);
      add.title = `New file or folder in ${path}`;
      add.setAttribute("aria-haspopup", "dialog");
      add.addEventListener("click", () => openCreate(path, add));
      line.append(add);
    }
    fileActions?.attach(row, line, { path, name: entry.path, folder: directory, gone: Boolean(gone) });
    item.append(line);
    list.append(item);
    // A folder open before the tree was drawn again opens again.
    if (directory && openFolders.has(path)) {
      const known = cached();
      if (known) show(known);
      else
        void load().then(
          (children) => { if (children && epoch === generation && !childList && row.isConnected) show(children); },
          () => openFolders.delete(path),
        );
    }
  }
  return list;
}

async function openEntry(
  entry: TreeEntry,
  path: string,
  epoch: number,
  options: { linkDefaultStyle?: boolean; keepExplorer?: boolean } = {},
) {
  if (epoch !== generation || !currentRepo || !snapshot || !info.user) return;
  // A file deleted in the drafts opens as a note with Restore; one renamed
  // or moved opens where it is now.
  const marker = draftStore().get({ account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }, path);
  if (marker?.deleted) {
    if (marker.movedTo) { await openAfter(marker.movedTo, options.keepExplorer); return; }
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
  status(`Reading ${path}…`);
  try {
    const content = await readFile(currentRepo.full_name, entry.sha);
    if (epoch !== generation || selection !== fileGeneration) return;
    await mountSource(
      path,
      content,
      entry.sha,
      entry.mode === "120000",
      epoch,
      selection,
      options,
    );
    settleStatus(`Viewing ${path} at ${snapshot?.commit.slice(0, 7)}.`);
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
  options: { linkDefaultStyle?: boolean } = {},
) {
  if (
    !currentRepo ||
    !snapshot ||
    !info.user ||
    epoch !== generation ||
    selection !== fileGeneration
  )
    return;
  const scope = {
    account: info.user!.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot!.branch,
  };
  const saveEpoch = generation;
  await openCodeEditor({
    key: draftKey(scope, path),
    scope,
    baseSha: baseSha,
    saveLabels: nativeEngaged,
    onPublished: (result, submitted) => {
      if (
        generation !== saveEpoch ||
        currentRepo?.id !== scope.repoId ||
        snapshot?.branch !== scope.branch ||
        info.user?.login !== scope.account
      )
        return;
      adoptNativeBaseSources(scope, result, submitted);
      // Saved uploads are GitHub's now; this browser lets their bytes go.
      void sweepUploads(uploadBytes(), scope, draftStore().list(scope)).catch(() => undefined);
      seeHead(result.commit);
      void refreshPublishedSnapshot(scope.repo, scope.branch, result.commit);
      if (nativeEngaged && !result.unchanged)
        siteActions?.track({ repo: scope.repo, commit: result.commit, url: result.url },
          () => currentRepo?.id === scope.repoId && (snapshot?.branch ?? branchSelect.value) === scope.branch && info.user?.login === scope.account);
    },
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
      if (snapshot && info.user) {
        showDirectory(snapshot);
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
      if (value && currentPath === value.path) syncLinkedStyles(value.path, value.content);
      updateAgentContext();
      renderDraftFiles();
      commitHistory?.refresh();
      if (nativeModeActive()) updateNativePreviewSources();
      // An open template's banner counts its instances again.
      componentTools?.refresh();
      // The Page fields follow the page's head (typed, undone or redone).
      if (value && nativeRouteForPath(value.path)) pageStructure?.refreshMeta();
      // A heading or title typed in the open file renames it in the top bar.
      updateCurrentPageLabel();
    },
    onHistory: openHistory,
    onDiscardAll: () => void discardAllChanges(),
    publishHead: () => (snapshot?.branch === scope.branch && currentRepo?.id === scope.repoId ? (snapshot.empty && (!headSeen || headSeen.commit === EMPTY_COMMIT) ? EMPTY_COMMIT : trustedHead()) : undefined),
    onRefused: () => void checkBranchHead(true),
    onDiscardChange: discardFileChange,
    deletedUpstream: (path) => deletedUpstream.has(path),
    onSettleDeleted: settleDeletedDraft,
    cssWorkspace: nativeCssWorkspace,
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
  });
  // Another file opened over the selected page: its controls would edit the
  // wrong file, so the bar waits for the next preview click.
  if (nativeModeActive() && lastNativeSelection?.path !== path) {
    nativePreview?.hideEditBar();
    componentTools?.show(undefined);
  }
  componentTools?.refresh();
  // Checked before the file-generation guard: handling that click is what
  // superseded this open.
  const pending = pendingNativeSelection;
  if (pending?.selection.path === path && currentPath === path && editorModule?.isMounted(path)) {
    pendingNativeSelection = undefined;
    if (pending.epoch === generation) void selectNativeSource(pending.selection);
  }
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
    if (nativeComponentTagForPath(path)) void openComponentLinkedStyle(path);
    else void openDefaultLinkedStyle(path);
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
  const entry = await findEntry(css);
  if (request !== linkedStyleRequest || epoch !== generation || currentPath !== page) return false;
  if (!entry) return openDefaultLinkedStyle(page);
  nativeLinkedStyles = undefined;
  linkedStyle = { page, css, rules: linkedStyleIdle };
  if (!(await openSecondary(css))) return false;
  if (request !== linkedStyleRequest || epoch !== generation || linkedStyle?.page !== page) return false;
  renderLinkedStyle();
  return true;
}

function updateAgentContext() {
  agentMenu?.changed();
  refreshSetup();
}

// ---- Agents (src/agent-site.ts): the context shared, and changes applied through the editor's own actions. ----

function agentRepository() {
  return currentRepo && snapshot && info.user ? { id: currentRepo.id, fullName: currentRepo.full_name } : undefined;
}
async function agentContext(): Promise<SharedContext | undefined> {
  const scope = draftScope();
  if (!currentRepo || !snapshot || !scope) return undefined;
  const site = nativeSite;
  return buildAgentContext({
    repository: { id: currentRepo.id, fullName: currentRepo.full_name },
    branch: snapshot.branch,
    commit: snapshot.commit,
    file: activeFileContext,
    drafts: draftStore().list(scope),
    mountedSource: (path) => editorModule?.getMountedSource(path),
    native: site && {
      site,
      routeInfo: (route) => nativeRouteInfo(route, site),
      source: (path) => nativeEffectiveSource(path, scope),
      exists: (path) => pathNow(path) === "file",
      openFile: currentPath,
      selection: lastNativeSelection && { ...lastNativeSelection, route: nativePreview?.route() },
    },
  });
}
// A Files-tab action run for an agent: its confirmation is answered as asked.
async function withAgentAnswers<T>(answers: { option?: boolean }, run: () => Promise<T>) {
  const real = confirmDialog;
  confirmDialog = real && agentAnswers(real, answers);
  try {
    return await run();
  } finally {
    confirmDialog = real;
  }
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
  const before = { account: info.user?.login, repoId: currentRepo?.id, branch: snapshot?.branch };
  await nativeResyncDone;
  if (before.account !== info.user?.login || before.repoId !== currentRepo?.id || (before.branch && before.branch !== snapshot?.branch))
    throw new Error("The editor tab switched to another site meanwhile. Call get_site and try again.");
}
const agentSiteActions: AgentSiteActions = {
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
  replaceMounted(path, source, edit) {
    if (!editorModule) throw new Error("The editor is not ready.");
    editorModule.replaceActiveRanges([{ path, ...edit, expected: source.slice(edit.start, edit.end) }]);
  },
  writeDraft: async (path, content, create) => {
    const error = await applyNativeOperation({
      ...(create ? { creates: [{ path, content }] } : { edits: new Map([[path, content]]) }),
      ...(nativePageRoute(path) ? { open: path } : {}),
      done: `An agent ${create ? "created" : "changed"} ${path}.`,
      undone: `Undid the agent's change to ${path}.`,
    });
    // A home page just written switches the site on: the context is whole before the write is answered.
    await nativeResyncDone;
    return error;
  },
  async open(path) {
    if (currentPath !== path || !editorModule?.isMounted(path)) await restoreFile(path, generation, { linkDefaultStyle: false });
    return currentPath === path;
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
  template: (tag) => (nativeSite?.components[tag] ? nativeSources()[nativeSite.components[tag]] : undefined),
  change: applyNativeChange,
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
function applyAgentSiteCommand(command: AgentCommand) {
  if (!snapshot || command.branch !== snapshot.branch || command.commit !== snapshot.commit)
    throw new Error("The editor changed branch or revision.");
  return agentActing(() => applySiteCommand(agentSiteActions, command));
}
// While an agent's command runs, file operations leave .github alone (see applyNativeOperation).
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

async function openNewDraft(draft: SavedDraft, options: { keepExplorer?: boolean } = {}) {
  if (
    !snapshot ||
    !currentRepo ||
    draft.repoId !== currentRepo.id ||
    draft.branch !== snapshot.branch
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
  await mountSource(draft.path, "", null, false, epoch, selection);
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
    !currentRepo ||
    !snapshot ||
    command.branch !== snapshot.branch ||
    command.commit !== snapshot.commit
  )
    throw new Error("The editor context changed.");
  if (command.operation === "update_active_draft") {
    if (!editorModule) throw new Error("Open the file in the editor first.");
    await editorModule.applyAgentDraft(command);
    return;
  }
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
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
  options: { linkDefaultStyle?: boolean; keepExplorer?: boolean } = {},
) {
  const selection = ++fileGeneration;
  const repo = currentRepo!;
  const unavailable = () =>
    new Error("The previously open file is no longer available. Choose another file.");
  const nowFolder = () =>
    new Error("The previously open file is now a folder. Choose another file.");
  const savedDraft = () =>
    info.user && snapshot
      ? draftStore().get(
          {
            account: info.user.login,
            repoId: repo.id,
            repo: repo.full_name,
            branch: snapshot.branch,
          },
          path,
        )
      : undefined;
  try {
    let entry: TreeEntry | undefined;
    if (snapshot?.tree) {
      entry = entryAt(path);
    } else {
      let entries = snapshot!.entries;
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
        await openNewDraft(saved, { keepExplorer: options.keepExplorer });
        return;
      }
      // An edit of a file GitHub deleted: opened to be settled.
      if (saved && !saved.deleted && deletedUpstream.has(path)) {
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

// After a save: the branch as the save left it. `commit` is the save's own
// commit, so a GitHub read lagging behind it still gives it (worker/github.ts).
async function refreshPublishedSnapshot(repo: string, branch: string, commit: string) {
  const epoch = generation;
  try {
    const result = await api<Snapshot>("snapshot", { repo, branch, commit });
    if (
      epoch !== generation ||
      currentRepo?.full_name !== repo ||
      snapshot?.branch !== branch
    )
      return;
    snapshot = result;
    repositoryIndex.seed(currentRepo, result);
    seeHead(result.commit);
    await findDeletedUpstream(epoch);
    if (epoch !== generation) return;
    updateAgentContext();
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    renderFileTree();
    if (nativeEngaged && nativeSite) startNativeTextIndex(currentRepo, nativeSite, draftScope(), generation, nativeSourcesRequest);
    status("Selected files saved to GitHub.");
  } catch (error) {
    if (epoch === generation) errorMessage(error);
  }
}

// The branch head as this tab last learned it (a snapshot, a save) and when:
// trusted over GitHub's answer for a while, as GitHub's reads can lag its
// writes; after that a branch reset elsewhere is believed.
let headSeen: { commit: string; at: number } | undefined;
const headTrust = 5 * 60_000;
function seeHead(commit: string) {
  headSeen = { commit, at: Date.now() };
}
const trustedHead = () => (headSeen && Date.now() - headSeen.at < headTrust ? headSeen.commit : undefined);
// Whether GitHub moved the branch on (a pull request merged, a save in
// another tab): checked when the tab is shown or focused again, at most
// every 15 seconds, and after a save was refused. A new head loads as
// Refresh does, the open file opening again.
let headCheckedAt = 0;
async function checkBranchHead(force = false) {
  if (!currentRepo || !snapshot || document.visibilityState !== "visible") return;
  if (!force && Date.now() - headCheckedAt < 15_000) return;
  headCheckedAt = Date.now();
  const epoch = generation, seen = snapshot, repo = currentRepo;
  try {
    const { commit } = await api<{ commit: string }>("head", {
      repo: repo.full_name, branch: seen.branch,
      ...(trustedHead() ? { commit: trustedHead()! } : {}),
    });
    if (epoch !== generation || snapshot !== seen || commit === seen.commit) return;
    seeHead(commit);
    await loadSnapshot();
  } catch {
    // Checked again on the next focus.
  }
}
document.addEventListener("visibilitychange", () => void checkBranchHead());
window.addEventListener("focus", () => void checkBranchHead());

async function loadSnapshot(
  resumePath?: string,
  prefetched?: Promise<Snapshot>,
) {
  if (!currentRepo || !branchSelect.value) return;
  removeFinishStarter();
  const reopen =
    resumePath ??
    (snapshot?.branch === branchSelect.value ? currentPath : undefined);
  // The head this tab saw on the branch: a lagging read never steps back from it.
  const known = snapshot && snapshot.branch === branchSelect.value ? trustedHead() : undefined;
  const epoch = ++generation;
  fileGeneration++;
  clearError();
  snapshot = undefined;
  repositoryIndex.clear();
  deletedUpstream = new Set();
  siteActions?.revalidate();
  openFolders.clear();
  folderListings.clear();
  deactivateNative();
  setCurrentPage();
  const repo = currentRepo;
  const branch = branchSelect.value;
  refreshButton.disabled = true;
  element("revision").textContent = "…";
  files.replaceChildren(node("p", "muted sidebar-hint", "Loading files…"));
  content.replaceChildren(
    node("p", "empty-message", "Opening your repository…"),
  );
  status(`Loading ${repo.name} / ${branch}…`);
  try {
    const result = await (prefetched ??
      api<Snapshot>("snapshot", {
        repo: repo.full_name,
        branch,
        ...(known ? { commit: known } : {}),
      }));
    if (epoch !== generation) return;
    snapshot = result;
    repositoryIndex.seed(repo, result);
    seeHead(result.commit);
    await findDeletedUpstream(epoch);
    if (epoch !== generation) return;
    updateAgentContext();
    updatePreview();
    // Start reading the file to reopen now, alongside the native site's files.
    const reopenEntry = reopen ? entryAt(reopen) : undefined;
    if (reopenEntry?.type === "blob" && (reopenEntry.size ?? 0) <= 1024 * 1024)
      void readFile(repo.full_name, reopenEntry.sha).catch(() => {});
    const isNative = await activateNativeSite(repo, result, epoch);
    if (epoch !== generation) return;
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
    if (open) await restoreFile(open, epoch);
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

async function chooseRepository(resume?: WorkspaceLocation) {
  const epoch = ++generation;
  fileGeneration++;
  currentRepo = repositories.find(
    (repo) => String(repo.id) === repositorySelect.value,
  );
  repositoryMenu?.setRepository(currentRepo);
  snapshot = undefined;
  repositoryIndex.clear();
  setCurrentPage();
  branchSelect.disabled = true;
  refreshButton.disabled = true;
  options(branchSelect, [{ value: "", label: "Loading branches…" }]);
  files.replaceChildren();
  content.replaceChildren(node("p", "empty-message", "Loading branches…"));
  clearError();
  if (!currentRepo) {
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
  const requestedBranch = resume?.branch ?? currentRepo.default_branch;
  const prefetched = api<Snapshot>("snapshot", {
    repo: currentRepo.full_name,
    branch: requestedBranch,
  });
  // A branch lookup may fail first or navigation may supersede this request.
  void prefetched.catch(() => {});
  void loadEditorModule().catch(() => {});
  try {
    const branches = await api<string[]>("branches", {
      repo: currentRepo.full_name,
    });
    if (epoch !== generation) return;
    if (!branches.length) {
      // An empty repository opens on its default branch with no files, so
      // drafts work; its first save makes the branch.
      const branch = currentRepo.default_branch || "main";
      options(branchSelect, [{ value: branch, label: `⑂ ${branch}` }]);
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
    branchSelect.value =
      resume && branches.includes(resume.branch)
        ? resume.branch
        : branches.includes(currentRepo.default_branch)
          ? currentRepo.default_branch
          : branches[0];
    branchSelect.disabled = false;
    await loadSnapshot(
      resume?.branch === branchSelect.value ? resume.path : undefined,
      branchSelect.value === requestedBranch ? prefetched : undefined,
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
let wizard: ReturnType<typeof createSetupWizard> | undefined;
/** The wizard was left in this page load: Get started shows instead. */
let wizardDismissed = false;
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

async function openWizard() {
  if (wizard || !info.user) return;
  wizardDismissed = false;
  const memory = readWizard(localStorage);
  // The session says what is left to do (and a reload keeps it); asked again only when it did not.
  const connection = connectionFromOnboarding(info.onboarding) ?? (await wizardConnection());
  if (wizard) return;
  const step = openingStep(memory, connection);
  const kept = writeWizard(localStorage, { step });
  wizard = createSetupWizard({
    login: info.user.login,
    connected: connection === "installed",
    step,
    memory: kept,
    connectUrl: "/auth/install",
    loadOwners: () => api<OwnerInstallation[]>("owners"),
    create: createSiteInWizard,
    findRepository: findWizardRepository,
    loadPreview: wizardPreview,
    agentPrompt: (choice, about) =>
      setupPrompt({ editor: location.origin, installUrl: info.installUrl, name: choice.name, private: choice.private, owner: choice.owner, about, repository: choice.repository }),
    remember: (change) => void writeWizard(localStorage, change),
    finish: (repo) => void finishWizard(repo),
    exit: closeWizard,
  });
  document.body.append(wizard.root);
  wizard.focus();
}

function removeWizard() {
  wizard?.destroy();
  wizard = undefined;
}

/** Leaves the wizard: Get started for a signed-in account, the sign-in screen otherwise. */
function closeWizard() {
  removeWizard();
  clearWizard(localStorage);
  wizardDismissed = true;
  if (info.user && !repositories.length) showGetStarted();
}

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
      const blob = await api<{ content: string }>("raw", { repo: repo.fullName, sha: byPath.get(path)! });
      images.set(path, `data:${assetType(path)};base64,${blob.content}`);
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
  const list = await api<Repository[]>("repositories");
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
  const branch = snapshot?.branch;
  const epoch = generation;
  const banner = node("div", "notice");
  banner.id = "finish-starter";
  banner.setAttribute("role", "status");
  const what = partial.point === "starter" ? "Starter site" : "blank page";
  const finish = button(`Finish adding the ${what}`, async () => {
    if (generation !== epoch || currentRepo?.id !== repo.id || snapshot?.branch !== branch) {
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
  removeWizard();
  clearWizard(localStorage);
  wizardDismissed = true;
  startSetupChecklist(repo.id);
  history.replaceState(null, "", `#repo=${repo.id}&branch=${encodeURIComponent(repo.defaultBranch)}`);
  // GitHub may not list a repository it has just made yet: the one made here is added.
  const listed = await api<Repository[]>("repositories").catch(() => repositories);
  await loadRepositories(wizardCreated && !listed.some((known) => known.id === wizardCreated!.id) ? [...listed, wizardCreated] : listed);
}

// Get started: the screen of an account with no repository in the editor.
// Coming back to the tab (from GitHub, where access was given or a
// repository made) lists the repositories again.
let waitingForRepositories = false;
let openNewRepository = false;
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
function showGetStarted() {
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
    const next = await api<Repository[]>("repositories");
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
  if (currentRepo?.id === repo.id) {
    const problem = await writeStartingPoint(choice.point);
    if (problem) errorMessage(new Error(problem));
  }
  return { ok: true };
}

async function loadRepositories(prefetched?: Repository[]) {
  removeFinishStarter();
  waitingForRepositories = false;
  const epoch = ++generation;
  fileGeneration++;
  currentRepo = undefined;
  siteActions?.revalidate();
  repositoryMenu?.setRepository();
  setCurrentPage();
  snapshot = undefined;
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
    const result = prefetched ?? (await api<Repository[]>("repositories"));
    if (epoch !== generation) return;
    repositories = result;
    repositoryMenu?.setRepositories(repositories);
    // Back from GitHub: the repositories this browser knew before leaving, not the session's (already after the install).
    const knownBefore = openNewRepository ? knownRepositories() ?? (info.repositories ?? []).map((repo) => repo.id) : undefined;
    openNewRepository = false;
    rememberRepositories(result);
    if (!repositories.length) {
      options(repositorySelect, [
        { value: "", label: "No selected repositories" },
      ]);
      if (wizardDismissed) showGetStarted();
      else {
        // A new user: the Setup wizard, full screen, in place of Get started.
        content.replaceChildren(node("p", "empty-message", "Create your first site to get started."));
        void openWizard();
      }
      return;
    }
    // A wizard that made a site and was interrupted: the checklist still follows it.
    const unfinished = readWizard(localStorage)?.repo;
    if (unfinished && repositories.some((repo) => repo.id === unfinished.id)) startSetupChecklist(unfinished.id);
    if (!wizard) clearWizard(localStorage);
    repositoryOptions();
    repositorySelect.disabled = false;
    const linked = readWorkspaceUrl();
    if (location.hash && !linked) {
      errorMessage(
        new Error(
          "This workspace link is invalid. Choose a repository to continue.",
        ),
      );
      return;
    }
    if (linked && !repositories.some((repo) => repo.id === linked.repoId)) {
      errorMessage(
        new Error(
          "The linked repository is not available to this GitHub account. Check repository access or choose another project.",
        ),
      );
      return;
    }
    // Back from giving the editor access: the one repository that is new opens.
    if (knownBefore) {
      const known = new Set(knownBefore);
      const added = repositories.filter((repo) => !known.has(repo.id));
      if (added.length === 1 && !linked) {
        repositorySelect.value = String(added[0].id);
        await chooseRepository();
        return;
      }
    }
    const previous =
      linked ?? (info.user ? readWorkspace(info.user.login) : undefined);
    const remembered =
      previous && repositories.find((repo) => repo.id === previous.repoId);
    if (remembered || repositories.length === 1) {
      repositorySelect.value = String(
        remembered ? remembered.id : repositories[0].id,
      );
      await chooseRepository(remembered ? previous : undefined);
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
    next = await api<Repository[]>("repositories");
  } catch (error) {
    errorMessage(error);
    return;
  }
  if (
    next.length === repositories.length &&
    next.every((repo, index) => repo.id === repositories[index].id)
  )
    return;
  rememberRepositories(next);
  if (!currentRepo || !next.some((repo) => repo.id === currentRepo!.id)) {
    if (currentRepo) history.replaceState(null, "", location.pathname);
    await loadRepositories(next);
    return;
  }
  const added = next.filter(
    (repo) => !repositories.some((known) => known.id === repo.id),
  ).length;
  const removed = repositories.length + added - next.length;
  repositories = next;
  repositoryOptions();
  repositorySelect.value = String(currentRepo.id);
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

async function start() {
  try {
    const session = await api<SessionInfo>("session");
    // Back from installing the App while "Request user authorization during
    // installation" is off: GitHub returns to the setup URL (this page) with an
    // installation_id, which is never trusted. Sign in now; the authorization
    // usually needs no click and completes the sign-in.
    const returnedFromInstall = new URL(location.href);
    if (!session.user && session.configured && (returnedFromInstall.searchParams.has("installation_id") || returnedFromInstall.searchParams.has("setup_action"))) {
      location.replace("/auth/login");
      return;
    }
    if (session.user) {
      rememberSignedIn(storage("local"));
      // The editor bundle is large; start it downloading before any
      // repository data arrives so opening the first file never waits for it.
      void loadEditorModule().catch(() => {});
      // Drafts are read synchronously from here on: they load before
      // anything can read them (src/drafts.ts).
      await draftStore().load(session.user.login);
      draftStore().onError = (message) => errorMessage(new Error(message));
    }
    info = session;
    if (info.user) {
      resumeWorkspaceLink();
      mountWorkspace();
      agentMenu = createAgentMenu({
        account: info.user.login,
        repository: agentRepository,
        context: agentContext,
        onCommand: applyAgentSiteCommand,
        // Ask agent shows in the edit bar while an agent is connected.
        onConnection: (connected) => { noteSetupAgent(connected); if (lastNativeSelection) renderNativeEditBar(lastNativeSelection); },
        onRequests: (requests) => nativePreview?.setRequests(requests),
        onQuestions: (count) => repositoryMenu?.setQuestions(count),
        // A question in the selector's list: its pin, card open, answer box focused.
        onShowRequest: (id) => {
          repositoryMenu?.close();
          nativePreview?.showRequest(id);
        },
      });
      element("agent-menu").append(agentMenu.root);
      // GitHub sends the user back here after the App was installed or its
      // repositories changed: list them afresh, and tidy the address.
      const returned = new URL(location.href);
      const installed = returned.searchParams.has("installation_id") || returned.searchParams.has("setup_action");
      if (installed) {
        returned.searchParams.delete("installation_id");
        returned.searchParams.delete("setup_action");
        history.replaceState(null, "", returned);
        openNewRepository = true;
      }
      await loadRepositories(installed ? undefined : info.repositories ?? undefined);
    } else if (
      autoSignInPlan({ configured: session.configured, hasSession: false, pathname: location.pathname, search: location.search, local: storage("local"), session: storage("session") }) === "auto"
    ) {
      // Signed in here before and the session ended: go on to GitHub, which completes
      // the authorization silently. Once per tab session; the message stays readable
      // for a moment and can be cancelled.
      markAutoSignInTried(storage("session"));
      renderLogin("auto");
      const timer = setTimeout(() => {
        cancelAutoSignIn = undefined;
        retainWorkspaceLink();
        location.assign("/auth/login");
      }, AUTO_SIGNIN_DELAY_MS);
      cancelAutoSignIn = () => {
        clearTimeout(timer);
        cancelAutoSignIn = undefined;
        renderLogin();
      };
      return;
    } else {
      renderLogin();
    }
    const error = new URL(location.href).searchParams.get("error");
    if (error) {
      errorMessage(new Error(error));
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("error");
      history.replaceState(null, "", cleanUrl);
    }
  } catch (error) {
    renderLogin("error");
    errorMessage(error);
  }
}
document.addEventListener("click", (event) => {
  if ((event.target as Element).closest?.('a[href="/auth/login"]'))
    retainWorkspaceLink();
});
window.addEventListener("hashchange", () => {
  if (info.user) void loadRepositories();
});
renderLogin("loading");
void start();
