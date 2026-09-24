import { node } from "../ui/dom";
import {
  nativeDefaultRoute,
  nativeManifestPaths,
  type NativeManifest,
} from "../native-manifest";
import { createEditBar, type EditBarModel, type SelectionRect } from "./edit-bar";
import { createInsertControls, type InsertChoice, type InsertPoint } from "./insert-controls";
import { isSectionTemplate } from "../native-insert";
import { startTags } from "../native-source-location";
import "./native-preview.css";

// Browser-native preview: a persistent sandboxed iframe that renders plain
// `src/pages/*.html` routes and custom elements defined under `src/components/`
// (flat `<name>.html` or one folder per component, `<name>/<name>.html`) from
// in-memory source, patched over `postMessage` and never reloaded per edit.
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
  // Repository image paths to data URLs, so `<img src>` shows in the frame.
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
function routeUsesTag(manifest: NativeManifest, sources: Record<string, string>, routePath: string, tag: string) {
  const seen = new Set<string>();
  const queue = [sources[manifest.routes[routePath]] ?? ""];
  while (queue.length) {
    const html = queue.pop()!;
    if (usesTag(html, tag)) return true;
    for (const [name, path] of Object.entries(manifest.components)) {
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

export interface NativeSelectedRule {
  path: string;
  selector: string;
  ruleIndex?: number;
}

export interface NativePreviewSelection {
  path: string;
  tag: string;
  text: string;
  reason: "click" | "refresh";
  selectors: NativeSelectedRule[];
  // Element-child indexes from the owning file's root to the selected element.
  node?: number[];
  // The nearest enclosing link's href, when the selection sits inside one.
  link?: string;
  // Frame-viewport rectangle of the selected element.
  rect?: SelectionRect;
}

// A text selection inside the selected element: offsets into its DOM text
// content, the selected text, and the inline wrappers around it (innermost first).
export interface NativeTextSelection {
  start: number;
  end: number;
  text: string;
  wrappers: string[];
}

export type NativeFormat = "strong" | "em";

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
  onTextSelection?: (selection: NativeTextSelection | undefined) => void;
  // Ctrl/⌘+B or +I pressed inside the preview.
  onFormat?: (format: NativeFormat) => void;
  // Alt+Up or Alt+Down pressed inside the preview on a selected section.
  onMove?: (direction: "up" | "down") => void;
  onTextEdit?: (edit: NativeTextEdit) => void;
  // The rendered page's own elements, after each render.
  onStructure?: (structure: NativeStructure | undefined) => void;
  // Components offered between page sections, and what to do with a choice.
  insertChoices?: () => InsertChoice[];
  onInsert?: (point: InsertPoint, choice: InsertChoice) => void;
}

function composePayload(
  manifest: NativeManifest,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  assets: Record<string, string>,
  route: string,
  alone: string | undefined,
  context: string,
  selectNode: NativeNodeRequest | undefined,
  selectText: { start: number; end: number } | undefined,
) {
  const pages: Record<string, string> = {};
  const pagePaths: Record<string, string> = {};
  for (const [routePath, filePath] of Object.entries(manifest.routes))
    pagePaths[routePath] = filePath;
  for (const [routePath, filePath] of Object.entries(manifest.routes))
    pages[routePath] = sources[filePath] ?? "";
  // A component on its own: a page of just one instance, belonging to no
  // file, so only clicks inside the component select anything. It sits in
  // the same page container the home page uses, so it gets the page's width.
  if (alone) {
    pages[componentRoute(alone)] = `${pageContainer(pages[nativeDefaultRoute(manifest)] ?? "")}\n  <${alone} data-key="${alone}"></${alone}>\n</main>`;
    pagePaths[componentRoute(alone)] = "";
  }
  const components: Record<string, string> = {};
  const componentPaths: Record<string, string> = {};
  for (const [tag, filePath] of Object.entries(manifest.components))
    componentPaths[tag] = filePath;
  for (const [tag, filePath] of Object.entries(manifest.components))
    components[tag] = sources[filePath] ?? "";
  const stylesByComponent: Record<string, { path: string; source: string }> = {};
  for (const [tag, path] of Object.entries(componentStyles)) {
    if (!Object.hasOwn(manifest.components, tag)) continue;
    stylesByComponent[tag] = { path, source: sources[path] ?? "" };
  }
  const styles = manifest.styles.map((path) => ({ path, source: sources[path] ?? "" }));
  // Section components count as sections when the runtime looks for places to insert one.
  const sectionTags = Object.keys(components).filter((tag) => isSectionTemplate(components[tag]));
  return { pages, pagePaths, components, componentPaths, styles, componentStyles: stylesByComponent, assets, sectionTags, route, context, selectNode, selectText };
}

function routeCandidate(manifest: NativeManifest, href: string) {
  if (!href.startsWith("#")) return undefined;
  const raw = href.slice(1) || "/";
  const next = raw.endsWith("/") ? raw : `${raw}/`;
  return Object.hasOwn(manifest.routes, raw)
    ? raw
    : Object.hasOwn(manifest.routes, next)
      ? next
      : undefined;
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
  pane.append(errorBox, frameHost);
  const editBar = createEditBar(pane, frame);
  const insertControls = createInsertControls(pane, frame, {
    choices: () => handlers.insertChoices?.() ?? [],
    onInsert: (point, choice) => handlers.onInsert?.(point, choice),
  });

  let manifest: NativeManifest | undefined;
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
  // A load/manifest failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;
  let selectNode: NativeNodeRequest | undefined;
  let selectText: { start: number; end: number } | undefined;

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
    if (!manifest || !ready || !mounted) return;
    const payload = composePayload(manifest, sources, componentStyles, assets, route, alone, context, selectNode, selectText);
    selectNode = undefined;
    selectText = undefined;
    frame.contentWindow?.postMessage(
      { source: "astro-native-preview-host", type: "update", id: ++messageId, payload },
      "*",
    );
  }
  function schedule() {
    if (!manifest) return;
    renderVersion++;
    context = [
      renderVersion,
      route,
      alone ?? "",
      Object.entries(sources).map(([path, source]) => `${path}:${source.length}:${source.charCodeAt(0) || 0}:${source.charCodeAt(source.length - 1) || 0}`).join("|"),
      Object.keys(assets).join("|"),
    ].join("\n");
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(post);
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; route?: string; context?: string } | undefined;
    if (data?.source !== "astro-native-preview") return;
    // Typed text is checked against the current source, so it counts even
    // when a render was requested since.
    if (data.type === "text-edit" && manifest) {
      const raw = data as unknown as Record<string, unknown>;
      if (typeof raw.path !== "string" || !nativeManifestPaths(manifest).includes(raw.path)) return;
      if (typeof raw.before !== "string" || typeof raw.after !== "string" || raw.after.length > 100_000) return;
      if (!Array.isArray(raw.node) || raw.node.length > 500 || !raw.node.every((index) => Number.isInteger(index) && index >= 0)) return;
      handlers.onTextEdit?.({ path: raw.path, node: raw.node as number[], before: raw.before, after: raw.after });
      return;
    }
    if (data.type !== "ready" && data.context !== context) {
      if (data.type === "select" && (data as { reason?: unknown }).reason === "click") staleClick = true;
      return;
    }
    if (data.type === "ready") {
      ready = true;
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
    // A link click inside the preview (including inside shadow roots) navigates
    // the preview only, keeping the current source edits untouched.
    if (data.type === "route" && typeof data.route === "string" && manifest) followRoute(`#${data.route}`);
    if (data.type === "insert-points" && manifest) {
      const raw = data as unknown as { path?: unknown; points?: unknown };
      const path = raw.path;
      if (typeof path !== "string" || manifest.routes[route] !== path || !Array.isArray(raw.points)) return;
      const indexes = (value: unknown): value is number[] =>
        Array.isArray(value) && value.length <= 500 && value.every((index) => Number.isInteger(index) && index >= 0);
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
    if (data.type === "structure" && manifest) {
      const raw = data as unknown as { path?: unknown; items?: unknown };
      const path = typeof raw.path === "string" && (raw.path === "" || manifest.routes[route] === raw.path) ? raw.path : undefined;
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
    if (data.type === "format") {
      const format = (data as { format?: unknown }).format;
      if (format === "strong" || format === "em") handlers.onFormat?.(format);
      return;
    }
    if (data.type === "move") {
      const direction = (data as { direction?: unknown }).direction;
      if (direction === "up" || direction === "down") handlers.onMove?.(direction);
      return;
    }
    if (data.type === "selection-rect") {
      const rect = readRect((data as { rect?: unknown }).rect);
      if (rect) editBar.move(rect);
      return;
    }
    if (data.type === "select" && manifest) {
      const raw = data as unknown as {
        path?: unknown;
        tag?: unknown;
        text?: unknown;
        selectors?: unknown;
        reason?: unknown;
        node?: unknown;
        link?: unknown;
        rect?: unknown;
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
      if (typeof raw.path !== "string" || !nativeManifestPaths(manifest).includes(raw.path)) return;
      const allowedSelectorPaths = new Set([...nativeManifestPaths(manifest), ...Object.values(componentStyles)]);
      const selectors = Array.isArray(raw.selectors)
        ? raw.selectors.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const path = (item as { path?: unknown }).path;
          const selector = (item as { selector?: unknown }).selector;
          const ruleIndex = (item as { ruleIndex?: unknown }).ruleIndex;
          if (typeof path !== "string" || typeof selector !== "string" || !allowedSelectorPaths.has(path)) return [];
          return [{
            path,
            selector,
            ruleIndex: typeof ruleIndex === "number" && Number.isFinite(ruleIndex) ? ruleIndex : undefined,
          }];
        }).slice(0, 50)
        : [];
      handlers.onSelect?.({
        path: raw.path,
        tag: typeof raw.tag === "string" ? raw.tag : "",
        text: typeof raw.text === "string" ? raw.text : "",
        reason,
        selectors,
        node: Array.isArray(raw.node) && raw.node.length <= 500 &&
          raw.node.every((index) => Number.isInteger(index) && index >= 0)
          ? raw.node as number[]
          : undefined,
        link: typeof raw.link === "string" ? raw.link : undefined,
        rect: readRect(raw.rect),
      });
      return;
    }
    if (data.type === "component-styles" && manifest) {
      const raw = data as unknown as { tags?: unknown };
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => typeof tag === "string" && Object.hasOwn(manifest!.components, tag))
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
  function readTextSelection(raw: unknown): NativeTextSelection | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const value = raw as Record<string, unknown>;
    if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || typeof value.text !== "string") return undefined;
    const start = value.start as number;
    const end = value.end as number;
    if (start < 0 || end <= start || value.text.length > 100_000) return undefined;
    const wrappers = Array.isArray(value.wrappers)
      ? value.wrappers.filter((name): name is string => typeof name === "string").slice(0, 50)
      : [];
    return { start, end, text: value.text, wrappers };
  }
  function followRoute(href: string) {
    if (!manifest) return false;
    const candidate = routeCandidate(manifest, href);
    if (!candidate) return false;
    if (candidate !== route) {
      route = candidate;
      alone = undefined;
      insertControls.clear();
      clearSelection();
      schedule();
    }
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
    /** Show the pane and adopt a manifest. Idempotent for the same manifest. */
    activate(next: NativeManifest) {
      manifest = next;
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
      if (manifest && input.component && Object.hasOwn(manifest.components, input.component)) {
        // The page already on show wins; then any page that uses the component; else the component alone.
        const tag = input.component;
        const uses = (routePath: string) => routeUsesTag(manifest!, sources, routePath, tag);
        const next = alone !== tag && Object.hasOwn(manifest.routes, route) && uses(route)
          ? route
          : Object.keys(manifest.routes).find(uses) ?? componentRoute(tag);
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
      } else if (input.route && manifest && Object.hasOwn(manifest.routes, input.route) && input.route !== route) {
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
    /** Select this element once the next update (the one carrying an edit) has rendered. */
    selectAfterUpdate(request: NativeNodeRequest | undefined) {
      selectNode = request;
    },
    /** Re-select this text range (offsets into the selected element's text) after the next update. */
    selectTextAfterUpdate(range: { start: number; end: number } | undefined) {
      selectText = range;
    },
    /** Whether `href` (a `#route` link) can be followed in the preview. */
    canFollow(href: string) {
      return Boolean(manifest && routeCandidate(manifest, href));
    },
    /** Navigate the preview to a `#route` link; the current source edits stay. */
    follow(href: string) {
      return followRoute(href);
    },
    /** Render the current sources again, e.g. to drop typed text that was not applied. */
    refresh() {
      schedule();
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
    deactivate() {
      if (!mounted) return;
      mounted = false;
      manifest = undefined;
      componentStyles = {};
      loadError = false;
      insertControls.clear();
      clearSelection();
      handlers.onStructure?.(undefined);
      pane.remove();
      host.classList.remove("has-preview");
      showBanner(undefined, false);
    },
    isActive() {
      return mounted;
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      editBar.destroy();
      insertControls.destroy();
      pane.remove();
      host.classList.remove("has-preview");
    },
  };
}

export type NativePreview = ReturnType<typeof createNativePreview>;
