// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// Shared plumbing for the prototype: the editor's deps, the preview frame's
// rects (a prototype message in native-preview-runtime.js), writing a
// component through the real draft path, and small UI bits.

import type { Cb04Host } from "./cb04";
import { locateNativeElementRange, parseMarked } from "../native-source-location";
import { tagNameProblem } from "../page-builder/component-model";
import type { NativePreviewSelection } from "../components/native-preview";
import { dedentTail, indentTail } from "./cb04-rule";

export const state: { host?: Cb04Host } = {};
export const deps = () => state.host!.deps;
export const sources = () => deps().sources();
export const takenTags = () => Object.keys(deps().site()?.components ?? {});
export const tagProblem = (tag: string) => tagNameProblem(tag, takenTags());

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
}
export function btn(text: string, run: () => void, cls = "button secondary") {
  const out = el("button", cls, text);
  out.type = "button";
  out.addEventListener("click", run);
  return out;
}

// ---- Toast. ----
let toastEl: HTMLElement | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, action?: { label: string; run: () => void }) {
  toastEl?.remove();
  toastEl = el("div", "cb04-toast");
  toastEl.setAttribute("role", "status");
  toastEl.append(el("span", "", text));
  if (action) toastEl.append(btn(action.label, () => { action.run(); toastEl?.remove(); }, "cb04-toast__action"));
  document.body.append(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.remove(), 12000);
}

// ---- The preview frame. ----
export const frame = () => document.querySelector<HTMLIFrameElement>(".native-preview-frame");
let ids = 0;
const waiting = new Map<number, (rects: (Rect | null)[]) => void>();
export interface Rect { x: number; y: number; w: number; h: number }
/** Variant D: a right-click in the frame (frame viewport coordinates). */
export const frameEvents: { contextmenu?: (x: number, y: number) => void } = {};
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; id?: number; type?: string; x?: number; y?: number; rects?: (Rect | null)[] } | undefined;
  if (data?.source !== "cb04-proto") return;
  if (data.type === "contextmenu") {
    const box = frame()?.getBoundingClientRect();
    if (box) frameEvents.contextmenu?.(box.left + (data.x ?? 0), box.top + (data.y ?? 0));
    return;
  }
  if (data.id === undefined) return;
  waiting.get(data.id)?.(data.rects ?? []);
  waiting.delete(data.id);
});
// Shown in the frame while the prototype runs: an empty Section or Div keeps a drop area's height.
export const FRAME_CSS = "#page section:not(:has(*)), #page div.flow:not(:has(*)) { min-height: 140px; }";
/** Rects (in the editor's viewport) of elements of `path` by node path. */
export function frameRects(path: string, nodes: number[][], extra: Record<string, unknown> = {}): Promise<(Rect | null)[]> {
  const f = frame();
  if (!f?.contentWindow) return Promise.resolve(nodes.map(() => null));
  const id = ++ids;
  const box = f.getBoundingClientRect();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(nodes.map(() => null)); }, 1000);
    waiting.set(id, (rects) => {
      clearTimeout(timer);
      resolve(rects.map((r) => (r ? { x: r.x + box.left, y: r.y + box.top, w: r.w, h: r.h } : null)));
    });
    f.contentWindow!.postMessage({ source: "astro-native-preview-host", type: "cb04", id, path, nodes, css: FRAME_CSS, ...extra }, "*");
  });
}
export const scrollFrame = (dy: number) => frame()?.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "scroll-by", dy }, "*");

// ---- Targets in the page source. ----
export interface Target { path: string; node: number[]; tag: string; source: string; start: number; end: number; outer: string; indent: string }
export function targetAt(path: string, node: number[]): Target | undefined {
  const source = sources()[path];
  if (source === undefined) return;
  const range = locateNativeElementRange(source, node);
  if (!range?.close) return;
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const lead = source.slice(lineStart, range.start);
  return { path, node: [...node], tag: range.tag.name, source, start: range.start, end: range.end, outer: source.slice(range.start, range.end), indent: /^[ \t]*$/.test(lead) ? lead : "" };
}
export const targetOf = (selection: NativePreviewSelection) => (selection.node ? targetAt(selection.path, selection.node) : undefined);

