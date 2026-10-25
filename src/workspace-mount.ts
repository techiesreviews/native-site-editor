// The workspace's screen: its markup and controls (mountWorkspace), the code
// panes and the file's source editor (openCodeEditor), a folder's summary
// (showDirectory), and everything open going before the login page shows
// (closeWorkspace). It owns the workspace's controls (the repository menu, the
// explorer, the selects), the code panes and the source editor's state. The
// host (src/main.ts) keeps the session and the site, and owns the preview,
// Page Structure and the component tools: this module mounts those three and
// hands them back through the host's setters. Everything comes in as live ports.

import { batch } from "@preact/signals-core";
import type { EditorContext, Directory, Repository, SessionInfo } from "../shared/types";
import type { AppStore } from "./app-store";
import { handleChunkLoadFailure } from "./chunk-recovery";
import { mountBlockRail } from "./components/block-rail";
import { mountCodeResize, mountCodeWidthResize } from "./components/code-resize";
import { mountDropdown } from "./components/dropdown";
import { createNativePreview, type NativePreview, type NativePreviewHandlers, type NativeStructureItem } from "./components/native-preview";
import { createPageStructure, type PageStructureHandlers } from "./components/page-structure";
import { dismissRefusalNote, refuse } from "./components/refusal-note";
import { createRepositoryMenu } from "./components/repository-menu";
import { createRowMenu } from "./components/row-menu";
import { mountSidebarResize, type SidebarResize } from "./components/sidebar-resize";
import { mountSiteActions } from "./components/site-actions";
import type * as SourceEditor from "./components/source-editor";
import type { ElementMenuTarget } from "./components/element-menu";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import type { BlockInsertPorts, createBlockInsertController } from "./controllers/block-insert-controller";
import type { createAgentController } from "./controllers/agent-controller";
import type { createBootController } from "./controllers/boot-controller";
import { createCodePanesController } from "./controllers/code-panes-controller";
import type { createCommandPaletteController } from "./controllers/command-palette-controller";
import type { createLinkedStylesController } from "./controllers/linked-styles-controller";
import type { createMediaController } from "./controllers/media-controller";
import type { createPageStructureController } from "./controllers/page-structure-controller";
import type { PreviewSelectionController } from "./controllers/preview-selection-controller";
import { draftKey, type DraftScope } from "./drafts";
import type { createFinishedElsewhere } from "./finished-elsewhere";
import type { GuardedEdits, Stamp } from "./guarded-edit";
import type { createParkedSteps } from "./guarded-edit/parked";
import { iconMarkup } from "./icons";
import { structureLabel } from "./native-structure";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import type { Cards } from "./page-builder/cards";
import type { ComponentTools } from "./page-builder/components";
import type { DraggedBlock } from "./page-builder/drop-target";
import type { createMediaHistoryHome } from "./page-builder/media-history-home";
import { positionText } from "./page-builder/insert-target";
import { TEXT_LINE_TAGS } from "./page-builder/rules/text-level";
import type { createPagesAndFilesHost } from "./pages-and-files-host";
import type { RepositoryIndex } from "./repository-loading";
import type { CleanSourceCache } from "./clean-source-cache";
import type { createSetupHost } from "./setup-host";
import type { SiteFiles } from "./site-download";
import type { createVersionView } from "./version-view";
import { button, node } from "./ui/dom";
import { reported } from "./ui/report-failure";
import { workingPart } from "./working-part";
import { setupKeyOf, type SessionStamp, type WorkspaceSession, type WorkspaceScope } from "./workspace-session";

type BlockDrag = typeof import("./page-builder/block-drag");
type SetupHost = ReturnType<typeof createSetupHost>;
type PagesAndFiles = ReturnType<typeof createPagesAndFilesHost>;
type PageStructure = ReturnType<typeof createPageStructure>;
type Handler<K extends keyof NativePreviewHandlers> = NonNullable<NativePreviewHandlers[K]>;
type StructureHandler<K extends keyof PageStructureHandlers> = NonNullable<PageStructureHandlers[K]>;

