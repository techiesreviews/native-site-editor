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
import type { AgentCommand } from "../shared/agent";
import { draftStore, type SavedDraft } from "./drafts";
import { draftKey } from "./drafts";
import { mountDropdown } from "./components/dropdown";
import { createRepositoryMenu } from "./components/repository-menu";
import { mountSidebarResize, type SidebarResize } from "./components/sidebar-resize";
import { createNativePreview, type NativeWarning, type NativeFormat, type NativePreviewSelection, type NativeTextEdit, type NativeTextSelection } from "./components/native-preview";
import { createPageStructure, type PageMetaField } from "./components/page-structure";
import { addedNativeRouteEntries, editNativePageMeta, registerNativeFile, removeNativeRouteEntry, sameNativeJson, unpairNativeRoutes, type NativePageMetaResult, type NativeRegistration } from "./native-page-meta";
import { nativeNewPagePath, nativePageTemplate, nativeRegistration, newFilePath, newFolderPath, normalizeRoute, routeHeading, type Checked } from "./native-create";
import { createCreateDialog, type CreateRequest } from "./components/create-dialog";
import { createPagesTree, type NativeNewRequest } from "./components/pages-tree";
import { buildNativePagesTree, firstHeadingText, nativeNewTarget, type NativeNewTarget } from "./native-pages";
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
import { altFromPath, duplicateEdit, isImagePath, linkWrapEdit, moveEdit, nativeKindLabel, previousHeadingLevel, removeEdit, setAttributeEdit, structureLabel, swapEdits, unwrapEdits } from "./native-structure";
import { createCommitHistory } from "./components/commit-history";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { declarationRanges, findStyleRulesInSources, type StyleRule } from "./styles-index";
import { resolveSelectedRules, ruleOrigin, type NativeCascade, type NativeSelectedRule } from "./style-cascade";
import type { DeclarationStatus, RuleStatus } from "../shared/cascade";
import { expandStyleImports } from "../shared/css-imports";
import { NATIVE_PAGES_DIR, nativePageRoute } from "../shared/native-routes";
import { NATIVE_HOME_PAGE, NATIVE_MANIFEST_PATH, nativePageComment, nativePageInfo, resolveNativeProject } from "../shared/native-project";
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
  const newAtRoot = element<HTMLButtonElement>("new-at-root");
  newAtRoot.addEventListener("click", () => openCreate("", newAtRoot));
  pagesTree = createPagesTree({
    open: (file) => {
      if (file === currentPath && editorModule?.isMounted(file)) explorerDropdown?.close();
      else void restoreFile(file, generation);
    },
    plan: (request) => {
      const planned = planNativeNew(request);
      return planned.ok ? { ok: true, value: { route: planned.value.route, file: planned.value.file } } : planned;
    },
    create: createNativeNew,
    announce: (text) => { element("status").textContent = text; },
  });
  element("explorer-pages").append(pagesTree.root);
  mountExplorerTabs();
  element("explorer").addEventListener("toggle", () => {
    if (explorerDropdown?.isOpen()) renderPagesTree();
    else pagesTree?.reset();
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
    onPageMeta: writeNativePageMeta,
    onPageMetaClose: () => editorModule?.closeActiveEditGroup(NATIVE_MANIFEST_PATH),
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
  const files = draftStore()
    .list(scope)
    .filter((draft) => draft.baseSha === null || draft.content !== draft.original);
  const openFiles = new Set((editorModule?.changedFiles() ?? []).map((f) => f.path));
  if (!files.length && !openFiles.size)
    panel.append(node("p", "muted changes-window__empty", "No changes yet. Edit a file to start a draft."));
  const paths = [...new Set([...files.map((f) => f.path), ...openFiles])].sort();
  if (paths.length) {
    panel.append(node("p", "files-heading", "CHANGED FILES"));
    for (const path of paths)
      panel.append(
        button(
          path,
          () => {
            panel.hidePopover();
            void showCodeChanges(path);
          },
          "file-row",
        ),
      );
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

// Text sizes the bar offers, written as an inline `font-size` on the element.
const nativeTextSizes = [
  { value: "xs", label: "XS", css: "0.75rem" },
  { value: "s", label: "S", css: "0.875rem" },
  { value: "m", label: "M", css: "1rem" },
  { value: "l", label: "L", css: "1.25rem" },
  { value: "xl", label: "XL", css: "1.5rem" },
  { value: "2xl", label: "2XL", css: "2rem" },
  { value: "3xl", label: "3XL", css: "2.5rem" },
  { value: "4xl", label: "4XL", css: "3rem" },
];

// Elements whose whole content the bar can make bold or italic.
const nativeTextTags = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "li", "button", "blockquote", "figcaption",
  "small", "label", "td", "th", "dt", "dd", "div", "summary", "legend", "caption",
]);

// Split an inline style into declarations, keeping their order.
function styleDeclarations(style: string) {
  return style.split(";").map((part) => part.trim()).filter(Boolean);
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
  if (range && textual) {
    const tag = range.tag;
    const style = startTagAttribute(source, tag, "style");
    const declarations = style ? styleDeclarations(style.value) : [];
    const current = declarations.find((declaration) => /^font-size\s*:/i.test(declaration));
    const currentCss = current?.replace(/^font-size\s*:\s*/i, "").trim();
    const value = !currentCss ? "default" : nativeTextSizes.find((size) => size.css === currentCss)?.value ?? "custom";
    const options = [{ label: "Default", value: "default" }, ...nativeTextSizes.map((size) => ({ label: size.label, value: size.value }))];
    if (value === "custom") options.push({ label: "Custom", value: "custom" });
    controls.push({
      kind: "select",
      label: "Text size",
      options,
      value,
      onChange: (next) => {
        if (next === "custom") return;
        const size = nativeTextSizes.find((item) => item.value === next);
        const kept = declarations.filter((declaration) => declaration !== current);
        if (size) kept.push(`font-size: ${size.css}`);
        const text = kept.join("; ");
        // A new attribute goes last in the start tag, before `>` or `/>`.
        const insertAt = source[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
        const edit = !style
          ? { start: insertAt, end: insertAt, text: ` style="${text}"` }
          : text ? { start: style.valueStart, end: style.valueEnd, text }
            : { start: style.start, end: style.end, text: "" };
        change([edit], node, size ? `Text size ${size.label}` : "Default text size");
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
    const images = (snapshot?.tree ?? []).filter((entry) => entry.type === "blob" && isImagePath(entry.path)).map((entry) => entry.path);
    controls.push({
      kind: "address",
      icon: "link",
      label: "Address",
      warning: src?.value.trim() ? undefined : "No image",
      value: src?.value ?? "",
      placeholder: "Image in this repository or web address",
      suggestions: images.map((image) => ({ label: image, value: image })),
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
      onPress: () => change([removeEdit(source, range)], index > 0 ? [...parent, index - 1] : undefined, `${kind} removed`),
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
  const edit = nativeInsertEdit(nativeSources()[path] ?? "", point.parent, point.index, choice.tag, template);
  if (!edit) {
    errorMessage(new Error(`${choice.label} was not added: the HTML around that spot could not be located exactly in ${path}.`));
    return;
  }
  preview.selectAfterUpdate({ path, node: [...point.parent, point.index] });
  try {
    editor.replaceActiveRanges([{ path, ...edit, expected: "" }]);
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
const NO_MANIFEST_NOTE = "From the page's leading <!-- title: … --> comment; edit it in the page source.";

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
  return nativeManifestDraft()?.content ?? nativeManifestBase?.text;
}

// The manifest's title and description for the page file `path`, read from
// the manifest's effective text, with the page's leading comment's as
// placeholders; nothing when the file is not one of the site's routes. With a
// conflicting draft the values are GitHub's and the notice says why the
// fields are closed. With no manifest the fields show the comment's values,
// read-only.
function nativePageMeta(path: string) {
  const route = nativeRouteForPath(path);
  if (!route || !nativeManifest) return undefined;
  const comment = nativePageComment(nativeEffectiveSource(path) ?? "").meta;
  if (!nativeManifestBase)
    return { title: comment.title ?? "", description: comment.description ?? "", readOnly: true, notice: NO_MANIFEST_NOTE };
  const conflict = nativeManifestConflict();
  const source = conflict ? nativeManifestBase?.text : nativeManifestSource();
  const parsed = source !== undefined ? resolveNativeProject(nativePageFiles(), source) : undefined;
  const meta = (parsed?.ok ? parsed.manifest.pages : nativeManifest.pages)[route] ?? {};
  return {
    title: meta.title ?? "",
    description: meta.description ?? "",
    placeholders: { title: comment.title, description: comment.description },
    notice: conflict ? MANIFEST_CONFLICT : undefined,
  };
}

// The title and description the page at `route` has: the manifest's, else
// its leading comment's.
function nativeRouteInfo(route: string, manifest = nativeManifest) {
  if (!manifest || !Object.hasOwn(manifest.routes, route)) return {};
  return nativePageInfo(manifest.pages, route, nativeEffectiveSource(manifest.routes[route]));
}

// Writes a Page field into the manifest as one minimal text edit: into the
// manifest's editor model when it is open (grouped into one undo step until
// the field closes), else as a browser draft of the manifest file, which the
// Save to GitHub list and diff then show. The parsed manifest's page
// metadata follows the text at once; routes and the rest do not live-reparse.
function writeNativePageMeta(path: string, field: PageMetaField, value: string) {
  const route = nativeRouteForPath(path);
  const source = nativeManifestBase ? nativeManifestSource() : undefined;
  const manifest = nativeManifest;
  if (!route || source === undefined || !manifest) return;
  if (nativeManifestConflict()) { errorMessage(new Error(MANIFEST_CONFLICT)); return; }
  let result: ReturnType<typeof editNativePageMeta>;
  try {
    result = editNativePageMeta(source, route, field, value);
  } catch (error) {
    // The helper reports what it can; anything it did not foresee reaches
    // the notice the same way rather than escaping the input handler.
    errorMessage(error);
    return;
  }
  if (!result.ok) { errorMessage(new Error(result.error)); return; }
  const label = field === "title" ? "Title" : "Description";
  try {
    writeNativeManifest(source, result, true);
  } catch (error) {
    errorMessage(error);
    return;
  }
  const parsed = resolveNativeProject(nativePageFiles(), result.text);
  if (parsed.ok) manifest.pages = parsed.manifest.pages;
  element("status").textContent = value ? `${label} updated` : `${label} removed`;
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
  const source = !nativeManifestBase ? undefined : nativeManifestConflict() ? nativeManifestBase.text : nativeManifestSource();
  if (nativeManifestBase && source === undefined) return;
  const parsed = resolveNativeProject(nativePageFiles(), source);
  if (!parsed.ok) { errorMessage(new Error(parsed.error)); return; }
  nativeManifest = parsed.manifest;
  nativePreview?.setWarnings(nativeWarningItems(parsed));
  nativePreview?.activate(parsed.manifest);
  updateNativePreviewSources();
  updateAgentContext();
  pageStructure?.refreshMeta();
  renderPagesTree();
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
  try {
    for (const path of wanted) {
      const entry = await findEntry(path);
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
  for (const draft of submitted) {
    nativeBaseSources.set(draft.path, draft.content);
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
    for (const tag of wanted) {
      const path = nativeComponentCssPath(manifest.components[tag]);
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

// The files routes, components and styles are derived from: the branch's
// under `src/`, plus new files there drafted in the browser in `scope`.
function nativePageFiles(scope = draftScope()): string[] {
  const drafted = scope
    ? draftStore().list(scope).filter((draft) => draft.baseSha === null && draft.path.startsWith(NATIVE_SOURCE_DIR)).map((draft) => draft.path)
    : [];
  return [...new Set([...nativeBasePageFiles, ...drafted])];
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
      if (draft.baseSha === file.sha) manifestText = draft.content;
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
    const drafted = new Set(nativePageFiles(scope).filter((path) => !nativeBasePageFiles.includes(path)));
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
  element("current-page").textContent = path ?? "Select a page";
  element("primary-title").textContent = path ?? "";
  element("explorer-toggle").title = path
    ? `Pages & files — ${path}`
    : "Pages & files";
}

function openExplorer() {
  explorerDropdown?.open();
}

let repositories: Repository[] = [];
let info: SessionInfo;
let currentRepo: Repository | undefined;
let snapshot: Snapshot | undefined;
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
// The new files the tree was last drawn with.
let drawnNewFiles = "";

// Paths of the new files (drafts with no base blob) in the current scope.
function newDraftPaths(scope = draftScope()) {
  return scope ? draftStore().list(scope).filter((draft) => draft.baseSha === null).map((draft) => draft.path) : [];
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

// Draws the file tree from the snapshot, new files in place.
function renderFileTree() {
  if (!snapshot) return;
  const drafted = newDraftPaths();
  drawnNewFiles = drafted.join("\n");
  files.replaceChildren(renderEntries(snapshot.entries, "", generation, drafted));
}

// Draws the tree again when a new file was created, discarded or saved.
function renderDraftFiles() {
  if (snapshot && newDraftPaths().join("\n") !== drawnNewFiles) renderFileTree();
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
function renderPagesTree(focus?: { file?: string; folder?: string }) {
  if (!pagesTree || !nativeManifest || element("explorer-pages").hidden) return;
  const manifest = nativeManifest;
  const scope = draftScope();
  const drafted = new Set(newDraftPaths(scope));
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

// What a new page or collection typed in the Pages tab writes: its file (from
// the home page's shell, its heading the title) and, when the site has a
// manifest, the title's manifest entry, or why it cannot.
function planNativeNew(request: NativeNewRequest): Checked<NativeNewTarget & { title: string; content: string; manifest?: { source: string; result: Extract<NativePageMetaResult, { ok: true }> } }> {
  const manifest = nativeManifest;
  if (!manifest || !draftScope()) return { ok: false, error: "Open a native site first." };
  const title = request.title.trim();
  if (!title) return { ok: false, error: request.kind === "page" ? "Enter the page's title." : "Enter the collection's name." };
  if (!request.slug.trim()) return { ok: false, error: "The title gives no URL: add letters or digits, or change the URL." };
  const target = nativeNewTarget(request.kind, request.folder, request.slug, {
    route: (route) => manifest.routes[route],
    exists: nativePagesPathExists,
  });
  if (!target.ok) return target;
  const content = nativePageTemplate(nativeEffectiveSource(manifest.routes["/"]), title);
  if (!nativeManifestBase) return { ok: true, value: { ...target.value, title, content } };
  if (nativeManifestConflict()) return { ok: false, error: MANIFEST_CONFLICT };
  const source = nativeManifestSource();
  if (source === undefined) return { ok: false, error: "The manifest cannot be changed right now." };
  const result = editNativePageMeta(source, target.value.route, "title", title);
  if (!result.ok) return result;
  return { ok: true, value: { ...target.value, title, content, manifest: { source, result } } };
}

// A page or collection created in the Pages tab, for its undo.
interface NativeCreation {
  kind: "page" | "collection";
  file: string;
  route: string;
  title: string;
}

// Creates a new page or collection as one operation: the page file as a new
// draft and its title as a metadata-only manifest entry, both or neither.
// Routes are derived again and the tree drawn; a page opens (the explorer
// closes), a collection's overview opens behind the explorer, which stays
// open with the collection expanded and focused. Undo in the editor right
// after takes both back, as Discard changes on the new file does.
async function createNativeNew(request: NativeNewRequest): Promise<string | undefined> {
  const planned = planNativeNew(request);
  if (!planned.ok) return planned.error;
  const plan = planned.value;
  const scope = draftScope()!;
  const draft: SavedDraft = { ...scope, version: 1, path: plan.file, baseSha: null, original: "", content: plan.content, updatedAt: Date.now() };
  draftStore().save(draft);
  const failure = draftStore().error;
  if (failure) {
    draftStore().remove(scope, plan.file);
    return failure;
  }
  try {
    if (plan.manifest) writeNativeManifest(plan.manifest.source, plan.manifest.result);
  } catch (error) {
    // Neither part stays: the page goes with the title that could not be written.
    draftStore().remove(scope, plan.file);
    return error instanceof Error ? error.message : "The manifest could not be changed.";
  }
  editorModule?.refreshDrafts();
  commitHistory?.refresh();
  refreshNativeRoutes();
  renderFileTree();
  updateAgentContext();
  const creation: NativeCreation = { kind: request.kind, file: plan.file, route: plan.route, title: plan.title };
  const collection = request.kind === "collection" ? plan.folder!.slice(NATIVE_PAGES_DIR.length) : undefined;
  const epoch = generation;
  const opened = openNewDraft(draft, { keepExplorer: collection !== undefined });
  if (collection !== undefined) renderPagesTree({ folder: collection });
  await opened;
  if (epoch === generation && currentPath === plan.file)
    editorModule?.recordHistoryAction(plan.file, () => undoNativeCreation(creation));
  if (collection !== undefined) renderPagesTree({ folder: collection });
  element("status").textContent = request.kind === "page"
    ? `Created the page ${plan.title} at ${plan.route}.`
    : `Created the collection ${plan.title} at ${plan.route}, with its overview page ${plan.file}.`;
  return undefined;
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
function nativeWarningItems(parsed: { warnings: string[]; orphans: string[] }): (string | NativeWarning)[] {
  const orphans = new Set(parsed.orphans.map(nativeOrphanWarning));
  return [
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
    const found = nativeManifest && nativeManifestBase ? nativeRegistration(path.value) : undefined;
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
  const pagesHint = nativeManifest && `${path.value}/`.startsWith(NATIVE_PAGES_DIR) ? " To add pages or collections, use the Pages tab." : "";
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

function renderEntries(
  entries: TreeEntry[],
  parentPath: string,
  epoch: number,
  drafted = newDraftPaths(),
): HTMLUListElement {
  const list = node("ul", "file-list");
  for (const entry of withNewFiles(entries, parentPath, drafted)) {
    const item = node("li");
    const path = parentPath ? `${parentPath}/${entry.path}` : entry.path;
    const directory = entry.type === "tree";
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
    // A new file, or a folder only new files are in, is not on GitHub yet.
    if (entry.isNew) row.append(node("span", "file-new", "New"));
    row.title = entry.isNew ? `${path} (new, not saved to GitHub yet)` : path;
    row.dataset.path = path;
    if (!directory && path === currentPath) row.classList.add("selected");
    if (directory) row.setAttribute("aria-expanded", "false");
    let childList: HTMLUListElement | undefined;
    const show = (children: TreeEntry[]) => {
      childList = renderEntries(children, path, epoch, drafted);
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
    const line = node("div", "file-row-line");
    line.append(row);
    if (directory) {
      const add = node("button", "file-add", "+");
      add.type = "button";
      add.setAttribute("aria-label", `New in ${path}`);
      add.title = `New file or folder in ${path}`;
      add.setAttribute("aria-haspopup", "dialog");
      add.addEventListener("click", () => openCreate(path, add));
      line.append(add);
    }
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
  options: { linkDefaultStyle?: boolean } = {},
) {
  if (epoch !== generation || !currentRepo || !snapshot || !info.user) return;
  const selection = ++fileGeneration;
  explorerDropdown?.close();
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
      void refreshPublishedSnapshot(scope.repo, scope.branch);
    },
    onDiscardNew: () => {
      // A discarded page no longer routes, and the manifest entry it came
      // with goes too; the site shows the page's collection, else home.
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
      if (value?.path === NATIVE_MANIFEST_PATH) pageStructure?.refreshMeta();
    },
    onHistory: openHistory,
    discardPlan: path === NATIVE_MANIFEST_PATH ? nativeManifestDiscardPlan : undefined,
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
  if (!currentRepo || !snapshot || !info.user) {
    agentMenu?.setContext();
    return;
  }
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
  };
  agentMenu?.setContext({
    repository: { id: currentRepo.id, fullName: currentRepo.full_name },
    branch: snapshot.branch,
    commit: snapshot.commit,
    file: activeFileContext,
    drafts: draftStore()
      .list(scope)
      .slice(0, 200)
      .map(({ path, baseSha, updatedAt }) => ({ path, baseSha, updatedAt })),
    ...(nativeManifest ? { pages: nativeContextPages(nativeManifest) } : {}),
  });
}
// The native site's pages by route for the agent context, with the title and
// description the manifest or the page's leading comment gives.
function nativeContextPages(manifest: NativeManifest): NonNullable<EditorContext["pages"]> {
  return Object.entries(manifest.routes).slice(0, 500).map(([route, file]) => {
    const { title, description } = nativeRouteInfo(route, manifest);
    return { route, file, ...(title ? { title: title.slice(0, 1000) } : {}), ...(description ? { description: description.slice(0, 1000) } : {}) };
  });
}
// The page shown after the page `path` is gone: the overview of the nearest
// collection it was in that has one, else the home page.
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
  await mountSource(draft.path, "", null, false, epoch, selection);
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
  options: { linkDefaultStyle?: boolean } = {},
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
        await openNewDraft(saved);
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
    updateAgentContext();
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    renderFileTree();
    status("Selected files saved to GitHub. Deployment status is not tracked by this editor.");
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
        onCommand: applyAgentCommand,
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
