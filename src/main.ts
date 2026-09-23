import "./utilities.css";
import "./style.css";
import "./theme.css";
import "./components/structure-placeholder.css";
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
import { mountSidebarResize } from "./components/sidebar-resize";
import {
  createPreviewPanel,
  liveOrigin,
  parsePreviewConfig,
  previewOrigin,
  type PreviewConfig,
  type PreviewSelection,
} from "./components/preview-panel";
import { createNativePreview } from "./components/native-preview";
import {
  parseNativeManifest,
  nativeManifestPaths,
  nativeDefaultRoute,
  type NativeManifest,
} from "./native-manifest";
import { createChangeStatus } from "./components/change-status";
import { createPreviewStatus } from "./components/preview-status";
import { createCommitHistory } from "./components/commit-history";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { findStyleRules, pageStylesheets, styleSources, sourceSelector, type StyleRule } from "./styles-index";
import { planClassFontSize, listClassFontSizes, classFontSizeEditCovered } from "./text-style";
import { replaceButtonStyleClass, type ButtonStyleValue } from "./button-style";
import { textSizeOptions } from "../fixtures/astro-starter/.astro-editor/text-options.mjs";
import { createDraftPreviewController, type DraftPreviewContext } from "./draft-preview";
import type {
  DraftBuildSuccess,
  DraftBuildPending,
  DraftBuildResult,
  DraftFile,
  DraftPreviewAvailability,
  DraftPreviewRequest,
} from "../shared/draft-preview";
import type {
  EditorContext,
  Directory,
  EditorIntegration,
  EditorIntegrationUpdateResult,
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
let disposeSidebarResize: (() => void) | undefined;
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
        <div id="preview-status-host"></div>
        <span id="change-status-host"></span>
        <div id="editor-toolbar-host" class="editor-toolbar-host"></div>
        <div id="changes" class="changes-window" popover="auto" role="dialog" aria-label="History"></div>
      </div>
    </header>
    <div id="notice" class="notice" role="alert" hidden></div>
    <div id="explorer" class="explorer" role="region" aria-label="Pages & files">
      <div class="files-heading"><span>FILES</span><span id="revision">—</span></div>
      <nav id="files" aria-label="Repository files"></nav>
      <nav id="draft-files" aria-label="Unpublished files"></nav>
    </div>
    <div class="workspace">
      <aside class="sidebar" aria-label="Page structure">
        <div class="sidebar-heading"><span class="eyebrow">PAGE STRUCTURE</span></div>
        <div id="structure" class="structure-placeholder">
          <div class="structure-placeholder__tree" aria-hidden="true">
            <div>▾ <span>▤</span><i></i></div>
            <div>│　▾ <span>▧</span><i></i></div>
            <div>│　　<span>Ｔ</span><i></i></div>
            <div>│　　<span>▧</span><i></i></div>
            <div>└　<span>▤</span><i></i></div>
          </div>
          <p class="structure-placeholder__title">Your page structure</p>
          <p class="muted sidebar-hint">Sections, components, and content will appear here when visual editing is available.</p>
        </div>
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
    onUpdateIntegration: () => void prepareIntegrationUpdate(),
  });
  element("repository-menu").append(repositoryMenu.root);
  repositorySelect = element<HTMLSelectElement>("repository");
  disposeSidebarResize = mountSidebarResize(
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
  codeResize = mountCodeResize(element("main"), element("code-split"));
  codeWidthResize = mountCodeWidthResize(
    element("code-split"),
    element("code-split").querySelector<HTMLElement>(".code-pane")!,
    element("secondary-pane"),
  );
  changeStatus = createChangeStatus(element("change-status-host"));
  previewStatus = createPreviewStatus(element("preview-status-host"), () => draftPreview.flush());
  previewPanel = createPreviewPanel(element("main"), {
    onSelect: selectPreviewSource,
    onInput: applyPreviewEdit,
    onHeadingLevel: applyPreviewHeadingLevel,
    onTextSize: applyPreviewTextSize,
    onButtonStyle: applyPreviewButtonStyle,
    onHistory: async (direction) => { await editorModule?.runVisualHistory(direction, currentPath); },
    onCommit: (path) => editorModule?.closeActiveEditGroup(path),
    onStructuralFallback: () => draftPreview.notifySourceEdit(false),
    onStatus: (status) => {
      if (draftPreviewWarmStartupError && (status.kind === "ready" || status.kind === "loading")) return;
      switch (status.kind) {
        case "hidden": return previewStatus?.hide();
        case "waiting": return previewStatus?.waiting();
        case "building": return previewStatus?.building();
        case "loading": return previewStatus?.loading();
        case "ready": return previewStatus?.ready();
        case "failed": return previewStatus?.failed(status.message, status.retry);
      }
    },
  });
  nativePreview = createNativePreview(element("main"));
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
      if (!result.unchanged) {
        await loadSnapshot(path);
        if (currentRepo?.id === scope.repoId && snapshot?.branch === scope.branch) trackPublished(result);
      }
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
  const edits = previewPanel?.changes() ?? [];
  const files = draftStore()
    .list(scope)
    .filter((draft) => draft.baseSha === null || draft.content !== draft.original);
  const openFiles = new Set((editorModule?.changedFiles() ?? []).map((f) => f.path));
  if (!edits.length && !files.length && !openFiles.size)
    panel.append(node("p", "muted changes-window__empty", "No changes yet. Click text in the preview to edit it."));
  if (previewConfig && previewPanel) {
    const comparing = previewPanel.comparing();
    const compare = button(
      comparing ? "Show the current page only" : "Show old and new page side by side",
      () => {
        panel.hidePopover();
        previewPanel?.compare(!comparing);
      },
      "button secondary changes-window__compare",
    );
    compare.setAttribute("aria-pressed", String(comparing));
    panel.append(compare);
  }
  if (edits.length) {
    const list = node("ul", "changes-window__list");
    for (const edit of edits.slice().reverse()) {
      const item = node("li", "changes-window__edit");
      item.append(
        node("span", "changes-window__where", `${edit.tag}${edit.attribute ? ` ${edit.attribute}` : ""} · ${edit.path.split("/").pop()}`),
        node("del", "", edit.before),
        node("ins", "", edit.after),
      );
      list.append(item);
    }
    panel.append(node("p", "files-heading", "EDITS"), list);
  }
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
// preview, every rule that styles the selected element.
const changedClassSelectors = new Map<string, Set<string>>();
const linkedStyleSourceByPath = new Map<string, string>();
let classStyleContext = "";
function syncClassStyles(path: string, original: string, content: string) {
  const context = `${info.user?.login}:${currentRepo?.id}:${snapshot?.branch}`;
  if (classStyleContext !== context) {
    changedClassSelectors.clear();
    linkedStyleSourceByPath.clear();
    classStyleContext = context;
  }
  const originalValues = new Map(listClassFontSizes(path, original).map(item => [item.selector, item.value]));
  const values = new Map(listClassFontSizes(path, content).map(item => [item.selector, item.value]));
  const changed = changedClassSelectors.get(path) ?? new Set<string>();
  for (const selector of new Set([...originalValues.keys(), ...values.keys()]))
    if (originalValues.get(selector) !== values.get(selector)) changed.add(selector);
  changedClassSelectors.set(path, changed);
  if (changed.size) previewPanel?.syncClassStyles(path, [...changed].map(selector => ({ selector, value: values.get(selector) ?? "" })));
  const previous = linkedStyleSourceByPath.get(path);
  linkedStyleSourceByPath.set(path, content);
  if (previous !== content && linkedStyle && (path === linkedStyle.page || path === secondaryPath || changed.size)) void refreshLinkedStyleRules();
}
let selectedStyleSelectors: string[] = [];
let linkedStyle: { page: string; css?: string; rules: StyleRule[] } | undefined;
let linkedStyleRequest = 0;
let disposeSecondary: (() => void) | undefined;
let secondaryPath: string | undefined;
let secondaryHistoryScope: string | undefined;
let secondaryRequest = 0;
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
function findEntry(path: string) {
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
  const historyScope = currentPath ? draftKey({ account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }, currentPath) : undefined;
  if (secondaryPath === css && secondaryHistoryScope === historyScope && disposeSecondary) return true;
  const request = ++secondaryRequest;
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
  };
  try {
    const entry = await findEntry(css);
    if (!entry || (entry.size ?? 0) > 128 * 1024) throw new Error(`Could not open ${css}.`);
    const [{ content: source }, editor] = await Promise.all([
      api<{ content: string }>("file", { repo: scope.repo, sha: entry.sha }),
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
        onContextChange: (value, changes) => {
          if (value) {
            const patched = previewPanel?.syncSource(value.path, value.content, changes, value.original) ?? false;
            syncClassStyles(value.path, value.original, value.content);
            notifyDraftPreviewSourceIfChanged(value, changes, patched);
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
// Title and rule chips of the secondary pane; highlights the rules in both panes.
function renderLinkedStyle() {
  const linked = linkedStyle;
  const title = element("secondary-title");
  const chips = element("secondary-rules");
  chips.replaceChildren();
  if (!linked || !secondaryPath) return;
  title.textContent = secondaryPath;
  const inPane = (path: string) => linked.rules.filter((rule) => rule.path === path);
  editorModule?.highlightRanges(secondaryPath, inPane(secondaryPath));
  if (currentPath && currentPath !== secondaryPath) editorModule?.highlightRanges(currentPath, inPane(currentPath));
  if (!linked.rules.length) {
    if (linked.rules !== linkedStyleIdle) chips.append(node("span", "muted", "No rules match this element"));
    return;
  }
  for (const rule of linked.rules) {
    const chip = button(rule.selector, () => void revealRule(rule), "code-pane__rule");
    chip.title = `${rule.path} · ${rule.selector}`;
    if (rule.path !== secondaryPath) chip.append(node("span", "code-pane__rule-file", rule.path.split("/").pop() ?? ""));
    chips.append(chip);
  }
}
const linkedStyleIdle: StyleRule[] = [];
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

function currentStyleSourceOverlay() {
  if (!currentRepo || !snapshot || !info.user) return undefined;
  const scope = { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch };
  const overlay: Record<string, string> = {};
  for (const draft of draftStore().list(scope)) overlay[draft.path] = draft.content;
  if (currentPath && activeFileContext?.path === currentPath &&
      (activeFileContext.baseSha === null || activeFileContext.content !== activeFileContext.original)) {
    const mounted = editorModule?.getMountedSource(currentPath);
    if (mounted !== undefined) overlay[currentPath] = mounted;
  }
  return overlay;
}

async function refreshLinkedStyleRules() {
  if (!currentRepo || !snapshot || !linkedStyle || !selectedStyleSelectors.length) return;
  const request = ++linkedStyleRequest;
  const epoch = generation;
  const page = linkedStyle.page;
  const css = linkedStyle.css;
  const selectors = selectedStyleSelectors.slice();
  const rules = await findStyleRules(
    api,
    currentRepo.full_name,
    snapshot,
    selectors,
    page,
    currentStyleSourceOverlay(),
  ).catch(() => [] as StyleRule[]);
  if (request !== linkedStyleRequest || epoch !== generation || linkedStyle?.page !== page ||
      page !== currentPath || selectors.join("\n") !== selectedStyleSelectors.join("\n")) return;
  linkedStyle = { page, css, rules };
  renderLinkedStyle();
}

// A page opens with its stylesheet beside it, found through its imports.
async function linkPageStyles(page: string) {
  if (!currentRepo || !snapshot || !/\.astro$/.test(page)) {
    linkedStyle = undefined;
    closeSecondary();
    return;
  }
  const sheets = await pageStylesheets(api, currentRepo.full_name, snapshot, page).catch(() => [] as string[]);
  if (page !== currentPath) return;
  // A click may already have linked this page's rules; keep them.
  const rules = linkedStyle?.page === page ? linkedStyle.rules : linkedStyleIdle;
  linkedStyle = { page, css: sheets[0], rules };
  if (disposeSecondary) return;
  if (!sheets[0]) {
    closeSecondary();
    return;
  }
  if (await openSecondary(sheets[0])) renderLinkedStyle();
}
// A click in the preview: find every rule for the element across the project,
// show the most specific one and list the rest as chips.
async function linkStyles(selection: PreviewSelection, selectors: string[]) {
  if (!currentRepo || !snapshot) return;
  const request = ++linkedStyleRequest;
  const epoch = generation;
  const page = selection.path;
  const sourceSelectors = selectors.map(sourceSelector);
  const rules = await findStyleRules(
    api,
    currentRepo.full_name,
    snapshot,
    selectors,
    page,
    currentStyleSourceOverlay(),
  ).catch(() => [] as StyleRule[]);
  if (request !== linkedStyleRequest || epoch !== generation || page !== currentPath ||
      sourceSelectors.join("\n") !== selectedStyleSelectors.join("\n")) return;
  const css = linkedStyle?.page === page ? linkedStyle.css : undefined;
  linkedStyle = { page, css, rules };
  // The winning rule's file opens beside the page, unless it is the page itself.
  const target = rules.find((rule) => rule.path !== page)?.path ?? css;
  if (target && !(await openSecondary(target))) return;
  if (!target) closeSecondary();
  if (epoch !== generation || page !== currentPath ||
      sourceSelectors.join("\n") !== selectedStyleSelectors.join("\n")) return;
  renderLinkedStyle();
  const top = rules[0];
  if (top) editorModule?.revealRange(top.path, top.start, top.end);
}

// Visual-edit proof (ticket 06): a click in the preview opens the mapped file
// and selects the literal's exact source range; Apply replaces only that range.
async function selectPreviewSource(selection: PreviewSelection, selectors: string[]) {
  if (!snapshot) throw new Error("Open the project first.");
  const editor = await loadEditorModule();
  if (currentPath !== selection.path) {
    const epoch = generation;
    await restoreFile(selection.path, epoch);
    if (epoch !== generation || currentPath !== selection.path)
      throw new Error(`Could not open ${selection.path}.`);
  }
  selectedStyleSelectors = selectors.map(sourceSelector);
  void linkStyles(selection, selectors);
  editor.selectActiveRange({
    path: selection.path,
    start: selection.start,
    end: selection.end,
    expected: selection.text,
  });
}

async function applyPreviewEdit(selection: PreviewSelection, text: string, group: boolean) {
  if (!editorModule || currentPath !== selection.path)
    throw new Error("The file is no longer open. Select the element again.");
  editorModule.replaceActiveRange(
    {
      path: selection.path,
      start: selection.start,
      end: selection.end,
      expected: selection.text,
      text,
    },
    group,
  );
}

async function applyPreviewHeadingLevel(selection: PreviewSelection, level: string) {
  const heading = selection.textElement;
  if (!heading || !editorModule || currentPath !== selection.path)
    throw new Error("The heading source is no longer open. Select it again.");
  if (!/^h[1-6]$/.test(level) || heading.tag !== selection.tag ||
      heading.open.end - heading.open.start !== 2 || heading.close.end - heading.close.start !== 2 ||
      heading.open.end > selection.start || selection.end > heading.close.start)
    throw new Error("The heading source ranges are invalid. Select it again.");
  editorModule.replaceActiveRanges([
    {
      path: selection.path,
      start: selection.start,
      end: selection.end,
      expected: selection.text,
      text: selection.text,
    },
    { path: selection.path, ...heading.open, expected: heading.tag, text: level },
    { path: selection.path, ...heading.close, expected: heading.tag, text: level },
  ]);
}

const textSizes = Object.fromEntries(textSizeOptions.map(({ value, css }) => [value, css]));

function editFontSize(style: string, value: string | undefined) {
  if (/\/\*|(?:^|;)\s*font\s*:/i.test(style)) return undefined;
  let quote = "";
  let comment = false;
  let depth = 0;
  let start = 0;
  const declarations: { start: number; end: number; colon: number }[] = [];
  for (let index = 0; index <= style.length; index++) {
    const char = style[index] ?? ";";
    const next = style[index + 1];
    if (comment) { if (char === "*" && next === "/") { comment = false; index++; } continue; }
    if (quote) { if (char === "\\") index++; else if (char === quote) quote = ""; continue; }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === ";" && depth === 0) {
      const part = style.slice(start, index);
      let colon = -1;
      for (let at = 0, d = 0, q = ""; at < part.length; at++) {
        const c = part[at];
        if (q) { if (c === "\\") at++; else if (c === q) q = ""; continue; }
        if (c === '"' || c === "'") q = c; else if (c === "(") d++; else if (c === ")") d--; else if (c === ":" && d === 0) { colon = start + at; break; }
      }
      if (colon >= 0) declarations.push({ start, end: index, colon });
      start = index + 1;
    }
  }
  if (quote || comment || depth !== 0) return undefined;
  const matches = declarations.filter((part) => style.slice(part.start, part.colon).trim().toLowerCase() === "font-size");
  if (matches.length > 1) return undefined;
  const found = matches[0];
  if (found) {
    if (value) return style.slice(0, found.colon + 1) + style.slice(found.colon + 1, found.end).replace(/^(\s*).*?(\s*)$/s, `$1${value}$2`) + style.slice(found.end);
    let removeStart = found.start;
    let removeEnd = found.end + (style[found.end] === ";" ? 1 : 0);
    if (removeStart > 0 && removeEnd === style.length) {
      while (removeStart > 0 && /\s/.test(style[removeStart - 1])) removeStart--;
    }
    return style.slice(0, removeStart) + style.slice(removeEnd);
  }
  if (!value) return style;
  const separator = style ? (style.trimEnd().endsWith(";") ? (/\s$/.test(style) ? "" : " ") : "; ") : "";
  return `${style}${separator}font-size: ${value};`;
}

async function applyPreviewTextSize(selection: PreviewSelection, size: string, prepare: (start: number, end: number, replacement: string) => void) {
  const heading = selection.textElement;
  const mapping = heading?.size;
  const source = activeFileContext?.content;
  if (!heading || !mapping?.editable || !editorModule || currentPath !== selection.path || typeof source !== "string")
    throw new Error("This text size cannot be edited safely.");
  const invalid = () => { throw new Error("The text style changed. Select the text again."); };
  if (!/^(?:h[1-6]|p|a|button)$/.test(heading.tag) || heading.tag !== selection.tag ||
      source[heading.open.start - 1] !== "<" ||
      source.slice(heading.open.start, heading.open.end) !== heading.tag ||
      source.slice(heading.close.start, heading.close.end) !== heading.tag ||
      source.slice(selection.start, selection.end) !== selection.text ||
      source[selection.start - 1] !== ">") invalid();
  const withinOpening = (range: { start: number; end: number }) =>
    Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) &&
    range.start >= heading.open.end && range.end >= range.start && range.end <= selection.start - 1;
  // Validate current source, rather than trusting ranges from an older frame.
  // Ignore quoted attribute values while checking for spreads/dynamic attributes
  // and existing style attributes; a quoted `>` does not end the opening tag.
  const attributes = source.slice(heading.open.end, selection.start - 1);
  let outsideQuotes = "";
  let quote = "";
  for (const char of attributes) {
    if (quote) { if (char === quote) quote = ""; outsideQuotes += " "; }
    else if (char === '"' || char === "'") { quote = char; outsideQuotes += " "; }
    else { if (char === "{" || char === "}" || char === ">" || char === "<") invalid(); outsideQuotes += char; }
  }
  if (quote) invalid();
  const styleCount = [...outsideQuotes.matchAll(/(?:^|\s)style(?=\s|=|$)/gi)].length;
  if (mapping.style && mapping.styleValue && !mapping.insert) {
    if (!withinOpening(mapping.style) || !withinOpening(mapping.styleValue) ||
        mapping.styleValue.start <= mapping.style.start || mapping.styleValue.end >= mapping.style.end || styleCount !== 1) invalid();
    const prefix = source.slice(mapping.style.start, mapping.styleValue.start).match(/^\s*style\s*=\s*(["'])$/i);
    if (!prefix || source.slice(mapping.styleValue.end, mapping.style.end) !== prefix[1]) invalid();
  } else if (mapping.insert && !mapping.style && !mapping.styleValue) {
    if (!withinOpening(mapping.insert) || mapping.insert.start !== mapping.insert.end || styleCount !== 0 ||
        !/[\s>]/.test(source[mapping.insert.start] ?? "")) invalid();
  } else invalid();
  const value = size === "default" ? undefined : textSizes[size];
  if (size !== "default" && !value) throw new Error("Unknown text size.");
  // The source planner chooses the class rule from current draft text. Only
  // legacy inline Default removal keeps the old single-attribute path.
  const inlineDefault = size === "default" && mapping.styleValue &&
    /(?:^|;)\s*font-size\s*:/i.test(source.slice(mapping.styleValue.start, mapping.styleValue.end));
  if (!inlineDefault) {
    if (!currentRepo || !snapshot || !info.user) throw new Error("Open the project first.");
    const epoch = generation;
    const scope = { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch };
    const files = await styleSources(api, currentRepo.full_name, snapshot);
    for (const draft of draftStore().list(scope)) files[draft.path] = draft.content;
    for (const path of Object.keys(files)) files[path] = editorModule.getMountedSource(path) ?? files[path];
    files[selection.path] = source;
    if (generation !== epoch || currentPath !== selection.path || editorModule.getMountedSource(selection.path) !== source) invalid();
    const plan = planClassFontSize({ astroPath: selection.path, astroSource: source,
      opening: { start: heading.open.start - 1, end: selection.start }, files, matchedSelectors: selectedStyleSelectors, value,
      preferredClass: heading.buttonStyle?.baseClass });
    if (!plan.ok) throw new Error(plan.reason);
    const edits = "edits" in plan ? plan.edits : [{ ...plan.edit, targetPath: plan.targetPath }];
    if (!edits.length) return { classStyle: true as const };
    const target = edits[0].targetPath;
    if (target !== selection.path && !await openSecondary(target)) throw new Error("Could not open the class stylesheet.");
    if (generation !== epoch || currentPath !== selection.path || editorModule.getMountedSource(selection.path) !== source ||
        editorModule.getMountedSource(target) !== files[target]) invalid();
    if (plan.selector && !selectedStyleSelectors.includes(plan.selector)) selectedStyleSelectors.push(plan.selector);
    editorModule.replaceActiveRanges(edits.map(edit => ({ path: edit.targetPath, start: edit.start, end: edit.end, expected: edit.expected, text: edit.text })));
    if (plan.selector) previewPanel?.syncClassStyles(target, [{ selector: plan.selector, value: value ?? "" }]);
    void refreshLinkedStyleRules();
    return { classStyle: true as const };
  }
  let range = mapping.style;
  let replacement: string;
  if (mapping.style && mapping.styleValue) {
    const current = source.slice(mapping.styleValue.start, mapping.styleValue.end);
    const edited = editFontSize(current, value);
    if (edited === undefined) throw new Error("This text style cannot be parsed safely.");
    replacement = edited ? `${source.slice(mapping.style.start, mapping.styleValue.start)}${edited}${source.slice(mapping.styleValue.end, mapping.style.end)}` : "";
  } else if (mapping.insert) {
    range = mapping.insert;
    replacement = value ? ` style="font-size: ${value};"` : "";
  } else throw new Error("This text style cannot be mapped safely.");
  if (!range) throw new Error("This text style cannot be mapped safely.");
  const expected = source.slice(range.start, range.end);
  if (replacement === expected) return value ?? "";
  const body = { start: selection.start, end: selection.end };
  const styleEdit = { start: range.start, end: range.end, expected, text: replacement };
  const open = { ...heading.open };
  const close = { ...heading.close };
  prepare(range.start, range.end, replacement);
  editorModule.replaceActiveRanges([
    { path: selection.path, ...body, expected: selection.text, text: selection.text },
    { path: selection.path, ...open, expected: heading.tag, text: heading.tag },
    { path: selection.path, ...close, expected: heading.tag, text: heading.tag },
    { path: selection.path, ...styleEdit },
  ]);
  return value ?? "";
}

async function applyPreviewButtonStyle(selection: PreviewSelection, style: ButtonStyleValue, prepare: (start: number, end: number, replacement: string) => void) {
  const mapping = selection.textElement?.buttonStyle;
  const textElement = selection.textElement;
  const source = editorModule?.getMountedSource(selection.path) ?? activeFileContext?.content;
  if (!mapping || !editorModule || currentPath !== selection.path || typeof source !== "string")
    throw new Error("This button style cannot be edited safely.");
  if (!textElement || source.slice(selection.start, selection.end) !== selection.text ||
      source.slice(textElement.open.start, textElement.open.end) !== selection.tag ||
      source.slice(textElement.close.start, textElement.close.end) !== selection.tag ||
      mapping.classValue.start < textElement.open.end ||
      mapping.classValue.end > selection.start - 1)
    throw new Error("The button source changed. Select the button again.");
  const edit = replaceButtonStyleClass(source, mapping, style);
  if (!edit) throw new Error("The button style changed. Select the button again.");
  if (edit.text === edit.expected) return undefined;
  const body = { start: selection.start, end: selection.end, expected: selection.text, text: selection.text };
  const open = { ...textElement.open, expected: selection.tag, text: selection.tag };
  const close = { ...textElement.close, expected: selection.tag, text: selection.tag };
  prepare(edit.start, edit.end, edit.text);
  editorModule.replaceActiveRanges([
    { path: selection.path, ...body },
    { path: selection.path, ...open },
    { path: selection.path, ...close },
    { path: selection.path, start: edit.start, end: edit.end, expected: edit.expected, text: edit.text },
  ]);
  return { start: edit.start, end: edit.end, replacement: edit.text };
}

let previewPanel: ReturnType<typeof createPreviewPanel> | undefined;
let nativePreview: ReturnType<typeof createNativePreview> | undefined;
// Set when the loaded project opts into browser-native preview via
// `.astro-editor/native.json`. While set, the Astro preview/draft-build path is
// bypassed entirely; clearing it restores the ordinary Astro path.
let nativeManifest: NativeManifest | undefined;
// True whenever the project opts into native preview (a `.astro-editor/native.json`
// exists), even when that manifest is invalid or its sources fail to load. It
// gates the Astro path off so a stale `previewConfig` can never revive.
let nativeEngaged = false;
const nativeBaseSources = new Map<string, string>();
let nativeSourcesRequest = 0;

function nativeModeActive() {
  return Boolean(nativeManifest);
}

// The route whose page file is `path`, matched by the manifest's own mapping
// (not a filename convention); undefined when the file is not a mapped page.
function nativeRouteForPath(path: string | undefined) {
  if (!nativeManifest || !path) return undefined;
  return Object.entries(nativeManifest.routes).find(([, file]) => file === path)?.[0];
}

// Resolve every manifest file to its effective source: a mounted editor model
// wins, then a saved/new browser draft, then the clean snapshot baseline.
function nativeSources(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!nativeManifest) return out;
  const scope =
    currentRepo && snapshot && info.user
      ? { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }
      : undefined;
  for (const path of nativeManifestPaths(nativeManifest)) {
    let content = nativeBaseSources.get(path);
    const draft = scope ? draftStore().get(scope, path) : undefined;
    if (draft) content = draft.content;
    const mounted = editorModule?.getMountedSource(path);
    if (mounted !== undefined) content = mounted;
    out[path] = content ?? "";
  }
  return out;
}

// A page selection: the preview follows the newly opened page's route. Opening
// a non-page file (CSS, component) leaves the preview's current route untouched.
function updateNativePreview() {
  if (!nativeManifest || !nativePreview) return;
  nativePreview.update({ sources: nativeSources(), route: nativeRouteForPath(currentPath) });
}

// A source edit: push new sources but never change the route, so an edit while
// the preview is on About (with a different file open) does not snap it Home.
function updateNativePreviewSources() {
  if (!nativeManifest || !nativePreview) return;
  nativePreview.update({ sources: nativeSources() });
}

function deactivateNative() {
  nativeManifest = undefined;
  nativeEngaged = false;
  nativeBaseSources.clear();
  nativeSourcesRequest++;
  nativePreview?.deactivate();
}

// Reads and validates `.astro-editor/native.json`, prefetches every referenced
// source file from the current snapshot, and activates the native preview. All
// async steps are guarded against a superseding navigation (`epoch`).
async function activateNativeManifest(repo: Repository, result: Snapshot, epoch: number) {
  const request = ++nativeSourcesRequest;
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const placeholder: NativeManifest = { version: 1, routes: { "/": "src/pages/index.html" }, components: {}, styles: [] };
  // Locate the manifest first. A failure *before* we confirm native.json exists
  // cannot be attributed to native intent, so it falls through to Astro. Once
  // the file is found, the project is native and every later failure surfaces as
  // a native error rather than silently reverting to Astro.
  let manifestText: string;
  try {
    const dir = result.entries.find((entry) => entry.path === ".astro-editor" && entry.type === "tree");
    if (!dir) return false;
    const tree = await api<Directory>("tree", { repo: repo.full_name, sha: dir.sha });
    if (!live()) return false;
    const file = tree.entries.find((entry) => entry.path === "native.json" && entry.type === "blob");
    if (!file) return false;
    // The project is native from here on.
    nativeEngaged = true;
    nativeManifest = undefined;
    previewConfig = undefined;
    previewPanel?.close();
    const source = await api<{ content: string }>("file", { repo: repo.full_name, sha: file.sha });
    if (!live()) return true;
    manifestText = source.content;
  } catch (error) {
    if (!nativeEngaged) return false;
    if (!live()) return true;
    nativeManifest = undefined;
    nativePreview?.activate(placeholder);
    nativePreview?.setError(error instanceof Error ? error.message : "native.json could not be loaded.");
    return true;
  }
  const parsed = parseNativeManifest(manifestText);
  if (!parsed.ok) {
    // A present-but-invalid manifest is a visible native error, never a silent
    // fall-through to the Astro path that would confuse the project's intent.
    nativeManifest = undefined;
    nativePreview?.activate(placeholder);
    nativePreview?.setError(parsed.error);
    return true;
  }
  const manifest = parsed.manifest;
  nativeBaseSources.clear();
  try {
    for (const path of nativeManifestPaths(manifest)) {
      const entry = await findEntry(path);
      if (!live()) return true;
      if (!entry) throw new Error(`native.json references ${path}, which is missing from this branch.`);
      const file = await api<{ content: string }>("file", { repo: repo.full_name, sha: entry.sha });
      if (!live()) return true;
      nativeBaseSources.set(path, file.content);
    }
  } catch (error) {
    if (!live()) return true;
    nativeManifest = undefined;
    nativePreview?.activate(manifest);
    nativePreview?.setError(error instanceof Error ? error.message : "Native sources could not be loaded.");
    return true;
  }
  if (!live()) return true;
  nativeManifest = manifest;
  nativePreview?.setError(undefined);
  nativePreview?.activate(manifest);
  nativePreview?.update({
    sources: nativeSources(),
    route: nativeRouteForPath(currentPath) ?? nativeDefaultRoute(manifest),
  });
  return true;
}

let changeStatus: ReturnType<typeof createChangeStatus> | undefined;
let previewStatus: ReturnType<typeof createPreviewStatus> | undefined;
let codeResize: ReturnType<typeof mountCodeResize> | undefined;
let codeWidthResize: ReturnType<typeof mountCodeWidthResize> | undefined;
function draftPreviewTabSessionId() {
  const key = "astro-site-editor:draft-preview-session";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  }
}
const draftPreviewSessionId = draftPreviewTabSessionId();
let draftPreviewAvailable = false;
let draftPreviewOrigin = "";
let draftPreviewMode: DraftPreviewAvailability["mode"] | undefined;
let draftPreviewChecked = 0;
let draftPreviewOverlayContext = "";
let draftPreviewNoticeActive = false;
let draftPreviewWarmStartupError = false;
const draftPreviewNotifiedContent = new Map<string, string>();
const draftPreview = createDraftPreviewController({
  getContext: draftPreviewContext,
  snapshot: draftPreviewSnapshot,
  request: requestDraftPreview,
  debounceMs: () => draftPreviewMode === "github-actions" ? 10_000 : draftPreviewMode === "warm" ? 150 : 600,
  onPending: () => previewPanel?.draftPending(),
  onBuildStart: () => previewPanel?.draftPending(true),
  onSuccess: (build) => {
    draftPreviewWarmStartupError = false;
    clearDraftPreviewError();
    previewPanel?.adoptDraftBuild(build);
  },
  onError: (result) => {
    const message = draftPreviewErrorMessage(result.error);
    previewPanel?.draftError(message);
    showDraftPreviewError(message);
  },
});

function trackPublished(result: Pick<PublishResult, "branch" | "commit">) {
  if (!currentRepo || !previewConfig) return;
  const branch = result.branch;
  changeStatus?.track({
    commit: result.commit,
    previewUrl: previewOrigin(previewConfig, branch) + previewConfig.revisionPath,
    liveUrl:
      branch === currentRepo.default_branch
        ? liveOrigin(previewConfig) + previewConfig.revisionPath
        : undefined,
    actionsUrl: `https://github.com/${currentRepo.full_name}/actions`,
  });
}
let previewConfig: PreviewConfig | undefined;

function updatePreview() {
  if (nativeEngaged) {
    // Never feed a stale Astro config to the closed preview panel while native.
    updateNativePreview();
    return;
  }
  previewPanel?.update({
    config: previewConfig,
    branch: snapshot?.branch,
    commit: snapshot?.commit,
    path: currentPath,
  });
  draftPreview.notifyContextChange();
  updateNativePreview();
}

function draftPreviewContext(): DraftPreviewContext | undefined {
  if (!draftPreviewAvailable || !currentRepo || !snapshot) return undefined;
  return {
    sessionId: draftPreviewSessionId,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
    baseCommit: snapshot.commit,
    pageRoute: currentPath ? pageRouteFromPath(currentPath) : "/",
  };
}

function draftPreviewUrl(path = "") {
  if (!currentRepo || !snapshot) return "/api/draft-preview";
  const params = new URLSearchParams({
    repo: currentRepo.full_name,
    branch: snapshot.branch,
    baseCommit: snapshot.commit,
  });
  return `/api/draft-preview${path}?${params.toString()}`;
}

function pageRouteFromPath(path: string) {
  const match = path.match(/^src\/pages\/(.+)\.(astro|md|mdx|html)$/);
  if (!match) return "/";
  const route = match[1].replace(/(^|\/)index$/, "");
  return route ? `/${route}/` : "/";
}

function draftPreviewSnapshot(): DraftFile[] {
  const overlay = currentStyleSourceOverlay() ?? {};
  return Object.entries(overlay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, content }));
}

function notifyDraftPreviewSourceIfChanged(
  value: EditorContext["file"] | null,
  changes?: { start: number; end: number; text: string }[],
  patched: boolean | "pending" = false,
) {
  if (!value || value.readOnly) return;
  const context = `${info.user?.login}:${currentRepo?.id}:${snapshot?.branch}:${snapshot?.commit}`;
  if (draftPreviewOverlayContext !== context) {
    draftPreviewOverlayContext = context;
    draftPreviewNotifiedContent.clear();
  }
  const dirty = value.baseSha === null || value.content !== value.original;
  const previous = draftPreviewNotifiedContent.get(value.path);
  // A class-rule font-size change is already applied live by syncClassStyles, so
  // a full draft rebuild is unnecessary. Treat it as patched only when the diff
  // from what the preview currently reflects (the last notified content, else the
  // clean baseline) is confined to those declaration values, including an Undo
  // back to the baseline. Any other coincident change leaves an unpatched region
  // and falls back to a rebuild.
  if (patched === false && previewPanel?.livePatchReady()) {
    const baseline = previous ?? value.original;
    if (baseline !== value.content && classFontSizeEditCovered(value.path, baseline, value.content))
      patched = true;
  }
  if (!dirty) {
    if (previous !== undefined) {
      draftPreviewNotifiedContent.delete(value.path);
      // Undo back to the clean baseline is still a covered edit when the reverting
      // diff stayed inside a mapped body, so it must not force a reload either.
      draftPreview.notifySourceEdit(patched !== false);
    }
    return;
  }
  if (previous === value.content) return;
  draftPreviewNotifiedContent.set(value.path, value.content);
  // `changes` means a true content edit. No previous notification means a
  // restored browser draft reported on mount; notify once. `patched` marks an
  // edit already applied live to the preview (exact rich-format/text diff within
  // a mapped body), so the controller skips the rebuild while still invalidating
  // any stale in-flight build.
  if (changes || previous === undefined) draftPreview.notifySourceEdit(patched !== false);
}

async function requestDraftPreview(body: DraftPreviewRequest, signal: AbortSignal): Promise<DraftBuildResult> {
  const response = await fetch(draftPreviewUrl(), {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string } | DraftBuildSuccess | DraftBuildPending;
  if (response.status === 202)
    return isDraftBuildPending(data)
      ? pollDraftPreviewBuild(data, body, signal)
      : { ok: false, status: 202, error: "Draft preview returned an invalid build-pending response." };
  if (response.ok) {
    const build = data as DraftBuildSuccess;
    if (!isDraftBuildSuccess(build))
      return { ok: false, status: response.status, error: "Draft preview returned an invalid build response." };
    if (draftPreviewOrigin && new URL(build.previewUrl).origin !== draftPreviewOrigin)
      return { ok: false, status: 0, error: "Draft preview returned an unexpected origin." };
    return { ok: true, build };
  }
  return { ok: false, status: response.status, error: "error" in data ? data.error : undefined };
}

function isDraftBuildSuccess(value: unknown): value is DraftBuildSuccess {
  const build = value as Partial<DraftBuildSuccess>;
  return typeof build?.revision === "string" &&
    typeof build.previewUrl === "string" &&
    build.sources !== null &&
    typeof build.sources === "object" &&
    !Array.isArray(build.sources);
}

function isDraftBuildPending(value: unknown): value is DraftBuildPending {
  const pending = value as Partial<DraftBuildPending>;
  return pending?.status === "building" &&
    typeof pending.revision === "string" &&
    typeof pending.previewUrl === "string" &&
    typeof pending.revisionUrl === "string" &&
    pending.sources !== null &&
    typeof pending.sources === "object" &&
    !Array.isArray(pending.sources);
}

function validateProductionDraftUrls(pending: DraftBuildPending) {
  let preview: URL;
  let revision: URL;
  try {
    preview = new URL(pending.previewUrl);
    revision = new URL(pending.revisionUrl);
  } catch {
    return "Draft preview returned an invalid build URL.";
  }
  if (preview.protocol !== "https:" || revision.protocol !== "https:" ||
      preview.origin !== revision.origin ||
      !preview.hostname.endsWith(".workers.dev"))
    return "Draft preview returned an unexpected build origin.";
  if (!preview.pathname.endsWith("/") || !revision.pathname.endsWith("/.astro-editor/revision.json"))
    return "Draft preview returned an unexpected build path.";
  return undefined;
}

async function pollDraftPreviewBuild(
  pending: DraftBuildPending,
  body: DraftPreviewRequest,
  signal: AbortSignal,
): Promise<DraftBuildResult> {
  const invalid = validateProductionDraftUrls(pending);
  if (invalid) return { ok: false, status: 0, error: invalid };
  const deadline = Date.now() + 10 * 60_000;
  const actionsUrl = `https://github.com/${body.repo}/actions`;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    let response: Response;
    let revision: { sha?: unknown } | undefined;
    try {
      ({ response, json: revision } = await fetchRevisionWithDraftPreviewTimeout(pending.revisionUrl, signal, 10_000));
    } catch (error) {
      if (signal.aborted) throw error;
      await waitForDraftPreviewPoll(signal);
      continue;
    }
    if (response.status === 404) {
      await waitForDraftPreviewPoll(signal);
      continue;
    }
    if (!response.ok)
      return { ok: false, status: response.status, error: `Draft preview status check failed (HTTP ${response.status}). Check ${actionsUrl}.` };
    if (revision?.sha === pending.revision)
      return {
        ok: true,
        build: {
          revision: pending.revision,
          previewUrl: pending.previewUrl,
          sources: pending.sources,
        },
      };
    await waitForDraftPreviewPoll(signal);
  }
  return { ok: false, status: 408, error: `Draft preview build was not confirmed after 10 minutes. Check ${actionsUrl}.` };
}

function waitForDraftPreviewPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 3_000);
    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function fetchRevisionWithDraftPreviewTimeout(url: string, parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timeout = 0;
  const onAbort = () => controller.abort(parent.reason);
  timeout = window.setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  parent.addEventListener("abort", onAbort, { once: true });
  return fetch(url, {
    cache: "no-store",
    credentials: "omit",
    signal: controller.signal,
  }).then(async (response) => ({
    response,
    json: response.ok ? await response.json().catch(() => undefined) as { sha?: unknown } | undefined : undefined,
  })).finally(() => {
    window.clearTimeout(timeout);
    parent.removeEventListener("abort", onAbort);
  });
}

async function probeDraftPreview(epoch: number) {
  const attempt = ++draftPreviewChecked;
  try {
    const response = await fetch(draftPreviewUrl(), { credentials: "same-origin", cache: "no-store" });
    const data = (await response.json().catch(() => undefined)) as (Partial<DraftPreviewAvailability> & { error?: string; reason?: string }) | undefined;
    const available = response.ok && data?.available === true &&
      (typeof data.previewOrigin === "string" || data.mode === "github-actions");
    if (attempt !== draftPreviewChecked || epoch !== generation) return;
    if (!response.ok && data?.mode === "warm") {
      draftPreviewAvailable = false;
      draftPreviewOrigin = "";
      draftPreviewMode = undefined;
      draftPreview.reset();
      draftPreviewWarmStartupError = true;
      const detail = data.error ?? data.reason ?? "Warm preview runtime failed to start.";
      const message = `Warm draft preview failed. ${detail} Fix the local checkout, then reload the editor. Restart npm run dev:ui if the runtime still fails.`;
      previewPanel?.draftError(message);
      previewStatus?.failed(message, false);
      showDraftPreviewError(message);
      return;
    }
    draftPreviewWarmStartupError = false;
    draftPreviewAvailable = available;
    draftPreviewOrigin = available && typeof data.previewOrigin === "string" ? data.previewOrigin : "";
    draftPreviewMode = available ? data.mode : undefined;
    draftPreview.reset();
    draftPreview.notifyContextChange();
  } catch {
    if (attempt !== draftPreviewChecked || epoch !== generation) return;
    draftPreviewAvailable = false;
    draftPreviewOrigin = "";
    draftPreviewMode = undefined;
    draftPreview.reset();
  }
}

// Reads .astro-editor/preview.json from the loaded snapshot, if present.
async function loadPreviewConfig(repo: Repository, result: Snapshot, epoch: number) {
  let config: PreviewConfig | undefined;
  try {
    const dir = result.entries.find(
      (entry) => entry.path === ".astro-editor" && entry.type === "tree",
    );
    if (dir) {
      const tree = await api<Directory>("tree", { repo: repo.full_name, sha: dir.sha });
      const file = tree.entries.find(
        (entry) => entry.path === "preview.json" && entry.type === "blob",
      );
      if (file) {
        const source = await api<{ content: string }>("file", {
          repo: repo.full_name,
          sha: file.sha,
        });
        config = parsePreviewConfig(source.content);
      }
    }
  } catch {
    config = undefined;
  }
  if (epoch !== generation) return;
  previewConfig = config;
  updatePreview();
  if (config) previewPanel?.openByDefault();
}
function setCurrentPage(path?: string) {
  currentPath = path;
  closeEditor();
  updateAgentContext();
  updatePreview();
  // Another page re-links its own stylesheet once it opens; anything else closes the pane.
  if (linkedStyle && path !== linkedStyle.page && !path?.endsWith(".astro")) {
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
let integrationCheck = 0;
let generation = 0;
let fileGeneration = 0;

function status(message: string) {
  const target = document.getElementById("status");
  if (target) target.textContent = message;
}
function clearError() {
  draftPreviewNoticeActive = false;
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
  draftPreviewNoticeActive = false;
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
function draftPreviewErrorMessage(error: string | undefined) {
  const fallback = "Draft preview failed.";
  if (!error) return fallback;
  const compiler = error.match(/\[CompilerError\]\s*([^\n]+)/i)?.[1] ??
    error.match(/CompilerError:\s*([^\n]+)/i)?.[1];
  const location = error.match(/Location:\s*\n\s*(?:\/project\/)?([^\n]+)/i)?.[1] ??
    error.match(/(?:Location|loc(?:ation)?)[:\s]+(?:\/project\/)?([^\n]+)/i)?.[1];
  const diagnostic = compiler ?? error.split(/\r?\n/).find((line) =>
    /(?:CompilerError|error|failed|Expected|Unexpected)/i.test(line) &&
    !/(?:bwrap|node_modules|astro build|Command failed|npm exec)/i.test(line)
  );
  const clean = diagnostic?.replace(/^.*?CompilerError:\s*/i, "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const suffix = location ? ` (${location.replace(/\s+/g, " ").trim()})` : "";
  return `${fallback} ${clean.slice(0, 220)}${suffix}`;
}
function showDraftPreviewError(message: string) {
  const notice = element("notice");
  draftPreviewNoticeActive = true;
  placeNotice(notice);
  notice.replaceChildren(node("span", "", message));
  notice.hidden = false;
  status(message);
}
function clearDraftPreviewError() {
  if (!draftPreviewNoticeActive) return;
  draftPreviewNoticeActive = false;
  element("notice").hidden = true;
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
  disposeSidebarResize?.();
  disposeSidebarResize = undefined;
  closeEditor();
  deactivateNative();
  nativePreview?.destroy();
  nativePreview = undefined;
  changedClassSelectors.clear();
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
      <a class="brand login-brand" href="/" aria-label="Astro Site Editor home"><span class="brand-mark">a<span>✦</span></span><span>Astro <strong>Site Editor</strong></span></a>
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
      node("p", "login-state", "GitHub sign-in hasn’t been configured yet."),
    );
    const details = node("details", "login-setup");
    details.append(
      node("summary", "", "Administrator setup"),
      node(
        "p",
        "",
        "Run the setup wizard in the editor project, then configure the hosted credentials described in docs/setup.md.",
      ),
      node("code", "command", "npm run setup"),
    );
    action.append(details);
  }
}

function showDirectory(directory: Directory, path = "") {
  fileGeneration++;
  setCurrentPage();
  const panel = node("section", "directory-summary");
  panel.append(
    node(
      "span",
      `badge ${directory.detection.status}`,
      directory.detection.status === "detected"
        ? "✦ Astro detected"
        : directory.detection.status === "ambiguous"
          ? "Setup needs a closer look"
          : "Explore this folder",
    ),
  );
  panel.append(
    node(
      "h1",
      "",
      path.split("/").at(-1) || currentRepo?.name || "Your project",
    ),
    node("p", "intro", directory.detection.message),
  );
  if (directory.detection.version)
    panel.append(node("p", "version", `Astro ${directory.detection.version}`));
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

function renderEntries(
  entries: TreeEntry[],
  parentPath: string,
  epoch: number,
): HTMLUListElement {
  const list = node("ul", "file-list");
  for (const entry of entries) {
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
    row.title = path;
    if (directory) row.setAttribute("aria-expanded", "false");
    let childList: HTMLUListElement | undefined;
    let loadedDirectory: Directory | undefined;
    row.addEventListener("click", async () => {
      if (epoch !== generation || !currentRepo) return;
      clearError();
      files
        .querySelectorAll(".selected")
        .forEach((el) => el.classList.remove("selected"));
      row.classList.add("selected");
      if (directory) {
        if (childList) {
          childList.hidden = !childList.hidden;
          icon.textContent = childList.hidden ? "▸" : "▾";
          row.setAttribute("aria-expanded", String(!childList.hidden));
          showDirectory(loadedDirectory!, path);
          return;
        }
        row.disabled = true;
        const selection = ++fileGeneration;
        status(`Loading ${path}…`);
        try {
          const result = await api<Directory>("tree", {
            repo: currentRepo.full_name,
            sha: entry.sha,
          });
          if (epoch !== generation) return;
          loadedDirectory = result;
          childList = renderEntries(result.entries, path, epoch);
          if (!result.entries.length)
            childList.append(node("li", "muted empty-folder", "Empty folder"));
          item.append(childList);
          icon.textContent = "▾";
          row.setAttribute("aria-expanded", "true");
          if (selection === fileGeneration) {
            showDirectory(result, path);
            status(`Opened ${path}.`);
          }
        } catch (error) {
          if (epoch === generation) errorMessage(error);
        } finally {
          row.disabled = false;
        }
      } else {
        await openEntry(entry, path, epoch);
      }
    });
    item.append(row);
    list.append(item);
  }
  return list;
}

async function openEntry(entry: TreeEntry, path: string, epoch: number) {
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
    const result = await api<{ content: string }>("file", {
      repo: currentRepo.full_name,
      sha: entry.sha,
    });
    if (epoch !== generation || selection !== fileGeneration) return;
    await mountSource(
      path,
      result.content,
      entry.sha,
      entry.mode === "120000",
      epoch,
      selection,
    );
    status(`Viewing ${path} at ${snapshot?.commit.slice(0, 7)}.`);
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
  await openCodeEditor({
    key: draftKey(scope, path),
    scope,
    baseSha: baseSha,
    onPublished: (result) => {
      trackPublished(result);
      void refreshPublishedSnapshot(scope.repo, scope.branch);
    },
    onDiscardNew: () => {
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
    onContextChange: (value, changes) => {
      activeFileContext = value;
      if (value && currentPath === value.path) {
        const patched = previewPanel?.syncSource(value.path, value.content, changes, value.original) ?? false;
        syncClassStyles(value.path, value.original, value.content);
        notifyDraftPreviewSourceIfChanged(value, changes, patched);
      }
      updateAgentContext();
      renderDraftFiles();
      commitHistory?.refresh();
      if (nativeModeActive()) updateNativePreviewSources();
    },
    onHistory: openHistory,
    ensureHistoryTarget: async (path) => {
      const opened = await openSecondary(path);
      if (opened) renderLinkedStyle();
      return opened;
    },
    path,
    source: source,
    readOnly: readOnly,
    project: snapshot
      ? {
          key: `${currentRepo.full_name}:${snapshot.branch}:${snapshot.commit}`,
          repo: currentRepo.full_name,
          entries: snapshot.entries,
          onSessionExpired: () =>
            errorMessage(
              new ApiError(401, "Your GitHub session expired. Connect again."),
            ),
        }
      : undefined,
  });
  if (epoch !== generation || selection !== fileGeneration || !info.user)
    return;
  rememberWorkspace(info.user.login, {
    repoId: scope.repoId,
    branch: scope.branch,
    path,
  });
  if (linkedStyle?.page !== path) void linkPageStyles(path);
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
  });
}
function renderDraftFiles() {
  const target = document.getElementById("draft-files");
  if (!target) return;
  target.replaceChildren();
  if (!info.user || !currentRepo || !snapshot) return;
  const scope = {
    account: info.user.login,
    repoId: currentRepo.id,
    repo: currentRepo.full_name,
    branch: snapshot.branch,
  };
  const created = draftStore()
    .list(scope)
    .filter((draft) => draft.baseSha === null);
  if (!created.length) return;
  target.append(node("p", "files-heading", "NEW DRAFT FILES"));
  for (const draft of created)
    target.append(
      button(draft.path, () => void openNewDraft(draft), "file-row"),
    );
}
async function openNewDraft(draft: SavedDraft) {
  if (
    !snapshot ||
    !currentRepo ||
    draft.repoId !== currentRepo.id ||
    draft.branch !== snapshot.branch
  )
    return;
  const epoch = generation,
    selection = ++fileGeneration;
  explorerDropdown?.close();
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
  renderDraftFiles();
  await openNewDraft(draft);
}

async function restoreFile(path: string, epoch: number) {
  const selection = ++fileGeneration;
  const repo = currentRepo!;
  let entries = snapshot!.entries;
  const parts = path.split("/");
  try {
    for (let index = 0; index < parts.length; index++) {
      if (epoch !== generation || selection !== fileGeneration) return;
      const entry = entries.find((entry) => entry.path === parts[index]);
      if (!entry) {
        const saved =
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
        if (saved?.baseSha === null) {
          await openNewDraft(saved);
          return;
        }
        throw new Error(
          "The previously open file is no longer available. Choose another file.",
        );
      }
      if (index === parts.length - 1) {
        if (entry.type === "tree")
          throw new Error(
            "The previously open file is now a folder. Choose another file.",
          );
        await openEntry(entry, path, epoch);
        return;
      }
      if (entry.type !== "tree")
        throw new Error(
          "The previously open file is no longer available. Choose another file.",
        );
      entries = (
        await api<Directory>("tree", { repo: repo.full_name, sha: entry.sha })
      ).entries;
    }
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
    renderDraftFiles();
    updatePreview();
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    files.replaceChildren(renderEntries(result.entries, "", epoch));
    status("Selected files saved to GitHub. The build status is shown in the top bar.");
  } catch (error) {
    if (epoch === generation) errorMessage(error);
  }
}

async function checkIntegration(repo: Repository, branch: string, epoch: number) {
  const request = ++integrationCheck;
  repositoryMenu?.setIntegration("loading");
  try {
    const result = await api<EditorIntegration>("editor-integration", {
      repo: repo.full_name,
      branch,
    });
    if (epoch === generation && request === integrationCheck)
      repositoryMenu?.setIntegration(result);
  } catch (error) {
    if (epoch === generation && request === integrationCheck) {
      repositoryMenu?.setIntegration();
      errorMessage(error);
    }
  }
}

async function prepareIntegrationUpdate() {
  if (!currentRepo || !snapshot) return;
  const repo = currentRepo;
  const branch = snapshot.branch;
  const expectedHead = snapshot.commit;
  repositoryMenu?.setIntegration("updating");
  try {
    const result = await postApi<EditorIntegrationUpdateResult>(
      "editor-integration/update",
      { repo: repo.full_name },
      { branch, expectedHead },
    );
    if (!result.unchanged) window.open(result.compareUrl, "_blank", "noopener");
    status(
      result.unchanged
        ? "Visual editing integration is current."
        : `Integration update branch ${result.branch} is ready for review on GitHub.`,
    );
    void checkIntegration(repo, branch, generation);
  } catch (error) {
    repositoryMenu?.setIntegration();
    errorMessage(error);
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
  integrationCheck++;
  repositoryMenu?.setIntegration();
  draftPreviewAvailable = false;
  draftPreviewOrigin = "";
  draftPreviewMode = undefined;
  draftPreview.reset();
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
    renderDraftFiles();
    changeStatus?.clear();
    updatePreview();
    // Detect native before any Astro-only work so integration checks, the draft
    // probe, and preview config never run (or error) for a native project.
    const isNative = await activateNativeManifest(repo, result, epoch);
    if (epoch !== generation) return;
    if (!isNative) {
      void checkIntegration(repo, branch, epoch);
      void probeDraftPreview(epoch);
      void loadPreviewConfig(repo, result, epoch);
    }
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    files.replaceChildren(renderEntries(result.entries, "", epoch));
    showDirectory(result);
    if (info.user)
      rememberWorkspace(info.user.login, {
        repoId: repo.id,
        branch,
        path: reopen,
      });
    if (reopen) await restoreFile(reopen, epoch);
    if (epoch !== generation) return;
    status(
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
          "This repository is empty. Add your Astro starter on GitHub, then reload repositories.",
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

async function loadRepositories() {
  const epoch = ++generation;
  fileGeneration++;
  currentRepo = undefined;
  repositoryMenu?.setRepository();
  repositoryMenu?.setIntegration();
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
    const result = await api<Repository[]>("repositories");
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
      resumeWorkspaceLink();
      mountWorkspace();
      agentMenu = createAgentMenu({
        embedded: true,
        account: info.user.login,
        onCommand: applyAgentCommand,
      });
      element("agent-menu").append(agentMenu.root);
      await loadRepositories();
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
