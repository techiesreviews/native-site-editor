// The page builder's wiring: the command palette, component tools, inserting a
// section, block moves and drags, preview selection, the Variant lookup's files,
// CSS code intelligence, the edit bar and Page Structure controller, a page's
// title and description, the page and site settings and navigation, and the card
// grids. The host (src/main.ts) keeps the session, the editor, the preview,
// Page Structure's view and the guarded edits, and hands them in as live ports.

import { refuse } from "./components/refusal-note";
import { elementMenuItems as collectElementMenuItems, type ElementMenuTarget } from "./components/element-menu";
import type { InsertChoice, InsertPoint } from "./components/insert-controls";
import { nativeChoiceMarkup, placeholderImageCreates } from "./page-builder/native-elements";
import { nativeDestinations, nativeMarkupInsertEdit } from "./page-builder/native-operations";
import { INLINE_FORMATTING, TEXT_LINE_TAGS, TEXT_TAGS } from "./page-builder/rules/text-level";
import type { VariantFiles, VariantSite } from "../shared/variant-lookup";
import { createPageStructureController } from "./controllers/page-structure-controller";
import type { BlockInsertPorts } from "./controllers/block-insert-controller";
import { createCards } from "./page-builder/cards";
import { createPreviewSelectionController } from "./controllers/preview-selection-controller";
import type { AppStore } from "./app-store";
import { handleChunkLoadFailure } from "./chunk-recovery";
import { draftKey, type DraftScope } from "./drafts";
import type { createNativePreview, PressedBlock } from "./components/native-preview";
import { trackDrag, type DragPress } from "./page-builder/insert-drag";
import type { DraggedBlock } from "./page-builder/drop-target";
import type { createPageStructure, PageMetaField } from "./components/page-structure";
import { readNavigation } from "./page-builder/site-navigation";
import { withPageField } from "./page-builder/site-head";
import { firstHeadingText, nativeLinkSuggestions, nativePageLabel } from "./native-pages";
import { elementPathAt, locateNativeElement, locateNativeElementRange, startTagAttribute, wrapperAround, type ElementRange } from "./native-source-location";
import { itemsSlotRule } from "./page-builder/block-insert";
import { createBlockMoves, type MoveAt } from "./page-builder/block-move";
import { componentLabel, nativeInsertEdit, isSectionTemplate } from "./native-insert";
import { gridOfItem } from "./page-builder/card-source";
import type * as sourceEditor from "./components/source-editor";
import type { CssWorkspace } from "./page-builder/css-intelligence";
import { descendants, parseSource } from "./page-builder/component-model";
import { NATIVE_CONFIG_PATH, minimalTextEdit, nativePageHead, resolveNativeProject, type NativeSite, nativeSitePrefix } from "../shared/native-project";
import type { createNativeSiteRuntime } from "./native-site-runtime";
import { createCommandPaletteController } from "./controllers/command-palette-controller";
import type { createCodePanesController } from "./controllers/code-panes-controller";
import type { createLinkedStylesController } from "./controllers/linked-styles-controller";
import type { createMediaController } from "./controllers/media-controller";
import type { createAgentController } from "./controllers/agent-controller";
import { createComponentTools, type ComponentTools, type PreparedComponentLoader } from "./page-builder/components";
import { addSectionStep } from "./page-builder/component-plans";
import type { createPagesAndFilesHost } from "./pages-and-files-host";
import type { createSiteLoading } from "./site-loading";
import type { createSiteTextIndex } from "./site-text-index";
import type { createVersionView } from "./version-view";
import type { createWorkspaceBoot } from "./workspace-boot";
import type { createWorkspaceMount } from "./workspace-mount";
import type { GuardedEdits, Reads, PlanResult } from "./guarded-edit";
import type { SessionStamp, WorkspaceSession } from "./workspace-session";
import type { AnnounceAs } from "./components/toast-rules";

type PagesAndFiles = ReturnType<typeof createPagesAndFilesHost>;
type TextIndex = ReturnType<typeof createSiteTextIndex>;