/** Where a new section goes: after the selected section of <main>, else at the end of <main>. */
export function insertionPoint(): { path: string; at: number; node: number[]; indent: string } | undefined {
  const path = deps().currentPath();
  const source = path ? sources()[path] : undefined;
  if (!path || source === undefined) return;
  // Node paths count from the source's own parse (a template's content: no html/head/body).
  const root = parseMarked(source).root;
  const main = root.querySelector("main");
  if (!main) return;
  const pathOf = (node: Element) => {
    const out: number[] = [];
    for (let at: Element = node; ; at = at.parentElement!) {
      const parent: ParentNode = at.parentElement ?? root;
      out.unshift([...parent.children].indexOf(at));
      if (!at.parentElement) break;
    }
    return out;
  };
  const mainPath = pathOf(main);
  const selection = deps().selection();
  if (selection?.path === path && selection.node && selection.node.length > mainPath.length && mainPath.every((n, i) => selection.node![i] === n)) {
    const sectionNode = selection.node.slice(0, mainPath.length + 1);
    const range = locateNativeElementRange(source, sectionNode);
    if (range) {
      const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
      return { path, at: range.end, node: [...mainPath, sectionNode[mainPath.length] + 1], indent: source.slice(lineStart, range.start).replace(/\S.*$/, "") };
    }
  }
  const close = source.lastIndexOf("</main>");
  const lineStart = source.lastIndexOf("\n", close - 1) + 1;
  const mainIndent = source.slice(lineStart, close).replace(/\S.*$/, "");
  return { path, at: lineStart > 0 ? lineStart - 1 : close, node: [...mainPath, main.children.length], indent: `${mainIndent}  ` };
}

/** Puts markup at an insertion point as one plain page edit (no files). */
export function insertMarkup(markup: string, point = insertionPoint()) {
  const editor = deps().editor();
  if (!point || !editor) { deps().announce("Open a page first."); return undefined; }
  const source = sources()[point.path]!;
  deps().preview()?.selectAfterUpdate({ path: point.path, node: point.node });
  editor.replaceActiveRange({ path: point.path, start: point.at, end: point.at, expected: source.slice(point.at, point.at), text: `\n${point.indent}${indentTail(dedentTail(markup), point.indent)}` });
  return point;
}

/**
 * Writes components/<tag>/<tag>.html and .css as drafts and makes one page
 * edit, as one undo step (the real Make component's path, components.ts).
 */
export async function writeComponent(request: { tag: string; html: string; css: string; edit: { path: string; start: number; end: number; text: string }; select: number[] }) {
  const { tag, html, css, edit } = request;
  const before = sources()[edit.path];
  const result = await deps().createFiles([
    { path: `components/${tag}/${tag}.html`, content: html },
    { path: `components/${tag}/${tag}.css`, content: css },
  ]);
  if ("error" in result) { deps().announce(result.error); toast(result.error); return false; }
  const editor = deps().editor();
  const now = sources()[edit.path];
  if (!editor || now === undefined || now !== before || deps().currentPath() !== edit.path) {
    result.receipt.undo();
    toast("The page changed meanwhile; nothing was made.");
    return false;
  }
  deps().preview()?.selectAfterUpdate({ path: edit.path, node: request.select });
  editor.replaceActiveRange({ ...edit, expected: now.slice(edit.start, edit.end) }, false, {
    undo: () => result.receipt.undo(),
    redo: () => void result.receipt.redo(),
  });
  return true;
}

/** Replaces `target` with `instance` (indented for its place) and writes the files. */
export function makeInPlace(target: Target, tag: string, plan: { template: string; css: string; instance: string }) {
  return writeComponent({
    tag, html: plan.template, css: plan.css,
    edit: { path: target.path, start: target.start, end: target.end, text: indentTail(plan.instance, target.indent) },
    select: target.node,
  });
}

/** Places a new instance at the insertion point and writes the files. */
export function makeAndPlace(tag: string, html: string, css: string, instance: string) {
  const point = insertionPoint();
  if (!point) { toast("Open a page first."); return Promise.resolve(undefined); }
  return writeComponent({
    tag, html, css,
    edit: { path: point.path, start: point.at, end: point.at, text: `\n${point.indent}${indentTail(instance, point.indent)}` },
    select: point.node,
  }).then((ok) => (ok ? point : undefined));
}

export function codeView(label: string, text: string) {
  const figure = el("figure", "cb04-code");
  figure.append(el("figcaption", "cb04-code__name", label), el("pre", "cb04-code__text", text));
  return figure;
}

export function nameField(initial: string, onInput: () => void) {
  const wrap = el("label", "cb04-name");
  const label = el("span", "cb04-name__label", "Component name");
  const input = el("input", "cb04-name__input");
  input.type = "text";
  input.value = initial;
  input.autocomplete = "off";
  input.spellcheck = false;
  const tag = el("code", "cb04-name__tag");
  const problem = el("span", "cb04-name__problem");
  const render = () => {
    const name = input.value.trim();
    tag.textContent = `<${name || "…"}>`;
    const why = tagProblem(name);
    problem.textContent = why ?? "";
    problem.hidden = !why;
    wrap.classList.toggle("is-error", Boolean(why));
  };
  input.addEventListener("input", () => { render(); onInput(); });
  render();
  const row = el("span", "cb04-name__row");
  row.append(input, tag);
  wrap.append(label, row, problem);
  return { wrap, input, value: () => input.value.trim(), problem: () => tagProblem(input.value.trim()) };
}

export const KIND_LABEL: Record<string, string> = { text: "Text", image: "Image", link: "Link", list: "List", items: "Items", instance: "Component", content: "Content" };
export const KIND_ICON: Record<string, string> = { text: "T", image: "▣", link: "↗", list: "≡", items: "▦", instance: "◇", content: "▢" };
