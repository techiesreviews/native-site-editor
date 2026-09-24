import { node } from "../ui/dom";
import {
  nativeDefaultRoute,
  nativeManifestPaths,
  type NativeManifest,
} from "../native-manifest";
import "./native-preview.css";

// Browser-native preview: a persistent sandboxed iframe that renders plain
// `src/pages/*.html` routes and custom elements defined under `src/components/`
// (flat `<name>.html` or one folder per component, `<name>/<name>.html`) from
// in-memory source, patched over `postMessage` and never reloaded per edit.
//
// This is the editor's only preview: a sandboxed frame rendered in place. It
// deliberately supports NO arbitrary page JavaScript: `<script>`, `on*`
// handlers, and `javascript:` URLs are stripped before render. It has no source
// position mapping, so visual selection opens the owning page/component file and
// matching rendered CSS rules, but does not claim exact HTML source offsets.
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
  route?: string;
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
}

interface NativePreviewHandlers {
  onSelect?: (selection: NativePreviewSelection) => void;
  onComponentStyles?: (tags: string[]) => void;
}

function composePayload(
  manifest: NativeManifest,
  sources: Record<string, string>,
  componentStyles: Record<string, string>,
  route: string,
  context: string,
) {
  const pages: Record<string, string> = {};
  const pagePaths: Record<string, string> = {};
  for (const [routePath, filePath] of Object.entries(manifest.routes))
    pagePaths[routePath] = filePath;
  for (const [routePath, filePath] of Object.entries(manifest.routes))
    pages[routePath] = sources[filePath] ?? "";
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
  return { pages, pagePaths, components, componentPaths, styles, componentStyles: stylesByComponent, route, context };
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

  let manifest: NativeManifest | undefined;
  let sources: Record<string, string> = {};
  let componentStyles: Record<string, string> = {};
  let route = "/";
  let context = "";
  let renderVersion = 0;
  let ready = false;
  let mounted = false;
  let rafHandle = 0;
  let messageId = 0;
  // A load/manifest failure (frame hidden) outranks a transient runtime error
  // (banner only), so runtime "clear-error" must not wipe a hard load error.
  let loadError = false;

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
    const payload = composePayload(manifest, sources, componentStyles, route, context);
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
      Object.entries(sources).map(([path, source]) => `${path}:${source.length}:${source.charCodeAt(0) || 0}:${source.charCodeAt(source.length - 1) || 0}`).join("|"),
    ].join("\n");
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(post);
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return;
    const data = event.data as { source?: string; type?: string; route?: string; context?: string } | undefined;
    if (data?.source !== "astro-native-preview") return;
    if (data.type !== "ready" && data.context !== context) return;
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
    if (data.type === "route" && typeof data.route === "string" && manifest) {
      const candidate = routeCandidate(manifest, `#${data.route}`);
      if (candidate && candidate !== route) {
        route = candidate;
        clearSelection();
        schedule();
      }
    }
    if (data.type === "select" && manifest) {
      const raw = data as unknown as {
        path?: unknown;
        tag?: unknown;
        text?: unknown;
        selectors?: unknown;
        reason?: unknown;
      };
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
        reason: raw.reason === "refresh" ? "refresh" : "click",
        selectors,
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
  function postClearSelection() {
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "clear-selection" }, "*");
  }
  function clearSelection() {
    postClearSelection();
    handlers.onSelect?.({ path: "", tag: "", text: "", reason: "click", selectors: [] });
  }

  return {
    /** Show the pane and adopt a manifest. Idempotent for the same manifest. */
    activate(next: NativeManifest) {
      manifest = next;
      route = Object.hasOwn(next.routes, route) ? route : nativeDefaultRoute(next);
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
      if (input.route && manifest && Object.hasOwn(manifest.routes, input.route)) route = input.route;
      schedule();
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
      clearSelection();
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
      pane.remove();
      host.classList.remove("has-preview");
    },
  };
}

export type NativePreview = ReturnType<typeof createNativePreview>;