export interface PageBuilderHostPorts {
  app: HTMLElement;
  appStore: AppStore;
  runtime: ReturnType<typeof createNativeSiteRuntime>;
  workspaceSession: WorkspaceSession;
  editorModule: typeof sourceEditor;
  guardedEdits: GuardedEdits;
  element: <T extends HTMLElement>(id: string) => T;
  lazyModule: <T>(load: () => Promise<T>) => () => Promise<T>;
  loadSiteSettings: () => Promise<ReturnType<typeof import("./native-settings").createNativeSettings>>;
  errorMessage: (error: unknown) => void;
  announce: (text: string, as?: AnnounceAs) => void;
  currentLoad: () => number;
  setupScope: () => string;
  draftScope: () => DraftScope | undefined;
  stampOf: (epoch: number) => SessionStamp;
  nativeHistorySession: (scope: DraftScope, path: string) => string;
  nativeRouteInfo: (route: string, site?: NativeSite) => { title?: string; description?: string };
  nativeRouteForPath: (path: string | undefined) => string | undefined;
  nativeComponentTagForPath: (path: string) => string | undefined;
  nativePageStyles: () => string[];
  nativeImagePaths: () => string[];
  ensureNativeTextIndex: TextIndex["ensureNativeTextIndex"];
  wantNativeTextIndex: TextIndex["wantNativeTextIndex"];
  showNativeWarnings: ReturnType<typeof createSiteLoading>["showNativeWarnings"];
  updateCurrentPageLabel: () => void;
  updateNativePreviewSources: () => void;
  updateAgentContext: () => void;
  /** Host state and later consts, read at call time. */
  readonly workspace: Pick<ReturnType<typeof createWorkspaceMount>, "explorerDropdown" | "sidebarResize">;
  readonly codePanes: ReturnType<typeof createCodePanesController>;
  readonly nativeHistoryShares: Map<string, { stamp: SessionStamp; session: string }[]>;
  readonly nativePreview: ReturnType<typeof createNativePreview> | undefined;
  readonly pageStructure: ReturnType<typeof createPageStructure> | undefined;
  readonly componentTools: ComponentTools | undefined;
  fileGeneration: number;
  readonly versions: ReturnType<typeof createVersionView>;
  readonly linkedStyles: ReturnType<typeof createLinkedStylesController>;
  readonly mediaController: ReturnType<typeof createMediaController>;
  readonly pagesController: PagesAndFiles["pagesController"];
  readonly pagesAndFiles: PagesAndFiles;
  readonly agentController: ReturnType<typeof createAgentController>;
  restoreFile: ReturnType<typeof createWorkspaceBoot>["restoreFile"];
  ensureExplorer: PagesAndFiles["ensureExplorer"];
  openCreate: PagesAndFiles["openCreate"];
  nativeSiteReadForCreate: PagesAndFiles["nativeSiteReadForCreate"];
}

