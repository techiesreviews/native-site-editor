import { samePreviewFiles } from "./preview-files";
import type { DropReport } from "../page-builder/drop-report";
import type { FrameHost } from "./preview-protocol";
import { createPreviewLink, iframeFramePort } from "./preview-link";
import { handleChunkLoadFailure } from "../chunk-recovery";
import { mountSlotGhosts, readSlotGhostReport, type SlotGhostFillTarget } from "./slot-ghosts";
export type { SlotGhostFillTarget, SlotGhostReport } from "./slot-ghosts";
import { button, node } from "../ui/dom";
import {
  nativeDefaultRoute,
  nativePageBody,
  nativePageStylesheets,
  nativeSitePaths,
  type NativeSite,
} from "../../shared/native-project";
import { nativeLinkFragment, nativeLinkTarget } from "../../shared/native-routes";
import { editBarSources } from "./edit-bar-sources";
import { createEditBar, type EditBarModel, type SelectionRect } from "./edit-bar";
import { createInsertControls, type InsertChoice, type InsertPoint } from "./insert-controls";
import type { createAgentPins, PinRequest } from "./agent-pins";
import { createCardGridControls, type CardGridHandlers, type ItemGridReport, type ItemGridsReport } from "./card-grid-controls";
import { isSectionTemplate } from "../native-insert";
import { startTags } from "../native-source-location";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";
import { withSlottedRules } from "../../shared/slotted-css";
import type { NativeCascade, NativeSelectedRule } from "../style-cascade";
import { watchEditorTheme } from "../theme";
import type { AddPanelHandlers } from "../page-builder/add-panel";
import { createPageBuilder } from "../page-builder/page-builder";
import type { DraggedBlock, DropTarget } from "../page-builder/drop-target";
import type { createBlockDrag } from "../page-builder/block-drag";
import type { StructureDrop } from "../page-builder/tree-drop";
import type { DragFeed, DragPress } from "../page-builder/insert-drag";
import { createCanvasBar } from "./canvas-bar";
import { linkCodeToCanvas } from "../page-builder/code-link";
import { createPreviewFrameState } from "./preview-frame-state";
import "./native-preview.css";

