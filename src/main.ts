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
import { createAgentMenu } from "./components/agent-menu";
import { agentAnswers, applySiteCommand, buildAgentContext, type AgentSiteActions } from "./agent-site";
import type { AgentCommand } from "../shared/agent";
import { draftStore, type SavedDraft } from "./drafts";
import { draftKey } from "./drafts";
import { mountDropdown } from "./components/dropdown";
import { createRepositoryMenu } from "./components/repository-menu";
import { mountSiteActions } from "./components/site-actions";
import type { SiteFiles } from "./site-download";
import { NATIVE_SITE_PATHS } from "../shared/native-project";
import { mountSidebarResize, type SidebarResize } from "./components/sidebar-resize";
import { createNativePreview, type NativeWarning, type NativeFormat, type NativePreviewSelection, type NativeTextEdit, type NativeTextSelection } from "./components/native-preview";
import { createPageStructure, type PageMetaField } from "./components/page-structure";
import { addedNativeRouteEntries, editNativePageMeta, moveNativeEntries, nativeManifestDetailRoutes, nativeManifestRedundant, planNativeDetailsMigration, removeNativePageDetails, rekeyNativeRoutes, registerNativeFile, removeNativeRouteEntry, restoreNativeEntries, sameNativeJson, unpairNativeRoutes, type NativeFileMove, type NativePageMetaResult, type NativeRegistration } from "./native-page-meta";
import { nativeNewPagePath, nativePageTemplate, nativeRegistration, newFilePath, newFolderPath, normalizeRoute, renamedPath, routeHeading, type Checked } from "./native-create";
import { createCreateDialog, type CreateKind, type CreateRequest } from "./components/create-dialog";
import { createPagesTree, type NativeNewRequest, type NativePagesTarget } from "./components/pages-tree";
import { createFileRowActions, type FileRowTarget } from "./components/file-row-actions";
import { createConfirmDialog } from "./components/confirm-dialog";
import { createPagePicker, type PagePickerItem } from "./components/page-picker";
import type { UrlPlan } from "./components/url-change";
import { NATIVE_REDIRECTS_PATH, editNativeRedirects, folderFile, folderToLeaf, groupRouteChanges, isRouteWithin, parentRoute, planPageMove, rewriteRouteLinks, routeFolder, routeSlug, type FileMove, type PageMovePlan, type RouteChange } from "./native-page-moves";
import type { MenuItem } from "./components/row-menu";
import { CHANGE_WORDS, deleteFile, duplicateFile, keepAsNewFile, listChanges, moveFile, restoreFile as restoreDraftFile, settleDeletedUpstream, type ChangeKind, type FileChange, type MovableFile } from "./file-changes";
import { DEFAULT_IMAGE_FOLDER, addUpload, formatBytes, pickFiles, sweepUploads, uploadBytes, uploadDataUrl } from "./uploads";
import { copyPath, filesLinkingTo, linkNote, movedPath, protectedPathProblem, type FileOperation } from "./native-files";
import { buildNativePagesTree, firstHeadingText, nativeNewTarget, nativePageLabel, type NativeNewTarget, type NativePageNode } from "./native-pages";
import {
  nativeManifestPaths,
  nativeDefaultRoute,
  nativeOrphanWarning,
  type NativeManifest,
} from "./native-manifest";
import { elementPathAt, locateNativeElement, locateNativeElementRange, startTagAttribute, textRangeInSource, wrapperAround, type ElementRange, type StartTag } from "./native-source-location";
import type { EditBarControl, EditBarModel } from "./components/edit-bar";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import { componentLabel, isSectionTemplate, nativeInsertEdit } from "./native-insert";
import { altFromPath, duplicateEdit, isImagePath, linkWrapEdit, moveEdit, nativeKindLabel, newTabEdit, opensInNewTab, previousHeadingLevel, removeEdit, setAttributeEdit, structureLabel, swapEdits, unwrapEdits } from "./native-structure";
import { currentTextSize, textSizeEdit, textSizeScale } from "./native-text-size";
import { createCommitHistory } from "./components/commit-history";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "./styles-index";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "./style-cascade";
import type { DeclarationStatus, RuleStatus } from "../shared/cascade";
import { expandStyleImports } from "../shared/css-imports";
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import { NATIVE_HOME_PAGE, NATIVE_MANIFEST_PATH, applyTextEdit, nativePageComment, nativePageCommentEdit, nativePageInfo, nativePageWithTitle, resolveNativeProject } from "../shared/native-project";
import type {
  EditorContext,
  Directory,
  FilesResult,
  PublishResult,
  Repository,
  SessionInfo,
  Snapshot,
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
      <button id="explorer-toggle" title="Pages & files" class="explorer-toggle" aria-controls="explorer"><span id="current-page">Select a page</span> <span aria-hidden="true">⌄</span></button>
      <div class="topbar-actions">
        <div id="change-status"></div>
        <div id="editor-toolbar-host" class="editor-toolbar-host"></div>
        <div id="changes" class="changes-window" popover="auto" role="dialog" aria-label="History"></div>
      </div>
    </header>
    <div id="notice" class="notice" role="alert" hidden></div>
    <div id="explorer" class="explorer" role="region" aria-label="Pages & files">
      <div id="explorer-tabs" class="explorer-tabs" role="tablist" aria-label="Pages or files" hidden>
        <button type="button" id="explorer-tab-pages" class="explorer-tab" role="tab" aria-controls="explorer-pages" aria-selected="true">Pages</button>
        <button type="button" id="explorer-tab-files" class="explorer-tab" role="tab" aria-controls="explorer-files" aria-selected="false" tabindex="-1">Files</button>
      </div>
      <div id="explorer-pages" class="explorer-panel" aria-labelledby="explorer-tab-pages" hidden></div>
      <div id="explorer-files" class="explorer-panel" aria-labelledby="explorer-tab-files">
        <div class="files-heading"><span>FILES</span><span class="files-heading__end"><span id="revision">—</span><button type="button" id="new-at-root" class="file-add" aria-label="New file or folder" title="New file or folder at the top of the repository" aria-haspopup="dialog">+</button></span></div>
        <nav id="files" aria-label="Repository files"></nav>
      </div>
    </div>
    <div class="workspace">
      <aside class="sidebar" aria-label="Page structure">
        <div class="sidebar-heading"><span class="eyebrow">PAGE STRUCTURE</span></div>
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
    onReload: () => void loadRepositories(),
    onDisconnect: disconnect,
  });
  element("repository-menu").append(repositoryMenu.root);
  siteActions = mountSiteActions({ statusHost: element("change-status"), menuHost: element("site-actions"), siteFiles: nativeSiteFiles, announce });
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
    duplicate: (file) => void duplicateNativePage(file),
    remove: (target) => void removeNativePagesTarget(target),
    createPage: (route) => void createNativeFolderPage(route),
    planUrl: (target, value) => (target.file ? nativeUrlPlan(target.file, value) : { ok: false, error: "This row has no page." }),
    changeUrl: (target, value, keep) => (target.file ? changeNativeUrl(target.file, value, keep) : Promise.resolve("This row has no page.")),
    moveTo: (target) => void moveNativePageTo(target),
    dropProblem: nativeDropProblem,
    drop: (source, parent) => void confirmNativeMove(source, parent),
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
  nativePreview = createNativePreview(element("main"), {
    onSelect: (selection) => void selectNativeSource(selection),
    onComponentStyles: (tags) => void loadNativeComponentStyles(tags),
    onDefaultStyles: (styles) => updateBodyStyles({ rules: styles.selectors, cascade: styles.cascade }),
    onTextSelection: (text) => {
      nativeTextSelection = text && lastNativeSelection?.node ? { ...text, path: lastNativeSelection.path, node: lastNativeSelection.node } : undefined;
      if (lastNativeSelection) renderNativeEditBar(lastNativeSelection);
    },
    onFormat: (format) => nativeFormatActions[format]?.(),
    onTextEdit: (edit) => void applyNativeTextEdit(edit),
    insertChoices: nativeSectionChoices,
    onInsert: (point, choice) => void insertNativeComponent(point, choice),
    onStructure: (structure) => pageStructure?.update(structure),
    onMove: (direction) => { if (lastNativeSelection) moveNativeSection(lastNativeSelection, direction); },
    onSectionDrag: (gap) => {
      const outcome = gap && lastNativeSelection ? moveNativeSectionTo(lastNativeSelection, gap.parent, gap.index) : undefined;
      if (!outcome) element("status").textContent = "Section drag cancelled";
    },
  });
  pageStructure = createPageStructure(element("structure"), {
    label: (item) => structureLabel(item, Boolean(nativeManifest && Object.hasOwn(nativeManifest.components, item.tag))),
    onSelect: (path, node) => nativePreview?.selectNode({ path, node }),
    pageMeta: nativePageMeta,
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
function openHistory(force = false) {
  const panel = element("changes");
  const anchor = document.getElementById("history-button");
  if (!anchor || !info.user || !currentRepo || !snapshot || !currentPath) return;
  if (!force && panel.matches(":popover-open")) { panel.hidePopover(); return; }
  commitHistory?.destroy();
  const epoch = generation;
  const path = currentPath;
  const scope = { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch };
  const isCurrent = () => generation === epoch && info.user?.login === scope.account &&
    currentRepo?.id === scope.repoId && snapshot?.branch === scope.branch && currentPath === path;
  commitHistory = createCommitHistory({
    repo: scope.repo, branch: scope.branch, path, isCurrent,
    hasDraft: () => Boolean(draftStore().get(scope, path)),
    onDrafts: openDraftChanges,
    onExpired: () => errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
    onRestored: async (result) => {
      if (!isCurrent()) return;
      panel.hidePopover();
      commitHistory?.destroy();
      if (!result.unchanged) await loadSnapshot(path);
      status(result.unchanged ? "This file already matches that version." : `Restored ${path} in a new commit. Other files are unchanged.`);
    },
  });
  panel.replaceChildren(commitHistory.root);
  positionHistory(panel, anchor);
}

// Keep draft review reachable beside the durable GitHub file history.
function openDraftChanges() {
  commitHistory?.destroy();
  const panel = element("changes");
  const anchor = document.getElementById("history-button");
  if (!anchor || !info.user || !currentRepo || !snapshot) return;
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
  };
  panel.replaceChildren(
    node("h2", "changes-window__title", `Draft changes on ${scope.branch}`),
    button("Commit history", () => openHistory(true), "text-button"),
  );
  const changes = listChanges(draftStore().list(scope));
  const openFiles = new Set((editorModule?.changedFiles() ?? []).map((f) => f.path));
  if (!changes.length && !openFiles.size)
    panel.append(node("p", "muted changes-window__empty", "No changes yet. Edit a file to start a draft."));
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const paths = [...new Set([...byPath.keys(), ...openFiles])].sort();
  if (paths.length) {
    panel.append(node("p", "files-heading", "CHANGED FILES"));
    for (const path of paths) {
      const change = byPath.get(path);
      const label = change?.kind === "D" ? `${path} (deleted)` : change?.kind === "R" ? `${change.from} → ${path}` : path;
      panel.append(
        button(
          label,
          () => {
            panel.hidePopover();
            void showCodeChanges(path);
          },
          "file-row",
        ),
      );
    }
  }
  if (currentPath && editorModule?.isReviewing(currentPath)) {
    const path = currentPath;
    panel.append(
      button(
        "Back to editing",
        () => {
          panel.hidePopover();
          editorModule?.setReviewMode(path, false);
        },
        "button secondary changes-window__back",
      ),
    );
  }
  positionHistory(panel, anchor);
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
  if (!nativeManifest) return undefined;
  const rules = nativeBodyStyles ? linkedRules(nativeBodyStyles) : [];
  const css = rules.find((rule) => /\.css$/.test(rule.path))?.path ?? nativeManifest.styles[0];
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
function entryAt(path: string): TreeEntry | undefined {
  return snapshot?.tree?.find((entry) => entry.path === path);
}
function findEntry(path: string) {
  if (snapshot?.tree) {
    const entry = entryAt(path);
    return Promise.resolve(entry?.type === "blob" ? entry : undefined);
  }
  let entries = snapshot?.entries ?? [];
  const parts = path.split("/");
  return (async () => {
    for (let index = 0; index < parts.length; index++) {
      const entry = entries.find((entry) => entry.path === parts[index]);
      if (!entry) return undefined;
      if (index === parts.length - 1) return entry.type === "blob" ? entry : undefined;
      if (entry.type !== "tree" || !currentRepo) return undefined;
      entries = (await api<Directory>("tree", { repo: currentRepo.full_name, sha: entry.sha })).entries;
    }
    return undefined;
  })();
}
// Opens `css` in the secondary pane (or keeps it if already there), then resolves.
async function openSecondary(css: string) {
  if (!currentRepo || !snapshot || !info.user) return false;
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
    const entry = await findEntry(css);
    if (!entry || (entry.size ?? 0) > 128 * 1024) throw new Error(`Could not open ${css}.`);
    const [source, editor] = await Promise.all([
      readFile(scope.repo, entry.sha),
      loadEditorModule(),
    ]);
    if (request !== secondaryRequest) return false;
    disposeSecondary?.();
    element("secondary-pane").hidden = false;
    element("main").classList.add("has-secondary");
    codeWidthResize?.apply();
    disposeSecondary = editor.mountCodeEditor(
      element("content-secondary"),
      { key: draftKey(scope, css), historyScope, scope, baseSha: entry.sha, path: css, source, readOnly: entry.mode === "120000",
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
    return;
  }
  const source = nativeSources()[path] ?? "";
  const range = node ? locateNativeElementRange(source, node) : undefined;
  const kind = nativeKindLabel(selection.tag);
  // A new link whose Address never opened (the selection moved on first) keeps its empty href; its undo group ends.
  if (nativeNewLink && !nativeNewLink.shown && (nativeNewLink.path !== path || nativeNewLink.node.join(".") !== node?.join("."))) {
    editor.closeActiveEditGroup(nativeNewLink.path);
    nativeNewLink = undefined;
  }
  const announce = (text: string) => { element("status").textContent = text; };
  const change = (edits: { start: number; end: number; text: string }[], next: number[] | undefined, message: string) =>
    applyNativeChange(path, source, edits, next, message);
  const controls: EditBarControl[] = [];
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
  if (range && textual && nativeManifest) {
    // The site's own sizes (classes, else variables) when its stylesheets define them (`src/native-text-size.ts`).
    const sources = nativeSources();
    const scale = textSizeScale([...nativeManifest.styles, ...nativeImportedStyles].map((sheet) => sources[sheet] ?? ""));
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
  if (link && node && nativeManifest) {
    const href = startTagAttribute(source, link.range.tag, "href");
    const current = href?.value.trim() ?? "";
    const manifest = nativeManifest;
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
      suggestions: Object.keys(manifest.routes).map((route) => {
        const title = nativeRouteInfo(route).title;
        return { label: title ? `${title} (#${route})` : `#${route}`, value: `#${route}` };
      }),
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
      suggestions: images.map((image) => ({ label: image, value: image })),
      // An image from the computer, uploaded beside the site's images.
      upload: { label: "Upload image…", accept: "image/*", onFiles: async (files) => (await uploadFilesTo(DEFAULT_IMAGE_FOLDER, files))[0] },
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
  const model: EditBarModel = { kind, controls, onFormat: (format) => nativeFormatActions[format]?.(), onMove, draggable };
  preview.showEditBar(model, rect);
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
  return tag === "section" || (tag.includes("-") && isSectionTemplate(nativeSources()[nativeManifest?.components[tag] ?? ""] ?? ""));
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
  if (!nativeManifest) return [];
  const sources = nativeSources();
  return Object.entries(nativeManifest.components)
    .filter(([, path]) => isSectionTemplate(sources[path] ?? ""))
    .map(([tag]) => ({ tag, label: componentLabel(tag) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Puts a new instance of a section component into the page at `point`, as
// one undo step, and selects it. The page file opens first when another
// file is in the editor, since edits go through the mounted editor.
async function insertNativeComponent(point: InsertPoint, choice: InsertChoice) {
  const path = point.path;
  if (!nativePreview || !nativeManifest || !Object.values(nativeManifest.routes).includes(path)) return;
  if (currentPath !== path || !editorModule?.isMounted(path)) {
    const epoch = generation;
    await restoreFile(path, epoch, { linkDefaultStyle: false });
    if (epoch !== generation || currentPath !== path || !editorModule?.isMounted(path)) return;
  }
  const editor = editorModule;
  const preview = nativePreview;
  if (!editor || !preview) return;
  const template = nativeSources()[nativeManifest.components[choice.tag] ?? ""] ?? "";
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
  pageStructure?.select(selection.path && selection.node ? { path: selection.path, node: selection.node } : undefined);
  if (!selection.path) nativePreview?.hideEditBar();
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
  if (!snapshot || !nativeManifest || !nativeManifestPaths(nativeManifest).includes(selection.path)) return;
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
// The effective manifest of the loaded native project: `.astro-editor/native.json`
// when there is one, completed by convention (shared/native-project.ts).
let nativeManifest: NativeManifest | undefined;
// True whenever the project is native (it has `.astro-editor/native.json` or
// `src/pages/index.html`), even when the manifest is invalid or its sources
// fail to load: the preview then shows the error instead of the plain file
// browser.
let nativeEngaged = false;
const nativeBaseSources = new Map<string, string>();
const nativeComponentStyles = new Map<string, string>();
const nativeMissingComponentStyles = new Set<string>();
const nativeComponentStyleRequests = new Set<string>();
// Files the shared stylesheets `@import` (not in the manifest): loaded, or
// missing from the branch, or being read. Each is a style dependency like a
// manifest stylesheet: its effective source reaches the preview and edits to
// it re-render.
const nativeImportedStyles = new Set<string>();
const nativeMissingImportedStyles = new Set<string>();
const nativeImportedStyleRequests = new Set<string>();
let nativeSourcesRequest = 0;
// Every file under `src/` on the branch; pages are routed by where they are
// (shared/native-routes.ts) and components and styles are found by convention
// (shared/native-project.ts), so this list, with new files drafted in the
// browser (`nativePageFiles`), decides the site's routes, components and
// styles.
let nativeBasePageFiles: string[] = [];
const NATIVE_SOURCE_DIR = "src/";

function nativeModeActive() {
  return Boolean(nativeManifest);
}

// The route whose page file is `path`, matched by the manifest's own mapping
// (not a filename convention); undefined when the file is not a mapped page.
function nativeRouteForPath(path: string | undefined) {
  if (!nativeManifest || !path) return undefined;
  return Object.entries(nativeManifest.routes).find(([, file]) => file === path)?.[0];
}

// The manifest as GitHub has it, for the draft written by the Page fields;
// undefined when the project has no manifest.
let nativeManifestBase: { sha: string; text: string } | undefined;
// Set once the page details moved into the pages this session: the notice
// then offers to remove a manifest that says nothing more.
let nativeDetailsMoved = false;

// Whether the site has a manifest now: GitHub has one and the drafts do not delete it.
function nativeHasManifest() {
  return Boolean(nativeManifestBase) && !nativeManifestDraft()?.deleted;
}

function draftScope() {
  return currentRepo && snapshot && info.user
    ? { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }
    : undefined;
}

// The browser draft of the manifest in the current scope, if any.
function nativeManifestDraft() {
  const scope = draftScope();
  return scope ? draftStore().get(scope, NATIVE_MANIFEST_PATH) : undefined;
}

// Whether the manifest draft began from an older blob than GitHub has now.
// Such a draft is never rebased by the Page fields: it keeps its baseSha,
// so a save is refused, and the code editor's conflict bar (Review latest,
// Keep my draft, Discard) is where it is settled.
const MANIFEST_CONFLICT = "The manifest changed on GitHub. Open .astro-editor/native.json to review.";
function nativeManifestConflict() {
  const draft = nativeManifestDraft();
  return Boolean(draft && nativeManifestBase && draft.baseSha !== nativeManifestBase.sha);
}

// The manifest's effective text, resolved like any other source: a mounted
// editor model wins, then a browser draft, then the clean snapshot baseline.
function nativeManifestSource() {
  const mounted = editorModule?.getMountedSource(NATIVE_MANIFEST_PATH);
  if (mounted !== undefined) return mounted;
  const draft = nativeManifestDraft();
  if (draft?.deleted) return undefined;
  return draft?.content ?? nativeManifestBase?.text;
}

// The title and description of the page file `path` for the Page block: the
// manifest's for its route when it still has them (they win), else the
// page's leading comment's, where editing writes them; nothing when the file
// is not one of the site's routes. The title's placeholder is the page's
// heading, which the export falls back to. When the manifest has details for
// the route and its draft conflicts with GitHub, the fields close and the
// notice says why.
function nativePageMeta(path: string) {
  const route = nativeRouteForPath(path);
  if (!route || !nativeManifest) return undefined;
  const source = nativeEffectiveSource(path) ?? "";
  const comment = nativePageComment(source).meta;
  const entry = nativeManifest.pages[route] ?? {};
  const conflict = Boolean(entry.title || entry.description) && nativeHasManifest() && nativeManifestConflict();
  return {
    title: entry.title || comment.title || "",
    description: entry.description || comment.description || "",
    placeholders: { title: firstHeadingText(source) || undefined },
    notice: conflict ? MANIFEST_CONFLICT : undefined,
  };
}

// The title and description the page at `route` has: the manifest's, else
// its leading comment's.
function nativeRouteInfo(route: string, manifest = nativeManifest) {
  if (!manifest || !Object.hasOwn(manifest.routes, route)) return {};
  return nativePageInfo(manifest.pages, route, nativeEffectiveSource(manifest.routes[route]));
}

// The manifest's text set to `text` (a minimal edit, or no draft when it is
// GitHub's again), and everything read from it derived again.
function setNativeManifestText(text: string) {
  const source = nativeManifestSource();
  if (source === undefined || source === text) return;
  writeNativeManifest(source, manifestReplacement(source, text));
  refreshNativeRoutes();
}

// Writes a Page field (the Page block's Title or Description, the Pages
// tab's Rename) into the page's leading comment as one minimal edit, the
// comment made when missing and removed when left empty. When the manifest
// still gives the route that field it would win, so it goes in the same
// step: Undo takes both back. The open page's edit goes into its editor
// (`group` joins the field's keystrokes into one undo step until it closes);
// another page's is one operation over the drafts. Resolves to an error.
async function writeNativePageMeta(path: string, field: PageMetaField, value: string, group = true): Promise<string | undefined> {
  const route = nativeRouteForPath(path);
  const manifest = nativeManifest;
  if (!route || !manifest) return "This page has no URL in the site.";
  const source = nativeEffectiveSource(path);
  if (source === undefined) return "The page could not be read.";
  const edit = nativePageCommentEdit(source, field, value);
  let manifestChange: { before: string; after: string } | undefined;
  if (manifest.pages[route]?.[field] !== undefined && nativeHasManifest()) {
    const text = nativeManifestConflict() ? undefined : nativeManifestSource();
    if (text === undefined) return MANIFEST_CONFLICT;
    const removed = removeNativePageDetails(text, route, [field]);
    if (!removed.ok) return removed.error;
    if (removed.edit) manifestChange = { before: text, after: removed.text };
  }
  if (!edit && !manifestChange) return undefined;
  const label = field === "title" ? "Title" : "Description";
  const done = value.trim() ? `${label} updated` : `${label} removed`;
  if (editorModule?.isMounted(path)) {
    try {
      if (edit) {
        const change = manifestChange;
        const companion = change && { undo: () => setNativeManifestText(change.before), redo: () => setNativeManifestText(change.after) };
        editorModule.replaceActiveRange({ path, ...edit, expected: source.slice(edit.start, edit.end) }, group, companion);
      }
      if (manifestChange) {
        setNativeManifestText(manifestChange.after);
        const before = manifestChange.before;
        if (!edit) editorModule.recordHistoryAction(path, () => setNativeManifestText(before));
      }
    } catch (error) {
      return error instanceof Error ? error.message : "The page could not be changed.";
    }
    updateCurrentPageLabel();
    if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree();
    element("status").textContent = done;
    return undefined;
  }
  const after = manifestChange?.after;
  return applyNativeOperation({
    edits: edit ? new Map([[path, applyTextEdit(source, edit)]]) : undefined,
    manifest: after === undefined ? undefined : (text) => {
      const removed = removeNativePageDetails(text, route, [field]);
      return removed.ok ? removed.text : text;
    },
    done,
    undone: `Undid changing the ${field} of ${nativePageLabelOf(path)}.`,
    focus: { file: path },
  });
}

// Writes a manifest edit made from its effective text `source`: into the
// manifest's editor model when it is open (`group` joins the previous edit's
// undo step), else as a browser draft of the manifest file, which the Save to
// GitHub list and diff then show. Throws when it cannot be written.
function writeNativeManifest(source: string, result: Extract<NativePageMetaResult, { ok: true }>, group = false) {
  if (!result.edit) return;
  if (editorModule?.isMounted(NATIVE_MANIFEST_PATH)) {
    editorModule.replaceActiveRange({ path: NATIVE_MANIFEST_PATH, ...result.edit, expected: source.slice(result.edit.start, result.edit.end) }, group);
    return;
  }
  const scope = draftScope();
  if (!scope || !nativeManifestBase) throw new Error("The manifest cannot be changed right now.");
  // A draft keeps the base it began from; only a fresh one starts at the snapshot's blob.
  const existing = draftStore().get(scope, NATIVE_MANIFEST_PATH);
  const base = existing ? { sha: existing.baseSha, text: existing.original } : nativeManifestBase;
  // Back to what GitHub has: no draft is left.
  if (result.text === base.text && base.sha === nativeManifestBase.sha) {
    draftStore().remove(scope, NATIVE_MANIFEST_PATH);
    editorModule?.forgetDraftModel(scope, NATIVE_MANIFEST_PATH);
    editorModule?.refreshDrafts();
    commitHistory?.refresh();
    return;
  }
  draftStore().save({ ...scope, version: 1, path: NATIVE_MANIFEST_PATH, baseSha: base.sha, original: base.text, content: result.text, updatedAt: Date.now() });
  const failure = draftStore().error;
  if (failure) throw new Error(failure);
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
}

// Routes are derived from the page files when the project loads. A page file
// created or discarded here, or a manifest entry written for a new file,
// re-reads the manifest's effective text with the files now, so the new page
// routes (and a new stylesheet or component renders) at once.
function refreshNativeRoutes() {
  if (!nativeManifest) return;
  const source = !nativeHasManifest() ? undefined : nativeManifestConflict() ? nativeManifestBase!.text : nativeManifestSource();
  if (nativeHasManifest() && source === undefined) return;
  const parsed = resolveNativeProject(nativePageFiles(), source);
  if (!parsed.ok) { errorMessage(new Error(parsed.error)); return; }
  nativeManifest = parsed.manifest;
  nativePreview?.setWarnings(nativeWarningItems(parsed));
  nativePreview?.activate(parsed.manifest);
  updateNativePreviewSources();
  updateAgentContext();
  pageStructure?.refreshMeta();
  renderPagesTree();
  updateCurrentPageLabel();
}

// Resolve every manifest file to its effective source: a mounted editor model
// wins, then a saved/new browser draft, then the clean snapshot baseline.
function nativeSources(manifest = nativeManifest): Record<string, string> {
  const out: Record<string, string> = {};
  if (!manifest) return out;
  const paths = new Set([...nativeManifestPaths(manifest), ...nativeComponentStyles.values()]);
  const scope = draftScope();
  const effective = (path: string) => nativeEffectiveSource(path, scope);
  for (const path of paths) out[path] = effective(path) ?? "";
  // An imported file that is neither in the branch nor a draft stays out, so
  // the preview reports the import as missing.
  for (const path of [...nativeImportedStyles, ...nativeMissingImportedStyles]) {
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

// A page selection: the preview follows the newly opened page's route. Opening
// a non-page file (CSS, component) leaves the preview's current route untouched.
function updateNativePreview() {
  if (!nativeManifest || !nativePreview) return;
  nativePreview.update({
    sources: nativeSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(currentPath),
    component: currentPath ? nativeComponentTagForPath(currentPath) : undefined,
  });
}

// A source edit: push new sources but never change the route, so an edit while
// the preview is on About (with a different file open) does not snap it Home.
function updateNativePreviewSources() {
  if (!nativeManifest || !nativePreview) return;
  nativePreview.update({ sources: nativeSources(), componentStyles: Object.fromEntries(nativeComponentStyles), assets: Object.fromEntries(nativeAssets) });
  void loadNativeAssets();
  void loadNativeImportedStyles();
}

// Reads the files the shared stylesheets `@import` that are not loaded yet,
// following imports of imports, into the base sources. True when any loaded.
async function readNativeImportedStyles(repo: string, manifest: NativeManifest, live: () => boolean) {
  let loaded = false;
  for (let round = 0; round < 20; round++) {
    const sources = nativeSources(manifest);
    const wanted = expandStyleImports(manifest.styles, (path) => sources[path]).imported.filter((path) =>
      !Object.hasOwn(sources, path) && !nativeMissingImportedStyles.has(path) && !nativeImportedStyleRequests.has(path));
    if (!wanted.length) break;
    wanted.forEach((path) => nativeImportedStyleRequests.add(path));
    try {
      const found: { path: string; sha: string }[] = [];
      for (const path of wanted) {
        const entry = await findEntry(path);
        if (!live()) return false;
        if (entry) found.push({ path, sha: entry.sha });
        else nativeMissingImportedStyles.add(path);
      }
      const contents = found.length ? await readFiles(repo, found.map((file) => file.sha)) : {};
      if (!live()) return false;
      for (const file of found) {
        nativeBaseSources.set(file.path, contents[file.sha]);
        nativeImportedStyles.add(file.path);
        loaded = true;
      }
    } finally {
      wanted.forEach((path) => nativeImportedStyleRequests.delete(path));
    }
  }
  return loaded;
}

async function loadNativeImportedStyles() {
  if (!nativeManifest || !currentRepo || !snapshot) return;
  const manifest = nativeManifest;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const live = () => epoch === generation && request === nativeSourcesRequest && nativeManifest === manifest;
  let loaded = false;
  try {
    loaded = await readNativeImportedStyles(currentRepo.full_name, manifest, live);
  } catch {
    // The preview reports the import as missing.
  }
  if (loaded && live()) updateNativePreviewSources();
}

// Images the pages and components refer to, read once per path as data URLs
// so the sandboxed frame can show them; a path that is not in the branch
// (or not an image) is remembered as missing and left as written.
const nativeAssets = new Map<string, string>();
const nativeMissingAssets = new Set<string>();
const nativeAssetRequests = new Set<string>();
const IMAGE_TYPES: Record<string, string> = {
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
};
const imageType = (path: string) => IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
function referencedImages(sources: Record<string, string>) {
  const out = new Set<string>();
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (!raw || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
      const path = raw.replace(/^\.?\//, "").split(/[?#]/)[0];
      if (path && imageType(path)) out.add(path);
    }
  }
  return out;
}
async function loadNativeAssets() {
  if (!nativeManifest || !currentRepo || !snapshot) return;
  const repo = currentRepo.full_name;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const wanted = [...referencedImages(nativeSources())].filter((path) =>
    !nativeAssets.has(path) && !nativeMissingAssets.has(path) && !nativeAssetRequests.has(path));
  if (!wanted.length) return;
  wanted.forEach((path) => nativeAssetRequests.add(path));
  let loaded = false;
  const scope = draftScope();
  try {
    for (const path of wanted) {
      // A drafted image: an upload's bytes from this browser, a moved or
      // copied one's blob; a deleted one is missing.
      const draft = scope ? draftStore().get(scope, path) : undefined;
      if (draft) nativeDraftAssets.add(path);
      if (draft?.upload && scope) {
        const url = await uploadDataUrl(uploadBytes(), scope, draft).catch(() => undefined);
        if (epoch !== generation || request !== nativeSourcesRequest) return;
        if (url) { nativeAssets.set(path, url); loaded = true; } else nativeMissingAssets.add(path);
        continue;
      }
      const entry = draft?.deleted ? undefined : draft?.sourceSha ? { sha: draft.sourceSha } : await findEntry(path);
      if (epoch !== generation || request !== nativeSourcesRequest) return;
      if (!entry) { nativeMissingAssets.add(path); continue; }
      try {
        const blob = await api<{ content: string }>("raw", { repo, sha: entry.sha });
        if (epoch !== generation || request !== nativeSourcesRequest) return;
        nativeAssets.set(path, `data:${imageType(path)};base64,${blob.content}`);
        loaded = true;
      } catch {
        nativeMissingAssets.add(path);
      }
    }
  } finally {
    wanted.forEach((path) => nativeAssetRequests.delete(path));
  }
  if (loaded && epoch === generation && request === nativeSourcesRequest) updateNativePreviewSources();
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
  const scope = draftScope();
  if (!scope || !files.length) return [];
  const added: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    const result = await addUpload({
      drafts: draftStore(), bytes: uploadBytes(), scope, folder, file,
      taken: async (path) => added.includes(path) || pathNow(path) !== undefined || (await branchPathProblem(path).catch(() => "unknown")) !== undefined,
    });
    if (!result.ok) { errors.push(result.error); continue; }
    added.push(result.path);
    if (result.warning) warnings.push(result.warning);
  }
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
      if (draft.path === NATIVE_MANIFEST_PATH) nativeManifestBase = undefined;
      nativeBaseSources.delete(draft.path);
      nativeBasePageFiles = nativeBasePageFiles.filter((path) => path !== draft.path);
      continue;
    }
    if (!draft.opaque) nativeBaseSources.set(draft.path, draft.content);
    if (draft.path.startsWith(NATIVE_SOURCE_DIR) && !nativeBasePageFiles.includes(draft.path))
      nativeBasePageFiles = [...nativeBasePageFiles, draft.path];
    const sha = result.files.find((file) => file.path === draft.path)?.sha;
    if (draft.path === NATIVE_MANIFEST_PATH && sha) nativeManifestBase = { sha, text: draft.content };
  }
  if (nativeModeActive()) updateNativePreviewSources();
}

function deactivateNative() {
  nativeManifest = undefined;
  updateExplorerTabs();
  nativeManifestBase = undefined;
  nativeBasePageFiles = [];
  nativeEngaged = false;
  nativeBaseSources.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
  nativeImportedStyles.clear();
  nativeMissingImportedStyles.clear();
  nativeImportedStyleRequests.clear();
  nativeAssets.clear();
  nativeMissingAssets.clear();
  nativeBodyStyles = undefined;
  nativeSourcesRequest++;
  nativePreview?.deactivate();
}

function nativeComponentCssPath(componentPath: string) {
  return componentPath.replace(/\.html$/, ".css");
}

async function loadNativeComponentStyles(tags: string[]) {
  if (!nativeManifest || !currentRepo || !snapshot) return;
  const manifest = nativeManifest;
  const repo = currentRepo.full_name;
  const request = nativeSourcesRequest;
  const epoch = generation;
  const wanted = tags.filter((tag) =>
    Object.hasOwn(manifest.components, tag) &&
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
      const path = nativeComponentCssPath(manifest.components[tag]);
      // A stylesheet drafted here (new, or moved with its component) is its draft; a deleted one is missing.
      const draft = scope ? draftStore().get(scope, path) : undefined;
      if (draft && !draft.deleted) { nativeComponentStyles.set(tag, path); continue; }
      if (draft?.deleted) { nativeMissingComponentStyles.add(tag); continue; }
      const entry = await findEntry(path);
      if (epoch !== generation || request !== nativeSourcesRequest || nativeManifest !== manifest) return;
      if (!entry) nativeMissingComponentStyles.add(tag);
      else found.push({ tag, path, sha: entry.sha });
    }
    const contents = await readFiles(repo, found.map((file) => file.sha));
    if (epoch !== generation || request !== nativeSourcesRequest || nativeManifest !== manifest) return;
    for (const file of found) {
      nativeBaseSources.set(file.path, contents[file.sha]);
      nativeComponentStyles.set(file.tag, file.path);
    }
  } finally {
    wanted.forEach((tag) => nativeComponentStyleRequests.delete(tag));
  }
  if (epoch === generation && request === nativeSourcesRequest && nativeManifest === manifest) updateNativePreviewSources();
}

// Every file under `src/` on the branch: from the snapshot's recursive tree
// when it has one, else from one recursive listing of that folder.
async function listNativePageFiles(repo: Repository, result: Snapshot): Promise<string[]> {
  if (result.tree)
    return result.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(NATIVE_SOURCE_DIR)).map((entry) => entry.path);
  const src = result.entries.find((entry) => entry.path === "src" && entry.type === "tree");
  if (!src) return [];
  const listed = await api<Directory>("tree", { repo: repo.full_name, sha: src.sha, recursive: "1" });
  return listed.entries.filter((entry) => entry.type === "blob").map((entry) => `${NATIVE_SOURCE_DIR}${entry.path}`);
}

// The site as edited, for Download site and the site's address: every file
// under `src/` with its drafts, and the manifest and the root site settings
// when the site has them. Undefined when no native site is open.
async function nativeSiteFiles(): Promise<SiteFiles | undefined> {
  const repo = currentRepo?.full_name;
  const scope = draftScope();
  if (!repo || !scope || !nativeModeActive()) return undefined;
  const draftAt = (path: string) => draftStore().get(scope, path);
  const extra: string[] = [];
  if (nativeHasManifest()) extra.push(NATIVE_MANIFEST_PATH);
  for (const path of NATIVE_SITE_PATHS) {
    if (path.startsWith(NATIVE_SOURCE_DIR)) continue;
    const draft = draftAt(path);
    if (draft ? !draft.deleted : await findEntry(path)) extra.push(path);
  }
  return {
    repository: repo,
    paths: [...nativePageFiles(scope), ...extra],
    held: (path) => (path === NATIVE_MANIFEST_PATH ? nativeManifestSource() : nativeEffectiveSource(path, scope)),
    blob: async (path) => {
      const draft = draftAt(path);
      if (draft?.deleted) return undefined;
      if (draft?.opaque) return draft.sourceSha;
      return (await findEntry(path))?.sha;
    },
    readTexts: (shas) => readFiles(repo, shas),
    readBase64: async (sha) => (await api<{ content: string }>("raw", { repo, sha })).content,
  };
}

// The files routes, components and styles are derived from: the branch's
// under `src/`, plus new files there drafted in the browser in `scope`.
function nativePageFiles(scope = draftScope()): string[] {
  const drafts = scope ? draftStore().list(scope).filter((draft) => draft.path.startsWith(NATIVE_SOURCE_DIR)) : [];
  const drafted = drafts.filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path);
  // A file deleted, or renamed or moved away, in the drafts is not routed or found.
  const gone = new Set(drafts.filter((draft) => draft.deleted).map((draft) => draft.path));
  return [...new Set([...nativeBasePageFiles.filter((path) => !gone.has(path)), ...drafted])];
}

// Reads and validates `.astro-editor/native.json` when there is one, completes
// it by convention from the files under `src/` (a project with only
// `src/pages/index.html` is native too), prefetches every referenced source
// file from the current snapshot, and activates the native preview. All async
// steps are guarded against a superseding navigation (`epoch`).
async function activateNativeManifest(repo: Repository, result: Snapshot, epoch: number) {
  const request = ++nativeSourcesRequest;
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const placeholder: NativeManifest = { version: 1, routes: { "/": "src/pages/index.html" }, pages: {}, components: {}, styles: [] };
  const scope = info.user ? { account: info.user.login, repoId: repo.id, repo: repo.full_name, branch: result.branch } : undefined;
  // Locate the manifest, else the home page, first. A failure *before* we
  // confirm either exists cannot be attributed to native intent, so the
  // project opens as plain files. Once one is found, the project is native
  // and every later failure surfaces as a native error rather than silently
  // hiding the preview.
  let manifestText: string | undefined;
  try {
    const dir = result.entries.find((entry) => entry.path === ".astro-editor" && entry.type === "tree");
    const file = dir ? await findEntry(NATIVE_MANIFEST_PATH) : undefined;
    if (!live()) return false;
    if (!file) {
      const src = result.entries.find((entry) => entry.path === "src" && entry.type === "tree");
      const home = src ? await findEntry(NATIVE_HOME_PAGE) : undefined;
      if (!live() || !home) return false;
    }
    // The project is native from here on.
    nativeEngaged = true;
    nativeManifest = undefined;
    nativeManifestBase = undefined;
    manifestText = file ? await readFile(repo.full_name, file.sha) : undefined;
    if (!live()) return true;
    if (file && manifestText !== undefined) nativeManifestBase = { sha: file.sha, text: manifestText };
    nativeBasePageFiles = await listNativePageFiles(repo, result);
    if (!live()) return true;
    const draft = file && scope ? draftStore().get(scope, NATIVE_MANIFEST_PATH) : undefined;
    if (file && draft && scope) {
      // Deleted in the drafts: the site is read as having none.
      if (draft.deleted && draft.baseSha === file.sha) manifestText = undefined;
      else if (draft.baseSha === file.sha) manifestText = draft.content;
      // A publish whose response was lost: the branch already has the draft.
      else if (draft.content === manifestText) draftStore().remove(scope, NATIVE_MANIFEST_PATH);
      // Otherwise GitHub moved on since the draft began: the draft keeps its
      // base (so a save is refused, and the code editor shows the conflict)
      // and the preview follows what GitHub has.
    }
  } catch (error) {
    if (!nativeEngaged) return false;
    if (!live()) return true;
    nativeManifest = undefined;
    nativePreview?.activate(placeholder);
    nativePreview?.setError(error instanceof Error ? error.message : "native.json could not be loaded.");
    return true;
  }
  const parsed = resolveNativeProject(nativePageFiles(scope), manifestText);
  if (!parsed.ok) {
    // A present-but-invalid manifest is a visible native error, never a silent
    // fall-back to plain files that would confuse the project's intent.
    nativeManifest = undefined;
    nativePreview?.activate(placeholder);
    nativePreview?.setWarnings([]);
    nativePreview?.setError(parsed.error);
    return true;
  }
  const manifest = parsed.manifest;
  nativeBaseSources.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
  nativeImportedStyles.clear();
  nativeMissingImportedStyles.clear();
  nativeImportedStyleRequests.clear();
  nativeAssets.clear();
  nativeMissingAssets.clear();
  try {
    // Resolve every referenced file, then read them all in one round trip.
    // A page drafted as a new file has no blob; its draft is its source.
    const drafted = new Set(scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null && !draft.deleted).map((draft) => draft.path) : []);
    const sources: { path: string; sha: string }[] = [];
    for (const path of nativeManifestPaths(manifest)) {
      if (drafted.has(path)) continue;
      const entry = await findEntry(path);
      if (!live()) return true;
      if (!entry) throw new Error(`${manifestText === undefined ? "The site" : "native.json"} references ${path}, which is missing from this branch.`);
      sources.push({ path, sha: entry.sha });
    }
    const contents = sources.length ? await readFiles(repo.full_name, sources.map((source) => source.sha)) : {};
    if (!live()) return true;
    for (const source of sources) nativeBaseSources.set(source.path, contents[source.sha]);
    // Files the shared stylesheets import render with the first update; one
    // that cannot be read is reported by the preview, not here.
    try {
      await readNativeImportedStyles(repo.full_name, manifest, live);
    } catch {
      // Reported by the preview as a missing import.
    }
    if (!live()) return true;
  } catch (error) {
    if (!live()) return true;
    nativeManifest = undefined;
    nativePreview?.activate(manifest);
    nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
    return true;
  }
  if (!live()) return true;
  nativeManifest = manifest;
  pageStructure?.refreshMeta();
  updateCurrentPageLabel();
  nativePreview?.setError(undefined);
  nativePreview?.setWarnings(nativeWarningItems(parsed));
  nativePreview?.activate(manifest);
  nativePreview?.update({
    sources: nativeSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(currentPath) ?? nativeDefaultRoute(manifest),
  });
  updateAgentContext();
  void loadNativeAssets();
  return true;
}

let codeResize: ReturnType<typeof mountCodeResize> | undefined;
let codeWidthResize: ReturnType<typeof mountCodeWidthResize> | undefined;
function updatePreview() {
  updateNativePreview();
}

function setCurrentPage(path?: string) {
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
  element("explorer-toggle").title = path
    ? `Pages & files — ${path}`
    : "Pages & files";
}

// The top bar names the open file: a page of the native site as the Pages
// tab labels it (its manifest title, else its leading comment's, else its
// first heading, else its URL; "Home" for the home page), anything else by
// its path, which the button's tooltip and `data-path` always give.
function updateCurrentPageLabel() {
  const path = currentPath;
  const span = element("current-page");
  const route = nativeRouteForPath(path);
  const label = path && route && nativeManifest
    ? nativePageLabel(path, {
      routes: nativeManifest.routes,
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
  const response = await fetch(
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
function rememberFile(key: string, content: Promise<string>) {
  if (fileContents.size >= fileContentsLimit)
    fileContents.delete(fileContents.keys().next().value!);
  fileContents.set(key, content);
  content.catch(() => {
    if (fileContents.get(key) === content) fileContents.delete(key);
  });
  return content;
}
function readFile(repo: string, sha: string): Promise<string> {
  const key = `${repo}\n${sha}`;
  return (
    fileContents.get(key) ??
    rememberFile(
      key,
      api<{ content: string }>("file", { repo, sha }).then((file) => file.content),
    )
  );
}
// Reads many blobs in one request; anything already cached or in flight is
// reused rather than fetched twice.
async function readFiles(repo: string, shas: string[]): Promise<Record<string, string>> {
  const missing = [...new Set(shas)].filter((sha) => !fileContents.has(`${repo}\n${sha}`));
  for (let start = 0; start < missing.length; start += 64) {
    const chunk = missing.slice(start, start + 64);
    const batch = api<FilesResult>("files", { repo, shas: chunk.join(",") });
    void batch.catch(() => {});
    for (const sha of chunk)
      rememberFile(
        `${repo}\n${sha}`,
        batch.then((result) => {
          if (typeof result.files[sha] !== "string") throw new Error("Could not read this file.");
          return result.files[sha];
        }),
      );
  }
  const result: Record<string, string> = {};
  await Promise.all(
    [...new Set(shas)].map(async (sha) => {
      result[sha] = await readFile(repo, sha);
    }),
  );
  return result;
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
  mode: "loading" | "ready" | "expired" | "error" = "ready",
) {
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
  app.className = "login-page";
  app.innerHTML = `
    <main class="login-card" aria-labelledby="login-title">
      <a class="brand login-brand" href="/" aria-label="Native Site Editor home"><span class="brand-mark">n<span>✦</span></span><span>Native <strong>Site Editor</strong></span></a>
      <h1 id="login-title">Sign in to your workspace</h1>
      <p class="login-description">Connect your GitHub account to access your projects.</p>
      <div id="login-action"></div>
      <div id="notice" class="login-notice" role="alert" hidden></div>
      <p class="login-footnote">Your workspace is available after you sign in.</p>
    </main>
  `;
  const action = element("login-action");
  if (mode === "loading") {
    const loading = node("p", "login-state", "Checking your session…");
    loading.setAttribute("role", "status");
    action.append(loading);
  } else if (mode === "error") {
    action.append(
      button(
        "Retry connection",
        () => void start(),
        "button primary login-button",
      ),
    );
  } else if (info?.configured) {
    action.append(
      link(
        "Continue with GitHub",
        "/auth/login",
        "button primary login-button",
      ),
    );
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
        "Use the private setup link to register the editor's GitHub App. Without that link, this setup page stays locked.",
      ),
    );
    if (info?.ownerSetupUrl)
      details.append(link("Open owner setup", info.ownerSetupUrl, "text-link"));
    action.append(details);
  }
}

function showDirectory(directory: Directory, path = "") {
  fileGeneration++;
  setCurrentPage();
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
        : `${directory.entries.length} entries. Add src/pages/index.html to preview this project in the browser.`,
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
  if (snapshot && treeSignature(treeState()) !== drawnNewFiles) renderFileTree();
}

// The Files tree's row for `path`, when it is drawn.
function fileRow(path: string) {
  return [...files.querySelectorAll<HTMLButtonElement>(".file-row")].find((row) => row.dataset.path === path);
}

// The explorer's Pages | Files tabs: a native site shows both, Pages first
// when the project loads; any other project shows only its files, no tabs.
let explorerTab: "pages" | "files" = "pages";
let pagesTree: ReturnType<typeof createPagesTree> | undefined;

function mountExplorerTabs() {
  const tabs = { pages: element<HTMLButtonElement>("explorer-tab-pages"), files: element<HTMLButtonElement>("explorer-tab-files") };
  for (const [name, tab] of Object.entries(tabs) as ["pages" | "files", HTMLButtonElement][]) {
    tab.addEventListener("click", () => selectExplorerTab(name));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "pages" : event.key === "End" ? "files" : name === "pages" ? "files" : "pages";
      selectExplorerTab(next);
      tabs[next].focus();
    });
  }
}

function selectExplorerTab(name: "pages" | "files") {
  explorerTab = name;
  updateExplorerTabs();
  if (name === "pages") renderPagesTree();
}

function updateExplorerTabs(reset = false) {
  if (!document.getElementById("explorer-tabs")) return;
  const native = Boolean(nativeManifest);
  if (reset) explorerTab = "pages";
  const tab = native ? explorerTab : "files";
  element("explorer-tabs").hidden = !native;
  for (const name of ["pages", "files"] as const) {
    const button = element(`explorer-tab-${name}`);
    const panel = element(`explorer-${name}`);
    button.setAttribute("aria-selected", String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    panel.hidden = tab !== name;
    // Without tabs the files are the whole explorer, not a tab's panel.
    if (native) panel.setAttribute("role", "tabpanel");
    else panel.removeAttribute("role");
  }
  if (!native) pagesTree?.reset();
}

// The site's pages as a tree, from the page files (new drafts included) and
// the parsed manifest; labels read each page's first heading from its source
// as far as it is loaded.
function renderPagesTree(focus?: { file?: string; route?: string }) {
  if (!pagesTree || !nativeManifest || element("explorer-pages").hidden) return;
  const manifest = nativeManifest;
  const scope = draftScope();
  // New pages are marked; a renamed or moved one is the same page.
  const drafted = new Set(scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null && !draft.deleted && !draft.movedFrom).map((draft) => draft.path) : []);
  const site = buildNativePagesTree({
    files: nativePageFiles(scope),
    routes: manifest.routes,
    titles: Object.fromEntries(Object.keys(manifest.routes).map((route) => [route, nativeRouteInfo(route, manifest).title])),
    heading: (file) => firstHeadingText(nativeEffectiveSource(file, scope)),
    isNew: (file) => drafted.has(file),
  });
  pagesTree.render(site, currentPath, focus);
}

// Whether the repository path (a file, or a folder something is in) is under
// src/pages on the branch or drafted: the branch's src/pages is listed whole.
function nativePagesPathExists(path: string) {
  return nativePageFiles().some((file) => file === path || file.startsWith(`${path}/`));
}

// What a new page typed in the Pages tab writes: its file (from the home
// page's shell, its heading the title), its title (a manifest entry when the
// site has a manifest, else the page's leading comment), and, under a page
// with no subpages yet, that page made a folder (`about.html` →
// `about/index.html`, the same URL); or why it cannot.
interface NativeNewPlan extends NativeNewTarget {
  title: string;
  content: string;
  note?: string;
  manifest?: { source: string; result: Extract<NativePageMetaResult, { ok: true }> };
}
function planNativeNew(request: NativeNewRequest): Checked<NativeNewPlan> {
  const manifest = nativeManifest;
  if (!manifest || !draftScope()) return { ok: false, error: "Open a native site first." };
  const title = request.title.trim();
  if (!title) return { ok: false, error: "Enter the page's title." };
  if (!request.slug.trim()) return { ok: false, error: "The title gives no URL: add letters or digits, or change the URL." };
  const target = nativeNewTarget(request.parent, request.slug, {
    route: (route) => manifest.routes[route],
    exists: nativePagesPathExists,
  }, nativePageFiles());
  if (!target.ok) return target;
  const template = nativePageTemplate(nativeEffectiveSource(manifest.routes["/"]), title);
  const convert = target.value.convert;
  const note = convert ? `${nativePageLabelOf(convert.from)} moves to ${convert.to}, its URL still ${request.parent}` : undefined;
  return { ok: true, value: { ...target.value, title, content: nativePageWithTitle(template, title), note } };
}

// The Pages tab's label of the page file `file`.
function nativePageLabelOf(file: string) {
  const manifest = nativeManifest;
  const route = nativeRouteForPath(file);
  if (!manifest || !route) return file;
  return nativePageLabel(file, {
    routes: manifest.routes,
    titles: { [route]: nativeRouteInfo(route, manifest).title },
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

// Creates a new page as one operation: the page file as a new draft and its
// title as a metadata-only manifest entry, both or neither; under a page
// with no subpages yet, that page becomes a folder in the same operation.
// Routes are derived again, the tree drawn and the page opened (the explorer
// closes). Undo in the editor right after takes it all back, as Discard
// changes on the new file does for a plain one.
async function createNativeNew(request: NativeNewRequest): Promise<string | undefined> {
  const planned = planNativeNew(request);
  if (!planned.ok) return planned.error;
  const plan = planned.value;
  if (!plan.convert)
    return commitNativePage({ file: plan.file, route: plan.route, title: plan.title, content: plan.content, manifest: plan.manifest, done: `Created the page ${plan.title} at ${plan.route}.` });
  const convert = plan.convert;
  return applyNativeOperation({
    moves: [convert],
    creates: [{ path: plan.file, content: plan.content }],
    open: plan.file,
    done: `Created the page ${plan.title} at ${plan.route}; ${convert.from} is now ${convert.to}.`,
    undone: `Undid creating the page ${plan.title}.`,
  });
}

// A URL with subpages and no page of its own gets its page, `index.html` in
// its folder, made like a new page.
async function createNativeFolderPage(route: string) {
  const manifest = nativeManifest;
  if (!manifest || !draftScope()) return;
  const file = folderFile(route);
  if (manifest.routes[route] || nativePagesPathExists(file)) { errorMessage(new Error(`The URL ${route} has a page already.`)); return; }
  // Its page deleted in the drafts: Create page brings it back.
  const scope = draftScope();
  if (scope && draftStore().get(scope, file)?.deleted) { undoFileChanges({ restore: [file] }); return; }
  const title = routeHeading(route);
  const content = nativePageWithTitle(nativePageTemplate(nativeEffectiveSource(manifest.routes["/"]), title), title);
  const error = await commitNativePage({ file, route, title, content, done: `Created the page ${title} at ${route}.` });
  if (error) errorMessage(new Error(error));
}

// Writes a new page (a creation or a copy) as one operation: the file as a
// new draft and its title as a metadata-only manifest entry, both or
// neither; then routes are derived again, the trees drawn, the page opened,
// and Undo right after takes both back.
async function commitNativePage(page: {
  file: string;
  route: string;
  title: string;
  content: string;
  manifest?: { source: string; result: Extract<NativePageMetaResult, { ok: true }> };
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
  try {
    if (page.manifest) writeNativeManifest(page.manifest.source, page.manifest.result);
  } catch (error) {
    // Neither part stays: the page goes with the title that could not be written.
    draftStore().remove(scope, page.file);
    return error instanceof Error ? error.message : "The manifest could not be changed.";
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

// ---- The Pages tab's Rename, Duplicate and Delete. ----

// A page's title in its leading comment, as the Page block's Title field
// sets it (the manifest's title for the route, if any, going with it).
async function retitleNativePage(file: string, title: string): Promise<string | undefined> {
  if (!nativeManifest || !nativeRouteForPath(file)) return "This page has no URL in the site.";
  const error = await writeNativePageMeta(file, "title", title, false);
  if (error) return error;
  pageStructure?.refreshMeta();
  renderPagesTree();
  updateCurrentPageLabel();
  return undefined;
}

// A copy of a page beside it: `<slug>-copy` (then `-copy-2`, …), its content
// as it is now, titled "… (copy)" in its leading comment, made like a new
// page.
async function duplicateNativePage(file: string) {
  const manifest = nativeManifest;
  const route = nativeRouteForPath(file);
  if (!manifest || !route) return;
  const parts = file.slice(NATIVE_PAGES_DIR.length, -".html".length).split("/");
  let name = parts.pop()!;
  if (name === "index") name = parts.length ? parts.pop()! : "home";
  const parent = parts.length ? `/${parts.join("/")}/` : "/";
  let target: Checked<NativeNewTarget> | undefined;
  for (let n = 1; n < 100; n++) {
    target = nativeNewTarget(parent, `${name}-copy${n > 1 ? `-${n}` : ""}`, { route: (r) => manifest.routes[r], exists: nativePagesPathExists });
    if (target.ok) break;
  }
  if (!target?.ok) { errorMessage(new Error(target?.error ?? "No name is free for the copy.")); return; }
  const original = nativeEffectiveSource(file);
  if (original === undefined) { errorMessage(new Error("The page could not be read.")); return; }
  const label = nativeRouteInfo(route, manifest).title?.trim() || (route === "/" ? "Home" : firstHeadingText(original)) || routeHeading(route);
  const title = `${label} (copy)`;
  const error = await commitNativePage({
    file: target.value.file, route: target.value.route, title, content: nativePageWithTitle(original, title),
    done: `Duplicated ${label} as ${title} at ${target.value.route}.`,
  });
  if (error) errorMessage(new Error(error));
}

// Delete in the Pages tab. A page with subpages asks whether they go too
// ("Delete About and its 2 subpages") or stay ("Delete only this page": its
// folder is then a URL with no page); a page that was its parent's last
// subpage leaves the parent a file again (`x/index.html` → `x.html`).
async function removeNativePagesTarget(target: NativePagesTarget) {
  const manifest = nativeManifest;
  if (!target.file || !manifest || !confirmDialog) return;
  const unused = manifest.routes[target.route] !== target.file;
  const files = nativePageFiles();
  const folder = routeFolder(target.route);
  const inside = unused ? [] : files.filter((path) => path.startsWith(folder) && path !== target.file);
  const everything = [target.file, ...inside];
  const onGitHub = (paths: string[]) => paths.some((path) => nativeBasePageFiles.includes(path));
  const links = pageLinks(everything, new Map(), "deleted");
  const saveNote = (paths: string[]) => onGitHub(paths)
    ? "It is removed from GitHub when you save. Until then, Restore brings it back."
    : "It is not on GitHub yet, so this discards it.";
  let paths = [target.file];
  if (target.subpages > 0 && !unused) {
    const count = `${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`;
    const answer = await confirmDialog.choose({
      title: `Delete ${target.label}?`,
      notes: [
        `${target.label} (${target.route}) has ${count}. Delete them too, or only this page: its subpages then stay at their URLs, under ${target.route} with no page of its own.`,
        ...(links ? [links] : []),
        saveNote(everything),
      ],
      actions: [
        { label: "Delete only this page", value: "only" },
        { label: `Delete ${target.label} and its ${count}`, value: "all" },
      ],
    });
    if (!answer.value) { announce(`Cancelled deleting ${target.label}`); return; }
    if (answer.value === "all") paths = everything;
  } else {
    const ok = await confirmDialog.ask({
      title: `Delete the page ${target.label} (${target.file})?`,
      notes: [...(links ? [links] : []), saveNote(everything)],
      action: "Delete",
    });
    if (!ok) { announce(`Cancelled deleting ${target.file}`); return; }
    if (inside.length) paths = everything;
  }
  const gone = new Set(paths);
  const after = files.filter((path) => !gone.has(path));
  const parent = parentRoute(target.route);
  const collapse = !unused && parent !== "/" && manifest.routes[parent] === folderFile(parent) ? folderToLeaf(parent, after) : undefined;
  const what = paths.length > 1 && target.subpages
    ? `${target.label} and its ${target.subpages} ${target.subpages === 1 ? "subpage" : "subpages"}`
    : `the page ${target.label}`;
  const error = await applyNativeOperation({
    moves: collapse ? [collapse] : [],
    deletes: paths,
    done: `Deleted ${what}${collapse ? `; ${collapse.from} is now ${collapse.to}` : ""}.`,
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
  /** Pages and components whose links change, by the path they have after the move. */
  links: { path: string; from: string; text: string; count: number }[];
  /** Whether every page and component was read (else the count is a lower bound). */
  complete: boolean;
  /** The moved routes on the live site: an old URL to keep working. */
  redirect: string[];
  /** The page itself is on the live site (not new in this browser). */
  live: boolean;
}

// Whether the file is on GitHub at this path (not a new or moved draft).
function onBranchHere(path: string) {
  const scope = draftScope();
  if (!nativeBasePageFiles.includes(path)) return false;
  const draft = scope ? draftStore().get(scope, path) : undefined;
  return !draft || (draft.baseSha !== null && !draft.deleted);
}

const UNCHANGED_URL = "That is the page's URL now.";

// What changing the URL of the page `file` to the typed `value` does: the
// files that move (the page, its subpages, a parent made a folder or a file
// again), the links that change, the old URLs that could redirect; or why
// it cannot.
function planNativeUrlChange(file: string, value: string): Checked<NativeUrlChange> {
  const manifest = nativeManifest;
  const from = nativeRouteForPath(file);
  if (!manifest || !from || !draftScope()) return { ok: false, error: "This page has no URL in the site." };
  const normalized = normalizeRoute(value);
  if (!normalized.ok) return normalized;
  const to = normalized.value;
  if (to === from) return { ok: false, error: UNCHANGED_URL };
  if (nativeHasManifest() && nativeManifestConflict()) return { ok: false, error: MANIFEST_CONFLICT };
  const planned = planPageMove({ files: nativePageFiles(), routes: manifest.routes, from, to });
  if (!planned.ok) return planned;
  const move = planned.value;
  const moved = new Map(move.moves.map((item) => [item.from, item.to]));
  const links: NativeUrlChange["links"] = [];
  let complete = true;
  for (const path of new Set([...Object.values(manifest.routes), ...Object.values(manifest.components)])) {
    const source = nativeEffectiveSource(path);
    if (source === undefined) { complete = false; continue; }
    const rewritten = rewriteRouteLinks(source, from, to);
    if (rewritten.count) links.push({ path: moved.get(path) ?? path, from: path, text: rewritten.text, count: rewritten.count });
  }
  const redirect = move.routes.filter(([route]) => onBranchHere(manifest.routes[route])).map(([route]) => route);
  return { ok: true, value: { from, to, label: nativePageLabelOf(file), move, links, complete, redirect, live: onBranchHere(file) } };
}

// A change's summary, as the URL field and the confirmation say it.
function describeUrlChange(change: NativeUrlChange) {
  const { move } = change;
  const subpages = move.routes.length - 1;
  const parts = [`Moves ${move.file} to ${move.target}${subpages ? ` with its ${subpages} ${subpages === 1 ? "subpage" : "subpages"}` : ""}`];
  if (move.converted) parts.push(`${move.converted.from} becomes ${move.converted.to}`);
  if (move.collapsed) parts.push(`${move.collapsed.from} becomes ${move.collapsed.to}`);
  const count = change.links.reduce((sum, item) => sum + item.count, 0);
  const least = change.complete ? "" : "at least ";
  parts.push(count
    ? `updates ${least}${count} ${count === 1 ? "link" : "links"} in ${change.links.length} ${change.links.length === 1 ? "file" : "files"}`
    : change.complete ? "no links to update" : "no links found in the pages read");
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

// `src/public/_redirects` as it is now: its draft, or the branch's file.
async function readNativeRedirects(): Promise<string | undefined> {
  const scope = draftScope();
  const draft = scope ? draftStore().get(scope, NATIVE_REDIRECTS_PATH) : undefined;
  if (draft) return draft.deleted ? undefined : draft.content;
  if (!nativeBasePageFiles.includes(NATIVE_REDIRECTS_PATH) || !currentRepo) return undefined;
  const entry = await findEntry(NATIVE_REDIRECTS_PATH);
  return entry ? readFile(currentRepo.full_name, entry.sha) : undefined;
}

// Changes the URL of the page `file` to `value` as one operation, all as
// drafts: the files move (subpages along; a parent made a folder or a file
// again), the manifest's entries follow, every link to the old URL and
// under it points at the new one, and with `keep` the old URLs redirect
// there (`src/public/_redirects`, which is also kept free of chains to the
// old URLs and of redirects away from the new ones). The open page stays
// open where it went. Undo right after takes it all back.
async function changeNativeUrl(file: string, value: string, keep: boolean): Promise<string | undefined> {
  const planned = planNativeUrlChange(file, value);
  if (!planned.ok) return planned.error === UNCHANGED_URL ? undefined : planned.error;
  const change = planned.value;
  const edits = new Map(change.links.map((item) => [item.path, item.text]));
  let redirects: string | undefined;
  try {
    redirects = await readNativeRedirects();
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
  return applyNativeOperation({
    moves: change.move.moves,
    edits,
    manifest: (text) => {
      const rekeyed = rekeyNativeRoutes(text, change.move.routes);
      return rekeyed.ok ? rekeyed.text : text;
    },
    done: `URL changed to ${change.to} — ${summary}${redirected.length ? `; ${change.from} redirects there` : ""}.`,
    undone: `Undid changing the URL of ${change.label} to ${change.to}.`,
    focus: { file: change.move.target },
  });
}

// The rows of Move to…: the top level, then every URL of the site, the page
// itself, its subpages and where it is now not chosen.
function nativeMoveChoices(target: NativePagesTarget): PagePickerItem[] {
  const manifest = nativeManifest;
  if (!manifest) return [];
  const site = buildNativePagesTree({ files: nativePageFiles(), routes: manifest.routes, titles: Object.fromEntries(Object.keys(manifest.routes).map((route) => [route, nativeRouteInfo(route, manifest).title])), heading: (file) => firstHeadingText(nativeEffectiveSource(file)) });
  const parent = parentRoute(target.route);
  const items: PagePickerItem[] = [{ route: "/", label: "Top level", level: 1, disabled: parent === "/" ? "It is there now." : undefined }];
  const walk = (page: NativePageNode, level: number) => {
    if (page.unusedFor) return;
    const disabled = isRouteWithin(page.route, target.route) ? "It is this page or one of its subpages." : page.route === parent ? "It is there now." : undefined;
    items.push({ route: page.route, label: page.file ? page.label : `${page.label} (no page)`, level, disabled });
    for (const child of page.children) walk(child, level + 1);
  };
  for (const page of site.children) walk(page, 2);
  return items;
}

// Why a dragged page cannot go under `parent`, said as it is dragged.
function nativeDropProblem(source: NativePagesTarget, parent: string): string | undefined {
  if (!source.file || source.home) return "This page cannot move.";
  if (isRouteWithin(parent, source.route)) return "A page cannot go under itself or its own subpages.";
  if (parent === parentRoute(source.route)) return "It is already there.";
  const to = `${parent}${routeSlug(source.route)}/`;
  const taken = nativeManifest?.routes[to];
  return taken ? `The URL ${to} is taken by ${taken}.` : undefined;
}

// Moves a page under `parent` ("/" the top level) after a confirmation that
// says its new URL, what else moves, the links updated, and offers to keep
// the old URL working: Move to… and a drop in the Pages tab.
async function confirmNativeMove(source: NativePagesTarget, parent: string) {
  if (!source.file || !confirmDialog) return;
  const to = `${parent}${routeSlug(source.route)}/`;
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
  moves?: FileMove[];
  deletes?: string[];
  /** New files. */
  creates?: { path: string; content: string }[];
  /** New text for files (by the path they have after the moves). */
  edits?: Map<string, string>;
  /** The manifest's text after the moves' entries followed them (a route re-keyed, a title added). */
  manifest?: (text: string) => string;
  /** The file to open after; else the open file where it went (the home page when it went). */
  open?: string;
  done: string;
  undone: string;
  /** The Pages tab's row to show and focus after, when it is open. */
  focus?: { file?: string; route?: string };
}

interface NativeOperationRecord {
  /** Every path it touched, as its draft was before (none: no draft). */
  before: Map<string, SavedDraft | undefined>;
  /** The manifest's text before, when its editor was open (its draft is in `before` otherwise). */
  manifestBefore?: string;
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
 * Moves, deletes, creates and edits files as one operation, with the
 * manifest entries that go with them: drafts written, routes derived again,
 * the trees drawn, the file that was open open where it went. Undo in the
 * open file's editor right after puts every draft back as it was. Resolves
 * to an error message, or nothing.
 */
async function applyNativeOperation(op: NativeOperation): Promise<string | undefined> {
  const scope = draftScope();
  if (!scope || !currentRepo) return "Open a repository first.";
  const store = draftStore();
  const epoch = generation;
  const moves = op.moves ?? [];
  const deletes = op.deletes ?? [];
  const creates = op.creates ?? [];
  const edits = op.edits ?? new Map<string, string>();
  // The files moved and deleted, with their blobs and text; the base of each file edited.
  const movable = new Map<string, MovableFile>();
  const bases = new Map<string, { sha: string; text: string } | undefined>();
  try {
    for (const path of [...moves.map((move) => move.from), ...deletes]) {
      const [found] = await targetFiles({ path, name: path.slice(path.lastIndexOf("/") + 1), folder: false }, true);
      if (!found) return `${path} is not there any more.`;
      movable.set(path, found);
    }
    const arriving = new Set([...moves.map((move) => move.to), ...creates.map((file) => file.path)]);
    for (const path of edits.keys())
      if (!arriving.has(path) && !store.get(scope, path)) bases.set(path, await branchText(path));
  } catch (error) {
    return error instanceof Error ? error.message : "The files could not be read.";
  }
  if (epoch !== generation) return "The repository changed meanwhile. Try again.";

  // The manifest after: entries follow their files, then the operation's own change.
  const manifestOpen = Boolean(editorModule?.isMounted(NATIVE_MANIFEST_PATH));
  let manifest: { source: string; text: string; dropped: Record<string, NonNullable<SavedDraft["entries"]>> } | undefined;
  // The manifest itself deleted: nothing in it follows.
  if (nativeManifest && nativeHasManifest() && !deletes.includes(NATIVE_MANIFEST_PATH)) {
    if (nativeManifestConflict()) return MANIFEST_CONFLICT;
    const source = nativeManifestSource();
    if (source === undefined) return "The manifest cannot be changed right now.";
    const result = moveNativeEntries(source, nativeManifest.routes, [...moves, ...deletes.map((from) => ({ from }))]);
    if (!result.ok) return result.error;
    manifest = { source, text: op.manifest ? op.manifest(result.text) : result.text, dropped: result.dropped };
  }

  const touched = new Set<string>([...moves.flatMap((move) => [move.from, move.to]), ...deletes, ...creates.map((file) => file.path), ...edits.keys()]);
  for (const path of [...touched]) {
    const from = store.get(scope, path)?.movedFrom;
    if (from) touched.add(from);
  }
  if (manifest && !manifestOpen) touched.add(NATIVE_MANIFEST_PATH);
  const before = new Map([...touched].map((path) => [path, store.get(scope, path)] as const));
  const record: NativeOperationRecord = { before, manifestBefore: manifest && manifestOpen ? manifest.source : undefined, opened: currentPath, undone: op.undone };
  const opened = releaseFiles(touched);

  const now = Date.now();
  for (const move of moves) moveFile(store, scope, movable.get(move.from)!, move.to, manifest?.dropped[move.from], now);
  for (const path of deletes) deleteFile(store, scope, movable.get(path)!, manifest?.dropped[path], now);
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
  if (manifest && manifest.text !== manifest.source) {
    try {
      writeNativeManifest(manifest.source, manifestReplacement(manifest.source, manifest.text));
    } catch (error) {
      errorMessage(error);
    }
  }
  afterFileChanges();
  const moved = new Map(moves.map((move) => [move.from, move.to]));
  const next = op.open ?? (opened ? (moved.get(opened) ?? (deletes.includes(opened) ? undefined : opened)) : undefined);
  if (op.open || opened) await openAfter(next, !op.open);
  // Undo in the open file's editor takes the whole operation back.
  if (currentPath && editorModule?.isMounted(currentPath)) editorModule.recordHistoryAction(currentPath, () => undoNativeOperation(record));
  if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree(op.focus ?? {});
  announce(op.done);
  return undefined;
}

async function undoNativeOperation(record: NativeOperationRecord) {
  const scope = draftScope();
  if (!scope) return;
  const store = draftStore();
  releaseFiles(new Set(record.before.keys()));
  if (currentPath && !record.before.has(currentPath)) releaseFiles(new Set([currentPath]));
  for (const [path, draft] of record.before) draft ? store.save(draft) : store.remove(scope, path);
  if (record.manifestBefore !== undefined) {
    const source = nativeManifestSource();
    if (source !== undefined && source !== record.manifestBefore) {
      try {
        writeNativeManifest(source, manifestReplacement(source, record.manifestBefore));
      } catch (error) {
        errorMessage(error);
      }
    }
  }
  afterFileChanges();
  await openAfter(record.opened, true);
  if (explorerDropdown?.isOpen() && explorerTab === "pages") renderPagesTree(record.opened ? { file: record.opened } : undefined);
  announce(record.undone);
}

// Undo right after a creation: the new file and the manifest entry it added
// are discarded together. Nothing is undone once the page is on GitHub.
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

// New page files discarded (Discard changes, an undo, or with the manifest
// draft): the manifest entries their routes had that GitHub's manifest has
// not go with them, so no metadata is left for a page that is gone. Routes
// are then derived again and the trees drawn. Call before the routes are
// derived again, while the files' routes are still known.
function discardedNewPages(paths: string[]) {
  if (!nativeManifest) return;
  const routes = paths.map((path) => nativeRouteForPath(path) ?? nativePageRoute(path)).filter((route): route is string => Boolean(route));
  const source = nativeManifestConflict() ? undefined : nativeManifestSource();
  if (source !== undefined && routes.length) {
    const text = unpairNativeRoutes(nativeManifestBase?.text, source, routes);
    if (text !== source) {
      try {
        writeNativeManifest(source, manifestReplacement(source, text));
      } catch (error) {
        errorMessage(error);
      }
    }
  }
  refreshNativeRoutes();
  renderFileTree();
  updateAgentContext();
}

// The minimal edit from `source` to `text`, or to GitHub's manifest when
// `text` says the same, so a manifest edited back needs no draft.
function manifestReplacement(source: string, text: string): Extract<NativePageMetaResult, { ok: true }> {
  const base = nativeManifestBase?.text;
  const next = base !== undefined && sameNativeJson(text, base) ? base : text;
  let start = 0;
  while (start < source.length && start < next.length && source[start] === next[start]) start++;
  let end = 0;
  while (end < source.length - start && end < next.length - start && source[source.length - 1 - end] === next[next.length - 1 - end]) end++;
  return { ok: true, text: next, edit: next === source ? null : { start, end: source.length - end, text: next.slice(start, next.length - end) } };
}

// Discard changes on the manifest: new page files whose entries it added are
// discarded with it (the confirmation names them), so no page it titled is
// left half made.
function nativeManifestDiscardPlan() {
  const scope = draftScope();
  const source = editorModule?.getMountedSource(NATIVE_MANIFEST_PATH);
  if (!scope || !nativeManifest || source === undefined) return undefined;
  const added = new Set(addedNativeRouteEntries(nativeManifestBase?.text, source));
  const pages = newDraftPaths(scope).filter((path) => {
    const route = nativeRouteForPath(path) ?? nativePageRoute(path);
    return route !== undefined && added.has(route);
  });
  if (!pages.length) return undefined;
  return {
    note: `The new ${pages.length === 1 ? "page" : "pages"} it titles ${pages.length === 1 ? "is" : "are"} discarded with it: ${pages.join(", ")}.`,
    after: () => {
      for (const path of pages) editorModule?.dropDraft(scope, path);
      discardedNewPages(pages);
      element("status").textContent = `Discarded native.json's changes and the new ${pages.length === 1 ? "page" : "pages"} ${pages.join(", ")}.`;
    },
  };
}

// The manifest's warnings for the preview, metadata with no page offering to
// remove the entry or to create the page it describes.
function nativeWarningItems(parsed: { warnings: string[]; orphans: string[]; manifest?: NativeManifest }): (string | NativeWarning)[] {
  const orphans = new Set(parsed.orphans.map(nativeOrphanWarning));
  const details = nativeDetailsNotice(parsed.manifest);
  return [
    ...(details ? [details] : []),
    ...parsed.warnings.filter((warning) => !orphans.has(warning)),
    ...parsed.orphans.map((route) => ({
      text: nativeOrphanWarning(route),
      fixes: [
        { label: "Remove entry", ariaLabel: `Remove the entry for ${route} from native.json`, title: `Remove the metadata for ${route} from native.json`, run: () => removeNativeOrphan(route) },
        { label: "Create the page", ariaLabel: `Create the page ${route}`, title: `Create a page at ${route} from the home page`, run: () => void createNativeOrphanPage(route) },
      ],
    })),
  ];
}

// The notice for page details still in the manifest: the pages whose title
// or description native.json gives, with the button that moves them into
// the pages. Once moved, when the manifest says nothing the files do not
// already, the summary offers to remove it.
function nativeDetailsNotice(manifest: NativeManifest | undefined): NativeWarning | undefined {
  if (!manifest || !nativeHasManifest() || nativeManifestConflict()) return undefined;
  const source = nativeManifestSource();
  if (source === undefined) return undefined;
  const routes = nativeManifestDetailRoutes(source).filter((route) => Object.hasOwn(manifest.routes, route));
  if (routes.length) {
    const pages = routes.length === 1 ? "1 page its title or description" : `${routes.length} pages their titles or descriptions`;
    return {
      text: `native.json gives ${pages}. A page's details now live in its leading <!-- title: … --> comment.`,
      fixes: [{ label: "Move page details into the pages", title: "Move every title and description from native.json into its page's leading comment", run: () => void moveNativeDetailsIntoPages() }],
    };
  }
  if (nativeDetailsMoved && pathNow(NATIVE_HOME_PAGE) === "file" && nativeManifestRedundant(source, nativePageFiles()))
    return {
      text: "The page details are in the pages now, and native.json says nothing the files do not already say.",
      fixes: [{ label: "Remove native.json", title: `Delete ${NATIVE_MANIFEST_PATH} (a change to save, like any deletion)`, run: () => void removeNativeManifest() }],
    };
  return undefined;
}

// Moves every route's title and description from the manifest into its
// page's leading comment, and out of the manifest, as one operation over the
// drafts: Undo right after takes it all back.
async function moveNativeDetailsIntoPages() {
  const manifest = nativeManifest;
  if (!manifest || !nativeHasManifest()) return;
  const source = nativeManifestConflict() ? undefined : nativeManifestSource();
  if (source === undefined) { errorMessage(new Error(MANIFEST_CONFLICT)); return; }
  const sources: Record<string, string | undefined> = {};
  for (const file of Object.values(manifest.routes)) sources[file] = nativeEffectiveSource(file);
  const planned = planNativeDetailsMigration(source, manifest.routes, sources);
  if (!planned.ok) { errorMessage(new Error(planned.error)); return; }
  const { value } = planned;
  if (!value.moved.length) return;
  const count = value.moved.length === 1 ? "1 page" : `${value.moved.length} pages`;
  const redundant = nativeManifestRedundant(value.manifest, nativePageFiles());
  const wasMoved = nativeDetailsMoved;
  nativeDetailsMoved = true;
  const error = await applyNativeOperation({
    edits: new Map(Object.entries(value.pages)),
    manifest: () => value.manifest,
    done: `Moved the titles and descriptions of ${count} into the pages${redundant ? "; native.json now says nothing the files do not, so it can be removed" : ""}.`,
    undone: "Undid moving the page details into the pages.",
  });
  if (error) { nativeDetailsMoved = wasMoved; errorMessage(new Error(error)); }
}

// Deletes the manifest (a draft, saved like any deletion) when the site is
// native without it.
async function removeNativeManifest() {
  if (!nativeHasManifest()) return;
  if (pathNow(NATIVE_HOME_PAGE) !== "file") { errorMessage(new Error(`${NATIVE_MANIFEST_PATH} cannot be deleted: without ${NATIVE_HOME_PAGE} the site needs it.`)); return; }
  const error = await applyNativeOperation({
    deletes: [NATIVE_MANIFEST_PATH],
    done: `Deleted ${NATIVE_MANIFEST_PATH}: the site is read from its files. Save to GitHub to remove it there.`,
    undone: `Undid deleting ${NATIVE_MANIFEST_PATH}.`,
  });
  if (error) errorMessage(new Error(error));
}

function removeNativeOrphan(route: string) {
  const source = nativeManifestConflict() ? undefined : nativeManifestSource();
  if (source === undefined) { errorMessage(new Error(MANIFEST_CONFLICT)); return; }
  const removed = removeNativeRouteEntry(source, route);
  if (!removed.ok) { errorMessage(new Error(removed.error)); return; }
  try {
    writeNativeManifest(source, manifestReplacement(source, removed.text));
  } catch (error) {
    errorMessage(error);
    return;
  }
  refreshNativeRoutes();
  element("status").textContent = `Removed the entry for ${route} from native.json.`;
}

// The page the orphaned metadata describes, made like a new page: its file
// where file-based routing gives it the route, its heading the entry's title.
async function createNativeOrphanPage(route: string) {
  const scope = draftScope();
  const manifest = nativeManifest;
  if (!scope || !manifest) return;
  const path = nativeNewPagePath(route, nativePagesPathExists);
  if (!path.ok) { errorMessage(new Error(path.error)); return; }
  if (nativePagesPathExists(path.value)) { errorMessage(new Error(`${path.value} is already there.`)); return; }
  const title = manifest.pages[route]?.title?.trim() || routeHeading(route);
  const draft: SavedDraft = { ...scope, version: 1, path: path.value, baseSha: null, original: "", content: nativePageTemplate(nativeEffectiveSource(manifest.routes["/"], scope), title), updatedAt: Date.now() };
  draftStore().save(draft);
  const failure = draftStore().error;
  if (failure) { errorMessage(new Error(failure)); return; }
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
  refreshNativeRoutes();
  renderFileTree();
  updateAgentContext();
  const epoch = generation;
  await openNewDraft(draft);
  if (epoch === generation && currentPath === path.value)
    editorModule?.recordHistoryAction(path.value, () => undoNativeCreation({ kind: "page", file: path.value, route, title }));
  element("status").textContent = `Created the page ${path.value} at ${route}.`;
}

let createDialog: ReturnType<typeof createCreateDialog> | undefined;

// What a creation in the Files tab writes: new files (drafts with no base
// blob), the manifest entry a new stylesheet or component adds, and what to
// show after. Planned as the name is typed, so the dialog says the result
// live. Pages are made in the Pages tab (`createNativeNew`), where the URL is
// the site's; a file or folder here is only ever what was typed.
interface Creation {
  files: { path: string; content: string }[];
  register?: NativeRegistration;
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
    entryAt(folder)?.type === "tree" || nativeBasePageFiles.some((path) => inFolder(path, folder)) || drafted.some((path) => inFolder(path, folder));
  // What stands in the way of a new file at `path`, as far as is known here;
  // without the whole-commit tree, GitHub is asked on confirm.
  const problem = (path: string) => {
    if (draftStore().get(scope, path)?.deleted) return `${path} is deleted in your changes. Restore it instead.`;
    if (draftStore().get(scope, path)) return `${path} already has a draft in this browser.`;
    if (folderExists(path)) return `There is a folder ${path} already.`;
    if (entryAt(path) || nativeBasePageFiles.includes(path)) return `${path} already exists.`;
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (entryAt(parent)?.type === "blob" || draftStore().get(scope, parent)) return `${parent} is a file, so nothing can go in it.`;
    }
    return undefined;
  };
  const routes = nativeManifest?.routes ?? {};
  const routeTaken = (route: string) => (Object.hasOwn(routes, route) ? `The URL ${route} already has a page, ${routes[route]}.` : undefined);
  const manifestSource = () => (nativeManifestConflict() ? undefined : nativeManifestSource());
  const fail = (error: string): Checked<Creation> => ({ ok: false, error });

  if (kind === "file") {
    const path = newFilePath(folder, name);
    if (!path.ok) return path;
    const blocked = problem(path.value);
    if (blocked) return fail(blocked);
    const route = nativeManifest ? nativePageRoute(path.value) : undefined;
    if (route && routeTaken(route)) return fail(routeTaken(route)!);
    // With no manifest, or a stylesheet where the manifest lists no styles,
    // the file is found by convention and nothing is registered.
    const found = nativeManifest && nativeHasManifest() ? nativeRegistration(path.value) : undefined;
    const register = found?.kind === "style" && !nativeManifest?.explicit?.styles ? undefined : found;
    if (register) {
      const source = manifestSource();
      if (source === undefined) return fail(MANIFEST_CONFLICT);
      const check = registerNativeFile(source, register);
      if (!check.ok) return check;
    }
    const adds = register?.kind === "style" ? " and adds it to the site's styles in native.json"
      : register?.kind === "component" ? ` and adds the component <${register.tag}> to native.json` : "";
    const page = route ? `, the page at ${route}` : "";
    return { ok: true, value: {
      files: [{ path: path.value, content: "" }], register, open: path.value,
      summary: `Creates the empty file ${path.value}${page}${adds}.`,
      done: `Created ${path.value}${page}.`,
    } };
  }

  const path = newFolderPath(folder, name);
  if (!path.ok) return path;
  if (folderExists(path.value) || entryAt(path.value)) return fail(`${path.value} already exists.`);
  const keep = `${path.value}/.gitkeep`;
  const blocked = problem(keep);
  if (blocked) return fail(blocked);
  const pagesHint = nativeManifest && `${path.value}/`.startsWith(NATIVE_PAGES_DIR) ? " To add pages and subpages, use the Pages tab." : "";
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

// Carries out a creation: the new files as drafts, the manifest edits, the
// routes derived again, the tree drawn with the new files, and the new file
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
  // Checked when planned; a failure here leaves the file created and says why.
  try {
    for (const edit of [
      creation.register && ((source: string) => registerNativeFile(source, creation.register!)),
    ]) {
      if (!edit) continue;
      const source = nativeManifestSource();
      if (source === undefined) throw new Error("The manifest cannot be changed right now.");
      const result = edit(source);
      if (!result.ok) throw new Error(result.error);
      writeNativeManifest(source, result);
    }
  } catch (error) {
    errorMessage(error);
  }
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
  if (creation.files.some((file) => nativePageRoute(file.path)) || creation.register) refreshNativeRoutes();
  updateAgentContext();
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
// saved with Save to GitHub in one commit. What goes with it in a native
// site is written in the same operation: a page's manifest entry follows it
// to its new route or goes with it, a component's or stylesheet's entry
// names its new path or goes (`moveNativeEntries`), and routes are derived
// again. Undo right after (the open file's editor), Restore on a deletion
// and Move back on a rename take the whole operation back.
let fileActions: ReturnType<typeof createFileRowActions> | undefined;
let confirmDialog: ReturnType<typeof createConfirmDialog> | undefined;
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
  if (entry?.type === "blob" || entry?.type === "commit" || nativeBasePageFiles.includes(path)) return "file";
  const prefix = `${path}/`;
  if (state.drafted.some((file) => file.startsWith(prefix))) return "folder";
  const inside = snapshot?.tree
    ? snapshot.tree.filter((item) => item.type !== "tree" && item.path.startsWith(prefix)).map((item) => item.path)
    : nativeBasePageFiles.filter((file) => file.startsWith(prefix));
  if (inside.some((file) => !state.deleted.has(file))) return "folder";
  if (inside.length) return "deleted";
  return entry?.type === "tree" ? "folder" : undefined;
}

// The protected files a target takes: native.json and the home page.
function protectedProblem(target: FileRowTarget, operation: FileOperation) {
  const home = nativeManifest?.routes["/"];
  const inside = (path: string | undefined) => path !== undefined && (path === target.path || (target.folder && path.startsWith(`${target.path}/`)));
  return protectedPathProblem([NATIVE_MANIFEST_PATH, home].filter(inside) as string[], operation, home, nativeEngaged, pathNow(NATIVE_HOME_PAGE) === "file");
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
  const wanted = live.filter((entry) => !draftStore().get(scope, entry.path) && (entry.size ?? 0) <= 128 * 1024 && !BINARY_FILE.test(entry.path));
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

// For a confirmation: the pages and components that link to the pages
// among `paths` whose URL goes away.
function pageLinks(paths: string[], moves: Map<string, string | undefined>, action: "deleted" | "moved") {
  if (!nativeManifest) return undefined;
  const routes = paths.flatMap((path) => {
    const route = nativeRouteForPath(path);
    if (!route) return [];
    const to = moves.get(path);
    return to && (nativeRouteForPath(to) ?? nativePageRoute(to)) === route ? [] : [route];
  });
  if (!routes.length) return undefined;
  const sources: Record<string, string | undefined> = {};
  for (const path of [...Object.values(nativeManifest.routes), ...Object.values(nativeManifest.components)]) sources[path] = nativeEffectiveSource(path);
  return linkNote(filesLinkingTo(sources, routes, new Set(paths)), routes, action);
}

interface FileOperationRecord {
  /** The drafts of every path it touched, as they were before. */
  before: Map<string, SavedDraft | undefined>;
  moves: NativeFileMove[];
  dropped: Record<string, NonNullable<SavedDraft["entries"]>>;
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
function afterFileChanges() {
  forgetDraftedAssets();
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
  if (nativeManifest) {
    // Component stylesheets are found again where their components now are.
    nativeComponentStyles.clear();
    nativeMissingComponentStyles.clear();
    refreshNativeRoutes();
    void loadNativeComponentStyles(Object.keys(nativeManifest.components));
  }
  renderFileTree();
  updateAgentContext();
  updateCurrentPageLabel();
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
  else if (nativeManifest?.routes["/"]) await restoreFile(nativeManifest.routes["/"], epoch, keep);
  else if (snapshot) showDirectory(snapshot);
}

/**
 * Renames, moves (`to`) or deletes (no `to`) files as one operation: the
 * drafts, the manifest entries that go with them, routes derived again, the
 * trees drawn, and the open file kept open where it went (or the home page
 * opened when it is gone). Resolves to an error message, or nothing.
 */
async function applyFileOperation(ops: { file: MovableFile; to?: string }[]): Promise<string | undefined> {
  const scope = draftScope();
  if (!scope || !ops.length) return "Open a repository first.";
  const store = draftStore();
  const moves: NativeFileMove[] = ops.map((op) => (op.to ? { from: op.file.path, to: op.to } : { from: op.file.path }));
  let manifest: { source: string; text: string; dropped: Record<string, NonNullable<SavedDraft["entries"]>> } | undefined;
  if (nativeManifest && nativeHasManifest() && !moves.some((move) => move.from === NATIVE_MANIFEST_PATH)) {
    const source = nativeManifestConflict() ? undefined : nativeManifestSource();
    if (source !== undefined) {
      const result = moveNativeEntries(source, nativeManifest.routes, moves);
      if (!result.ok) return result.error;
      manifest = { source, text: result.text, dropped: result.dropped };
    } else {
      // The manifest draft is in conflict: only files it does not name can go.
      const base = nativeManifestBase?.text;
      const check = base !== undefined ? moveNativeEntries(base, nativeManifest.routes, moves) : undefined;
      if (check?.ok && check.text !== base) return MANIFEST_CONFLICT;
    }
  }
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
    const entries = manifest?.dropped[op.file.path];
    if (op.to) moveFile(store, scope, op.file, op.to, entries);
    else deleteFile(store, scope, op.file, entries);
  }
  const failure = store.error;
  if (failure) {
    for (const [path, draft] of before) draft ? store.save(draft) : store.remove(scope, path);
    afterFileChanges();
    await openAfter(opened);
    return failure;
  }
  if (manifest && manifest.text !== manifest.source) {
    try {
      writeNativeManifest(manifest.source, manifestReplacement(manifest.source, manifest.text));
    } catch (error) {
      errorMessage(error);
    }
  }
  afterFileChanges();
  const record: FileOperationRecord = { before, moves, dropped: manifest?.dropped ?? {} };
  if (opened) {
    const to = ops.find((op) => op.file.path === opened)?.to;
    record.opened = { from: opened, to };
    await openAfter(to);
  }
  // Undo in the open file's editor takes the whole operation back.
  if (currentPath && editorModule?.isMounted(currentPath)) editorModule.recordHistoryAction(currentPath, () => undoFileOperation(record));
  return undefined;
}

// Undo right after an operation: the drafts as they were, the manifest's
// entries back where they were, and the file that was open open again.
async function undoFileOperation(record: FileOperationRecord) {
  const scope = draftScope();
  if (!scope) return;
  const store = draftStore();
  const opened = releaseFiles(new Set([...record.before.keys()]));
  for (const [path, draft] of record.before) draft ? store.save(draft) : store.remove(scope, path);
  putBackEntries(record.moves.filter((move) => move.to).map((move) => ({ from: move.to!, to: move.from })), Object.values(record.dropped));
  afterFileChanges();
  const back = record.opened?.from ?? (opened && record.moves.find((move) => move.to === opened)?.from) ?? opened;
  if (back) await openAfter(back);
  announce(`Undid ${describeMoves(record.moves)}.`);
}

// The manifest with renames reversed and dropped entries put back.
function putBackEntries(moves: NativeFileMove[], dropped: (SavedDraft["entries"] | undefined)[]) {
  if (!nativeManifest) return;
  const source = nativeManifestConflict() ? undefined : nativeManifestSource();
  if (source === undefined) return;
  let text = source;
  if (moves.length) {
    const moved = moveNativeEntries(text, nativeManifest.routes, moves);
    if (moved.ok) text = moved.text;
  }
  for (const entries of dropped) {
    const restored = restoreNativeEntries(text, entries);
    if (restored.ok) text = restored.text;
  }
  if (text === source) return;
  try {
    writeNativeManifest(source, manifestReplacement(source, text));
  } catch (error) {
    errorMessage(error);
  }
}

function describeMoves(moves: NativeFileMove[]) {
  if (moves.length !== 1) return moves.some((move) => move.to) ? `moving ${moves.length} files` : `deleting ${moves.length} files`;
  const [move] = moves;
  if (!move.to) return `deleting ${move.from}`;
  return parentOf(move.from) === parentOf(move.to) ? `renaming ${move.from} to ${move.to}` : `moving ${move.from} to ${move.to}`;
}

/**
 * Restores deletions and moves renamed files back (Restore in the tree, the
 * Save panel's Restore and Move back, Discard changes on a renamed file),
 * with the manifest entries that went with them.
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
  const reversed: NativeFileMove[] = [];
  const dropped: SavedDraft["entries"][] = [];
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
    dropped.push(result.entries);
  }
  putBackEntries(reversed, dropped);
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

// A change's Restore (a deletion) or Move back (a rename) in the Save panel.
function discardFileChange(change: FileChange) {
  if (change.kind === "A" && change.drafts[0]?.upload) discardUpload(change.path);
  else if (change.kind === "D") undoFileChanges({ restore: [change.path] });
  else if (change.kind === "R") undoFileChanges({ moveBack: [change.path] });
}

// Drafts of files GitHub deleted since they began, found when a snapshot
// loads (src/file-changes.ts): a deletion is dropped, an edit waits in Save
// to GitHub and the code editor for Discard draft or Keep as new file.
async function findDeletedUpstream(epoch: number) {
  deletedUpstream = new Set();
  const scope = draftScope();
  if (!scope) return;
  const drafts = draftStore().list(scope).filter((draft) => draft.baseSha !== null);
  const missing = new Set<string>();
  try {
    for (const draft of drafts) {
      const entry = await findEntry(draft.path);
      if (epoch !== generation) return;
      if (!entry) missing.add(draft.path);
    }
  } catch {
    // Unknown: a save reports it instead.
    return;
  }
  deletedUpstream = new Set(settleDeletedUpstream(draftStore(), scope, drafts, missing));
}

// Discard draft (`keep` false) or Keep as new file, for an edit of a file
// GitHub deleted. A discarded manifest leaves the project without one, as
// GitHub has it; kept, it is the manifest again once saved.
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
}
function planFileMoveUrls(ops: { file: MovableFile; to: string }[]): FileMoveUrls | undefined {
  const manifest = nativeManifest;
  if (!manifest) return undefined;
  const moved = new Map(ops.map((op) => [op.file.path, op.to]));
  const files = nativePageFiles().map((path) => moved.get(path) ?? path);
  let manifestAfter: string | undefined;
  if (nativeHasManifest()) {
    const source = nativeManifestConflict() ? undefined : nativeManifestSource();
    if (source === undefined) return undefined;
    const result = moveNativeEntries(source, manifest.routes, ops.map((op) => ({ from: op.file.path, to: op.to })));
    manifestAfter = result.ok ? result.text : source;
  }
  const after = resolveNativeProject(files, manifestAfter);
  if (!after.ok) return undefined;
  const routeOf = new Map(Object.entries(after.manifest.routes).map(([route, file]) => [file, route]));
  const pairs: [string, string][] = [];
  const gone: string[] = [];
  for (const [route, file] of Object.entries(manifest.routes)) {
    const to = moved.get(file);
    if (!to) continue;
    const next = routeOf.get(to);
    if (!next) gone.push(file);
    else if (next !== route) pairs.push([route, next]);
  }
  if (!pairs.length) return undefined;
  const changes = groupRouteChanges(Object.keys(manifest.routes), pairs);
  const links: FileMoveUrls["links"] = [];
  let complete = true;
  for (const path of new Set([...Object.values(manifest.routes), ...Object.values(manifest.components)])) {
    let text = nativeEffectiveSource(path);
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
    const routes = change.subtree ? Object.keys(manifest.routes).filter((route) => isRouteWithin(route, change.from)) : [change.from];
    redirect.set(change, routes.filter((route) => pairs.some(([from]) => from === route) && onBranchHere(manifest.routes[route])));
  }
  const live = pairs.some(([route]) => onBranchHere(manifest.routes[route]));
  return { changes, links, complete, redirect, live, gone };
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
  // The manifest: what the site loses with it, unless the files already say it all.
  const manifestText = found.some((file) => file.path === NATIVE_MANIFEST_PATH) ? nativeManifestSource() : undefined;
  const manifestNote = manifestText === undefined ? undefined
    : nativeManifestRedundant(manifestText, nativePageFiles().filter((path) => !found.some((file) => file.path === path)))
      ? "The site is then read from its files alone, which already give everything native.json says."
      : "The site is then read from its files alone: what native.json adds (page titles and descriptions, JSON-LD, routes, components or styles it names) is lost. Move page details into the pages first to keep them.";
  const title = wording?.title ?? (target.folder ? `Delete the folder ${target.path} and its ${count} ${count === 1 ? "file" : "files"}?` : `Delete ${target.path}?`);
  const ok = await confirmDialog?.ask({
    title,
    notes: [
      ...(links ? [links] : []),
      ...(manifestNote ? [manifestNote] : []),
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
    const icon = node(
      "span",
      `file-icon ${directory ? "folder" : ""}`,
      directory
        ? "▸"
        : entry.type === "commit"
          ? "↗"
          : entry.mode === "120000"
            ? "↪"
            : "◇",
    );
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
      icon.textContent = "▾";
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
          icon.textContent = childList.hidden ? "▸" : "▾";
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
      const add = node("button", "file-add", "+");
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
  if ((entry.size ?? 0) > 128 * 1024) {
    content.replaceChildren(
      node(
        "p",
        "empty-message",
        "This file is larger than the 128 KB text preview limit.",
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
      void refreshPublishedSnapshot(scope.repo, scope.branch);
      if (nativeEngaged && !result.unchanged)
        siteActions?.track({ repo: scope.repo, commit: result.commit, url: result.url },
          () => currentRepo?.id === scope.repoId && (snapshot?.branch ?? branchSelect.value) === scope.branch && info.user?.login === scope.account);
    },
    onDiscardNew: () => {
      // A discarded page no longer routes, and the manifest entry it came
      // with goes too; the site shows the page's parent page, else home.
      const page = Boolean(nativeManifest && (nativeRouteForPath(path) ?? nativePageRoute(path)));
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
      // The Page fields follow the manifest and the page's comment (typed, undone or redone).
      if (value?.path === NATIVE_MANIFEST_PATH || (value && nativeRouteForPath(value.path))) pageStructure?.refreshMeta();
      // A heading or title typed in the open file renames it in the top bar.
      updateCurrentPageLabel();
    },
    onHistory: openHistory,
    discardPlan: path === NATIVE_MANIFEST_PATH ? nativeManifestDiscardPlan : undefined,
    movedFrom: baseSha === null ? draftStore().get(scope, path)?.movedFrom : undefined,
    onMoveBack: () => undoFileChanges({ moveBack: [path] }),
    onDiscardChange: discardFileChange,
    deletedUpstream: (path) => deletedUpstream.has(path),
    onSettleDeleted: settleDeletedDraft,
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
  if (nativeModeActive() && lastNativeSelection?.path !== path) nativePreview?.hideEditBar();
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

// The component whose template is `path`, per the manifest.
function nativeComponentTagForPath(path: string) {
  if (!nativeManifest) return undefined;
  return Object.entries(nativeManifest.components).find(([, file]) => file === path)?.[0];
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
}

// ---- Agents (src/agent-site.ts): the context shared, and changes applied through the editor's own actions. ----

function agentRepository() {
  return currentRepo && snapshot && info.user ? { id: currentRepo.id, fullName: currentRepo.full_name } : undefined;
}
async function agentContext(): Promise<EditorContext | undefined> {
  const scope = draftScope();
  if (!currentRepo || !snapshot || !scope) return undefined;
  const manifest = nativeManifest;
  return buildAgentContext({
    repository: { id: currentRepo.id, fullName: currentRepo.full_name },
    branch: snapshot.branch,
    commit: snapshot.commit,
    file: activeFileContext,
    drafts: draftStore().list(scope),
    mountedSource: (path) => editorModule?.getMountedSource(path),
    native: manifest && {
      manifest,
      hasManifest: nativeHasManifest(),
      files: nativePageFiles(scope),
      routeInfo: (route) => nativeRouteInfo(route, manifest),
      source: (path) => nativeEffectiveSource(path, scope),
      exists: (path) => pathNow(path) === "file",
      openFile: currentPath,
      selection: lastNativeSelection,
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
const agentSiteActions: AgentSiteActions = {
  async text(path) {
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
  writeDraft: (path, content, create) =>
    applyNativeOperation({
      ...(create ? { creates: [{ path, content }] } : { edits: new Map([[path, content]]) }),
      ...(nativePageRoute(path) ? { open: path } : {}),
      done: `An agent ${create ? "created" : "changed"} ${path}.`,
      undone: `Undid the agent's change to ${path}.`,
    }),
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
  template: (tag) => (nativeManifest?.components[tag] ? nativeSources()[nativeManifest.components[tag]] : undefined),
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
  legacy: applyAgentCommand,
};
function applyAgentSiteCommand(command: AgentCommand) {
  if (!snapshot || command.branch !== snapshot.branch || command.commit !== snapshot.commit)
    throw new Error("The editor changed branch or revision.");
  return applySiteCommand(agentSiteActions, command);
}
// The page shown after the page `path` is gone: the nearest page above it
// (by folder) that has one, else the home page.
function nativeFallbackPage(path: string) {
  if (!nativeManifest) return undefined;
  const parts = path.slice(NATIVE_PAGES_DIR.length).split("/").slice(0, -1);
  for (let length = parts.length; length > 0; length--) {
    const file = nativeManifest.routes[`/${parts.slice(0, length).join("/")}/`];
    if (file && file !== path) return file;
  }
  return nativeManifest.routes["/"];
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

async function refreshPublishedSnapshot(repo: string, branch: string) {
  const epoch = generation;
  try {
    const result = await api<Snapshot>("snapshot", { repo, branch });
    if (
      epoch !== generation ||
      currentRepo?.full_name !== repo ||
      snapshot?.branch !== branch
    )
      return;
    snapshot = result;
    await findDeletedUpstream(epoch);
    if (epoch !== generation) return;
    updateAgentContext();
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    renderFileTree();
    status("Selected files saved to GitHub.");
  } catch (error) {
    if (epoch === generation) errorMessage(error);
  }
}

async function loadSnapshot(
  resumePath?: string,
  prefetched?: Promise<Snapshot>,
) {
  if (!currentRepo || !branchSelect.value) return;
  const reopen =
    resumePath ??
    (snapshot?.branch === branchSelect.value ? currentPath : undefined);
  const epoch = ++generation;
  fileGeneration++;
  clearError();
  snapshot = undefined;
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
      }));
    if (epoch !== generation) return;
    snapshot = result;
    await findDeletedUpstream(epoch);
    if (epoch !== generation) return;
    updateAgentContext();
    updatePreview();
    // Start reading the file to reopen now, alongside the native manifest.
    const reopenEntry = reopen ? entryAt(reopen) : undefined;
    if (reopenEntry?.type === "blob" && (reopenEntry.size ?? 0) <= 128 * 1024)
      void readFile(repo.full_name, reopenEntry.sha).catch(() => {});
    const isNative = await activateNativeManifest(repo, result, epoch);
    if (epoch !== generation) return;
    // A native project opens on its home page when nothing else is selected;
    // its source is already in memory from the manifest prefetch.
    const open = reopen ?? (isNative ? nativeManifest?.routes["/"] : undefined);
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    renderFileTree();
    updateExplorerTabs(true);
    showDirectory(result);
    if (info.user)
      rememberWorkspace(info.user.login, {
        repoId: repo.id,
        branch,
        path: open,
      });
    if (open) await restoreFile(open, epoch);
    if (epoch !== generation) return;
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
      options(branchSelect, [{ value: "", label: "No branches yet" }]);
      content.replaceChildren(
        node(
          "p",
          "empty-message",
          "This repository is empty. Add your site files on GitHub, then reload repositories.",
        ),
      );
      status("Empty repository.");
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

async function loadRepositories(prefetched?: Repository[]) {
  const epoch = ++generation;
  fileGeneration++;
  currentRepo = undefined;
  siteActions?.revalidate();
  repositoryMenu?.setRepository();
  setCurrentPage();
  snapshot = undefined;
  repositorySelect.disabled = true;
  branchSelect.disabled = true;
  refreshButton.disabled = true;
  options(repositorySelect, [{ value: "", label: "Loading repositories…" }]);
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
    if (!repositories.length) {
      options(repositorySelect, [
        { value: "", label: "No selected repositories" },
      ]);
      const panel = node("section", "welcome");
      panel.append(
        node("div", "intro-label", "CONNECTED TO GITHUB"),
        node("h1", "", "Choose your first\nrepository."),
        node(
          "p",
          "intro",
          "Give this editor access to selected repositories on your personal account. Then return here and reload.",
        ),
      );
      const actions = node("div", "actions");
      if (info.installUrl) {
        const install = link("Choose repositories ↗", info.installUrl);
        install.target = "_blank";
        install.rel = "noopener noreferrer";
        actions.append(install);
      }
      actions.append(
        button("Reload repositories", () => void loadRepositories()),
      );
      panel.append(actions);
      content.replaceChildren(panel);
      status("Connected. Choose repositories to continue.");
      return;
    }
    options(repositorySelect, [
      { value: "", label: "Select a repository…" },
      ...repositories.map((repo) => ({
        value: String(repo.id),
        label: `${repo.name}${repo.private ? " · private" : ""}`,
      })),
    ]);
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

async function disconnect() {
  try {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Could not disconnect. Try again.");
    location.assign("/");
  } catch (error) {
    errorMessage(error);
  }
}

async function start() {
  try {
    info = await api<SessionInfo>("session");
    if (info.user) {
      // The editor bundle is large; start it downloading before any
      // repository data arrives so opening the first file never waits for it.
      void loadEditorModule().catch(() => {});
      resumeWorkspaceLink();
      mountWorkspace();
      agentMenu = createAgentMenu({
        embedded: true,
        account: info.user.login,
        repository: agentRepository,
        context: agentContext,
        onCommand: applyAgentSiteCommand,
      });
      element("agent-menu").append(agentMenu.root);
      await loadRepositories(info.repositories ?? undefined);
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