export function createPageBuilderHost(ports: PageBuilderHostPorts) {
  // Consts and functions main.ts never reassigns, read once; its `let` state and later consts stay `ports.` reads.
  const { app, appStore, runtime, workspaceSession, editorModule, guardedEdits, element, lazyModule, loadSiteSettings, errorMessage, announce,
    currentLoad, setupScope, draftScope, stampOf, nativeHistorySession, nativeRouteInfo, nativeRouteForPath,
    nativeComponentTagForPath, nativePageStyles, nativeImagePaths, ensureNativeTextIndex, wantNativeTextIndex, showNativeWarnings,
    updateCurrentPageLabel, updateNativePreviewSources, updateAgentContext, restoreFile, ensureExplorer, openCreate, nativeSiteReadForCreate } = ports;

  // The command palette (⌘K, ⌘P) and the keyboard shortcuts sheet (?), with
  // the editor's commands calling what its own controls call
  // (src/page-builder/palette.ts, docs/page-builder/palette.md).
  const paletteController = createCommandPaletteController({
    appStore,
    host: () => app,
    site: () => runtime.site,
    routeTitle: route => nativeRouteInfo(route).title,
    files: () => runtime.files(),
    sources: () => runtime.sources(),
    effectiveSource: path => runtime.source(path),
    indexed: () => runtime.state.textIndexed,
    index: ensureNativeTextIndex,
    stamp: () => guardedEdits.stamp("repository"),
    isMounted: path => Boolean(editorModule?.isMounted(path)),
    beginNewPage: () => { ports.workspace.explorerDropdown?.open(); ports.pagesController.selectTab("pages"); },
    startNewPage: () => {
      const since = guardedEdits.stamp("repository");
      void ensureExplorer().then(() => { if (since.holds() && ports.workspace.explorerDropdown?.isOpen()) ports.pagesAndFiles.pagesTree?.startNew("/"); }).catch(errorMessage);
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
      select: (path, node) => ports.nativePreview?.selectNode({ path, node }),
      textSelected: () => { const text = previewSelection.textSelection(); return Boolean(text && !text.caret && text.text); },
      history: (direction) => void editorModule?.runVisualHistory(direction, appStore.openFile.value),
      toggleCode: () => ports.codePanes.heightResize()?.toggle(),
      codeHidden: () => element("main").classList.contains("code-collapsed"),
      toggleStructure: () => ports.workspace.sidebarResize?.toggle(),
      structureHidden: () => Boolean(app.querySelector(".workspace--sidebar-collapsed")),
      newFile: () => {
        ports.workspace.explorerDropdown?.open();
        if (runtime.site) ports.pagesController.selectTab("files");
        openCreate("", element("new-at-root"));
      },
      showPagesAndFiles: () => {
        ports.workspace.explorerDropdown?.open();
        element("explorer").querySelector<HTMLElement>("[role='tab'][aria-selected='true'], [role='treeitem'][tabindex='0']")?.focus();
      },
      announce,
      onError: errorMessage,
    },
  });

  function mountComponentTools() {
    return createComponentTools(componentPorts());
  }
  function componentPorts(): Parameters<typeof createComponentTools>[0] {
    return {
      site: () => runtime.site,
      sources: () => runtime.sources(),
      variantFiles: nativeVariantFiles,
      structureFields: true,
      files: () => runtime.files(),
      index: ensureNativeTextIndex,
      loaderPlan: nativeComponentLoaderPlan,
      edits: guardedEdits,
      editor: () => editorModule,
      preview: () => ports.nativePreview,
      currentPath: () => appStore.openFile.value,
      selection: () => appStore.selection.value,
      openFile: async (path) => {
        const at = workspaceSession.begin(), scope = draftScope();
        previewSelection.recordIntent(path);
        // A pane open on its own history when a share (shareHistory below) asks for another opens again on that.
        const shared = scope && ports.nativeHistoryShares.has(draftKey(scope, path)) ? nativeHistorySession(scope, path) : undefined;
        if (appStore.openFile.value !== path || !editorModule?.isMounted(path) || (shared && editorModule.paneOf(path)?.session !== shared)) await restoreFile(path, at);
        return at.holds() && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path));
      },
      announce,
      error: errorMessage,
      images: nativeImagePaths,
      prefix: () => runtime.prefix(),
      chooseImage: (place, placement) => ports.mediaController.choosePath(place, placement),
      links: () => (runtime.site ? nativeLinkSuggestions(Object.keys(runtime.site.routes), (route) => nativeRouteInfo(route).title, runtime.prefix()) : []),
      pageLabel: (file) => ports.pagesController.pageLabel(file),
      panelHost: app.querySelector<HTMLElement>(".sidebar")!,
      canvasComponent: (parts) => ports.nativePreview?.setCanvasComponent(parts),
      codeTitle: element("primary-title").parentElement!,
      previewPage: () => {
        const route = ports.nativePreview?.route();
        return route && runtime.site ? runtime.site.routes[route] : undefined;
      },
      refreshBar: () => { if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value); },
      refreshStructure: () => ports.pageStructure?.refresh(),
      // Joins the template to the page's journal, as the stylesheet pane follows the page's; an operation's alias stays under it.
      shareHistory: (path, owner) => {
        const scope = draftScope();
        if (!scope) return () => {};
        const key = draftKey(scope, path), share = { stamp: workspaceSession.begin(), session: nativeHistorySession(scope, owner) };
        ports.nativeHistoryShares.set(key, [...ports.nativeHistoryShares.get(key) ?? [], share]);
        return () => {
          const rest = ports.nativeHistoryShares.get(key)?.filter((each) => each !== share) ?? [];
          if (rest.length) ports.nativeHistoryShares.set(key, rest); else ports.nativeHistoryShares.delete(key);
        };
      },
    };
  }

  // Components that fit between page sections: those whose template is a
  // single <section>, read from their current source so a draft counts.
  function nativeSectionChoices(): InsertChoice[] {
    if (!runtime.site) return [];
    // The Add panel lists every section component: their templates are the text index.
    if (!runtime.state.textIndexed) wantNativeTextIndex();
    const sources = runtime.sources();
    return Object.entries(runtime.site.components)
      .filter(([, path]) => isSectionTemplate(sources[path] ?? ""))
      .map(([tag]) => ({ tag, label: componentLabel(tag) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Puts a new instance of a section component into the page at `point`, as
  // one undo step, and selects it. The page file opens first when another
  // file is in the editor, since edits go through the mounted editor.
  const nativeAddPoints = new WeakMap<InsertPoint, { source: string; stamp: SessionStamp; description: string }>();
  function nativeElementAddPoint(choice: InsertChoice, fallback: InsertPoint | undefined, mode: "click" | "drop" | "gap" = "click"): InsertPoint | undefined {
    const markup = nativeChoiceMarkup(choice.tag, undefined, runtime.prefix());
    if (!markup) return fallback;
    if (ports.versions.view || !runtime.site) return;
    const selected = appStore.selection.value;
    const path = selected?.path && Object.values(runtime.site.routes).includes(selected.path) ? selected.path : fallback?.path;
    const source = path && runtime.source(path);
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
    const sources = runtime.sources(site, file => r.source(file));
    try {
      const { siteLoaderPlan } = await import("./page-builder/component-loader");
      if (check) await check();
      return await siteLoaderPlan(path, nextPageText, r, sources, check);
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
    const native = nativeChoiceMarkup(choice.tag, undefined, runtime.prefix());
    // A destination planned against the page's bytes then (the Add panel's) holds only while they do.
    const captured = nativeAddPoints.get(point), moved = "The insertion source changed. Choose the destination again.";
    if (captured && (!captured.stamp.holds() || ports.versions.view)) { errorMessage(new Error(moved)); return; }
    if (!ports.nativePreview || !runtime.site || !Object.values(runtime.site.routes).includes(path)) return;
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
    }, { since, anchor: path, guard: () => !ports.versions.view });
    if (!outcome.ok || outcome.message) errorMessage(new Error(!outcome.ok && outcome.reason === "stale" ? moved : outcome.message));
  }

  // A rail click or drop ends typing first, as Escape does: the runtime's
  // answer follows its text edit, whose queue is then drained. False when the
  // page did not answer: inserting before the typed text lands could move it.
  async function finishRailTyping(current: () => boolean) {
    if (ports.nativePreview && !await ports.nativePreview.finishTyping()) return false;
    if (current()) await pageStructureController.textEdits();
    return true;
  }

  // The Block move module (src/page-builder/block-move.ts): what a press moves, where it may go,
  // and the move as one guarded edit, on the page or the template edited: the edit bar, the
  // canvas's and Page Structure's Alt+arrows, and MCP move_section (drags arrive in slice 32).
  const blockMoves = createBlockMoves({
    edits: guardedEdits,
    editing: () => ports.componentTools?.mode.now(),
    mounted: path => appStore.openFile.value === path && Boolean(editorModule?.isMounted(path)),
    recheck: (path, source, node, tag) => {
      const stamp = guardedEdits.stamp(), close = editorModule!.editGroupCloser(path, tag);
      let changed = false;
      const stop = editorModule!.sourceStore().subscribe(event => {
        if (event.type === "text" || event.type === "history") { changed = true; close(); }
      });
      const current = () => !changed && stamp.holds() && runtime.source(path) === source && Boolean(editorModule?.hasOpenEditGroup(path, tag));
      void import("./page-builder/media-move-recheck").then(module => module.recheckMove({
        edits: guardedEdits, current, painted: () => ports.nativePreview?.paintedSource(path),
        measure: node => ports.nativePreview!.measureImage({ path, node }, source),
        close: () => { stop(); close(); },
      }, path, source, node, tag)).catch(() => { stop(); close(); });
    },
    forgetOpening: path => {
      const draft = draftScope();
      // A kept model of the page, forgotten when the open is refused: it holds bytes older than the draft's.
      const kept = draft ? editorModule?.captureFileModelState(draft, path, true) : undefined;
      return painted => {
        if (draft && runtime.source(path) !== painted && kept?.isCurrent() && !editorModule?.isMounted(path)) editorModule?.forgetDraftModel(draft, path);
        updateNativePreviewSources();
      };
    },
  });
  // The block rail's clicks and drags: one source edit per block, the new block selected.
  // Loaded with the first click.
  const blockInsertPorts: BlockInsertPorts = {
    target: () => {
      const route = ports.nativePreview?.route();
      const path = route !== undefined && runtime.site && !ports.versions.view ? runtime.site.routes[route] : undefined;
      if (!path) return undefined;
      // Edit component mode builds in the template edited, a part of it selected.
      const template = ports.componentTools?.mode.now();
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
      ports.nativePreview?.flashRefusal(reason);
      refuse(reason, { visible: document.querySelector<HTMLElement>(".pb-flash-label.is-refused") ?? undefined });
    },
  };
  const loadBlockDrag = lazyModule(() => import("./page-builder/block-drag"));
  // Page Structure's side of a block's drag: its line, and its own targets
  // (in Edit component mode, the rows of the template edited).
  const structureDrop = (drag: Awaited<ReturnType<typeof loadBlockDrag>>, block: DraggedBlock, template?: { template: string; tag: string }) =>
    ports.pageStructure && drag.structureDrop(ports.pageStructure.dropView(template?.template), block, tag => guardedEdits.peek.template(tag)?.source, template?.tag);

  // A page block dragged by its name in the edit bar (`pressed` none: the
  // selection) or pressed in the page: moved where it is dropped, one undo
  // step (the Block move module's `move`), anywhere HTML's content rules
  // allow (slice 82). In Edit component mode the template's parts move the
  // same way in the template (a named slot with its element), and the page's
  // blocks stay put. The drag's targets load with the first one; the press's
  // page, repository and session hold throughout.
  function dragPageBlock(press: DragPress, pressed?: PressedBlock) {
    const target = blockInsertPorts.target(), selection = appStore.selection.value;
    const template = target?.template !== undefined ? ports.componentTools?.mode.now() : undefined;
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
    const component = Boolean(runtime.site && Object.hasOwn(runtime.site.components, from.tag));
    return trackDrag(press, () => ({ name, tag: from.tag, component }), () => loadBlockDrag().then(drag => {
      if (!since.holds()) return undefined;
      if (pressed) name = drag.dropBlockName(from.tag, from.cls);
      return ports.nativePreview?.blockDrag(block, {
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

  const previewSelection = createPreviewSelectionController({
    generation: currentLoad,
    scope: setupScope,
    store: appStore,
    site: () => runtime.site,
    sources: () => runtime.sources(),
    editableSource: (path) => runtime.sources()[path],
    preview: () => ports.nativePreview,
    editor: () => editorModule,
    componentTag: nativeComponentTagForPath,
    editingScopePath: () => ports.componentTools?.mode.opened(),
    instanceContent: nativeInstanceContent,
    locateTag: locateNativeElement,
    tagName: (source, node) => locateNativeElementRange(source, [...node])?.tag.name,
    openFile: (path, epoch) => restoreFile(path, stampOf(epoch), { linkDefaultStyle: false }),
    renderEditBar: (selection) => pageStructureController.renderEditBar(selection),
    linkStyles: (selection, reveal) => void ports.linkedStyles.linkNativeStyles(selection, reveal),
    clearMoveAction: () => { pageStructureController.nativeElementMoveAction = undefined; },
    structureSelect: (target) => ports.pageStructure?.select(target),
    hideComponentTools: () => ports.componentTools?.show(undefined),
    agentContext: updateAgentContext,
    announce: (message) => refuse(message),
    beginReveal: () => {
      const request = ports.linkedStyles.beginReveal();
      ports.fileGeneration++;
      return request;
    },
    styleRequest: () => ports.linkedStyles.styleRequest(),
    clearStyles: () => ports.linkedStyles.clearStyles(),
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
      const site = runtime.site;
      if (!site || !draftScope() || ports.versions.view) return undefined;
      if (variantSite?.from !== site) variantSite = { from: site, site: { pages: Object.values(site.routes), components: site.components } };
      return variantSite.site;
    },
    read: (path) => {
      const scope = draftScope();
      if (!runtime.site || !scope || ports.versions.view) return undefined;
      const source = runtime.source(path, scope);
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
    if (!wanted || !runtime.site || !scope || !repo || ports.versions.view) return;
    const at = workspaceSession.begin(), scopeKey = setupScope();
    const key = (path: string) => JSON.stringify([at.load, scopeKey, path]);
    const files = new Set(runtime.files(scope));
    const missing = [...wanted].filter(path => files.has(path) && runtime.source(path, scope) === undefined && !variantReads.has(key(path)));
    if (!missing.length) return;
    missing.forEach(path => variantReads.add(key(path)));
    const live = () => at.holds();
    void runtime.readPredicted(repo.full_name, missing, live).then((read) => {
      missing.forEach(path => variantReads.delete(key(path)));
      if (!live() || !read) return;
      editorModule?.refreshVariants();
      ports.nativePreview?.refreshCardLooks();
      if (appStore.selection.value) pageStructureController.renderEditBar(appStore.selection.value);
    });
  }

  /** A fresh source appStore.snapshot.value for CSS code intelligence. */
  function nativeCssWorkspace(): CssWorkspace | undefined {
    const scope = draftScope(), requester = appStore.openFile.value;
    if (!runtime.site || !scope || !requester || ports.versions.view || !editorModule?.isMounted(requester)) return;
    const at = workspaceSession.begin(), scopeKey = setupScope(), sources = runtime.sources();
    const revision = JSON.stringify([at.load, scopeKey, requester, runtime.site.routes, runtime.site.components, appStore.selection.value?.path, appStore.selection.value?.node, sources]);
    const orderedPaths = [...new Set([...nativePageStyles(), ...Object.keys(sources).sort()])];
    return {
      revision, sources, orderedPaths,
      async openDefinition(path, start, end, expectedRevision) {
        if (expectedRevision !== revision || !/\.css$/i.test(path) || sources[path] === undefined || start < 0 || end < start || end > sources[path].length) return false;
        const requesterProof = editorModule!.captureFileModelState(scope, requester);
        const targetProof = editorModule!.captureFileModelState(scope, path);
        const current = () => at.holds() && appStore.openFile.value === requester && !ports.versions.view &&
          requesterProof.isCurrent() && nativeCssWorkspace()?.revision === revision;
        if (!current() || !targetProof.isCurrent()) return false;
        if (path !== requester && !(await ports.linkedStyles.openSecondary(path, () => current() && targetProof.isCurrent()))) return false;
        if (!current() || editorModule?.getMountedSource(path) !== sources[path] || !editorModule.isMounted(path)) return false;
        ports.linkedStyles.renderLinkedStyle();
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

  const pageStructureController = createPageStructureController({
    get nativePreview() { return ports.nativePreview; },
    editorModule,
    appStore,
    get componentTools() { return ports.componentTools; },
    nativeEditableSource: (path) => runtime.sources()[path],
    get nativeSite() { return runtime.site; },
    element,
    get generation() { return currentLoad(); },
    setupScope,
    draftScope,
    openNativeNavigation,
    nativeSources: (site?: NativeSite) => runtime.sources(site),
    nativePageStyles,
    nativeTextTags: TEXT_LINE_TAGS,
    previewSelection,
    wholeWrapper,
    nativeLinkParents,
    errorMessage,
    nearestLink,
    nativeRouteInfo,
    get versionView() { return ports.versions.view; },
    nativeEffectiveSource: (path: string, scope?: DraftScope) => runtime.source(path, scope),
    nativeNamedDescendant,
    chooseMediaForImage: (target, files) => ports.mediaController.chooseImage(target, files),
    mediaPlaceState: (page, src, alt) => ports.mediaController.placeState(page, src, alt),
    mediaVideoControls: (page, node, source) => ports.mediaController.videoControls(page, node, source),
    mediaButton: (page, node, source) => ports.mediaController.mediaButton(page, node, source),
    mediaPlaceFrame: (page, node, tag) => ports.mediaController.placeFrame(page, node, tag),
    editImage: target => void ports.mediaController.editImage(target),
    changeMediaPlace: (page, node, decorative) => ports.mediaController.changePlace(page, node, decorative),
    nativePictureSources,
    // cards is declared later in this module: read it at call time.
    cardControls: (selection, source) => cards.controls(selection, source),
    get agentController() { return ports.agentController; },
    announce,
    refuse,
    restoreFile: (path, epoch, options) => restoreFile(path, stampOf(epoch), options),
    updateNativePreviewSources,
    nativeEditableTemplatePath: () => previewSelection.editableTemplatePath(),
    nativePageLabelOf: file => ports.pagesController.pageLabel(file),
    get pageStructure() { return ports.pageStructure; },
    locateNativeElementRange,
    elementPathAt,
    wrapperAround,
    moves: blockMoves,
    edits: guardedEdits,
  });

  /** Instance content uses the same text/inline boundary as native canvas typing. */
  function nativeInstanceContent(source: string, node: readonly number[], tag: string): boolean {
    const range = locateNativeElementRange(source, [...node]);
    if (!range || range.tag.name !== tag) return false;
    if (["img", "picture", "video", "a", "button"].includes(tag)) return true;
    const route = ports.nativePreview?.route();
    if (route && gridOfItem(source, [...node], { route, prefix: runtime.prefix(), routes: runtime.site?.routes ?? {}, isSection: (...args) => pageStructureController.isNativeSectionTag(...args) })) return true;
    if (!range.close || !TEXT_TAGS.has(tag)) return false;
    const template = document.createElement("template");
    template.innerHTML = source.slice(range.tag.end, range.close.start);
    return Boolean(template.content.textContent?.trim()) && [...template.content.querySelectorAll("*")].every(element => INLINE_FORMATTING.has(element.localName));
  }

  let nativeComponentFieldToken = 0;
  let nativeComponentFieldSnapshot: { key: string; proofs: { isCurrent(): boolean }[] } | undefined;
  function nativeComponentFieldsRevision() {
    const scope = draftScope();
    const sources = runtime.sources();
    // Without a scope or the editor module there are no model proofs, so nothing would ever mark this
    // snapshot stale: whether proofs exist belongs to the key, or Structure keeps its pre-editor fields.
    const key = JSON.stringify([currentLoad(), setupScope(), appStore.openFile.value, runtime.site?.components, sources, Boolean(scope && editorModule)]);
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

  function elementMenuItems(target: ElementMenuTarget) {
    const providers = [
      (target: ElementMenuTarget) => ports.componentTools?.menuItems(target) ?? [],
      (target: ElementMenuTarget) => ports.componentTools?.slotMenu(target) ?? [],
    ];
    return collectElementMenuItems(target, providers);
  }

  // The title and description of the page file `path` for the Page block,
  // from its head (`<title>`, `<meta name="description">`); nothing when the
  // file is not one of the site's pages. The title's placeholder is the
  // page's first heading.
  function nativePageMeta(path: string) {
    if (!nativeRouteForPath(path)) return undefined;
    const source = runtime.source(path) ?? "";
    const head = nativePageHead(source);
    return {
      title: head.title ?? "",
      description: head.description ?? "",
      placeholders: { title: firstHeadingText(source) || undefined },
    };
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
    if (ports.workspace.explorerDropdown?.isOpen() && ports.pagesController.explorerTab() === "pages") ports.pagesController.renderTree();
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
    const source = runtime.source(path), route = nativeRouteForPath(path);
    if (source === undefined || !route) return;
    try { settings.nativeSettingsController(settings, [path]).page({ path, source, route, images: nativeImagePaths() }); }
    catch (error) { errorMessage(error); }
  }

  async function openNativeSiteSettings() {
    const at = workspaceSession.begin();
    if (!runtime.site) { refuse("Open a native site first."); return; }
    const [problem, settings] = await Promise.all([ensureNativeTextIndex(), loadSiteSettings()]);
    if (!at.holds()) return;
    if (problem || !runtime.site) { if (problem) errorMessage(new Error(problem)); return; }
    try {
      settings.nativeSettingsController(settings, [NATIVE_CONFIG_PATH, runtime.site.routes["/"]]).site({ values: settings.readSiteIdentity(runtime.source(NATIVE_CONFIG_PATH), runtime.source(runtime.site.routes["/"]) ?? ""), pages: settings.nativeSitePageChoices(), images: nativeImagePaths(), has404: Boolean(runtime.site.routes["/404.html"]) });
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
    if (!runtime.site) return;
    const parsed = resolveNativeProject(runtime.files());
    if (!parsed.ok) { errorMessage(new Error(parsed.error)); return; }
    runtime.site = parsed.site;
    showNativeWarnings(parsed.warnings);
    ports.nativePreview?.activate(parsed.site);
    updateNativePreviewSources();
    updateAgentContext();
    ports.pageStructure?.refreshMeta();
    ports.pagesController.renderTree();
    updateCurrentPageLabel();
  }

  /** Alt+arrow moves open an instance's seal at its items slots, as drags do. */
  function nativeMoveItems() {
    return itemsSlotRule(tag => guardedEdits.peek.template(tag)?.source);
  }

  // ---- Card grids (src/page-builder/cards.ts, docs/page-builder/cards.md). ----
  // Its ports are read live; every card write is a guarded edit (src/guarded-edit.ts).
  const cards = createCards({
    edits: guardedEdits,
    siteRead: nativeSiteReadForCreate,
    editable: path => Boolean(draftScope()) && appStore.openFile.value === path && Boolean(editorModule?.isMounted(path) && editorModule.captureHistoryHost(path)),
    preview: () => ports.nativePreview,
    openPage: file => void restoreFile(file, workspaceSession.begin()),
    pageLabel: (file) => ports.pagesController.pageLabel(file),
    variantFiles: nativeVariantFiles,
    announce,
  });

  return {
    paletteController, mountComponentTools, componentPorts, nativeSectionChoices, nativeAddPoints, nativeElementAddPoint, nativeComponentLoaderPlan,
    insertNativeComponent, finishRailTyping, blockMoves, blockInsertPorts, loadBlockDrag, structureDrop, dragPageBlock, loadBlockInsert,
    previewSelection, nativeVariantFiles, nativeCssWorkspace, pageStructureController, nativeComponentFieldsRevision, elementMenuItems,
    nativePageMeta, writeNativePageMeta, nativeNavigationTarget, openNativePageSettings, openNativeSiteSettings, openNativeNavigation,
    refreshNativeRoutes, nativeMoveItems, cards,
  };
}
