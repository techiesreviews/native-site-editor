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
import { createEditBar, type EditBarModel, type SelectionRect } from "./edit-bar";
import { createInsertControls, type InsertChoice, type InsertPoint } from "./insert-controls";
import { createAgentPins, type PinRequest } from "./agent-pins";
import { createCardGridControls, type CardGridHandlers, type ItemGridReport, type ItemGridsReport } from "./card-grid-controls";
import { isSectionTemplate } from "../native-insert";
import { startTags } from "../native-source-location";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";
import { withSlottedRules } from "../../shared/slotted-css";
import { readCascade, readSelectedRules, type NativeCascade, type NativeSelectedRule } from "../style-cascade";
import { watchEditorTheme } from "../theme";
import type { AddPanelHandlers } from "../page-builder/add-panel";
import { createPageBuilder, type PageBuilderDeps } from "../page-builder/page-builder";
import { createCanvasBar } from "./canvas-bar";
import { readCrumbs } from "../page-builder/canvas-model";
import { linkCodeToCanvas } from "../page-builder/code-link";
import { composeNativeMasterEdit, type NativeMasterComposition, type NativeMasterEditInput } from "./native-master-preview";
export type { NativeMasterEditInput } from "./native-master-preview";
import { composeNativePagePartEdit, type NativePagePartComposition, type NativePagePartEditInput } from "./native-page-part-preview";
export type NativePagePartMasterEditInput = NativePagePartEditInput & { kind: "page-part"; rootTag: "header" | "footer" };
type NativeEditingInput = NativeMasterEditInput | NativePagePartMasterEditInput;
type NativeEditingComposition = NativeMasterComposition | NativePagePartComposition;
import "./native-preview.css";

