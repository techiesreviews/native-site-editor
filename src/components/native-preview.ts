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
import { isSectionTemplate } from "../native-insert";
import { startTags } from "../native-source-location";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";
import { withSlottedRules } from "../../shared/slotted-css";
import { readCascade, readSelectedRules, type NativeCascade, type NativeSelectedRule } from "../style-cascade";
import { watchEditorTheme } from "../theme";
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
  host?: { tag: string; selector: string };
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
}

export interface NativeTextEdit {
  path: string;
  node: number[];
  before: string;
  after: string;
}

interface NativePreviewHandlers {
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
  // A section dragged in the preview was released on a gap among its
  // siblings (`index` as the insert points count them), or the drag was cancelled.
  onSectionDrag?: (gap: { parent: number[]; index: number } | undefined) => void;
  // The rendered page's own elements, after each render.
  onStructure?: (structure: NativeStructure | undefined) => void;
  // Components offered between page sections, and what to do with a choice.
  insertChoices?: () => InsertChoice[];
  onInsert?: (point: InsertPoint, choice: InsertChoice) => void;
  // A request to agents dismissed from its pin, and the user's answer to an agent's question.
  onDismissRequest?: (id: string) => void;
  onAnswerRequest?: (id: string, text: string) => Promise<void>;
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

function composePayload(
  site: NativeSite,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  assets: Record<string, string>,
  route: string,
  alone: string | undefined,
  context: string,
  selectNode: NativeNodeRequest | undefined,
  selectText: { start: number; end: number } | undefined,
  hash?: string,
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
  // Section components count as sections when the runtime looks for places to insert one.
  const sectionTags = Object.keys(components).filter((tag) => isSectionTemplate(components[tag]));
  // Relative image paths resolve against the page's URL, as on the live site.
  const base = alone ? "/" : route;
  return { pages, pagePaths, components, componentPaths, styles, styleErrors, componentStyles: stylesByComponent, assets, sectionTags, route, base, context, selectNode, selectText, hash };
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
  const errorBox = node("div", "native-preview-error");
  errorBox.setAttribute("role", "alert");
  errorBox.hidden = true;
  // Problems that leave the site usable (two files for one component):
  // shown above the page, which renders.
  const warningBox = node("div", "native-preview-warning");
  warningBox.setAttribute("role", "status");
  warningBox.hidden = true;
  pane.append(errorBox, warningBox, frameHost);
  // A drag from the edit bar's grip: the editor holds the pointer and sends
  // its place in the frame; the runtime answers with `section-drag` messages.
  const toRuntime = (type: string, at?: { x: number; y: number }) =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type, ...at }, "*");
  // The runtime draws its hover and selection boxes in the editor's color.
  let previewFocus = "";
  const postTheme = () =>
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "theme", focus: previewFocus }, "*");
  // The bar keeps clear of the selection's pins, and Ask agent's note goes after them.
  const editBar = createEditBar(pane, frame, {
    start: (at) => toRuntime("drag-start", at),
    move: (at) => toRuntime("drag-move", at),
    end: (at) => toRuntime("drag-end", at),
    cancel: () => toRuntime("drag-cancel"),
  }, (rect) => pins.row(rect));
  const insertControls = createInsertControls(pane, frame, {
    choices: () => handlers.insertChoices?.() ?? [],
    onInsert: (point, choice) => handlers.onInsert?.(point, choice),
  });
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
  let sources: Record<string, string> = {};
  let componentStyles: Record<string, string> = {};
  let assets: Record<string, string> = {};
  let route = "/";
  // The component shown by itself, when its template is open and no page uses it.
  let alone: string | undefined;
  let context = "";
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
    if (ready) postTheme();
  });
  // A load/site failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;
  let selectNode: NativeNodeRequest | undefined;
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
    } else {
      errorBox.hidden = true;
      frameHost.hidden = false;
    }
  }

  function post() {
    rafHandle = 0;
    if (!site || !ready || !mounted) return;
    const payload = composePayload(site, sources, componentStyles, assets, route, alone, context, selectNode, selectText, scrollHash);
    selectNode = undefined;
    selectText = undefined;
    scrollHash = undefined;
    frame.contentWindow?.postMessage(
      { source: "astro-native-preview-host", type: "update", id: ++messageId, payload },
      "*",
    );
  }
  function schedule() {
    if (!site) return;
    renderVersion++;
    context = [
      renderVersion,
      route,
      alone ?? "",
      Object.entries(sources).map(([path, source]) => `${path}:${source.length}:${source.charCodeAt(0) || 0}:${source.charCodeAt(source.length - 1) || 0}`).join("|"),
      Object.keys(assets).join("|"),
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
    // Typed text is checked against the current source, so it counts even
    // when a render was requested since.
    if (data.type === "text-edit" && site) {
      const raw = data as unknown as Record<string, unknown>;
      if (typeof raw.path !== "string" || !nativeSitePaths(site).includes(raw.path)) return;
      if (typeof raw.before !== "string" || typeof raw.after !== "string" || raw.after.length > 100_000) return;
      if (!Array.isArray(raw.node) || raw.node.length > 500 || !raw.node.every((index) => Number.isInteger(index) && index >= 0)) return;
      handlers.onTextEdit?.({ path: raw.path, node: raw.node as number[], before: raw.before, after: raw.after });
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
      if (direction === "up" || direction === "down") handlers.onMove?.(direction);
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
      if (raw.phase === "cancel" || (stale && raw.phase === "end")) {
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
    if (data.type === "inspect-result") {
      const answer = data as { id?: number; report?: unknown };
      inspections.get(Number(answer.id))?.(answer.report);
      return;
    }
    if (data.type === "ready") {
      ready = true;
      postTheme();
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
        }];
      });
      insertControls.update(points);
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
    if (data.type === "structure" && site) {
      const raw = data as unknown as { path?: unknown; items?: unknown };
      const path = typeof raw.path === "string" && (raw.path === "" || site.routes[route] === raw.path) ? raw.path : undefined;
      if (path === undefined) return;
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
      handlers.onStructure?.({ path, items: readItems(raw.items, 0) });
      return;
    }
    if (data.type === "selection-rect") {
      const rect = readRect((data as { rect?: unknown }).rect);
      if (rect) editBar.move(rect);
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
        selector?: unknown;
        host?: unknown;
      };
      const reason = raw.reason === "refresh" && !staleClick ? "refresh" : "click";
      staleClick = false;
      // The runtime lost its selection in a re-render (the element was
      // removed or replaced) and nothing was requested in its place.
      if (raw.path === "" && reason === "refresh") {
        editBar.hide();
        handlers.onSelect?.({ path: "", tag: "", text: "", reason, selectors: [] });
        return;
      }
      if (typeof raw.path !== "string" || !nativeSitePaths(site).includes(raw.path)) return;
      const selectors = readSelectedRules(raw.selectors, styleSourcePaths());
      handlers.onSelect?.({
        path: raw.path,
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
    return Object.fromEntries(keys.map((key) => [key, rect[key] as number])) as unknown as SelectionRect;
  }
  function readHost(raw: unknown) {
    if (!raw || typeof raw !== "object") return undefined;
    const { tag, selector } = raw as Record<string, unknown>;
    return typeof tag === "string" && typeof selector === "string" ? { tag: tag.slice(0, 100), selector: selector.slice(0, 2000) } : undefined;
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
      clearSelection();
    }
    // A fragment on the page on show scrolls there too.
    if (moved || scrollHash) schedule();
    return true;
  }
  function postClearSelection() {
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "clear-selection" }, "*");
  }
  function clearSelection() {
    staleClick = false;
    editBar.hide();
    postClearSelection();
    handlers.onSelect?.({ path: "", tag: "", text: "", reason: "click", selectors: [] });
  }

  return {
    /** Show the pane and adopt a site. Idempotent for the same site. */
    activate(next: NativeSite) {
      site = next;
      if (!Object.hasOwn(next.routes, route)) {
        route = nativeDefaultRoute(next);
        alone = undefined;
      }
      if (!mounted) {
        mounted = true;
        host.classList.add("has-preview");
        host.prepend(pane);
      }
      schedule();
    },
    update(input: UpdateInput) {
      if (input.sources) sources = input.sources;
      if (input.componentStyles) componentStyles = input.componentStyles;
      if (input.assets) assets = input.assets;
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
      }
      schedule();
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
    selectAfterUpdate(request: NativeNodeRequest | undefined) {
      selectNode = request;
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
    /** Show the edit bar for the current selection. */
    showEditBar(model: EditBarModel, rect: SelectionRect) {
      editBar.show(model, rect);
    },
    hideEditBar() {
      editBar.hide();
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
    deactivate() {
      if (!mounted) return;
      mounted = false;
      site = undefined;
      componentStyles = {};
      loadError = false;
      insertControls.clear();
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
      pins.destroy();
      stopTheme();
      insertControls.destroy();
      pane.remove();
      host.classList.remove("has-preview");
    },
  };
}

export type NativePreview = ReturnType<typeof createNativePreview>;