// Browser-native preview: a persistent sandboxed iframe that renders a
// site's pages (the `<body>` of each `.html` document, see
// shared/native-project.ts) and the custom elements defined under
// `components/` (flat `<name>.html` or one folder per component,
// `<name>/<name>.html`) from in-memory source, patched over messages (preview-link.ts)
// and never reloaded per edit, the way the site's own loader renders them.
//
// This is the editor's only preview: a sandboxed frame rendered in place. It
// deliberately supports NO arbitrary page JavaScript: `<script>`, `on*`
// handlers, and `javascript:` URLs are stripped before render. It has no build
// source maps; selection opens the owning page/component file at the
// selected element's start tag (see native-source-location.ts) plus the
// matching rendered CSS rules.
//
// The frame uses `srcdoc` so project-wide X-Frame-Options/`frame-ancestors` do
// not block it, but loads its runtime from a same-origin external script.
// Production CSP keeps `script-src` free of `unsafe-inline`.
//
// The runtime (native-preview-runtime.js) is bundled with the rules it imports
// into one classic script (vite-preview-runtime.ts): served readable in dev
// and the test server, minified with a source map under a content-hashed
// /assets/ URL in the build, cached as immutable.
// The URL is absolute so the about:srcdoc frame needs no base URL.
const RUNTIME_URL = new URL("./native-preview-runtime.js", import.meta.url).href;
// A tab opened before a deploy asks for the previous hash, which is gone: the
// sandboxed frame's failed <script> never reaches the parent, so the host
// waits this long for `ready` once the frame is attached and then treats it
// as a failed chunk load (chunk-recovery: reload, or the update notice).
const RUNTIME_READY_TIMEOUT_MS = 8000;
// The runtime answers a text patch at once; one not answered by then is let go
// (its full update comes with the next render anyway).
const PATCH_ANSWER_MS = 5000;
const RUNTIME_DOC = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="ase-frame-load" content="__FRAME_LOAD__" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Native preview</title>
<script src="${RUNTIME_URL}" defer></script>
</head>
<body><div id="root" data-key="root"><div id="page" data-key="page"></div></div></body>
</html>`;
const runtimeDoc = (load: number) => RUNTIME_DOC.replace("__FRAME_LOAD__", String(load));

/** Edit component mode as the frame takes it. */
export interface EditComponentFrameMode {
  path: string;
  node: number[];
  tag: string;
  nested?: { node: number[]; tag: string }[];
}

interface UpdateInput {
  sources?: Record<string, string>;
  componentStyles?: Record<string, string>;
  // Repository image paths to data URLs, so `<img src>` and CSS `url()`s show in the frame.
  assets?: Record<string, string>;
  route?: string;
  // The component whose template is open: the preview shows a page that uses
  // it, or the component alone when no page does.
  component?: string;
  /** A template explicitly opened through Files or Edit component. */
  editableTemplatePath?: string;
}

// The home page's `<main …>` start tag, or a plain one when it has none.
function pageContainer(pageHtml: string) {
  const main = startTags(pageHtml).find((tag) => tag.name === "main");
  return main ? pageHtml.slice(main.start, main.end) : `<main class="page">`;
}

// The pseudo-route on which a component renders by itself.
const componentRoute = (tag: string) => `/__component__/${tag}/`;
const usesTag = (html: string, tag: string) => new RegExp(`<${tag}[\\s>/]`, "i").test(html);

// Whether the page at `routePath` shows `tag`, directly or inside another
// component's template (a note inside a card inside the page).
function routeUsesTag(site: NativeSite, sources: Record<string, string>, routePath: string, tag: string) {
  const seen = new Set<string>();
  const queue = [pageOf(sources[site.routes[routePath]] ?? "")];
  while (queue.length) {
    const html = queue.pop()!;
    if (usesTag(html, tag)) return true;
    for (const [name, path] of Object.entries(site.components)) {
      if (seen.has(name) || !usesTag(html, name)) continue;
      seen.add(name);
      queue.push(sources[path] ?? "");
    }
  }
  return false;
}

// Which element the runtime should select once the next update has rendered:
// element-child indexes under the page root or the component's shadow root.
export interface NativeNodeRequest {
  path: string;
  node: number[];
}

export type { NativeSelectedRule } from "../style-cascade";

export interface NativePreviewSelection {
  path: string;
  tag: string;
  text: string;
  reason: "click" | "refresh";
  selectors: NativeSelectedRule[];
  // Layer order and computed values for resolving `selectors` (shared/cascade.ts).
  cascade?: NativeCascade;
  // Element-child indexes from the owning file's root to the selected element.
  node?: number[];
  // The nearest enclosing link's href, when the selection sits inside one.
  link?: string;
  // Frame-viewport rectangle of the selected element.
  rect?: SelectionRect;
  // A selector unique among the rendered page's elements (for one in a
  // component's template, among its instance's, with the instance's own as `host`).
  selector?: string;
  // For an element of a component's template, the instance it renders in
  // (with where that instance is written, when the runtime can tell).
  host?: { tag: string; selector: string; path?: string; node?: number[]; rect?: SelectionRect; paintedSource?: string };
  /** Actual shadow-root owners, nearest first, bounded to sixteen tiers. */
  hostChain?: NonNullable<NativePreviewSelection["host"]>[];
  /** Source bytes from this selection's sent render snapshot. */
  paintedSource?: string;
}

// A text selection inside the selected element: offsets into its DOM text
// content, the selected text, and the inline wrappers around it (innermost
// first). `caret` marks a collapsed one (start = end, no text), reported
// only when the caret sits inside a link.
export interface NativeTextSelection {
  start: number;
  end: number;
  text: string;
  wrappers: string[];
  caret?: boolean;
}

// Bold, italic, or a link on the selected text (Ctrl/⌘+K).
export type NativeFormat = "strong" | "em" | "link";

/** A warning about the site with the one-click fixes it offers. */
export interface NativeWarning {
  text: string;
  fixes: { label: string; run: () => void; title?: string; ariaLabel?: string }[];
}

// Text typed into a selected element in the preview: its whole text content
// before and after the change.
/** One page element in the structure the runtime reports after a render. */
export interface NativeStructureItem {
  tag: string;
  className?: string;
  node: number[];
  text: string;
  heading: string;
  slot: string;
  children: NativeStructureItem[];
}
export interface NativeStructure {
  /** The page file the items belong to; empty for a component shown by itself. */
  path: string;
  items: NativeStructureItem[];
  /** Exact page bytes in the update sent for this painted render. */
  paintedSource?: string;
}

export interface NativeTextEdit {
  path: string;
  node: number[];
  before: string;
  after: string;
}

/**
 * A block pressed in the page: its body path, tag and class, whether it is a
 * band, and the page bytes it was painted from; `template`: a part of the
 * template edited in Edit component mode, by its template path and bytes.
 */
export interface PressedBlock { node: number[]; tag: string; cls: string; band: boolean; painted: string | undefined; template?: boolean }

export interface NativePreviewHandlers {
  onShortcut?: (name: string) => void;
  onRefusalNoteAction?: () => void;
  /** A right-click in the frame selected `selection`: open its element menu at `point` (host viewport). */
  onContextMenu?: (point: { x: number; y: number }, anchor: HTMLIFrameElement, selection: NativePreviewSelection) => void;
  /** A press, scroll, re-render with other bytes or History view: close that menu. */
  onDismissContextMenu?: () => void;
  /** The frame drew another page (the first, a followed link, a file opened): the host reads its images. */
  onRouteShown?: (route: string) => void;
  /** Caller must check current source and revision before filling the page instance. */
  onSlotGhostFill?: (target: SlotGhostFillTarget) => void;
  onSelect?: (selection: NativePreviewSelection) => void;
  onSelectionRect?: (rect: SelectionRect) => void;
  onComponentStyles?: (tags: string[]) => void;
  // The rules styling the page's <body>, whenever they change.
  onDefaultStyles?: (styles: { selectors: NativeSelectedRule[]; cascade?: NativeCascade }) => void;
  onTextSelection?: (selection: NativeTextSelection | undefined) => void;
  // Ctrl/⌘+B, +I or +K pressed inside the preview.
  onFormat?: (format: NativeFormat) => void;
  // Alt+Up/Down (a selected section among its siblings) or Alt+Left/Right
  // ("out" of / "in" to a container) pressed inside the preview.
  onMove?: (direction: "up" | "down" | "out" | "in") => void;
  onTextEdit?: (edit: NativeTextEdit) => void;
  onImageDrop?: (target: { path: string; node: number[]; width?: number }, files: File[]) => void;
  // A double-click on an image of the page (or of the template open for editing): choose its image.
  onImageEdit?: (target: { path: string; node: number[]; width?: number }) => void;
  // A page block pressed and moved 7 px: its name in the edit bar (`moving`
  // none: the selection) or the block in the page (`moving`: the block the
  // runtime picked, on the bytes it shows). The drag it starts, or none.
  onBlockPress?: (press: DragPress, moving?: PressedBlock) => (DragFeed & { justDragged(): boolean }) | undefined;
  // The rendered page's own elements, after each render.
  onStructure?: (structure: NativeStructure | undefined) => void;
  // Components offered between page sections, and what to do with a choice.
  insertChoices?: () => InsertChoice[];
  insertPointFor?: AddPanelHandlers["pointFor"];
  insertDestinationText?: AddPanelHandlers["destinationText"];
  onInsert?: (point: InsertPoint, choice: InsertChoice) => void;
  onNewComponent?: AddPanelHandlers["newComponent"];
  // Where the Add panel docks (src/page-builder/add-panel.ts).
  addPanelDock?: () => { left: number; top: number; bottom: number; width: number } | undefined;
  // A request to agents dismissed from its pin, and the user's answer to an agent's question.
  onDismissRequest?: (id: string) => void;
  onAnswerRequest?: (id: string, text: string) => Promise<void>;
  // Grids of repeated items: what each is and how to add to it (src/components/card-grid-controls.ts),
  // and the grids under the pointer and around the selection whenever they change.
  cards?: CardGridHandlers;
  onItemGrids?: (report: ItemGridsReport) => void;
}

// The part of a page document the preview renders: its <body> content.
function pageOf(source: string) {
  const { start, end } = nativePageBody(source);
  return source.slice(start, end);
}

// `css` (the file `path`) with each `url()` that names a repository image
// the host has read shown from its data URL: the frame cannot reach the
// repository, and a root path would resolve against the editor.
function withAssetUrls(css: string, path: string, assets: Record<string, string>) {
  return rewriteCssUrls(css, (url) => {
    const target = resolveImportPath(path, url);
    return target !== undefined && Object.hasOwn(assets, target) ? assets[target] : undefined;
  });
}

/** The stylesheets the page at `route` links (the home page's for a component shown alone). */
export function routeStylesheets(site: NativeSite, sources: Record<string, string>, route: string) {
  const file = site.routes[route] ?? site.routes[nativeDefaultRoute(site)];
  return file ? nativePageStylesheets(sources[file] ?? "", file) : [];
}

/** A selection queued for the next render; `reveal: "center"` brings a just-added element fully into view. */
// `source`: the page's bytes the request belongs to; renders of other bytes leave it waiting.
type QueuedSelection = NativeNodeRequest & { reveal?: "center"; source?: string };

// The page's stylesheets and the components' own, each `url()` naming an
// asset the host has read shown from it.
function composeStyles(
  site: NativeSite,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  assets: Record<string, string>,
  route: string,
  alone: string | undefined,
  unreadable: ReadonlySet<string> = new Set(),
) {
  // Each component rule also styles what a page slots in (shared/slotted-css.ts).
  const stylesByComponent: Record<string, { path: string; source: string }> = {};
  for (const [tag, path] of Object.entries(componentStyles)) {
    if (!Object.hasOwn(site.components, tag)) continue;
    stylesByComponent[tag] = { path, source: withAssetUrls(withSlottedRules(sources[path] ?? ""), path, assets) };
  }
  // The page's linked stylesheets with their `@import`s expanded: one sheet
  // per file, each import before the sheet that imports it (see
  // shared/css-imports.ts).
  const linked = routeStylesheets(site, sources, alone ? "/" : route);
  const expanded = expandStyleImports(linked.filter((path) => sources[path] !== undefined), (path) => sources[path], (path) => unreadable.has(path));
  const styles = expanded.sheets.map(({ path, source, wrappers, importer, kind }) => ({ path, source: withAssetUrls(source, path, assets), wrappers, importer, kind }));
  const page = site.routes[alone ? "/" : route] ?? "";
  const styleErrors = [
    // A sheet the host could not read as text is not missing: it warns about it itself.
    ...linked.filter((path) => sources[path] === undefined && !unreadable.has(path)).map((path) => `${page} links ${path}, which is missing from this branch.`),
    ...expanded.errors,
  ];
  return { styles, styleErrors, componentStyles: stylesByComponent };
}

/** Assets the runtime does not have yet (`set`) and ones it should forget (`drop`). */
export interface AssetChanges { set: Record<string, string>; drop: string[] }

/** A render the host posts to the frame (`update`). */
export type UpdatePayload = ReturnType<typeof composePayload> & { viewing: boolean };

function composePayload(
  site: NativeSite,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  assets: Record<string, string>,
  assetChanges: AssetChanges,
  route: string,
  alone: string | undefined,
  context: string,
  selectNode: QueuedSelection | undefined,
  selectText: { start: number; end: number } | undefined,
  hash?: string,
  editableTemplatePath?: string,
  unreadable?: ReadonlySet<string>,
) {
  const pages: Record<string, string> = {};
  const pagePaths: Record<string, string> = {};
  for (const [routePath, filePath] of Object.entries(site.routes)) {
    pagePaths[routePath] = filePath;
    pages[routePath] = pageOf(sources[filePath] ?? "");
  }
  // A component on its own: a page of just one instance, belonging to no
  // file, so only clicks inside the component select anything. It sits in
  // the same page container the home page uses, so it gets the page's width.
  if (alone) {
    pages[componentRoute(alone)] = `${pageContainer(pages[nativeDefaultRoute(site)] ?? "")}\n  <${alone}></${alone}>\n</main>`;
    pagePaths[componentRoute(alone)] = "";
  }
  const components: Record<string, string> = {};
  const componentPaths: Record<string, string> = {};
  for (const [tag, filePath] of Object.entries(site.components)) {
    componentPaths[tag] = filePath;
    components[tag] = sources[filePath] ?? "";
  }
  const { styles, styleErrors, componentStyles: stylesByComponent } = composeStyles(site, sources, componentStyles, assets, route, alone, unreadable);
  // Section components count as sections when the runtime looks for places to insert one.
  const sectionTags = Object.keys(components).filter((tag) => isSectionTemplate(components[tag]));
  // Relative image paths resolve against the page's URL, as on the live site.
  const base = alone ? "/" : route;
  return { pages, pagePaths, components, componentPaths, styles, styleErrors, componentStyles: stylesByComponent, assetChanges, sectionTags, route, base, context, selectNode, selectText, hash, editableTemplatePath,
  };
}

export function createNativePreview(host: HTMLElement, handlers: NativePreviewHandlers = {}) {
  const pane = node("section", "preview-pane native-preview-pane");
  pane.setAttribute("aria-label", "Native site preview");
  const frameHost = node("div", "preview-frame-host");
  const frame = document.createElement("iframe");
  frame.className = "preview-frame native-preview-frame";
  frame.title = "Native site preview";
  frame.referrerPolicy = "no-referrer";
  // Scripts run so the runtime can render, but never same-origin: the frame
  // cannot reach the editor's origin, cookies, or storage.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("srcdoc", runtimeDoc(0));
  frameHost.append(frame);
  // Every message to and from the frame (preview-link.ts).
  const link = createPreviewLink(iframeFramePort(frame));
  // The canvas around the frame: breakpoints and breadcrumb (canvas-bar.ts).
  const canvas = createCanvasBar(frameHost, frame, {
    onCrumb: (index) => link.send({ type: "canvas-crumb", action: "select", index }),
    onCrumbHover: (index) => link.send({ type: "canvas-crumb", action: "hover", index: index ?? -2 }),
  });
  const errorBox = node("div", "native-preview-error");
  errorBox.setAttribute("role", "alert");
  errorBox.hidden = true;
  // Problems that leave the site usable (two files for one component):
  // shown above the page, which renders.
  const warningBox = node("div", "native-preview-warning");
  warningBox.setAttribute("role", "status");
  warningBox.hidden = true;
  pane.append(errorBox, warningBox, canvas.bar, frameHost);
  // The runtime draws its hover and selection boxes in the editor's color.
  let previewFocus = "";
  let componentColor = "";
  const postTheme = () => link.send({ type: "theme", focus: previewFocus, component: componentColor });
  // The component whose template is open: its instances show outlined.
  let focusTag = "";
  const postFocus = () => {
    link.send({ type: "component-focus", tag: focusTag });
    link.send({ type: "edit-component", mode: editMode });
  };
  // Edit component mode (src/page-builder/edit-component-mode.ts): the instance edited in place.
  let editMode: EditComponentFrameMode | undefined;
  // The bar keeps clear of the selection's pins, and Ask agent's note goes after them.
  let editBarRenderKey = "";
  // The edit bar's name drags the selected block (src/page-builder/insert-drag.ts).
  const editBar = createEditBar(pane, frame,
    (event, chip) => handlers.onBlockPress?.({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, alt: event.altKey, source: chip, hold: true }),
    (rect) => pins?.row(rect) ?? { offset: 0, next: pinRequests.length + 1 });
  // A block pressed in the page: the runtime keeps the pointer and relays it
  // here. A frame reloaded or gone sends no release: its drag is cancelled.
  let pressFeed: DragFeed | undefined;
  const endPress = () => { pressFeed?.cancel(); pressFeed = undefined; };
  const insertControls = createInsertControls(pane, frame, {
    onOpen: (point) => pageBuilder.openFor(point),
    onClose: () => pageBuilder.closeGap(),
  });
  // The Add panel, dragging onto the canvas, the empty page and the
  // highlight on a section just added (src/page-builder/).
  // What thumbnails render (the Add panel's, Add card ▾'s): the site, its sources, styles and images, the route on show.
  const thumbnailInputs = () => site && { site, sources, componentStyles, assets, route: alone ? "/" : route };
  // Component stylesheets a thumbnail needs and the preview has not read.
  const prepareStyles = (tags: string[]) => {
    const wanted = site ? tags.filter((tag) => Object.hasOwn(site!.components, tag) && !componentStyles[tag]) : [];
    if (wanted.length) handlers.onComponentStyles?.(wanted);
  };
  const pageBuilder = createPageBuilder({
    pane,
    frame,
    insertControls: () => insertControls,
    inputs: () => thumbnailInputs(),
    choices: () => handlers.insertChoices?.() ?? [],
    pointFor: handlers.insertPointFor,
    destinationText: handlers.insertDestinationText,
    newComponent: handlers.onNewComponent && ((tag, point) => viewing ? Promise.resolve(false) : handlers.onNewComponent!(tag, point)),
    // An earlier version on show (History) is not edited: its places are not the source's.
    insert: (point, choice) => { if (!viewing) handlers.onInsert?.(point, choice); },
    prepare: (tags) => prepareStyles(tags),
    scroll: (dy, smooth) => link.send({ type: "scroll-by", dy, smooth }),
    dock: handlers.addPanelDock,
  });
  let slotSelection: { path: string; node: number[]; tag?: string; exact: boolean } | undefined;
  const slotGhosts = mountSlotGhosts(pane, frame, {
    onFill: target => handlers.onSlotGhostFill?.(target),
    expectedIsCurrent: report => Boolean(frameState.active && !viewing && site && report.context === link.context() &&
      report.pagePath === site.routes[route] && report.templatePath === site.components[report.tag] &&
      slotSelection?.path === report.pagePath && report.hostNode.every((index, i) => slotSelection!.node[i] === index) &&
      (!slotSelection.exact || (slotSelection.node.length === report.hostNode.length && slotSelection.tag === report.tag))),
  });
  const cardGrids = handlers.cards ? createCardGridControls(pane, frame, handlers.cards, link.send, { inputs: thumbnailInputs, prepare: prepareStyles }) : undefined;
  // The runtime finds each pin's element and reports where it is (`pin-rects`).
  let pinRequests: PinRequest[] = [];
  let pins: ReturnType<typeof createAgentPins> | undefined;
  let pinsLoading: Promise<void> | undefined;
  let pinsDisposed = false;
  const loadPins = () => pinsLoading ??= import("./agent-pins").then(({ createAgentPins }) => {
    if (pinsDisposed) return;
    pins = createAgentPins(pane, frame, {
      locate: (list) => link.send({ type: "pins", pins: list }),
      onDismiss: (id) => handlers.onDismissRequest?.(id),
      onAnswer: async (id, text) => {
        if (!handlers.onAnswerRequest) throw new Error("No agent is connected.");
        await handlers.onAnswerRequest(id, text);
      },
      onShowPage: (target) => void followRoute(target),
      onShowElement: (id) => link.send({ type: "show-pin", id }),
      onLayout: () => editBar.refit(),
    });
    pins?.update(pinRequests, route);
  }).catch((error) => { pinsLoading = undefined; void handleChunkLoadFailure(error); });

  let site: NativeSite | undefined;
  // The bar over the page while History shows an earlier version.
  let viewing: HTMLElement | undefined;
  let sources: Record<string, string> = {};
  let componentStyles: Record<string, string> = {};
  let assets: Record<string, string> = {};
  // The assets the runtime holds (it keeps them across renders), so each
  // message carries only what changed: a page's images are posted once, not
  // with every render.
  const sentAssets = new Map<string, string>();
  function assetChanges(): AssetChanges {
    const set: Record<string, string> = {};
    const drop: string[] = [];
    for (const [path, url] of Object.entries(assets))
      if (sentAssets.get(path) !== url) { set[path] = url; sentAssets.set(path, url); }
    for (const path of [...sentAssets.keys()])
      if (!Object.hasOwn(assets, path)) { drop.push(path); sentAssets.delete(path); }
    return { set, drop };
  }
  // Assets that arrived after the page was drawn: the runtime shows them in
  // place (its images and stylesheets) without drawing the page again, so the
  // Page structure it reported stays current. A render on its way takes them.
  function postAssets() {
    if (!site || !frameState.ready || !frameState.active || rafHandle) return;
    const changes = assetChanges();
    if (!Object.keys(changes.set).length && !changes.drop.length) return;
    const { styles, componentStyles: styled } = composeStyles(site, sources, componentStyles, assets, route, alone);
    link.send({ type: "assets", assetChanges: changes, styles, componentStyles: styled });
  }
  let route = "/";
  // The component shown by itself, when its template is open and no page uses it.
  let alone: string | undefined;
  let editableTemplatePath: string | undefined;
  let unreadable: ReadonlySet<string> = new Set();
  /**
   * Measure nested containers at a frame-viewport point, or all page bands in <main>:
   * the report on `path` (the page, or in Edit component mode the template edited)
   * while `page` is still shown. A render asked for meanwhile ends it (preview-link.ts).
   */
  function probeDrop(at: { x: number; y: number }, moving?: number[], bands?: boolean, template?: string): Promise<DropReport | undefined> {
    link.cancel("drop-probe");
    const page = site?.routes[route], path = template ?? page;
    if (!page || !path || !frameState.active || !frameState.ready || viewing || alone || rafHandle ||
      !Number.isFinite(at.x) || !Number.isFinite(at.y)) return Promise.resolve(undefined);
    return link.ask({ type: "drop-probe", x: at.x, y: at.y, moving, bands }, 1000).then((answer) => {
      const valid = site?.routes[route] === page && frameState.active && !viewing && !alone;
      return valid && answer?.report?.path === path ? answer.report : undefined;
    });
  }
  // Armed while the frame is attached (parked or shown) and its document awaits `ready`.
  let readyWatchdog: ReturnType<typeof setTimeout> | undefined;
  const disarmReadyWatchdog = () => { clearTimeout(readyWatchdog); readyWatchdog = undefined; };
  const armReadyWatchdog = () => {
    disarmReadyWatchdog();
    readyWatchdog = setTimeout(() => {
      readyWatchdog = undefined;
      if (frame.isConnected) void handleChunkLoadFailure(new Error("Loading chunk native-preview-runtime failed"));
    }, RUNTIME_READY_TIMEOUT_MS);
  };
  let rafHandle = 0;
  // Parked: attached early (preload) so the runtime loads alongside the boot
  // reads, but hidden, inert and out of the accessibility tree.
  const park = () => {
    pane.classList.add("is-parked");
    pane.inert = true;
    pane.setAttribute("aria-hidden", "true");
  };
  const frameState = createPreviewFrameState({
    attach: () => host.prepend(pane),
    park,
    unpark: () => {
      pane.classList.remove("is-parked");
      pane.inert = false;
      pane.removeAttribute("aria-hidden");
    },
    // A fresh document for the next site: nothing of the old page or its assets
    // survives. The load number changes the srcdoc so the frame really navigates.
    reload: () => {
      sentAssets.clear();
      lastAvoid = "";
      if (rafHandle) cancelAnimationFrame(rafHandle);
      rafHandle = 0;
      frame.setAttribute("srcdoc", runtimeDoc(link.reload()));
    },
    armWatchdog: () => armReadyWatchdog(),
    disarmWatchdog: () => disarmReadyWatchdog(),
    resync: () => {
      // A frame that became ready while parked has not had the pins yet.
      pins?.reset();
      postTheme();
      lastAvoid = "";
      postAvoid();
      postFocus();
    },
  });
  // A structure field's text, set in the page ahead of its render (patchText):
  // the latest per frame, and what to do when the page could not take it.
  let pendingPatch: { request: NativeNodeRequest; text: string; miss?: () => void } | undefined;
  let patchHandle = 0;
  // The page's live patch: the source it holds good on top of. A full update
  // of any other source (Undo, another edit) drops it first, so the page never
  // shows typed text its source does not have.
  // `others`: every other source as it was when typing began (templates,
  // shared files): a change to any of them drops the patch too.
  let livePatch: { path: string; base: string; others: Record<string, string> } | undefined;
  let lastPatchRequest: NativeNodeRequest | undefined;
  // A text patch (`miss`: the page could not take it, its full update goes now), or the live patch dropped.
  function postPatch(patch: { request: NativeNodeRequest; text: string; end?: true } | { drop: true }, miss?: () => void) {
    if ("drop" in patch) return link.send({ type: "patch-text", drop: true });
    void link.ask({ type: "patch-text", ...patch }, PATCH_ANSWER_MS).then((answer) => { if (answer && !answer.ok) miss?.(); });
  }
  const stopTheme = watchEditorTheme(({ colors }) => {
    previewFocus = colors["preview-focus"];
    componentColor = colors.component;
    if (frameState.ready) postTheme();
  });
  // A load/site failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;
  let selectNode: QueuedSelection | undefined;
  let selectText: { start: number; end: number } | undefined;
  // The id a followed link's fragment names, scrolled to after the next render.
  let scrollHash: string | undefined;

  function showBanner(message: string | undefined, hideFrame: boolean) {
    if (message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      frameHost.hidden = hideFrame;
      canvas.bar.hidden = hideFrame;
    } else {
      errorBox.hidden = true;
      frameHost.hidden = false;
      canvas.bar.hidden = false;
    }
  }

  function post() {
    rafHandle = 0;
    if (!site || !frameState.ready || !frameState.active) return;
    if (livePatch && (sources[livePatch.path] !== livePatch.base || othersChanged(livePatch.others, livePatch.path))) dropPatch();
    const held = selectNode?.source !== undefined && sources[selectNode.path] !== selectNode.source ? selectNode : undefined;
    const payload = composePayload(site, sources, componentStyles, assets, assetChanges(), route, alone, link.context(), held ? undefined : selectNode, selectText, scrollHash, editableTemplatePath, unreadable);
    selectNode = held;
    selectText = undefined;
    scrollHash = undefined;
    link.render({ ...payload, viewing: Boolean(viewing) }, sources, alone ? "/" : route);
  }
  // The route of each render the frame drew (its `ack`): the host reads that
  // page's images only then, so no image is read before the page is on screen.
  let shownRoute: string | undefined;
  link.drawn((drawn) => {
    if (drawn === shownRoute) return;
    shownRoute = drawn;
    handlers.onRouteShown?.(drawn);
  });
  function othersChanged(others: Record<string, string>, path: string) {
    // Files that only arrived since (a stylesheet loading) do not count.
    for (const key of Object.keys(others)) if (key !== path && sources[key] !== others[key]) return true;
    return false;
  }
  function dropPatch() {
    cancelAnimationFrame(patchHandle); patchHandle = 0;
    pendingPatch = undefined;
    if (livePatch) { livePatch = undefined; postPatch({ drop: true }); }
  }
  function schedule() {
    if (!site) { link.cancel("drop-probe"); return; }
    slotGhosts.clear();
    slotSelection = undefined;
    link.stale([
      route,
      alone ?? "",
      Object.entries(sources).map(([path, source]) => `${path}:${source.length}:${source.charCodeAt(0) || 0}:${source.charCodeAt(source.length - 1) || 0}`).join("|"),
    ].join("\n"));
    pins?.update(pinRequests, route);
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(post);
  }

  // Files a matched rule may come from: pages, components, their stylesheets,
  // shared stylesheets and every stylesheet those import.
  function styleSourcePaths() {
    return new Set([
      ...(site ? nativeSitePaths(site) : []),
      ...Object.values(componentStyles),
      ...(site ? (() => {
        const linked = routeStylesheets(site, sources, alone ? "/" : route);
        return [...linked, ...expandStyleImports(linked, (path) => sources[path]).imported];
      })() : []),
    ]);
  }

  // Typing finished on request (a rail click or drop): true once the runtime
  // answered, after any text edit it posted; false when it did not in time.
  function finishTyping(): Promise<boolean> {
    if (!frameState.ready || !frameState.active) return Promise.resolve(true);
    return link.ask({ type: "finish-typing" }, 1000).then(Boolean);
  }

  // What the frame reports, each as soon as it counts (preview-link.ts): a
  // user's action (`text-edit`, `route`, `format`, `move`, a press drag's
  // steps after its start) even from an older render, as the host checks what
  // it asks against the current source; a description of the runtime's DOM
  // (`select`, `text-selection`, `insert-points`, `structure`, the rects, a
  // press drag's start) only for the render last asked for, with the sources
  // it was painted from: the runtime reports it again after that render.
  // Desktop files dropped onto a source-owned canvas image, including shadow roots.
  link.on("image-drop", (message) => {
    if (!site || !nativeSitePaths(site).includes(message.path)) return;
    handlers.onImageDrop?.({ path: message.path, node: message.node, width: message.width }, message.files);
  });
  link.on("image-edit", (message) => {
    if (!site || viewing || !nativeSitePaths(site).includes(message.path)) return;
    handlers.onImageEdit?.({ path: message.path, node: message.node, width: message.width });
  });
  // Typed text is checked against the current source, so it counts even
  // when a render was requested since.
  link.on("text-edit", (message) => {
    if (!site || !nativeSitePaths(site).includes(message.path)) return;
    const edit: NativeTextEdit = { path: message.path, node: message.node, before: message.before, after: message.after };
    handlers.onTextEdit?.(edit);
  });
  // A Ctrl/⌘+click on a link inside the preview (including inside shadow
  // roots) to one of the site's pages navigates the preview only, keeping
  // the current source edits untouched.
  link.on("route", (message) => { if (site) followRoute(message.href); });
  link.on("format", (message) => handlers.onFormat?.(message.format));
  link.on("move", (message) => handlers.onMove?.(message.direction));
  // A block pressed in the page and moved 7 px, and the pointer after
  // that (frame-viewport points). The start names the block in the DOM of
  // the render it saw: one from an older render is not heard.
  link.on("press-drag", (message, paintedSources) => {
    const box = frame.getBoundingClientRect();
    const x = box.left + frame.clientLeft + message.x, y = box.top + frame.clientTop + message.y;
    if (message.phase === "start") {
      endPress();
      if (!site || viewing || !message.node?.length || message.tag === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return;
      // A template's part: the bytes of the template edited (the innermost one opened).
      const template = message.template;
      const tag = editMode && (editMode.nested?.[editMode.nested.length - 1]?.tag ?? editMode.tag);
      const file = template ? tag && Object.hasOwn(site.components, tag) ? site.components[tag] : undefined : site.routes[route];
      const painted = file !== undefined ? paintedSources?.[file] : undefined;
      pressFeed = handlers.onBlockPress?.({ pointerId: -1, x, y, alt: message.alt, relayed: true },
        { node: message.node, tag: message.tag, cls: message.cls, band: message.band, painted, ...(template ? { template } : {}) });
      return;
    }
    if (message.phase === "move" && Number.isFinite(x) && Number.isFinite(y)) pressFeed?.move(x, y, message.alt);
    else if (message.phase === "end" && Number.isFinite(x) && Number.isFinite(y)) { pressFeed?.up(x, y); pressFeed = undefined; }
    else if (message.phase === "end" || message.phase === "cancel") endPress();
  });
  // Esc or Ctrl/⌘+↑ climbed past the top, or the breadcrumb's body was chosen.
  link.on("canvas-clear", () => clearSelection());
  // Pins' places describe the DOM too, but each report is whole and
  // sent only when it changed, so none is dropped.
  link.on("pin-rects", (message) => pins?.rects(message.rects));
  // A press or scroll in the frame closes the element menu, from any render.
  link.on("dismiss-context-menu", () => handlers.onDismissContextMenu?.());
  link.on("shortcut", (message) => handlers.onShortcut?.(message.name));
  link.on("refusal-note-action", () => handlers.onRefusalNoteAction?.());
  link.on("slot-ghosts", (message) => {
    const report = site && frameState.active && !viewing && readSlotGhostReport(message.report,
      { context: link.context(), pagePath: alone ? "" : site.routes[route] ?? "", components: site.components });
    if (report) slotGhosts.update(report); else slotGhosts.clear(false);
  });
  // The frame's document loaded (a late `ready` from a replaced one is not heard).
  link.on("ready", () => {
    endPress();
    sentAssets.clear();
    shownRoute = undefined;
    // A parked frame only records it; activate() sends the rest.
    if (!frameState.markReady()) return;
    postTheme();
    lastAvoid = "";
    postAvoid();
    postFocus();
    pins?.reset();
    schedule();
  });
  // Runtime-reported render failures (bad define, recursive templates) surface
  // as a banner but keep the frame visible, unless a hard load error is shown.
  link.on("error", (message) => { if (!loadError) showBanner(message.message, false); });
  link.on("clear-error", () => { if (!loadError) showBanner(undefined, false); });
  link.on("insert-points", (message) => {
    if (!site || site.routes[route] !== message.path) return;
    // An earlier version on show (History): its gaps are counted in its
    // markup, not the current source's, so nothing is offered there.
    if (viewing) {
      insertControls.update([]);
      pageBuilder.points([]);
      return;
    }
    insertControls.update(message.points);
    pageBuilder.points(message.points);
  });
  link.on("section-hover", (message) => insertControls.hover(message.item));
  link.on("text-selection", (message) => handlers.onTextSelection?.(message.selection));
  link.on("item-grids", (message) => {
    if (!site) return;
    const report = { hover: onPage(message.hover), selected: onPage(message.selected), tracking: message.tracking };
    cardGrids?.update(report);
    handlers.onItemGrids?.(report);
  });
  link.on("structure", (message, paintedSources) => {
    if (!site) return;
    const path = message.path === "" || site.routes[route] === message.path ? message.path : undefined;
    if (path === undefined || !paintedSources) return;
    const paintedSource = paintedSources[path];
    if (path && paintedSource === undefined) return;
    handlers.onStructure?.({ path, items: message.items, paintedSource });
  });
  link.on("selection-rect", (message) => {
    editBar.move(message.rect);
    pageBuilder.selectionRect(message.rect);
    handlers.onSelectionRect?.(message.rect);
  });
  // A click reported against an older render arrives as the next refresh's click (preview-link.ts).
  link.on("select", (message, paintedSources) => {
    // An earlier version on show (History): nothing on it can be selected or edited.
    if (viewing) {
      if (message.reason === "click") postClearSelection();
      return;
    }
    if (!site) return;
    // Geometry refreshes of the chosen element keep its menu usable.
    if (message.reason !== "refresh" || message.path === "") handlers.onDismissContextMenu?.();
    slotSelection = undefined;
    const reason = message.reason === "refresh" ? "refresh" : "click";
    if (reason === "click") codeLink.cancel();
    // The runtime lost its selection in a re-render (the element was
    // removed or replaced) and nothing was requested in its place.
    if (message.path === "" && reason === "refresh") {
      slotGhosts.clear();
      canvas.setCrumbs([]);
      editBar.hide();
      pageBuilder.selected("", undefined, undefined);
      handlers.onSelect?.({ path: "", tag: "", text: "", reason, selectors: [] });
      return;
    }
    if (message.path === undefined || !nativeSitePaths(site).includes(message.path)) return;
    const selectors = onSite(message.selectors);
    const selectedNode = message.node;
    // Inside a component's template: the page's instance it renders in.
    const pagePath = site.routes[route];
    const slotHost = inSite(message.host, paintedSources);
    if (message.path === pagePath && selectedNode) slotSelection = { path: pagePath, node: [...selectedNode],
      tag: message.tag, exact: message.tag !== undefined && Object.hasOwn(site.components, message.tag) };
    else if (slotHost?.path === pagePath && slotHost.node) slotSelection = { path: pagePath, node: [...slotHost.node], tag: slotHost.tag, exact: true };
    slotGhosts.selectionChanged();
    const instance = message.pageNode && pagePath ? { path: pagePath, node: message.pageNode } : undefined;
    pageBuilder.selected(message.path, selectedNode, message.rect, instance);
    canvas.setCrumbs(message.crumbs);
    const selection: NativePreviewSelection = {
      path: message.path,
      paintedSource: paintedSources?.[message.path],
      tag: message.tag ?? "",
      text: message.text,
      reason,
      selectors,
      cascade: message.cascade,
      node: message.node,
      link: message.link,
      rect: message.rect,
      selector: message.selector,
      host: inSite(message.host, paintedSources),
      hostChain: inSiteChain(message.hostChain, paintedSources),
    };
    handlers.onSelect?.(selection);
    // A right-click: the element menu at the pointer (frame points to the host's).
    if (message.menu) {
      const box = frame.getBoundingClientRect();
      handlers.onContextMenu?.({ x: box.left + frame.clientLeft + message.menu.x, y: box.top + frame.clientTop + message.menu.y }, frame, selection);
    }
  });
  link.on("default-styles", (message) => {
    if (site) handlers.onDefaultStyles?.({ selectors: onSite(message.selectors), cascade: message.cascade });
  });
  link.on("component-styles", (message) => {
    if (!site) return;
    const tags = message.tags.filter((tag) => Object.hasOwn(site!.components, tag));
    if (tags.length) handlers.onComponentStyles?.([...new Set(tags)]);
  });
  // The rest of a frame report's checks, against what the editor shows:
  // a card grid on the page on show,
  function onPage(grid: ItemGridReport | null): ItemGridReport | null {
    return grid && site && site.routes[route] === grid.path ? grid : null;
  }
  // matched rules from the site's files and their stylesheets,
  function onSite(selectors: NativeSelectedRule[]) {
    const allowed = styleSourcePaths();
    return selectors.filter((rule) => allowed.has(rule.path));
  }
  // and an instance in one of the site's files, with the source it was painted from.
  function inSite(raw: FrameHost | undefined, painted: Readonly<Record<string, string>> | undefined) {
    if (!raw) return undefined;
    const { tag, selector, path, node, rect } = raw;
    const host: NonNullable<NativePreviewSelection["host"]> = { tag, selector };
    if (path !== undefined && node && site && nativeSitePaths(site).includes(path)) {
      host.path = path;
      host.node = node;
      host.rect = rect;
      host.paintedSource = painted?.[path];
    }
    return host;
  }
  function inSiteChain(raw: FrameHost[] | undefined, painted: Readonly<Record<string, string>> | undefined) {
    const chain = raw?.map((host) => inSite(host, painted));
    return chain?.every((host): host is NonNullable<NativePreviewSelection["host"]> => Boolean(host?.path && host.node)) ? chain : undefined;
  }
  function followRoute(href: string) {
    if (!site) return false;
    const candidate = nativeLinkTarget(href, alone ? "/" : route, site.routes);
    if (!candidate) return false;
    scrollHash = nativeLinkFragment(href);
    const moved = candidate !== route;
    if (moved) {
      route = candidate;
      alone = undefined;
      insertControls.clear();
      pageBuilder.clear();
      cardGrids?.clear();
      clearSelection();
    }
    // A fragment on the page on show scrolls there too.
    if (moved || scrollHash) schedule();
    return true;
  }
  function postClearSelection() {
    slotSelection = undefined;
    slotGhosts.clear();
    link.send({ type: "clear-selection" });
  }
  function clearSelection() {
    selectNode = undefined;
    selectText = undefined;
    codeLink.cancel();
    canvas.setCrumbs([]);
    editBar.hide();
    pageBuilder.selected("", undefined, undefined);
    postClearSelection();
    handlers.onSelect?.({ path: "", tag: "", text: "", reason: "click", selectors: [] });
  }

  // The code pane's cursor selects its element here (as a refresh, so the
  // cursor stays put; the canvas scrolls only to an element out of sight),
  // and the line under the pointer gets a soft dashed box (code-link.ts).
  // Canvas labels keep clear of the edit bar: the runtime hears where it
  // stands over the frame (frame-viewport coordinates), or that it is hidden.
  let lastAvoid = "";
  const postAvoid = () => {
    const bar = editBar.element;
    const at = bar.hidden ? undefined : bar.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const rect = at && at.width ? { top: at.top - box.top, left: at.left - box.left, bottom: at.bottom - box.top, right: at.right - box.left } : null;
    const key = JSON.stringify(rect);
    if (key === lastAvoid) return;
    lastAvoid = key;
    link.send({ type: "canvas-avoid", rect });
  };
  const avoidWatch = new MutationObserver(() => requestAnimationFrame(postAvoid));
  avoidWatch.observe(editBar.element, { attributes: true, attributeFilter: ["style", "hidden"], childList: true });

  const codeLink = linkCodeToCanvas({
    owns: (path) => Boolean(site && frameState.active && frameState.ready && !viewing && nativeSitePaths(site).includes(path)),
    hint: (request) => link.send({ type: "canvas-hint", request: request ?? null }),
    select: (request) => link.send({ type: "canvas-code-select", request }),
  });

  return {
    probeDrop,
    /**
     * A block dragged over the page, new from the rail or moved (none
     * without a page on show to drop into). A drop gives the page source its
     * target was measured on, so a page that changed since refuses it.
     */
    blockDrag(block: DraggedBlock, ports: { drop(target: DropTarget, where: string, painted: string | undefined, pointer?: { x: number; y: number }): void; announce(text: string): void; tree?: StructureDrop },
      create: typeof createBlockDrag, template?: string) {
      if (!site || !frameState.active || alone) return undefined;
      let painted: string | undefined;
      return pageBuilder.blockDrag(block, {
        // `template`: Edit component mode's template, whose parts the frame reports by template paths.
        probe: (at, moving, bands) => {
          // With no update waiting (or the probe is refused), the frame shows the last sources sent.
          const shown = link.painted()?.[template ?? site!.routes[route]];
          return probeDrop(at, moving ? [...moving] : undefined, bands, template).then((report) => { if (report) painted = shown; return report; });
        },
        // A target picked in Page Structure was measured on the bytes its rows were painted from.
        drop: (target, where, pointer, tree) => ports.drop(target, where, tree ? tree.painted : painted, pointer),
        announce: (text) => ports.announce(text),
        tree: ports.tree,
      }, create);
    },
    /** Send an already scheduled source change immediately after a direct user action. */
    flushPendingUpdate() {
      if (!rafHandle) return;
      cancelAnimationFrame(rafHandle);
      post();
    },
    /**
     * Edit component mode: the instance at `node` on `path` shows its template
     * in place, framed, the rest of the page shaded; `show` picks the
     * template's placeholders or the page's own content. `undefined` ends it.
     * Sent as it is, with no render: the frame's document stays.
     */
    editComponent(mode: EditComponentFrameMode | undefined) {
      editMode = mode && { ...mode, node: [...mode.node], nested: mode.nested?.map((step) => ({ ...step, node: [...step.node] })) };
      pane.classList.toggle("is-editing-component", Boolean(mode));
      if (frameState.ready) link.send({ type: "edit-component", mode: editMode });
    },
    /** The component whose template is open, shown in the canvas bar (canvas-bar.ts). */
    setCanvasComponent(parts: { tag: string; lead: Element[]; end: Element[] } | undefined) {
      canvas.setComponent(parts);
    },
    /** Show the pane and adopt a site. Idempotent for the same site. */
    activate(next: NativeSite) {
      editableTemplatePath = undefined;
      // Another site (or the same one found again): its next draw reads its images.
      if (site !== next) shownRoute = undefined;
      site = next;
      if (!Object.hasOwn(next.routes, route)) {
        route = nativeDefaultRoute(next);
        alone = undefined;
      }
      if (frameState.activate()) {
        host.classList.add("has-preview");
        pageBuilder.setActive(true);
      }
      schedule();
    },
    update(input: UpdateInput) {
      // An element menu stays open while the same bytes are reported again (a code pane mounting).
      const changed = (Object.hasOwn(input, "component") && (input.component ?? "") !== focusTag) || Boolean(input.route && input.route !== route) ||
        (Object.hasOwn(input, "editableTemplatePath") && input.editableTemplatePath !== editableTemplatePath) ||
        (input.sources && !samePreviewFiles(sources, input.sources)) ||
        (input.componentStyles && !samePreviewFiles(componentStyles, input.componentStyles)) ||
        (input.assets && !samePreviewFiles(assets, input.assets));
      if (changed) handlers.onDismissContextMenu?.();
      if (Object.hasOwn(input, "editableTemplatePath")) editableTemplatePath = input.editableTemplatePath;
      if (input.sources) sources = input.sources;
      if (input.componentStyles) componentStyles = input.componentStyles;
      if (input.assets) assets = input.assets;
      if (Object.hasOwn(input, "component") && (input.component ?? "") !== focusTag) {
        focusTag = input.component ?? "";
        if (frameState.ready) postFocus();
      }
      if (site && input.component && Object.hasOwn(site.components, input.component)) {
        // The page already on show wins; then any page that uses the component; else the component alone.
        const tag = input.component;
        const uses = (routePath: string) => routeUsesTag(site!, sources, routePath, tag);
        const next = alone !== tag && Object.hasOwn(site.routes, route) && uses(route)
          ? route
          : Object.keys(site.routes).find(uses) ?? componentRoute(tag);
        if (next !== route) {
          route = next;
          insertControls.clear();
          pageBuilder.clear();
          cardGrids?.clear();
          // Quietly: the runtime reports the lost selection after the render,
          // and a click here would cancel the file open that led to this
          // (clearing the selection forgets a stale click, preview-link.ts).
          editBar.hide();
          postClearSelection();
        }
        alone = next === componentRoute(tag) ? tag : undefined;
      } else if (input.route && site && Object.hasOwn(site.routes, input.route) && input.route !== route) {
        route = input.route;
        alone = undefined;
        insertControls.clear();
        pageBuilder.clear();
        cardGrids?.clear();
      }
      schedule();
      pageBuilder.sourcesChanged();
      cardGrids?.sourcesChanged();
    },
    /**
     * Select an element of the rendered page now and bring it into the
     * middle of the frame; with `edit` false, as a click would (no longer
     * typed in), true as a double-click would (text typed into, the caret at
     * its end).
     */
    selectNode(request: NativeNodeRequest, edit?: boolean) {
      if (!frameState.active) return;
      // The caret needs the frame's focus.
      if (edit) frame.focus();
      link.send({ type: "select-node", request, ...(edit === undefined ? {} : { edit }) });
    },
    /**
     * Sets an element's text in the page at once, ahead of the render its
     * source change brings (a structure field as it is typed): the latest text
     * per frame, as text and line breaks only. `base` is the source the text is
     * typed on top of; `miss` runs when the page cannot take it (no such
     * element, or one holding more than text and breaks). Until `endPatch`, the
     * page draws the latest patch again over renders of a source the field
     * vouched for (`vouchPatch`), and drops it before any other.
     */
    patchText(request: NativeNodeRequest, text: string, base: string, miss?: () => void) {
      if (!frameState.active || !frameState.ready) { miss?.(); return; }
      const dropped = pendingPatch;
      pendingPatch = { request, text, miss };
      livePatch = livePatch?.path === request.path ? { ...livePatch, base } : { path: request.path, base, others: { ...sources } };
      lastPatchRequest = request;
      // A patch replaced before it went needs no answer: the newer one carries the text.
      if (dropped && dropped.miss !== miss) dropped.miss?.();
      if (patchHandle) return;
      patchHandle = requestAnimationFrame(() => {
        patchHandle = 0;
        const next = pendingPatch; pendingPatch = undefined;
        if (!next || !frameState.active || !livePatch) { next?.miss?.(); return; }
        postPatch({ request: next.request, text: next.text }, next.miss);
      });
    },
    /** The field wrote `source` itself: the live patch holds good on top of it. */
    vouchPatch(path: string, source: string) {
      if (livePatch?.path === path) livePatch.base = source;
    },
    /**
     * The field closed: with `finish`, the page shows its text and keeps it
     * until the next render (which brings the same); without, the page stops
     * redrawing the patch and is drawn again from its sources at once.
     */
    endPatch(path: string, finish?: { text: string }) {
      if (livePatch && livePatch.path !== path) return;
      const request = pendingPatch?.request ?? lastPatchRequest;
      cancelAnimationFrame(patchHandle); patchHandle = 0;
      pendingPatch = undefined;
      const was = livePatch; livePatch = undefined;
      if (!frameState.active) return;
      if (finish && request && request.path === path) postPatch({ request, text: finish.text, end: true });
      else if (was) {
        // Ended without its text written (refused, stale, a refused Escape): the
        // page is drawn again from its sources, so it shows what they hold.
        postPatch({ drop: true });
        schedule();
      }
    },
    /**
     * Elements of the page shown as rendered (box, computed styles, matching
     * rules, text contrast), for an agent: one by index path, those matching
     * a selector, or the selection. Measured after any pending render.
     */
    async inspect(request: { path?: string; node?: number[]; selector?: string; limit?: number }): Promise<unknown> {
      if (!frameState.active || !site || !frameState.ready) throw new Error("The preview is not showing a page yet. Try again in a moment.");
      // A scheduled render is posted on the next frame, before this request.
      if (rafHandle) await new Promise((resolve) => requestAnimationFrame(resolve));
      const answer = await link.ask({ type: "inspect", request }, 8000);
      if (!answer) throw new Error("The preview did not answer. Keep the editor tab visible and try again.");
      return answer.report;
    },
    /** Ends typing as Escape does: true once the runtime answered (after any text edit it posted). */
    finishTyping,
    /** The selection's container is selected (Escape on the block rail); above the top, nothing. */
    selectParent() {
      if (frameState.active) link.send({ type: "select-parent" });
    },
    /** The next selection of this element (a block just inserted or moved) flashes. */
    flashInsert(request: NativeNodeRequest) {
      pageBuilder.flash(request);
    },
    /** A refused insert: its red reason flashes at the selection. */
    flashRefusal(reason: string) {
      pageBuilder.refuse(reason);
    },
    /** Select this element once the next update (the one carrying an edit) has rendered. */
    selectAfterUpdate(request: (NativeNodeRequest & { source?: string }) | undefined, options?: { reveal?: "center" }) {
      selectNode = request && options?.reveal ? { ...request, reveal: options.reveal } : request;
    },
    /** Re-select this text range (offsets into the selected element's text) after the next update. */
    selectTextAfterUpdate(range: { start: number; end: number } | undefined) {
      selectText = range;
    },
    /** Whether `href` (a link on the page shown) goes to one of the site's pages. */
    canFollow(href: string) {
      return Boolean(site && nativeLinkTarget(href, alone ? "/" : route, site.routes));
    },
    /** Navigate the preview to the page a link goes to; the current source edits stay. */
    follow(href: string) {
      return followRoute(href);
    },
    /** Render the current sources again, e.g. to drop typed text that was not applied. */
    refresh() {
      schedule();
    },
    /** The page the preview shows (a component shown alone has its own pseudo-route). */
    route() {
      return route;
    },
    /** The requests to agents to pin on their elements (src/components/agent-pins.ts). */
    setRequests(requests: PinRequest[]) {
      pinRequests = requests;
      if (requests.length) void loadPins();
      pins?.update(pinRequests, route);
    },
    /** Show a request's pin and hold its card open (src/components/agent-pins.ts `show`). */
    showRequest(id: string) {
      void loadPins().then(() => { if (!pinsDisposed) pins?.show(id); });
    },
    /**
     * History shows an earlier version: its bar goes over the page, and the
     * page can be scrolled and followed but not selected or edited.
     * `undefined` goes back to the latest.
     */
    setViewing(bar: HTMLElement | undefined) {
      handlers.onDismissContextMenu?.();
      link.send({ type: "viewing", viewing: Boolean(bar) });
      link.cancel("drop-probe");
      viewing?.remove();
      viewing = bar;
      pane.classList.toggle("is-viewing", Boolean(bar));
      pageBuilder.setViewing(Boolean(viewing));
      if (bar) {
        pane.insertBefore(bar, canvas.bar);
        canvas.setCrumbs([]);
        editBar.hide();
        insertControls.clear();
        pageBuilder.clear();
        cardGrids?.clear();
        postClearSelection();
      }
    },
    /** The top bar's "+ Add" opens the Add panel (src/page-builder/add-panel.ts). */
    attachAddButton(addButton: HTMLButtonElement) {
      pageBuilder.attachAddButton(addButton);
      pageBuilder.setActive(frameState.active);
      pageBuilder.setViewing(Boolean(viewing));
    },
    /** The grid of repeated items around the selection, as the runtime last reported it. */
    selectedItemGrid() {
      return cardGrids?.selected();
    },
    /** Add to the grid around the selection, as its Add card button does. */
    addToSelectedGrid() {
      cardGrids?.addToSelected();
    },
    /** Show the edit bar for the current selection. */
    showEditBar(model: EditBarModel, rect: SelectionRect, textSelection?: NativeTextSelection) {
      // Repeated selection reports must not close a menu under the pointer.
      // Sources used by this selection and serialized control/origin changes
      // still refresh its callbacks; indexing another page does not.
      const relevantSources = editBarSources(sources, Object.values(site?.routes ?? {}), model.origin?.path, site?.routes[route]);
      const key = JSON.stringify({ model, sources: relevantSources, textSelection });
      if (!editBar.element.hidden && key === editBarRenderKey) editBar.move(rect);
      else { editBarRenderKey = key; editBar.show(model, rect); }
    },
    hideEditBar() {
      editBar.hide();
    },
    /** Clear the runtime outline and every host selection surface together. */
    clearSelection() { clearSelection(); },
    /** Files the host could not read as text: a page linking one of them is drawn without it, with no error. */
    setUnreadable(paths: readonly string[]) {
      unreadable = new Set(paths);
    },
    setError(message: string | undefined) {
      loadError = Boolean(message);
      showBanner(message, true);
    },
    /**
     * Show the site's warnings, one per line, each with the fixes it
     * offers as buttons after it; none hides the box.
     */
    setWarnings(warnings: (string | NativeWarning)[]) {
      warningBox.replaceChildren(...warnings.map((warning) => {
        const line = node("p", "", typeof warning === "string" ? warning : warning.text);
        if (typeof warning !== "string")
          for (const fix of warning.fixes) {
            const control = button(fix.label, fix.run, "native-preview-warning__fix");
            if (fix.title) control.title = fix.title;
            if (fix.ariaLabel) control.setAttribute("aria-label", fix.ariaLabel);
            line.append(" ", control);
          }
        return line;
      }));
      warningBox.hidden = !warnings.length;
    },
    /** What the Add panel offers changed (the host read more of the site): its list is built again, the page is not drawn again. */
    choicesChanged() {
      pageBuilder.sourcesChanged();
    },
    /** The route the frame last drew ("/" for a component shown alone); none before its first draw. */
    shownRoute() {
      return site ? shownRoute : undefined;
    },
    /** Images and fonts read after the page was drawn: shown in place, the page is not drawn again. */
    setAssets(next: Record<string, string>) {
      assets = next;
      postAssets();
      cardGrids?.sourcesChanged();
    },
    /** A file the Variant lookup asked for was read late: an open card looks list follows. */
    refreshCardLooks() {
      cardGrids?.refreshLooks();
    },
    /** Attach the frame parked so its runtime loads before the first page is known. */
    preload() {
      frameState.preload();
    },
    deactivate() {
      // Parks the pane and reloads its frame: the pane never leaves the host.
      if (!frameState.deactivate()) return;
      endPress();
      site = undefined;
      shownRoute = undefined;
      editableTemplatePath = undefined;
      unreadable = new Set();
      pageBuilder.setViewing(Boolean(viewing));
      componentStyles = {};
      loadError = false;
      insertControls.clear();
      pageBuilder.clear();
      pageBuilder.setActive(false);
      cardGrids?.clear();
      clearSelection();
      handlers.onStructure?.(undefined);
      host.classList.remove("has-preview");
      showBanner(undefined, false);
      warningBox.replaceChildren();
      warningBox.hidden = true;
    },
    isActive() {
      return frameState.active;
    },
    destroy() {
      link.close();
      endPress();
      frameState.destroy();
      if (rafHandle) cancelAnimationFrame(rafHandle);
      editBar.destroy();
      canvas.destroy();
      codeLink.destroy();
      avoidWatch.disconnect();
      pinsDisposed = true;
      pins?.destroy();
      stopTheme();
      insertControls.destroy();
      pageBuilder.destroy();
      cardGrids?.destroy();
      slotGhosts.destroy();
      pane.remove();
      host.classList.remove("has-preview");
    },
  };
}

export type NativePreview = ReturnType<typeof createNativePreview>;