// Browser-native preview: a persistent sandboxed iframe that renders a
// site's pages (the `<body>` of each `.html` document, see
// shared/native-project.ts) and the custom elements defined under
// `components/` (flat `<name>.html` or one folder per component,
// `<name>/<name>.html`) from in-memory source, patched over `postMessage`
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
const RUNTIME_DOC = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Native preview</title>
<script src="/native-preview-runtime.js" defer></script>
</head>
<body><div id="root" data-key="root"><div id="page" data-key="page"></div></div></body>
</html>`;

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
  /**
   * An explicit native master session: the page on show renders with its one
   * copy replaced by the master's root, editable as the master file.
   * Header/footer masters use the explicit `kind: "page-part"` variant.
   * `undefined` ends the session; an invalid one is refused (see masterEditStatus).
   */
  masterEdit?: NativeEditingInput;
}

/** Whether a master session is on show, or why the last one was refused or ended. */
export type NativeMasterEditStatus =
  | { active: true; session: string; pagePath: string; masterPath: string }
  | { active: false; error?: string };

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
  /** The master session this selection belongs to, when `path` is its master file. */
  masterSession?: string;
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
  /** The master session the text was typed in, when `path` is its master file. */
  masterSession?: string;
}

export interface NativePreviewHandlers {
  /** The frame drew another page (the first, a followed link, a file opened): the host reads its images. */
  onRouteShown?: (route: string) => void;
  /** Caller must check current source and revision before filling the page instance. */
  onSlotGhostFill?: (target: SlotGhostFillTarget) => void;
  onSelect?: (selection: NativePreviewSelection) => void;
  onComponentStyles?: (tags: string[]) => void;
  // The rules styling the page's <body>, whenever they change.
  onDefaultStyles?: (styles: { selectors: NativeSelectedRule[]; cascade?: NativeCascade }) => void;
  onTextSelection?: (selection: NativeTextSelection | undefined) => void;
  // Ctrl/⌘+B, +I or +K pressed inside the preview.
  onFormat?: (format: NativeFormat) => void;
  // Alt+Up or Alt+Down pressed inside the preview on a selected section.
  onMove?: (direction: "up" | "down") => void;
  onTextEdit?: (edit: NativeTextEdit) => void;
  onImageDrop?: (target: { path: string; node: number[]; width?: number }, files: File[]) => void;
  // A section dragged in the preview was released on a gap among its
  // siblings (`index` as the insert points count them), or the drag was cancelled.
  onSectionDrag?: (gap: { parent: number[]; index: number } | undefined) => void;
  // The rendered page's own elements, after each render.
  onStructure?: (structure: NativeStructure | undefined) => void;
  // Components offered between page sections, and what to do with a choice.
  insertChoices?: () => InsertChoice[];
  insertExtraChoices?: AddPanelHandlers["extraChoices"];
  insertNotice?: AddPanelHandlers["notice"];
  // A thumbnail for an extra choice: its markup and the preview inputs to render it with.
  insertPreview?: PageBuilderDeps["previewChoice"];
  insertPointFor?: AddPanelHandlers["pointFor"];
  insertDestinationText?: AddPanelHandlers["destinationText"];
  onInsert?: (point: InsertPoint, choice: InsertChoice) => void;
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

// A list of element-child indexes from the runtime.
const indexes = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length <= 500 && value.every((index) => Number.isInteger(index) && index >= 0);

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
type QueuedSelection = NativeNodeRequest & { reveal?: "center" };

// The page's stylesheets and the components' own, each `url()` naming an
// asset the host has read shown from it.
function composeStyles(
  site: NativeSite,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  assets: Record<string, string>,
  route: string,
  alone: string | undefined,
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
  const expanded = expandStyleImports(linked.filter((path) => sources[path] !== undefined), (path) => sources[path]);
  const styles = expanded.sheets.map(({ path, source, wrappers, importer, kind }) => ({ path, source: withAssetUrls(source, path, assets), wrappers, importer, kind }));
  const page = site.routes[alone ? "/" : route] ?? "";
  const styleErrors = [
    ...linked.filter((path) => sources[path] === undefined).map((path) => `${page} links ${path}, which is missing from this branch.`),
    ...expanded.errors,
  ];
  return { styles, styleErrors, componentStyles: stylesByComponent };
}

/** Assets the runtime does not have yet (`set`) and ones it should forget (`drop`). */
export interface AssetChanges { set: Record<string, string>; drop: string[] }

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
  master?: { composition: NativeEditingComposition; token: string },
) {
  const pages: Record<string, string> = {};
  const pagePaths: Record<string, string> = {};
  for (const [routePath, filePath] of Object.entries(site.routes)) {
    pagePaths[routePath] = filePath;
    pages[routePath] = pageOf(sources[filePath] ?? "");
  }
  // A master session: the page on show with its copy swapped (editor-only, in the frame).
  if (master && !alone) pages[route] = master.composition.pageBody;
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
  const { styles, styleErrors, componentStyles: stylesByComponent } = composeStyles(site, sources, componentStyles, assets, route, alone);
  // Section components count as sections when the runtime looks for places to insert one.
  const sectionTags = Object.keys(components).filter((tag) => isSectionTemplate(components[tag]));
  // Relative image paths resolve against the page's URL, as on the live site.
  const base = alone ? "/" : route;
  return { pages, pagePaths, components, componentPaths, styles, styleErrors, componentStyles: stylesByComponent, assetChanges, sectionTags, route, base, context, selectNode, selectText, hash, editableTemplatePath,
    master: master && !alone ? { path: master.composition.input.masterPath, session: master.token, node: [...master.composition.input.node], ...("masterPart" in master.composition
      ? { kind: "page-part", rootTag: master.composition.rootTag, part: master.composition.masterPart }
      : { section: master.composition.masterSection }) } : undefined };
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
  frame.setAttribute("srcdoc", RUNTIME_DOC);
  frameHost.append(frame);
  // The canvas around the frame: breakpoints and breadcrumb (canvas-bar.ts).
  const toCanvas = (message: Record<string, unknown>) =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", ...message }, "*");
  const canvas = createCanvasBar(frameHost, frame, {
    onCrumb: (index) => toCanvas({ type: "canvas-crumb", action: "select", index }),
    onCrumbHover: (index) => toCanvas({ type: "canvas-crumb", action: "hover", index: index ?? -2 }),
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
  // A drag from the edit bar's grip: the editor holds the pointer and sends
  // its place in the frame; the runtime answers with `section-drag` messages.
  const toRuntime = (type: string, at?: { x: number; y: number }) =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type, ...at }, "*");
  // The runtime draws its hover and selection boxes in the editor's color.
  let previewFocus = "";
  let componentColor = "";
  const postTheme = () =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "theme", focus: previewFocus, component: componentColor }, "*");
  // The component whose template is open: its instances show outlined.
  let focusTag = "";
  const postFocus = () =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "component-focus", tag: focusTag }, "*");
  // The bar keeps clear of the selection's pins, and Ask agent's note goes after them.
  let editBarRenderKey = "";
  const editBar = createEditBar(pane, frame, {
    start: (at) => toRuntime("drag-start", at),
    move: (at) => toRuntime("drag-move", at),
    end: (at) => toRuntime("drag-end", at),
    cancel: () => toRuntime("drag-cancel"),
  }, (rect) => pins.row(rect));
  const insertControls = createInsertControls(pane, frame, {
    onOpen: (point) => pageBuilder.openFor(point),
    onClose: () => pageBuilder.closeGap(),
  });
  // The Add panel, dragging onto the canvas, the empty page and the
  // highlight on a section just added (src/page-builder/).
  const pageBuilder = createPageBuilder({
    pane,
    frame,
    insertControls: () => insertControls,
    inputs: () => site && { site, sources, componentStyles, assets, route: alone ? "/" : route },
    choices: () => handlers.insertChoices?.() ?? [],
    extraChoices: handlers.insertExtraChoices,
    notice: handlers.insertNotice,
    previewChoice: handlers.insertPreview,
    pointFor: handlers.insertPointFor,
    destinationText: handlers.insertDestinationText,
    // An earlier version on show (History) is not edited: its places are not the source's.
    // Nor is a page while a master session is on show: only the master is edited then.
    insert: (point, choice) => { if (!viewing && !master) handlers.onInsert?.(point, choice); },
    prepare: (tags) => {
      const wanted = site ? tags.filter((tag) => Object.hasOwn(site!.components, tag) && !componentStyles[tag]) : [];
      if (wanted.length) handlers.onComponentStyles?.(wanted);
    },
    scroll: (dy, smooth) => frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "scroll-by", dy, smooth }, "*"),
    dock: handlers.addPanelDock,
  });
  let slotSelection: { path: string; node: number[]; tag?: string; exact: boolean } | undefined;
  const slotGhosts = mountSlotGhosts(pane, frame, {
    onFill: target => handlers.onSlotGhostFill?.(target),
    expectedIsCurrent: report => Boolean(mounted && !viewing && site && report.context === context &&
      report.pagePath === site.routes[route] && report.templatePath === site.components[report.tag] &&
      slotSelection?.path === report.pagePath && report.hostNode.every((index, i) => slotSelection!.node[i] === index) &&
      (!slotSelection.exact || (slotSelection.node.length === report.hostNode.length && slotSelection.tag === report.tag))),
  });
  const cardGrids = handlers.cards ? createCardGridControls(pane, frame, handlers.cards) : undefined;
  // The runtime finds each pin's element and reports where it is (`pin-rects`).
  let pinRequests: PinRequest[] = [];
  const pins = createAgentPins(pane, frame, {
    locate: (list) => frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "pins", pins: list }, "*"),
    onDismiss: (id) => handlers.onDismissRequest?.(id),
    onAnswer: async (id, text) => {
      if (!handlers.onAnswerRequest) throw new Error("No agent is connected.");
      await handlers.onAnswerRequest(id, text);
    },
    onShowPage: (target) => void followRoute(target),
    onShowElement: (id) => frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "show-pin", id }, "*"),
    onLayout: () => editBar.refit(),
  });

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
    if (!site || !ready || !mounted || rafHandle) return;
    const changes = assetChanges();
    if (!Object.keys(changes.set).length && !changes.drop.length) return;
    const { styles, componentStyles: styled } = composeStyles(site, sources, componentStyles, assets, route, alone);
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "assets", assetChanges: changes, styles, componentStyles: styled }, "*");
  }
  let route = "/";
  // The component shown by itself, when its template is open and no page uses it.
  let alone: string | undefined;
  let editableTemplatePath: string | undefined;
  // The master session input as the host last gave it, its checked composition
  // and a token unique to this activation (stamped on the runtime's messages).
  let masterInput: NativeEditingInput | undefined;
  let master: { composition: NativeEditingComposition; token: string } | undefined;
  let masterError: string | undefined;
  let masterEpoch = 0;
  let context = "";
  let sentStructureSnapshot: { context: string; sources: Readonly<Record<string, string>>; master?: { path: string; source: string; token: string } } | undefined;
  let renderVersion = 0;
  // A click reported against an older render. The runtime re-reports its
  // selection as a refresh after the next update, and that refresh then counts
  // as the click, so clicks during a re-render are not lost.
  let staleClick = false;
  let ready = false;
  let mounted = false;
  let rafHandle = 0;
  let messageId = 0;
  const stopTheme = watchEditorTheme(({ colors }) => {
    previewFocus = colors["preview-focus"];
    componentColor = colors.component;
    if (ready) postTheme();
  });
  // A load/site failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;
  let selectNode: QueuedSelection | undefined;
  let selectText: { start: number; end: number } | undefined;
  // The id a followed link's fragment names, scrolled to after the next render.
  let scrollHash: string | undefined;
  // Agents' inspections waiting for the runtime's answer, by request id.
  const inspections = new Map<number, (report: unknown) => void>();
  let inspectionId = 0;

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
    if (!site || !ready || !mounted) return;
    const payload = composePayload(site, sources, componentStyles, assets, assetChanges(), route, alone, context, selectNode, selectText, scrollHash, editableTemplatePath, master);
    selectNode = undefined;
    selectText = undefined;
    scrollHash = undefined;
    sentStructureSnapshot = { context, sources: { ...sources }, master: master && !alone
      ? { path: master.composition.input.masterPath, source: master.composition.input.masterSource, token: master.token } : undefined };
    postedRoutes.set(++messageId, alone ? "/" : route);
    frame.contentWindow?.postMessage(
      { source: "astro-native-preview-host", type: "update", id: messageId, payload },
      "*",
    );
  }
  // Re-checks the master session against the sources and page on show; an
  // invalid or ended one goes back to the plain page, and its messages are refused.
  function syncMaster() {
    const before = master;
    if (!masterInput || !site) master = undefined;
    else {
      const pagePart = "kind" in masterInput && masterInput.kind === "page-part";
      const composed = pagePart
        ? composeNativePagePartEdit(masterInput, { sources, pagePath: alone ? undefined : site.routes[route] })
        : composeNativeMasterEdit(masterInput, { sources, pagePath: alone ? undefined : site.routes[route] });
      if (!("error" in composed) && pagePart
        && (!("rootTag" in masterInput) || !("rootTag" in composed) || composed.rootTag !== masterInput.rootTag)) {
        master = undefined; masterInput = undefined; masterError = "The page part master has a different root tag.";
      } else if ("error" in composed) {
        master = undefined;
        masterInput = undefined;
        masterError = composed.error;
      } else {
        masterError = undefined;
        const same = before && before.composition.input.session === composed.input.session && before.composition.input.masterPath === composed.input.masterPath &&
          before.composition.input.pagePath === composed.input.pagePath && before.composition.input.node.join() === composed.input.node.join();
        master = { composition: composed, token: same ? before.token : `${++masterEpoch}:${composed.input.session}` };
      }
    }
    if (before && (!master || master.token !== before.token)) codeLink.cancel();
    syncAddLock();
  }
  // "+ Add" and its docked panel: unavailable while History shows an earlier
  // version or a master session is on show; back only when neither is.
  let addLocked = false;
  let addButtonEl: HTMLButtonElement | undefined;
  function syncAddLock() {
    const locked = Boolean(viewing) || Boolean(master && !alone);
    if (locked !== addLocked) {
      addLocked = locked;
      pageBuilder.setViewing(locked);
    }
    if (addButtonEl && locked && !viewing) addButtonEl.title = "Finish editing the saved section to add sections to the page";
  }
  const masterPath = () => (master && !alone ? master.composition.input.masterPath : undefined);
  // The route each posted render shows, until the runtime acknowledges it
  // (after the frame drew it): the host reads that page's images only then,
  // so no image is read before the page is on screen.
  const postedRoutes = new Map<number, string>();
  let shownRoute: string | undefined;
  function renderDrawn(id: number) {
    const drawn = postedRoutes.get(id);
    for (const key of [...postedRoutes.keys()]) if (key <= id) postedRoutes.delete(key);
    if (drawn === undefined || drawn === shownRoute) return;
    shownRoute = drawn;
    handlers.onRouteShown?.(drawn);
  }
  function schedule() {
    if (!site) return;
    syncMaster();
    slotGhosts.clear();
    slotSelection = undefined;
    renderVersion++;
    context = [
      renderVersion,
      route,
      alone ?? "",
      Object.entries(sources).map(([path, source]) => `${path}:${source.length}:${source.charCodeAt(0) || 0}:${source.charCodeAt(source.length - 1) || 0}`).join("|"),
    ].join("\n");
    pins.update(pinRequests, route);
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(post);
  }

  // Files a matched rule may come from: pages, components, their stylesheets,
  // shared stylesheets and every stylesheet those import.
  function styleSourcePaths() {
    return new Set([
      ...(site ? nativeSitePaths(site) : []),
      ...(masterPath() ? [masterPath()!] : []),
      ...Object.values(componentStyles),
      ...(site ? (() => {
        const linked = routeStylesheets(site, sources, alone ? "/" : route);
        return [...linked, ...expandStyleImports(linked, (path) => sources[path]).imported];
      })() : []),
    ]);
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; href?: string; context?: string } | undefined;
    if (data?.source !== "astro-native-preview") return;
    // Desktop files dropped onto a source-owned canvas image, including shadow roots.
    if (data.type === "image-drop" && site) {
      const raw = data as unknown as { path?: unknown; node?: unknown; width?: unknown; files?: unknown };
      if (master || data.context !== context || typeof raw.path !== "string" || !nativeSitePaths(site).includes(raw.path)) return;
      if (!Array.isArray(raw.node) || !raw.node.length || !raw.node.every((index) => Number.isInteger(index) && index >= 0)) return;
      if (!Array.isArray(raw.files) || !raw.files.every((file) => file instanceof File)) return;
      handlers.onImageDrop?.({ path: raw.path, node: raw.node, width: typeof raw.width === "number" ? raw.width : undefined }, raw.files);
      return;
    }
    // Typed text is checked against the current source, so it counts even
    // when a render was requested since.
    if (data.type === "text-edit" && site) {
      const raw = data as unknown as Record<string, unknown>;
      // While a master session is on show only its master takes typing, and
      // only from this very session; page text and stale sessions are refused.
      const inMaster = Boolean(master && raw.path === masterPath() && raw.session === master.token);
      if (typeof raw.path !== "string" || (master ? !inMaster : raw.session !== undefined || !nativeSitePaths(site).includes(raw.path))) return;
      if (typeof raw.before !== "string" || typeof raw.after !== "string" || raw.after.length > 100_000) return;
      if (!Array.isArray(raw.node) || raw.node.length > 500 || !raw.node.every((index) => Number.isInteger(index) && index >= 0)) return;
      if (inMaster && raw.node[0] !== 0) return;
      const edit: NativeTextEdit = { path: raw.path, node: raw.node as number[], before: raw.before, after: raw.after };
      if (inMaster) edit.masterSession = master!.composition.input.session;
      handlers.onTextEdit?.(edit);
      return;
    }
    // Messages that carry a user's action (`text-edit` above, `route`,
    // `format`, `move`, and a `section-drag` cancel) are read even when they
    // carry an older render context: they are not descriptions of a render,
    // and the host checks what they ask against the current source. The
    // rest (`select`, `text-selection`, `insert-points`, `structure`, the
    // rects, a drag's start, target and end) describe the runtime's DOM and
    // are dropped when a render requested since is still pending; the
    // runtime reports them again after that render.
    // A Ctrl/⌘+click on a link inside the preview (including inside shadow
    // roots) to one of the site's pages navigates the preview only, keeping
    // the current source edits untouched.
    if (data.type === "route" && typeof data.href === "string" && site) {
      followRoute(data.href);
      return;
    }
    if (data.type === "format") {
      const format = (data as { format?: unknown }).format;
      if (format === "strong" || format === "em" || format === "link") handlers.onFormat?.(format);
      return;
    }
    if (data.type === "move") {
      const direction = (data as { direction?: unknown }).direction;
      // A master session moves no page sections.
      if (!master && (direction === "up" || direction === "down")) handlers.onMove?.(direction);
      return;
    }
    if (data.type === "section-drag" && site) {
      const raw = data as { phase?: unknown; parent?: unknown; index?: unknown };
      const stale = data.context !== context;
      // A drag's gaps are counted in the runtime's DOM of the render it saw;
      // after a render requested since they may not be the source's. A stale
      // start or target is ignored; a stale end (or any cancel, including the
      // one the runtime sends when a render replaces the page under a drag)
      // ends the drag with nothing moved, announced as cancelled.
      if (raw.phase === "cancel" || master || (stale && raw.phase === "end")) {
        editBar.dragEnded();
        insertControls.dragEnd();
        handlers.onSectionDrag?.(undefined);
        return;
      }
      if (stale) return;
      if (!indexes(raw.parent) || !Number.isInteger(raw.index) || (raw.index as number) < 0) return;
      const gap = { parent: raw.parent, index: raw.index as number };
      if (raw.phase === "start") insertControls.dragStart(gap);
      else if (raw.phase === "target") insertControls.dragTarget(gap);
      else if (raw.phase === "end") {
        editBar.dragEnded();
        insertControls.dragEnd();
        handlers.onSectionDrag?.(gap);
      }
      return;
    }
    // Esc or Ctrl/⌘+↑ climbed past the top, or the breadcrumb's body was chosen.
    if (data.type === "canvas-clear") {
      clearSelection();
      return;
    }
    // Pins' places describe the DOM too, but each report is whole and
    // sent only when it changed, so none is dropped.
    if (data.type === "pin-rects") {
      const raw = (data as { rects?: unknown }).rects;
      if (!Array.isArray(raw)) return;
      pins.rects(raw.slice(0, 200).flatMap((item) =>
        item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
          ? [{ id: (item as { id: string }).id, rect: readRect((item as { rect?: unknown }).rect) ?? null }]
          : []));
      return;
    }
    if (data.type !== "ready" && data.context !== context) {
      if (data.type === "select" && (data as { reason?: unknown }).reason === "click") staleClick = true;
      return;
    }
    if (data.type === "slot-ghosts") {
      const report = site && mounted && !viewing && !master && readSlotGhostReport((data as { report?: unknown }).report,
        { context, pagePath: alone ? "" : site.routes[route] ?? "", components: site.components });
      if (report) slotGhosts.update(report); else slotGhosts.clear(false);
      return;
    }
    if (data.type === "inspect-result") {
      const answer = data as { id?: number; report?: unknown };
      inspections.get(Number(answer.id))?.(answer.report);
      return;
    }
    if (data.type === "ack") {
      renderDrawn(Number((data as { id?: unknown }).id));
      return;
    }
    if (data.type === "ready") {
      ready = true;
      sentAssets.clear();
      postedRoutes.clear();
      shownRoute = undefined;
      postTheme();
      lastAvoid = "";
      postAvoid();
      postFocus();
      pins.reset();
      schedule();
      return;
    }
    // Runtime-reported render failures (bad define, recursive templates) surface
    // as a banner but keep the frame visible, unless a hard load error is shown.
    if (data.type === "error" && typeof (data as { message?: string }).message === "string") {
      if (!loadError) showBanner((data as { message: string }).message, false);
      return;
    }
    if (data.type === "clear-error") {
      if (!loadError) showBanner(undefined, false);
      return;
    }
    if (data.type === "insert-points" && site) {
      const raw = data as unknown as { path?: unknown; points?: unknown };
      const path = raw.path;
      if (typeof path !== "string" || site.routes[route] !== path || !Array.isArray(raw.points)) return;
      // An earlier version on show (History): its gaps are counted in its
      // markup, not the current source's, so nothing is offered there.
      if (viewing || master) {
        insertControls.update([]);
        pageBuilder.points([]);
        return;
      }
      const points = raw.points.slice(0, 500).flatMap((item): InsertPoint[] => {
        if (!item || typeof item !== "object") return [];
        const point = item as Record<string, unknown>;
        if (!indexes(point.parent) || !Number.isInteger(point.index) || (point.index as number) < 0) return [];
        if (!["top", "left", "width"].every((key) => typeof point[key] === "number" && Number.isFinite(point[key]))) return [];
        return [{
          path,
          parent: point.parent,
          index: point.index as number,
          top: point.top as number,
          left: point.left as number,
          width: point.width as number,
          before: typeof point.before === "string" ? point.before.slice(0, 60) : "",
          tag: typeof point.tag === "string" ? point.tag.slice(0, 100) : undefined,
          empty: point.empty === true || undefined,
          height: typeof point.height === "number" && Number.isFinite(point.height) ? point.height : undefined,
        }];
      });
      insertControls.update(points);
      pageBuilder.points(points);
      return;
    }
    if (data.type === "section-hover") {
      const item = (data as { item?: unknown }).item as { parent?: unknown; index?: unknown } | null | undefined;
      const valid = item && Array.isArray(item.parent) && item.parent.every((index) => Number.isInteger(index) && index >= 0) &&
        Number.isInteger(item.index) && (item.index as number) >= 0;
      insertControls.hover(valid ? { parent: item.parent as number[], index: item.index as number } : undefined);
      return;
    }
    if (data.type === "text-selection") {
      handlers.onTextSelection?.(readTextSelection((data as { selection?: unknown }).selection));
      return;
    }
    if (data.type === "item-grids" && site) {
      const raw = data as { hover?: unknown; selected?: unknown };
      const report = master ? { hover: null, selected: null } : { hover: readItemGrid(raw.hover), selected: readItemGrid(raw.selected) };
      cardGrids?.update(report);
      handlers.onItemGrids?.(report);
      return;
    }
    if (data.type === "structure" && site) {
      const raw = data as unknown as { path?: unknown; items?: unknown };
      const path = typeof raw.path === "string" && (raw.path === "" || site.routes[route] === raw.path) ? raw.path : undefined;
      if (path === undefined || !sentStructureSnapshot || sentStructureSnapshot.context !== data.context) return;
      const paintedSource = sentStructureSnapshot.sources[path];
      if (path && paintedSource === undefined) return;
      let count = 0;
      const readItems = (value: unknown, depth: number): NativeStructureItem[] => {
        if (!Array.isArray(value) || depth > 12) return [];
        return value.flatMap((entry): NativeStructureItem[] => {
          if (!entry || typeof entry !== "object" || ++count > 2000) return [];
          const item = entry as Record<string, unknown>;
          if (typeof item.tag !== "string" || !Array.isArray(item.node) || item.node.length > 500 ||
            !item.node.every((index) => Number.isInteger(index) && index >= 0)) return [];
          const text = (key: string) => (typeof item[key] === "string" ? (item[key] as string).slice(0, 80) : "");
          return [{ tag: item.tag.slice(0, 100), node: item.node as number[], text: text("text"), heading: text("heading"), slot: text("slot"), children: readItems(item.children, depth + 1) }];
        });
      };
      handlers.onStructure?.({ path, items: readItems(raw.items, 0), paintedSource });
      return;
    }
    if (data.type === "selection-rect") {
      const rect = readRect((data as { rect?: unknown }).rect);
      if (rect) {
        editBar.move(rect);
        pageBuilder.selectionRect(rect);
      }
      return;
    }
    // An earlier version on show (History): nothing on it can be selected or edited.
    if (data.type === "select" && viewing) {
      if ((data as { reason?: unknown }).reason === "click") postClearSelection();
      return;
    }
    if (data.type === "select" && site) {
      const raw = data as unknown as {
        path?: unknown;
        tag?: unknown;
        text?: unknown;
        selectors?: unknown;
        cascade?: unknown;
        reason?: unknown;
        node?: unknown;
        link?: unknown;
        rect?: unknown;
        pageNode?: unknown;
        selector?: unknown;
        host?: unknown;
        hostChain?: unknown;
        crumbs?: unknown;
      };
      slotSelection = undefined;
      const reason = raw.reason === "refresh" && !staleClick ? "refresh" : "click";
      staleClick = false;
      if (reason === "click") codeLink.cancel();
      // The runtime lost its selection in a re-render (the element was
      // removed or replaced) and nothing was requested in its place.
      if (raw.path === "" && reason === "refresh") {
        slotGhosts.clear();
        canvas.setCrumbs([]);
        editBar.hide();
        pageBuilder.selected("", undefined, undefined);
        handlers.onSelect?.({ path: "", tag: "", text: "", reason, selectors: [] });
        return;
      }
      const painted = sentStructureSnapshot && sentStructureSnapshot.context === data.context ? sentStructureSnapshot : undefined;
      // The master's own elements, from the render that painted this master session.
      const masterSelection = typeof raw.path === "string" && Boolean(painted?.master && master && painted.master.token === master.token && raw.path === painted.master.path);
      if (typeof raw.path !== "string" || (!masterSelection && !nativeSitePaths(site).includes(raw.path))) return;
      if (masterSelection && !(indexes(raw.node) && raw.node[0] === 0)) return;
      const selectors = readSelectedRules(raw.selectors, styleSourcePaths());
      const selectedNode = indexes(raw.node) ? raw.node : undefined;
      // Inside a component's template: the page's instance it renders in.
      const pagePath = site.routes[route];
      const slotHost = readHost(raw.host);
      if (raw.path === pagePath && selectedNode) slotSelection = { path: pagePath, node: [...selectedNode],
        tag: typeof raw.tag === "string" ? raw.tag : undefined, exact: typeof raw.tag === "string" && Object.hasOwn(site.components, raw.tag) };
      else if (slotHost?.path === pagePath && slotHost.node) slotSelection = { path: pagePath, node: [...slotHost.node], tag: slotHost.tag, exact: true };
      slotGhosts.selectionChanged();
      const instance = indexes(raw.pageNode) && pagePath ? { path: pagePath, node: raw.pageNode } : undefined;
      pageBuilder.selected(raw.path, selectedNode, readRect(raw.rect), instance);
      canvas.setCrumbs(readCrumbs(raw.crumbs));
      handlers.onSelect?.({
        path: raw.path,
        paintedSource: masterSelection ? painted!.master!.source : painted?.sources[raw.path],
        masterSession: masterSelection ? master!.composition.input.session : undefined,
        tag: typeof raw.tag === "string" ? raw.tag : "",
        text: typeof raw.text === "string" ? raw.text : "",
        reason,
        selectors,
        cascade: readCascade(raw.cascade),
        node: Array.isArray(raw.node) && raw.node.length <= 500 &&
          raw.node.every((index) => Number.isInteger(index) && index >= 0)
          ? raw.node as number[]
          : undefined,
        link: typeof raw.link === "string" ? raw.link : undefined,
        rect: readRect(raw.rect),
        selector: typeof raw.selector === "string" ? raw.selector.slice(0, 2000) : undefined,
        host: readHost(raw.host),
        hostChain: readHostChain(raw.hostChain),
      });
      return;
    }
    if (data.type === "default-styles" && site) {
      const raw = data as unknown as { selectors?: unknown; cascade?: unknown };
      handlers.onDefaultStyles?.({ selectors: readSelectedRules(raw.selectors, styleSourcePaths()), cascade: readCascade(raw.cascade) });
      return;
    }
    if (data.type === "component-styles" && site) {
      const raw = data as unknown as { tags?: unknown };
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => typeof tag === "string" && Object.hasOwn(site!.components, tag))
        : [];
      if (tags.length) handlers.onComponentStyles?.([...new Set(tags)]);
    }
  }
  window.addEventListener("message", onMessage);
  function readRect(raw: unknown): SelectionRect | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const rect = raw as Record<string, unknown>;
    const keys = ["top", "left", "width", "height", "bottom", "right"] as const;
    if (!keys.every((key) => typeof rect[key] === "number" && Number.isFinite(rect[key]))) return undefined;
    const read = Object.fromEntries(keys.map((key) => [key, rect[key] as number])) as unknown as SelectionRect;
    // The page's own top bar over the viewport (src/components/edit-bar.ts):
    // kept only when a finite, non-negative number.
    if (typeof rect.inset === "number" && Number.isFinite(rect.inset) && rect.inset > 0) read.inset = rect.inset;
    return read;
  }
  function readItemGrid(raw: unknown): ItemGridReport | null {
    if (!raw || typeof raw !== "object" || !site) return null;
    const grid = raw as Record<string, unknown>;
    const box = readRect(grid.ghost && typeof grid.ghost === "object" ? { ...(grid.ghost as object), bottom: 0, right: 0 } : undefined);
    if (typeof grid.path !== "string" || site.routes[route] !== grid.path || !indexes(grid.parent) || !box) return null;
    if (![grid.index, grid.position, grid.count].every((value) => Number.isInteger(value) && (value as number) >= 0)) return null;
    return {
      path: grid.path,
      parent: grid.parent,
      index: grid.index as number,
      position: grid.position as number,
      count: grid.count as number,
      row: grid.row === true,
      beside: grid.beside === true,
      ghost: { top: box.top, left: box.left, width: box.width, height: box.height },
    };
  }
  function readHost(raw: unknown) {
    if (!raw || typeof raw !== "object") return undefined;
    const { tag, selector, path, node, rect } = raw as Record<string, unknown>;
    if (typeof tag !== "string" || typeof selector !== "string") return undefined;
    const host: NonNullable<NativePreviewSelection["host"]> = { tag: tag.slice(0, 100), selector: selector.slice(0, 2000) };
    if (typeof path === "string" && site && nativeSitePaths(site).includes(path) && indexes(node)) {
      host.path = path;
      host.node = node;
      host.rect = readRect(rect);
      host.paintedSource = sentStructureSnapshot && sentStructureSnapshot.context === context ? sentStructureSnapshot.sources[path] : undefined;
    }
    return host;
  }
  function readHostChain(raw: unknown) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 16) return undefined;
    const chain = raw.map(readHost);
    return chain.every((host): host is NonNullable<NativePreviewSelection["host"]> => Boolean(host?.path && host.node)) ? chain : undefined;
  }
  function readTextSelection(raw: unknown): NativeTextSelection | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const value = raw as Record<string, unknown>;
    if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || typeof value.text !== "string") return undefined;
    const start = value.start as number;
    const end = value.end as number;
    const caret = value.caret === true && end === start && value.text === "";
    if (start < 0 || (end <= start && !caret) || value.text.length > 100_000) return undefined;
    const wrappers = Array.isArray(value.wrappers)
      ? value.wrappers.filter((name): name is string => typeof name === "string").slice(0, 50)
      : [];
    return caret ? { start, end, text: "", wrappers, caret } : { start, end, text: value.text, wrappers };
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
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "clear-selection" }, "*");
  }
  function clearSelection() {
    selectNode = undefined;
    selectText = undefined;
    staleClick = false;
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
    toCanvas({ type: "canvas-avoid", rect });
  };
  const avoidWatch = new MutationObserver(() => requestAnimationFrame(postAvoid));
  avoidWatch.observe(editBar.element, { attributes: true, attributeFilter: ["style", "hidden"], childList: true });

  const codeLink = linkCodeToCanvas({
    owns: (path) => Boolean(site && mounted && ready && !viewing && (nativeSitePaths(site).includes(path) || path === masterPath())),
    hint: (request) => toCanvas({ type: "canvas-hint", request: request ?? null }),
    select: (request) => toCanvas({ type: "canvas-code-select", request }),
  });

  return {
    /** Send an already scheduled source change immediately after a direct user action. */
    flushPendingUpdate() {
      if (!rafHandle) return;
      cancelAnimationFrame(rafHandle);
      post();
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
      if (!mounted) {
        mounted = true;
        host.classList.add("has-preview");
        host.prepend(pane);
        pageBuilder.setActive(true);
      }
      schedule();
    },
    update(input: UpdateInput) {
      if (Object.hasOwn(input, "editableTemplatePath")) editableTemplatePath = input.editableTemplatePath;
      if (Object.hasOwn(input, "masterEdit")) {
        masterInput = input.masterEdit;
        masterError = undefined;
      }
      if (input.sources) sources = input.sources;
      if (input.componentStyles) componentStyles = input.componentStyles;
      if (input.assets) assets = input.assets;
      if (Object.hasOwn(input, "component") && (input.component ?? "") !== focusTag) {
        focusTag = input.component ?? "";
        if (ready) postFocus();
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
          // and a click here would cancel the file open that led to this.
          staleClick = false;
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
      // A session refused before any site is shown still reports why.
      if (!site && masterInput) { masterInput = undefined; masterError = "No site is shown."; }
      pageBuilder.sourcesChanged();
    },
    /** Whether the master session given to `update` is on show, or why it was refused or ended. */
    masterEditStatus(): NativeMasterEditStatus {
      if (site && masterInput) syncMaster();
      if (!master || alone) return masterError ? { active: false, error: masterError } : { active: false };
      const { session, pagePath, masterPath: path } = master.composition.input;
      return { active: true, session, pagePath, masterPath: path };
    },
    /** Select an element of the rendered page now, as a click would, and bring it into the middle of the frame. */
    selectNode(request: NativeNodeRequest) {
      if (!mounted) return;
      frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "select-node", request }, "*");
    },
    /**
     * Elements of the page shown as rendered (box, computed styles, matching
     * rules, text contrast), for an agent: one by index path, those matching
     * a selector, or the selection. Measured after any pending render.
     */
    async inspect(request: { path?: string; node?: number[]; selector?: string; limit?: number }): Promise<unknown> {
      if (!mounted || !site || !ready) throw new Error("The preview is not showing a page yet. Try again in a moment.");
      // A scheduled render is posted on the next frame, before this request.
      if (rafHandle) await new Promise((resolve) => requestAnimationFrame(resolve));
      const id = ++inspectionId;
      try {
        return await new Promise((resolve, reject) => {
          inspections.set(id, resolve);
          setTimeout(() => reject(new Error("The preview did not answer. Keep the editor tab visible and try again.")), 8000);
          frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "inspect", id, request }, "*");
        });
      } finally {
        inspections.delete(id);
      }
    },
    /** Select this element once the next update (the one carrying an edit) has rendered. */
    selectAfterUpdate(request: NativeNodeRequest | undefined, options?: { reveal?: "center" }) {
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
      pins.update(pinRequests, route);
    },
    /** Show a request's pin and hold its card open (src/components/agent-pins.ts `show`). */
    showRequest(id: string) {
      pins.show(id);
    },
    /**
     * History shows an earlier version: its bar goes over the page, and the
     * page can be scrolled and followed but not selected or edited.
     * `undefined` goes back to the latest.
     */
    setViewing(bar: HTMLElement | undefined) {
      viewing?.remove();
      viewing = bar;
      pane.classList.toggle("is-viewing", Boolean(bar));
      syncAddLock();
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
      addButtonEl = addButton;
      pageBuilder.attachAddButton(addButton);
      pageBuilder.setActive(mounted);
      if (addLocked) pageBuilder.setViewing(true);
      syncAddLock();
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
      // Any source or serialized control/origin change still refreshes its callbacks.
      const key = JSON.stringify({ model, sources, textSelection });
      if (!editBar.element.hidden && key === editBarRenderKey) editBar.move(rect);
      else { editBarRenderKey = key; editBar.show(model, rect); }
    },
    hideEditBar() {
      editBar.hide();
    },
    /** Clear the runtime outline and every host selection surface together. */
    clearSelection() { clearSelection(); },
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
    /** The route the frame last drew ("/" for a component shown alone); none before its first draw. */
    shownRoute() {
      return site ? shownRoute : undefined;
    },
    /** Images and fonts read after the page was drawn: shown in place, the page is not drawn again. */
    setAssets(next: Record<string, string>) {
      assets = next;
      postAssets();
    },
    deactivate() {
      if (!mounted) return;
      mounted = false;
      site = undefined;
      shownRoute = undefined;
      postedRoutes.clear();
      editableTemplatePath = undefined;
      masterInput = undefined;
      master = undefined;
      syncAddLock();
      componentStyles = {};
      loadError = false;
      insertControls.clear();
      pageBuilder.clear();
      pageBuilder.setActive(false);
      cardGrids?.clear();
      clearSelection();
      handlers.onStructure?.(undefined);
      pane.remove();
      host.classList.remove("has-preview");
      showBanner(undefined, false);
      warningBox.replaceChildren();
      warningBox.hidden = true;
    },
    isActive() {
      return mounted;
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      editBar.destroy();
      canvas.destroy();
      codeLink.destroy();
      avoidWatch.disconnect();
      pins.destroy();
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
