// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Live views of a page from the editor's current sources, in a small
// sandboxed frame (cb14-mini-frame.js): B's "Used on" thumbnails and C's page pane.
// A view re-renders whenever a template, a page or a stylesheet changes, so
// one edit of the template shows on every page that uses it at once.

import { deps, el, site } from "./cb14-core";

const MINI_URL = new URL("./cb14-mini-frame.js", import.meta.url).href;
const DOC = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="${MINI_URL}" defer></script></head><body></body></html>`;

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
function resolve(from: string, href: string) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return undefined;
  const base = new URL(href, `https://site.invalid/${from}`);
  return decodeURI(base.pathname).replace(/^\//, "");
}
/** A stylesheet with its @imports written in place (each file keeps its own @layer blocks). */
function inlineCss(path: string, seen = new Set<string>()): string {
  if (seen.has(path)) return "";
  seen.add(path);
  const css = deps().sources()[path];
  if (css === undefined) return "";
  return css.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/g, (_all, href: string) => {
    const target = resolve(path, href);
    return target ? `\n/* ${target} */\n${inlineCss(target, seen)}\n` : "";
  });
}
export function pagePayload(file: string, focus: string) {
  const sources = deps().sources();
  const html = sources[file] ?? "";
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  const css = [...head.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)]
    .map((m) => /href=["']([^"']+)["']/i.exec(m[0])?.[1])
    .map((href) => (href ? resolve(file, href) : undefined))
    .filter((p): p is string => Boolean(p))
    .map((p) => inlineCss(p)).join("\n");
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html).replace(/<script[\s\S]*?<\/script>/gi, "");
  const components: Record<string, { html: string; css: string }> = {};
  for (const [tag, path] of Object.entries(site()?.components ?? {})) {
    components[tag] = { html: sources[path] ?? "", css: sources[path.replace(/\.html$/, ".css")] ?? "" };
  }
  return { body, css, components, focus, page: dirOf(file) };
}

export interface MiniView {
  wrap: HTMLElement;
  frame: HTMLIFrameElement;
  file: string;
  render(force?: boolean): void;
  highlight(path: number[] | null): void;
  destroy(): void;
}
const views = new Set<MiniView>();
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; type?: string; path?: number[] | null; page?: boolean } | undefined;
  if (data?.source !== "cb14-mini") return;
  for (const view of views) {
    if (view.frame.contentWindow !== event.source) continue;
    if (data.type === "ready") view.render(true);
    else (view as MiniView & { onMessage?: (d: typeof data) => void }).onMessage?.(data);
  }
});

/**
 * A view of `file` at `width` CSS px, scaled by `scale`, showing the
 * instances of `focus` outlined. `interactive`: clicks pick template parts.
 */
export function miniView(file: string, focus: () => string, opts: { width: number; height: number; scale: number; interactive?: boolean; offset?: number; onPick?: (path: number[] | null, page: boolean) => void; onOpen?: () => void }): MiniView {
  const wrap = el("div", "cb14-mini");
  const frameEl = el("iframe", "cb14-mini__frame");
  frameEl.setAttribute("sandbox", "allow-scripts");
  frameEl.setAttribute("tabindex", "-1");
  frameEl.title = `Live view of ${file}`;
  Object.assign(frameEl.style, { width: `${opts.width}px`, height: `${opts.height}px`, transform: `scale(${opts.scale})` });
  Object.assign(wrap.style, { width: `${opts.width * opts.scale}px`, height: `${opts.height * opts.scale}px` });
  frameEl.srcdoc = DOC;
  wrap.append(frameEl);
  let last = "";
  let highlighted: number[] | null = null;
  const view: MiniView & { onMessage?: (d: { type?: string; path?: number[] | null; page?: boolean }) => void } = {
    wrap, frame: frameEl, file,
    render(force = false) {
      const payload = pagePayload(view.file, focus());
      const key = JSON.stringify(payload);
      if (!force && key === last) return;
      last = key;
      frameEl.contentWindow?.postMessage({ source: "cb14-mini-host", type: "render", interactive: Boolean(opts.interactive), offset: opts.offset ?? 40, ...payload }, "*");
      if (highlighted) view.highlight(highlighted);
    },
    highlight(path) {
      highlighted = path;
      frameEl.contentWindow?.postMessage({ source: "cb14-mini-host", type: "highlight", path }, "*");
    },
    destroy() { views.delete(view); wrap.remove(); },
    onMessage(d) {
      if (d.type === "pick") opts.onPick?.(d.path ?? null, Boolean(d.page));
      if (d.type === "open") opts.onOpen?.();
    },
  };
  views.add(view);
  return view;
}
/** Every live view re-renders from the current sources (cheap when nothing changed). */
export function refreshViews() { for (const view of views) view.render(); }