// The bytes each Structure row was painted from.
const nativeStructurePaintedSources = new WeakMap<NativeStructureItem, string | undefined>();
// The workspace and the page's editor model when a Structure row was painted, for its moves.
const nativeStructurePaints = new WeakMap<NativeStructureItem, { since: Stamp; model?: { isCurrent(): boolean } }>();
// A Structure row's stale words: the page open, or opening for the move.
const STRUCTURE_MOVE_STALE = "The source changed. Wait for the preview before moving this element.";
const SECTION_OPEN_STALE = "The source changed while its editor opened. Select the section again before moving it.";
const BLOCK_OPEN_STALE = "The source changed while its editor opened. Select the element again before moving it.";
// An Add rail pick or drop while the page's typing has not landed yet.
const STILL_UPDATING = "The page is still updating. Try again in a moment.";

/** The open site's loading and preview (src/main.ts until slice 87). */
export interface WorkspaceSitePorts {
  active: () => boolean;
  deactivate: () => void;
  update: () => void;
  painted: () => void;
  assets: (sources: Record<string, string>) => Promise<unknown>;
  shown: (route: string) => Promise<unknown>;
  routeSources: (route: string | undefined) => Record<string, string>;
  styles: (tags: string[]) => Promise<unknown>;
  files: () => Promise<SiteFiles | undefined>;
  route: (path: string | undefined) => string | undefined;
}

/** The page builder: the Add panel and rail, block drags, element menus and component tools (src/main.ts until slice 89). */
export interface WorkspaceBuilderPorts {
  choices: () => InsertChoice[];
  addPoint: Handler<"insertPointFor">;
  addPoints: WeakMap<InsertPoint, { description?: string }>;
  insert: (point: InsertPoint, choice: InsertChoice) => Promise<unknown>;
  drag: Handler<"onBlockPress">;
  dropTree: (drag: BlockDrag, block: DraggedBlock, template?: { template: string; tag: string }) => ReturnType<BlockDrag["structureDrop"]> | undefined;
  loadDrag: () => Promise<BlockDrag>;
  loadInsert: () => Promise<Pick<ReturnType<typeof createBlockInsertController>, "click" | "drop">>;
  insertPorts: Pick<BlockInsertPorts, "target" | "refuse">;
  finishTyping: (current: () => boolean) => Promise<boolean>;
  menuItems: (target: ElementMenuTarget) => ReturnType<StructureHandler<"menuItems">>;
  fields: () => string;
  moveItems: StructureHandler<"itemsSlots">;
  tools: () => ComponentTools;
}

/** A page's details and the settings dialogs. */
export interface WorkspacePagePorts {
  meta: StructureHandler<"pageMeta">;
  writeMeta: (path: string, field: Parameters<StructureHandler<"onPageMeta">>[1], value: string) => Promise<string | undefined>;
  settings: (path: string) => Promise<unknown>;
  navigation: (path: string) => Promise<unknown>;
  siteSettings: () => Promise<unknown>;
}

