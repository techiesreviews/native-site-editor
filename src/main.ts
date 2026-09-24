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
import { createNativePreview, type NativePreviewSelection } from "./components/native-preview";
import {
  parseNativeManifest,
  nativeManifestPaths,
  nativeDefaultRoute,
  type NativeManifest,
} from "./native-manifest";
import { locateNativeElement } from "./native-source-location";
import { createCommitHistory } from "./components/commit-history";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { findStyleRulesInSources, type StyleRule } from "./styles-index";
import type {
  EditorContext,
  Directory,
  FilesResult,
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
  nativePreview = createNativePreview(element("main"), {
    onSelect: (selection) => void selectNativeSource(selection),
    onComponentStyles: (tags) => void loadNativeComponentStyles(tags),
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
// preview, every rule that styles the selected element. An edit to either
// file re-derives the matching rules.
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
let selectedStyleSelectors: string[] = [];
let linkedStyle: { page: string; css?: string; rules: StyleRule[] } | undefined;
let nativeLinkedStyleMatches: NativePreviewSelection["selectors"] = [];
let linkedStyleRequest = 0;
let disposeSecondary: (() => void) | undefined;
let secondaryPath: string | undefined;
let secondaryHistoryScope: string | undefined;
let secondaryRequest = 0;
function defaultSharedStyleMatch() {
  if (!nativeManifest) return undefined;
  const sources = nativeSources();
  for (const path of nativeManifest.styles) {
    const match = { path, selector: "body" };
    if (findStyleRulesInSources(sources, [match]).length) return match;
  }
  const path = nativeManifest.styles[0];
  return path ? { path, selector: "body" } : undefined;
}
async function openDefaultLinkedStyle(page = currentPath) {
  const match = defaultSharedStyleMatch();
  if (!page || !match) return false;
  const request = ++linkedStyleRequest;
  const epoch = generation;
  nativeLinkedStyleMatches = [match];
  selectedStyleSelectors = ["body"];
  const rules = findStyleRulesInSources(nativeSources(), nativeLinkedStyleMatches);
  const css = match.path;
  linkedStyle = { page, css, rules };
  if (!(await openSecondary(css))) return false;
  if (request !== linkedStyleRequest || epoch !== generation || linkedStyle?.page !== page) return false;
  renderLinkedStyle();
  return true;
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

function refreshLinkedStyleRules() {
  if (!currentRepo || !snapshot || !linkedStyle || !selectedStyleSelectors.length) return;
  const epoch = generation;
  const page = linkedStyle.page;
  const css = linkedStyle.css;
  const nativeMatches = nativeLinkedStyleMatches.slice();
  if (!nativeModeActive()) return;
  const rules = findStyleRulesInSources(nativeSources(), nativeMatches);
  if (epoch !== generation || linkedStyle?.page !== page || page !== currentPath ||
      nativeMatches.map((match) => `${match.path}\n${match.selector}`).join("\n") !==
      nativeLinkedStyleMatches.map((match) => `${match.path}\n${match.selector}`).join("\n")) return;
  linkedStyle = { page, css, rules };
  renderLinkedStyle();
}

async function linkNativeStyles(selection: NativePreviewSelection, reveal: boolean) {
  const request = reveal ? ++linkedStyleRequest : linkedStyleRequest;
  const epoch = generation;
  const page = selection.path;
  let matches = selection.selectors.slice();
  const defaultMatch = defaultSharedStyleMatch();
  if (!matches.length && defaultMatch) matches = [defaultMatch];
  if (!reveal && (!matches.length || !secondaryPath)) return;
  nativeLinkedStyleMatches = matches;
  selectedStyleSelectors = matches.map((match) => match.selector);
  const rules = findStyleRulesInSources(nativeSources(), matches);
  if (request !== linkedStyleRequest || epoch !== generation || page !== currentPath) return;
  const css = rules.find((rule) => rule.path !== page)?.path ?? matches.find((match) => match.path !== page)?.path ?? defaultMatch?.path ?? secondaryPath;
  if (!reveal && css !== secondaryPath) return;
  linkedStyle = { page, css, rules };
  if (css && !(await openSecondary(css))) return;
  if (request !== linkedStyleRequest || epoch !== generation || page !== currentPath) return;
  if (!css) closeSecondary();
  renderLinkedStyle();
  const top = rules[0];
  // The page's own caret stays on the selected element; inline rules still
  // open from their chips.
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

async function selectNativeSource(selection: NativePreviewSelection) {
  const reveal = selection.reason !== "refresh";
  if (!reveal) {
    if (!selection.path || currentPath !== selection.path) return;
    markNativeElement(selection, false);
    void linkNativeStyles(selection, false);
    return;
  }
  if (currentPath) editorModule?.markElement(currentPath, undefined, false);
  pendingNativeSelection = selection.path ? { selection, epoch: generation } : undefined;
  const request = ++linkedStyleRequest;
  fileGeneration++;
  secondaryRequest++;
  if (!selection.path) {
    nativeLinkedStyleMatches = [];
    selectedStyleSelectors = [];
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
  void linkNativeStyles(selection, reveal);
}

let nativePreview: ReturnType<typeof createNativePreview> | undefined;
// The validated `.astro-editor/native.json` of the loaded project, when present.
let nativeManifest: NativeManifest | undefined;
// True whenever the project carries a `.astro-editor/native.json`, even when
// that manifest is invalid or its sources fail to load: the preview then shows
// the error instead of the plain file browser.
let nativeEngaged = false;
const nativeBaseSources = new Map<string, string>();
const nativeComponentStyles = new Map<string, string>();
const nativeMissingComponentStyles = new Set<string>();
const nativeComponentStyleRequests = new Set<string>();
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
  const paths = new Set([...nativeManifestPaths(nativeManifest), ...nativeComponentStyles.values()]);
  const scope =
    currentRepo && snapshot && info.user
      ? { account: info.user.login, repoId: currentRepo.id, repo: currentRepo.full_name, branch: snapshot.branch }
      : undefined;
  for (const path of paths) {
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
  nativePreview.update({
    sources: nativeSources(),
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(currentPath),
  });
}

// A source edit: push new sources but never change the route, so an edit while
// the preview is on About (with a different file open) does not snap it Home.
function updateNativePreviewSources() {
  if (!nativeManifest || !nativePreview) return;
  nativePreview.update({ sources: nativeSources(), componentStyles: Object.fromEntries(nativeComponentStyles) });
}

// After a successful save, the committed content becomes the new clean baseline.
// Without this, `reconcilePublished` drops each committed browser draft (a draft
// whose content equals its baseline is pruned), so a saved file that is not the
// open editor model would otherwise fall back to the stale pre-save
// `nativeBaseSources` and the preview would revert to the old content. Guarded so
// a repo/branch switch that superseded the in-flight save never leaks results.
function adoptNativeBaseSources(
  scope: { account: string; repoId: number; branch: string },
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
  for (const draft of submitted) nativeBaseSources.set(draft.path, draft.content);
  if (nativeModeActive()) updateNativePreviewSources();
}

function deactivateNative() {
  nativeManifest = undefined;
  nativeEngaged = false;
  nativeBaseSources.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
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

// Reads and validates `.astro-editor/native.json`, prefetches every referenced
// source file from the current snapshot, and activates the native preview. All
// async steps are guarded against a superseding navigation (`epoch`).
async function activateNativeManifest(repo: Repository, result: Snapshot, epoch: number) {
  const request = ++nativeSourcesRequest;
  const live = () => epoch === generation && request === nativeSourcesRequest;
  const placeholder: NativeManifest = { version: 1, routes: { "/": "src/pages/index.html" }, components: {}, styles: [] };
  // Locate the manifest first. A failure *before* we confirm native.json exists
  // cannot be attributed to native intent, so the project opens as plain files.
  // Once the file is found, the project is native and every later failure
  // surfaces as a native error rather than silently hiding the preview.
  let manifestText: string;
  try {
    const dir = result.entries.find((entry) => entry.path === ".astro-editor" && entry.type === "tree");
    if (!dir) return false;
    const file = await findEntry(".astro-editor/native.json");
    if (!live()) return false;
    if (!file) return false;
    // The project is native from here on.
    nativeEngaged = true;
    nativeManifest = undefined;
    manifestText = await readFile(repo.full_name, file.sha);
    if (!live()) return true;
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
    // fall-back to plain files that would confuse the project's intent.
    nativeManifest = undefined;
    nativePreview?.activate(placeholder);
    nativePreview?.setError(parsed.error);
    return true;
  }
  const manifest = parsed.manifest;
  nativeBaseSources.clear();
  nativeComponentStyles.clear();
  nativeMissingComponentStyles.clear();
  nativeComponentStyleRequests.clear();
  try {
    // Resolve every referenced file, then read them all in one round trip.
    const sources: { path: string; sha: string }[] = [];
    for (const path of nativeManifestPaths(manifest)) {
      const entry = await findEntry(path);
      if (!live()) return true;
      if (!entry) throw new Error(`native.json references ${path}, which is missing from this branch.`);
      sources.push({ path, sha: entry.sha });
    }
    const contents = await readFiles(repo.full_name, sources.map((source) => source.sha));
    if (!live()) return true;
    for (const source of sources) nativeBaseSources.set(source.path, contents[source.sha]);
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
    componentStyles: Object.fromEntries(nativeComponentStyles),
    route: nativeRouteForPath(currentPath) ?? nativeDefaultRoute(manifest),
  });
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

function status(message: string) {
  const target = document.getElementById("status");
  if (target) target.textContent = message;
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
  disposeSidebarResize?.();
  disposeSidebarResize = undefined;
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
        : `${directory.entries.length} entries. Add .astro-editor/native.json to preview this project in the browser.`,
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
    onPublished: (_result, submitted) => {
      if (
        generation !== saveEpoch ||
        currentRepo?.id !== scope.repoId ||
        snapshot?.branch !== scope.branch ||
        info.user?.login !== scope.account
      )
        return;
      adoptNativeBaseSources(scope, submitted);
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
    onContextChange: (value) => {
      activeFileContext = value;
      if (value && currentPath === value.path) syncLinkedStyles(value.path, value.content);
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
    onSessionExpired: () =>
      errorMessage(new ApiError(401, "Your GitHub session expired. Connect again.")),
  });
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
  if (nativeModeActive() && !linkedStyle && options.linkDefaultStyle !== false) void openDefaultLinkedStyle(path);
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
    renderDraftFiles();
    element("revision").textContent = result.commit.slice(0, 7);
    element("revision").title = result.commit;
    files.replaceChildren(renderEntries(result.entries, "", epoch));
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
    files.replaceChildren(renderEntries(result.entries, "", epoch));
    showDirectory(result);
    if (info.user)
      rememberWorkspace(info.user.login, {
        repoId: repo.id,
        branch,
        path: open,
      });
    if (open) await restoreFile(open, epoch);
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