/** The repository list, account switching and sign-out, and the workspace boot: declared after the host, so arrows. */
export interface WorkspaceAccountPorts {
  reload: () => Promise<unknown>;
  switchTo: (login: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  choose: () => Promise<unknown>;
  load: () => Promise<unknown>;
}

export interface WorkspaceMountPorts {
  app: HTMLElement;
  element: <T extends HTMLElement>(id: string) => T;
  appStore: Pick<AppStore, "openFile" | "branch" | "repository" | "snapshot" | "reset">;
  editorModule: Pick<typeof SourceEditor, "onUnmountedText" | "setViewLoader" | "mountSourceEditor" | "captureHistoryHost" | "recordHistoryAction"
    | "isMounted" | "captureFileModelState" | "closeActiveEditGroup" | "clearDrafts">;
  workspaceSession: Pick<WorkspaceSession, "begin">;
  runtime: Pick<ReturnType<typeof createNativeSiteRuntime>, "site" | "engaged" | "source">;
  finishedWork: Pick<ReturnType<typeof createFinishedElsewhere>, "open" | "shown">;
  mediaHistoryHome: Pick<ReturnType<typeof createMediaHistoryHome>, "adopt" | "clear">;
  parkedSteps: Pick<ReturnType<typeof createParkedSteps>, "adopt" | "clear">;
  guardedEdits: Pick<GuardedEdits, "stamp">;
  mediaController: Pick<ReturnType<typeof createMediaController>, "disposeGallery" | "mediaEnded" | "chooseImage">;
  paletteController: Pick<ReturnType<typeof createCommandPaletteController>, "shortcut" | "mount" | "dispose">;
  previewSelection: Pick<PreviewSelectionController, "handlers">;
  pageStructureController: Pick<ReturnType<typeof createPageStructureController>, "nativeFormatActions" | "applyNativeTextEdit" | "textEdits"
    | "nativeElementMoveAction" | "removeRow" | "isNativeSectionTag" | "moveBlock">;
  linkedStyles: Pick<ReturnType<typeof createLinkedStylesController>, "updateBodyStyles" | "clearSources">;
  versions: Pick<ReturnType<typeof createVersionView>, "view" | "history">;
  cards: Cards;
  pagesAndFiles: Pick<PagesAndFiles, "pageActions" | "mountExplorer" | "loadPagesActions"> & { filesTreeController: Pick<PagesAndFiles["filesTreeController"], "refresh"> };
  setup: { setupController: Pick<SetupHost["setupController"], "mount" | "dispose">; setupEntry: Pick<SetupHost["setupEntry"], "remove">; startSitePanel: () => Promise<HTMLElement> };
  site: WorkspaceSitePorts;
  builder: WorkspaceBuilderPorts;
  page: WorkspacePagePorts;
  account: WorkspaceAccountPorts;
  repositoryIndex: Pick<RepositoryIndex, "clear">;
  cleanSources: Pick<CleanSourceCache, "clear">;
  /** Host state, read (and written) at call time. */
  readonly info: SessionInfo;
  repositories: Repository[];
  fileGeneration: number;
  nativePreview: NativePreview | undefined;
  pageStructure: PageStructure | undefined;
  componentTools: ComponentTools | undefined;
  readonly nativePreviewBehind: boolean;
  /** The guarded edit module's, told of each file a pane mounts. */
  readonly nativeMountListener: ((path: string, pane: boolean) => void) | undefined;
  /** Declared after the host. */
  readonly boot: Pick<ReturnType<typeof createBootController>, "ensureList" | "reset">;
  readonly agentController: Pick<ReturnType<typeof createAgentController>, "ensure" | "dismiss" | "answer" | "destroy">;
  readonly workspaceBoot: { dropGuess(): void };
  draftScope: () => DraftScope | undefined;
  shownScope: () => WorkspaceScope | undefined;
  nextLoad: () => SessionStamp;
  setCurrentPage: (path?: string) => void;
  errorMessage: (error: unknown) => void;
  announce: (text: string) => void;
}

export function createWorkspaceMount(ports: WorkspaceMountPorts) {
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
  let previewElementMenu: ReturnType<typeof createRowMenu> | undefined;
  window.addEventListener("blur", () => previewElementMenu?.close(false));

  // The code panes' Monaco load gate and resize handles (src/controllers/code-panes-controller.ts).
  const codePanes = createCodePanesController({
    load: () => import("./components/code-editor"),
    onChunkFailure: (error) => void handleChunkLoadFailure(error),
    mountCodeResize,
    mountCodeWidthResize,
  });
  // Undo or Redo of a file no pane shows still redraws the preview and syncs the framed instance.
  ports.editorModule.onUnmountedText(({ scope, path }) => {
    const live = ports.draftScope();
    if (!live || draftKey(live, path) !== draftKey(scope, path)) return;
    ports.pagesAndFiles.filesTreeController.refresh();
    if (ports.site.active()) ports.site.update();
    ports.componentTools?.refresh();
  });
  // A pane that needs the code now (Review, focusing the code) asks for Monaco.
  ports.editorModule.setViewLoader(() => codePanes.want().then((module) => module.monacoView));
  let disposeEditor: (() => void) | undefined;
  // The live primary keeps its journal even when a completed operation releases its alias.
  let primaryHistoryScope: { key: string; session: string; proof: { isCurrent(): boolean } } | undefined;
  let activeFileContext: EditorContext["file"] = null;
  let editorRequest = 0;

  // A guarded edit's step binds only its own new and moved-in paths to the anchor page's journal.
  const nativeHistoryAliases = new Map<string, { stamp: SessionStamp; session: string }>();
  // Edit component's shares (components' shareHistory): a template records its steps in a page's journal, the latest share first.
  const nativeHistoryShares = new Map<string, { stamp: SessionStamp; session: string }[]>();
  function nativeHistorySession(scope: NonNullable<ReturnType<typeof ports.draftScope>>, path: string) {
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
    if (!ports.info.user) return Promise.resolve();
    if (beforeMount && !beforeMount()) {
      content.replaceChildren(node("p", "empty-message", "The source changed while its editor opened. Select it again."));
      return Promise.resolve();
    }
    const defer = codePanes.deferPane(ports.site.active());
    const historyScope = file.scope ? nativeHistorySession(file.scope, file.path) : undefined;
    disposeEditor = ports.editorModule.mountSourceEditor(
      content,
      { ...(file.scope ? { ...file, historyScope } : file), loadingMessage: defer ? "The code loads once the page is on screen." : "Opening editor…" },
      ports.element("editor-toolbar-host"),
    );
    const historyHost = ports.editorModule.captureHistoryHost(file.path), liveScope = ports.draftScope();
    if (ports.appStore.openFile.value === file.path && historyHost) {
      ports.mediaHistoryHome.adopt((undo, redo, dispose) => ports.editorModule.recordHistoryAction(file.path, undo, redo, dispose));
      if (file.scope) ports.parkedSteps.adopt(file.scope, file.path, (undo, redo, dispose) => ports.editorModule.recordHistoryAction(file.path, undo, redo, dispose));
    }
    primaryHistoryScope = file.scope && historyScope && ports.appStore.openFile.value === file.path && historyHost && liveScope &&
      draftKey(liveScope, file.path) === draftKey(file.scope, file.path)
      ? { key: draftKey(file.scope, file.path), session: historyScope, proof: historyHost } : undefined;
    ports.nativeMountListener?.(file.path, false);
    ports.finishedWork.shown(file.scope, ports.element("editor-toolbar-host"));
    void codePanes.whenDue(defer).catch((error) => {
      if (request !== editorRequest) return;
      content.querySelector(".code-editor__body")?.replaceChildren(
        node("p", "empty-message", "The code editor could not load."),
        button("Retry editor", () => void codePanes.want().catch(ports.errorMessage)),
      );
      ports.errorMessage(error);
    });
    return Promise.resolve();
  }

  function mountWorkspace() {
    ports.app.className = "";
    ports.app.innerHTML = `
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
    ports.element("changes").addEventListener("toggle", () => {
      document.getElementById("history-button")?.setAttribute("aria-expanded", String(ports.element("changes").matches(":popover-open")));
    });
    repositoryMenu = createRepositoryMenu({
      installUrl: ports.info.installUrl,
      accounts: ports.info.accounts ?? (ports.info.user ? [{ ...ports.info.user, current: true }] : []),
      onOpen: () => void ports.boot.ensureList(),
      onReload: () => void ports.account.reload(),
      onAccessChanged: () => void ports.account.reload(),
      onSwitchAccount: (login) => void ports.account.switchTo(login),
      onSignOut: reported(ports.account.signOut), onNote: (note) => { ports.finishedWork.open(note); handOver(); },
    });
    ports.element("repository-menu").append(repositoryMenu.root);
    ports.element("site-settings-toggle").addEventListener("click", () => void ports.page.siteSettings());
    ports.mediaController.disposeGallery();
    siteActions = mountSiteActions({ statusHost: ports.element("change-status"), menuHost: ports.element("site-actions"), siteFiles: ports.site.files, announce: ports.announce });
    const menuPanel = ports.element("repository-actions");
    menuPanel.addEventListener("toggle", () => {
      if (menuPanel.matches(":popover-open")) { void ports.agentController.ensure().catch(ports.errorMessage); void ports.setup.setupController.mount().catch(ports.errorMessage); }
    });
    repositorySelect = ports.element<HTMLSelectElement>("repository");
    blockRail = mountBlockRail(ports.app.querySelector<HTMLElement>(".workspace")!, ports.element<HTMLButtonElement>("add-panel-toggle"), {
      onPick: kind => {
        // The click's page, selection and repository, held while typing finishes and the insert code loads.
        const since = ports.guardedEdits.stamp(), at = ports.builder.insertPorts.target();
        void ports.builder.finishTyping(() => since.holds()).then(async finished => {
          if (!since.holds()) return;
          if (!finished) { ports.builder.insertPorts.refuse(STILL_UPDATING); return; }
          const blocks = await ports.builder.loadInsert();
          if (since.holds()) await blocks.click(kind, at, since);
        }).catch(ports.errorMessage);
      },
      onUp: () => ports.nativePreview?.selectParent(),
      // The drag's targets and drawing load with the first press on a block;
      // the press's repository, branch and session hold through both loads.
      // In Edit component mode, into the template edited (its items slots are its own <slot> elements).
      drag: kind => {
        const since = ports.guardedEdits.stamp();
        const template = ports.componentTools?.mode.now();
        const block = { kind: "new", block: kind, ...(template ? { template: true } : {}) } as const;
        // In Edit component mode Page Structure takes it into the template edited, as the canvas does.
        return ports.builder.loadDrag().then(drag => since.holds() ? ports.nativePreview?.blockDrag(block, {
          tree: ports.builder.dropTree(drag, block, template),
          drop: (target, where, painted, pointer) => {
            const place = { parent: target.container.path, index: target.index, where, ...(target.container.kind === "items" && !template ? { slot: target.container.slot } : {}) };
            const at = ports.builder.insertPorts.target();
            if (template && at?.path !== template.template) { refuse("Edit component mode was left meanwhile: nothing was added.", { pointer }); return; }
            if (since.holds()) void ports.builder.finishTyping(() => since.holds()).then(async finished => {
              if (!since.holds()) return;
              if (!finished) { ports.builder.insertPorts.refuse(STILL_UPDATING, pointer); return; }
              const blocks = await ports.builder.loadInsert();
              if (since.holds()) await blocks.drop(kind, place, painted, at, pointer, since);
            }).catch(ports.errorMessage);
          },
          announce: ports.announce,
        }, drag.createBlockDrag, template?.template) : undefined);
      },
    });
    sidebarResize = mountSidebarResize(
      ports.app.querySelector<HTMLElement>(".workspace")!,
      ports.app.querySelector<HTMLElement>(".sidebar")!,
    );
    // Phones: Page structure and the code fold into a sheet under the page (phone-sheet.css); its handle loads on the first phone-wide window.
    const phone = matchMedia("(max-width: 650px) and (min-height: 500px)");
    const sheet = () => {
      if (!phone.matches) return;
      phone.removeEventListener("change", sheet);
      void import("./components/phone-sheet").then((module) => module.mountPhoneSheet(ports.app.querySelector<HTMLElement>(".workspace")!, ports.element<HTMLButtonElement>("sheet-handle"))).catch(ports.errorMessage);
    };
    phone.addEventListener("change", sheet);
    sheet();
    branchSelect = ports.element<HTMLSelectElement>("branch");
    refreshButton = ports.element<HTMLButtonElement>("refresh");
    content = ports.element<HTMLDivElement>("content");
    files = ports.element("files");
    // Choosing a project or branch, or refreshing, hands over to the explorer to pick a file.
    const handOver = () => {
      repositoryMenu?.close();
      ports.element("explorer-toggle").focus();
      explorerDropdown?.open();
    };
    repositorySelect.addEventListener("change", () => {
      void ports.account.choose();
      handOver();
    });
    branchSelect.addEventListener("change", () => {
      batch(() => {
        ports.appStore.branch.value = branchSelect.value || undefined;
        void ports.account.load();
      });
      handOver();
    });
    refreshButton.addEventListener("click", () => {
      void ports.account.load();
      handOver();
    });
    explorerDropdown = mountDropdown({
      trigger: ports.element<HTMLButtonElement>("explorer-toggle"),
      panel: ports.element("explorer"),
      below: ports.app.querySelector<HTMLElement>(".topbar")!,
      anchor: "--explorer",
    });
    ports.pagesAndFiles.mountExplorer();
    codePanes.mountResize(ports.element("main"), ports.element("code-split"), ports.element("secondary-pane"));
    // A selection inside a component's template gets Select card once the runtime says which card.
    // A remount must not leave the old pane (parked or shown) behind.
    ports.nativePreview?.destroy();
    previewElementMenu?.close(false);
    previewElementMenu?.element.remove();
    previewElementMenu = createRowMenu(ports.app);
    ports.nativePreview = createNativePreview(ports.element("main"), {
      onShortcut: name => ports.paletteController.shortcut(name),
      onRefusalNoteAction: dismissRefusalNote,
      onMediaEnded: (id) => ports.mediaController.mediaEnded(id),
      ...ports.previewSelection.handlers(),
      onDismissContextMenu: () => previewElementMenu?.close(false),
      // The right-clicked element as the edit bar takes it (a shared template's part maps to its instance).
      onContextMenu: (point, anchor, selection) => {
        const target = ports.componentTools?.mode.opened() ? selection : ports.componentTools?.instanceSelection(selection);
        const entries = target ? ports.builder.menuItems(target) : [];
        if (entries.length) previewElementMenu?.open(anchor, entries, point, "Element actions");
      },
      // The images of a page shown by following a link are read when it shows.
      // A page the text index has not read yet is read when it shows.
      onRouteShown: (route) => {
        ports.componentTools?.mode.sync();
        if (!ports.runtime.site) return;
        if (ports.nativePreviewBehind) ports.site.update();
        void ports.site.assets(ports.site.routeSources(route));
        void ports.site.shown(route);
      },
      cards: ports.cards,
      onComponentStyles: (tags) => void ports.site.styles(tags),
      onDefaultStyles: (styles) => ports.linkedStyles.updateBodyStyles({ rules: styles.selectors, cascade: styles.cascade }),
      onFormat: (format) => ports.pageStructureController.nativeFormatActions[format]?.(),
      onImageDrop: (target, files) => void ports.mediaController.chooseImage(target, files),
      onImageEdit: (target) => void ports.mediaController.chooseImage(target),
      onTextEdit: (edit) => void ports.pageStructureController.applyNativeTextEdit(edit),
      onTyping: (at, left) => left ? workingPart.left(at, ports.pageStructureController.textEdits()) : workingPart.typed(at),
      insertChoices: ports.builder.choices,
      insertPointFor: ports.builder.addPoint,
      insertDestinationText: point => point ? ports.builder.addPoints.get(point)?.description ?? positionText(point) : "Choose a section destination.",
      onInsert: (point, choice) => void ports.builder.insert(point, choice),
      onNewComponent: (tag, point) => ports.componentTools?.newComponent(tag, point) ?? Promise.resolve(false),
      onStructure: (structure) => {
        if (!structure) { ports.pageStructure?.update(undefined); return; }
        codePanes.notePreviewPainted();
        ports.site.painted();
        const path = structure.path, source = structure.paintedSource, scope = ports.draftScope();
        // A row's move holds the workspace from this paint, and the page's editor model if it is mounted.
        const paint = { since: ports.guardedEdits.stamp(), model: scope && ports.editorModule?.isMounted(path) ? ports.editorModule.captureFileModelState(scope, path) : undefined };
        const capture = (item: NativeStructureItem) => {
          nativeStructurePaintedSources.set(item, source);
          nativeStructurePaints.set(item, paint);
          item.children.forEach(capture);
        };
        const shown = structure;
        shown.items.forEach(capture);
        ports.pageStructure?.update(shown);
      },
      // Alt+arrows on the canvas: the edit bar's step for the selection.
      onMove: (direction) => ports.pageStructureController.nativeElementMoveAction?.(direction),
      onBlockPress: ports.builder.drag,
      onDismissRequest: (id) => void ports.agentController.dismiss(id),
      onAnswerRequest: async (id, text) => {
        await ports.agentController.answer(id, text);
      },
      // The Add panel docks over the page structure sidebar; under a phone's sheet (folded or not), over the page and sheet.
      addPanelDock: () => {
        const area = ports.app.querySelector<HTMLElement>(".workspace")?.getBoundingClientRect();
        const sheet = getComputedStyle(ports.element("sheet-handle")).display !== "none";
        const side = ports.app.querySelector<HTMLElement>(sheet ? ".workspace > main" : ".workspace > .sidebar")?.getBoundingClientRect();
        return area && { left: side?.left ?? area.left, top: side?.top ?? area.top, bottom: Math.min(area.bottom, innerHeight), width: side?.width ?? 320 };
      },
    });
    ports.nativePreview.attachAddButton(ports.element<HTMLButtonElement>("add-panel-toggle"));
    ports.pageStructure = createPageStructure(ports.element("structure"), {
      menuItems: (path, item, opening, template) => {
        const painted = template ? template.source : nativeStructurePaintedSources.get(item);
        const fresh = () => painted !== undefined && ports.runtime.source(path) === painted && !ports.versions.view;
        if (!fresh()) {
          if (opening) ports.announce("The source changed. Wait for the preview before using this action.");
          return [];
        }
        return ports.builder.menuItems({ path, node: template ? template.node : item.node, tag: item.tag, paintedSource: painted, renameChip: template?.chip }).map(entry => ({ ...entry, run: () => {
          if (!fresh()) { ports.announce("The source changed. Wait for the preview before using this action."); return; }
          entry.run();
        } }));
      },
      pageSource: (path) => ports.runtime.source(path),
      label: (item) => {
        const component = Boolean(ports.runtime.site && Object.hasOwn(ports.runtime.site.components, item.tag));
        return { ...structureLabel(item, component), component };
      },
      onSelect: (path, node, edit) => ports.nativePreview?.selectNode({ path, node }, edit),
      onRemove: (path, node, source) => ports.pageStructureController.removeRow(path, node, source),
      componentSlots: (path, node) => ports.componentTools?.structure(path, node),
      textRow: (path, node, tag) => TEXT_LINE_TAGS.has(tag) ? ports.componentTools?.textRow(path, node) : undefined,
      templateRows: (path, node) => ports.componentTools?.templateRows(path, node),
      componentFieldsRevision: ports.builder.fields,
      pageMeta: ports.page.meta,
      onPageSettings: (path) => void ports.page.settings(path),
      onNavigation: (path) => void ports.page.navigation(path),
      onPageMeta: (path, field, value) => void ports.page.writeMeta(path, field, value).then((error) => { if (error) ports.errorMessage(new Error(error)); }),
      pageUrl: (path) => {
        const route = ports.site.route(path);
        if (!route) return undefined;
        return route === "/" ? { route, fixed: "The home page's URL is always /." } : { route };
      },
      planUrl: (file, value) => {
        // The sidebar's URL field is hidden while Page settings holds the URL; this keeps it calm if it shows again.
        if (ports.pagesAndFiles.pageActions) return ports.pagesAndFiles.pageActions.urlPlan(file, value);
        if (value === ports.site.route(file)) return { ok: false, error: "", unchanged: true };
        void ports.pagesAndFiles.loadPagesActions().then(() => ports.pageStructure?.refreshMeta()).catch(ports.errorMessage);
        return { ok: false, error: "Loading page actions…", pending: true };
      },
      applyUrl: async (file, value, keep) => {
        const since = ports.guardedEdits.stamp("repository");
        await ports.pagesAndFiles.loadPagesActions();
        return since.holds() ? ports.pagesAndFiles.pageActions!.changeUrl(file, value, keep) : "The repository changed meanwhile. Try again.";
      },
      onPageMetaClose: (path) => ports.editorModule?.closeActiveEditGroup(path),
      // A row's Alt+arrows, by the Block move module. In Edit component mode a row of the template
      // edited (`template`: the bytes it was painted from) moves in it while that mode lasts. A page
      // that is not open opens first (the model held from the paint is then not its editor's).
      onMove: (path, item, direction, template) => {
        const paint = nativeStructurePaints.get(item), opens = !ports.editorModule?.isMounted(path) || ports.appStore.openFile.value !== path;
        const stale = !opens ? STRUCTURE_MOVE_STALE : ports.pageStructureController.isNativeSectionTag(item.tag) ? SECTION_OPEN_STALE : BLOCK_OPEN_STALE;
        const at = { path, node: item.node, painted: template ? template.painted : nativeStructurePaintedSources.get(item) };
        return ports.pageStructureController.moveBlock(at, direction, template
          ? { guard: () => ports.componentTools?.mode.now()?.template === path, stale }
          : { since: paint?.since, guard: () => opens || !paint?.model || paint.model.isCurrent(), stale });
      },
      // A row drags as its block does on the page: the same targets, in the tree as well.
      itemsSlots: ports.builder.moveItems,
      // In Edit component mode a row of the template edited (`template`: the bytes it was painted from).
      onRowDrag: (press, item, template) => ports.builder.drag(press, {
        node: item.node, tag: item.tag, cls: item.className ?? "", band: !template && ports.pageStructureController.isNativeSectionTag(item.tag),
        painted: template ? template.painted : nativeStructurePaintedSources.get(item), ...(template ? { template: true } : {}),
      }),
      announce: ports.announce,
    });
    ports.componentTools?.destroy();
    ports.componentTools = ports.builder.tools();
    ports.paletteController.mount();
  }

  // Everything open goes before the login page shows (renderLogin, src/setup-host.ts).
  function closeWorkspace() {
    ports.workspaceBoot.dropGuess();
    ports.paletteController.dispose();
    ports.agentController.destroy();
    ports.setup.setupController.dispose();
    ports.setup.setupEntry.remove();
    ports.versions.history.destroy();
    activeFileContext = null;
    explorerDropdown?.destroy();
    explorerDropdown = undefined;
    sidebarResize?.dispose();
    sidebarResize = undefined;
    blockRail?.dispose();
    blockRail = undefined;
    closeEditor();
    ports.site.deactivate();
    ports.nativePreview?.destroy();
    ports.nativePreview = undefined;
    ports.linkedStyles.clearSources();
    ports.editorModule?.clearDrafts();
    ports.mediaHistoryHome.clear();
    ports.parkedSteps.clear();
    ports.nextLoad();
    ports.fileGeneration++;
    repositoryMenu?.destroy();
    repositoryMenu = undefined;
    siteActions?.destroy();
    siteActions = undefined;
    ports.repositories = [];
    ports.boot.reset();
    ports.appStore.reset();
    ports.repositoryIndex.clear();
    ports.cleanSources.clear();
  }

  /** Account, repository and branch the checklist is of. */
  function setupScope() { return setupKeyOf(ports.shownScope()); }

  function showDirectory(directory: Directory, path = "") {
    ports.fileGeneration++;
    ports.setCurrentPage();
    ports.finishedWork.shown(ports.draftScope(), ports.element("editor-toolbar-host"));
    if (!path && !ports.runtime.engaged && ports.appStore.repository.value && ports.appStore.snapshot.value) {
      const host = content, at = ports.workspaceSession.begin(), fileEpoch = ports.fileGeneration;
      void ports.setup.startSitePanel().then((panel) => {
        if (host === content && at.holds() && ports.fileGeneration === fileEpoch) host.replaceChildren(panel);
      }).catch(ports.errorMessage);
      return;
    }
    const panel = node("section", "directory-summary");
    panel.append(
      node("span", "badge", ports.runtime.engaged ? "✦ Native site" : "Explore this folder"),
      node(
        "h1",
        "",
        path.split("/").at(-1) || ports.appStore.repository.value?.name || "Your project",
      ),
      node(
        "p",
        "intro",
        ports.runtime.engaged
          ? `${directory.entries.length} entries. Pages, components and styles render live in the preview.`
          : `${directory.entries.length} entries. Add index.html at the top of the repository to preview this project in the browser.`,
      ),
    );
    const meta = node("dl", "project-meta");
    for (const [label, value] of [
      ["Repository", ports.appStore.repository.value?.full_name ?? ""],
      ["Branch", ports.appStore.snapshot.value?.branch ?? ""],
      ["Revision", ports.appStore.snapshot.value?.commit.slice(0, 12) ?? ""],
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

  return {
    codePanes, nativeHistoryAliases, nativeHistoryShares, nativeHistorySession, closeEditor, openCodeEditor,
    mountWorkspace, closeWorkspace, setupScope, showDirectory,
    get primaryHistoryScope() { return primaryHistoryScope; },
    get activeFileContext() { return activeFileContext; }, set activeFileContext(value) { activeFileContext = value; },
    get repositorySelect() { return repositorySelect; }, get branchSelect() { return branchSelect; }, get refreshButton() { return refreshButton; },
    get content() { return content; }, get files() { return files; }, get explorerDropdown() { return explorerDropdown; },
    get repositoryMenu() { return repositoryMenu; }, get siteActions() { return siteActions; }, get sidebarResize() { return sidebarResize; },
  };
}
