// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Shared plumbing: the editor's deps, the mode's state, the frame's
// measurements (cb14-frame.js) as a tree of the template's parts, what each
// part is in template terms (fixed, a slot, an items slot, a nested
// component), where a block may go, and the writes to the template file:
// every change is one guarded range edit of components/<tag>/<tag>.html in
// the code pane, so it is one undo step and the code pane shows it at once.

import type { Cb14Host, Cb14Variant } from "./cb14";
import { cb14Variant } from "./cb14";
import { locateNativeElement, locateNativeElementRange } from "../native-source-location";
import { setAttributeEdit } from "../native-structure";
import { componentUsage, descendants, parseSource } from "../page-builder/component-model";
import { nativePageBody } from "../../shared/native-project";
import { mediaImageMarkup } from "../page-builder/media-markup";

export const state: { host?: Cb14Host } = {};
export const deps = () => state.host!.deps;
export const variant: Cb14Variant = cb14Variant();
export const VARIANT_NAMES: Record<Cb14Variant, string> = { A: "A · In place on the page", B: "B · Isolated canvas", C: "C · Split" };

// ---- DOM helpers. ----
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
}
export function btn(text: string, run: (event: MouseEvent) => void, cls = "cb14-btn") {
  const out = el("button", cls, text);
  out.type = "button";
  out.addEventListener("click", run);
  return out;
}
export const isTyping = () => {
  const active = document.activeElement as HTMLElement | null;
  return Boolean(active && (active.matches("input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']") || active.closest(".monaco-editor")));
};
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- The mode. ----
export interface Step { tag: string; path?: number[] }
export interface Mode {
  /** The page file the preview shows. */
  page: string;
  /** The instance on the page the mode started from (A draws on it). */
  topNode?: number[];
  /** The component edited, then each nested one drilled into (its template path in its parent's template). */
  chain: Step[];
  /** A: placeholders (the template's fallbacks) or the page's own slot content. */
  show: "fallbacks" | "page";
  /** B: the page whose instance fills the slots (none: placeholders). */
  contentFrom?: string;
  /** B: the stage width (none: full). */
  width?: number;
  /** C: the page in the left pane. */
  splitPage?: string;
}
export const mode: { now?: Mode } = {};
export const site = () => deps().site();
export const tagNow = () => mode.now?.chain.at(-1)?.tag;
export const templatePathOf = (tag: string | undefined) => (tag ? site()?.components[tag] : undefined);
export const templatePath = () => templatePathOf(tagNow());
export const isComponentTag = (tag: string) => Boolean(site() && Object.hasOwn(site()!.components, tag));
export const label = (tag: string) => `<${tag}>`;

// ---- The frame. ----
export type Rect = [number, number, number, number];
export interface RawSlot { name: string; assigned: number; fb: number; drop: boolean; showsPage: boolean }
export interface PageItem { t: string; r: Rect; txt: string; hd: string; n: number }
export interface RawNode { p: number[]; t: string; c: string; r: Rect; row: boolean; txt: string; hd: string; inst: boolean; hid: boolean; inSlot: boolean; slot?: RawSlot; pageItems?: PageItem[] }
export interface Dump { ok: boolean; tag?: string; host?: Rect; hd?: string; chain?: { tag: string; r: Rect }[]; nodes?: RawNode[]; vw: number; vh: number; sy?: number }
export interface TNode extends RawNode { key: string; parent?: TNode; kids: TNode[] }

export const frame = () => document.querySelector<HTMLIFrameElement>(".native-preview-frame");
export function frameBox() {
  const f = frame();
  if (!f) return undefined;
  const r = f.getBoundingClientRect();
  return { left: r.left + f.clientLeft, top: r.top + f.clientTop, width: f.clientWidth, height: f.clientHeight };
}
export function toFrame(x: number, y: number) {
  const box = frameBox();
  if (!box) return undefined;
  const fx = x - box.left, fy = y - box.top;
  return { x: fx, y: fy, inside: fx >= 0 && fy >= 0 && fx <= box.width && fy <= box.height };
}

let ids = 0;
const waiting = new Map<number, (data: unknown) => void>();
export interface FramePress { phase: "start" | "move" | "end" | "cancel"; x: number; y: number; p?: number[]; t?: string }
export const frameEvents: { dump?: (model: Model) => void; hover?: (p: number[] | null, slot: number[] | null) => void; key?: (key: string) => void; press?: (press: FramePress) => void } = {};
/** The template's root element: selected by path (a click on it would select the instance on the page). */
function selectRoot(p: number[] | null | undefined) {
  const path = templatePath();
  if (path && p) deps().preview()?.selectNode({ path, node: p });
}
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; id?: number; type?: string; dump?: Dump; p?: number[] | null; slot?: number[] | null; key?: string } | undefined;
  if (data?.source !== "cb14-proto") return;
  if (data.type === "hover") { frameEvents.hover?.(data.p ?? null, data.slot ?? null); return; }
  if (data.type === "key") { frameEvents.key?.(data.key ?? ""); return; }
  if (data.type === "root") selectRoot(data.p);
  if (data.type === "press") { frameEvents.press?.(data as unknown as FramePress); return; }
  if (data.type === "dump" && data.dump) {
    const model = new Model(data.dump);
    latest.model = model;
    if (data.id === undefined) frameEvents.dump?.(model);
  }
  if (data.id !== undefined) { waiting.get(data.id)?.(data.type === "dump" ? latest.model : data); waiting.delete(data.id); }
});
export function framePost(op: string, extra: Record<string, unknown> = {}) {
  frame()?.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "cb14", op, ...extra }, "*");
}
function frameAsk<T>(op: string, extra: Record<string, unknown> = {}): Promise<T | undefined> {
  const f = frame();
  if (!f?.contentWindow) return Promise.resolve(undefined);
  const id = ++ids;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(undefined); }, 1500);
    waiting.set(id, (data) => { clearTimeout(timer); resolve(data as T); });
    f.contentWindow!.postMessage({ source: "astro-native-preview-host", type: "cb14", op, id, ...extra }, "*");
  });
}
export const measure = () => frameAsk<Model>("dump");
export const latest: { model?: Model } = {};
/** Selects the element at a template path in the instance being edited (a click the runtime handles). */
export const frameSelect = (p: number[]) => frameAsk<{ ok: boolean }>("select", { p });

export class Model {
  ok: boolean;
  byKey = new Map<string, TNode>();
  roots: TNode[] = [];
  host?: Rect;
  hd: string;
  chain: { tag: string; r: Rect }[];
  tag?: string;
  constructor(dump: Dump) {
    this.ok = dump.ok;
    this.host = dump.host;
    this.hd = dump.hd ?? "";
    this.chain = dump.chain ?? [];
    this.tag = dump.tag;
    for (const raw of dump.nodes ?? []) {
      const node: TNode = { ...raw, key: raw.p.join("."), kids: [] };
      this.byKey.set(node.key, node);
      const parent = this.byKey.get(raw.p.slice(0, -1).join("."));
      if (parent) { node.parent = parent; parent.kids.push(node); } else this.roots.push(node);
    }
  }
  get(path: readonly number[]) { return this.byKey.get(path.join(".")); }
  all() { return [...this.byKey.values()]; }
}

// ---- What a part of the template is. ----
export const CONTAINERS = new Set(["section", "div", "article", "aside", "header", "footer", "nav", "figure", "main", "ul", "ol"]);
/** An items slot: unnamed, named for items, or whose fallback holds a component instance (ticket 04 rule 10). */
export const itemsNames = new Set<string>();
export function isItemsSlot(n: TNode) {
  if (!n.slot) return false;
  return !n.slot.name || itemsNames.has(n.slot.name) || /items?|cards?|list/.test(n.slot.name) || n.kids.some((k) => k.inst || k.t.includes("-")) || n.kids.length > 1;
}
export const slotOf = (n: TNode | undefined): TNode | undefined => { for (let at = n?.parent; at; at = at.parent) if (at.slot) return at; return undefined; };
const pretty = (tag: string) => tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
export function nodeName(n: TNode | undefined): string {
  if (!n) return "Template";
  const t = n.t;
  if (n.slot) return isItemsSlot(n) ? `items slot${n.slot.name ? ` “${n.slot.name}”` : " (unnamed)"}` : `slot “${n.slot.name}”`;
  if (t === "section") return "Section";
  if (t === "div") return /\bcards\b/.test(n.c) ? "Div (grid)" : /\bflow\b/.test(n.c) ? "Div (stack)" : "Div";
  if (/^h[1-6]$/.test(t)) return `Heading ${t}`;
  if (t === "p") return "Paragraph";
  if (t === "a") return /\bbtn\b/.test(n.c) ? "Button" : "Link";
  if (t === "img" || t === "picture") return "Image";
  if (t.includes("-")) return `${pretty(t)} <${t}>`;
  return `<${t}>`;
}
/** The selection in template terms, for the readout. */
export function describePart(n: TNode | undefined) {
  if (!n) return "nothing in the template";
  if (n.slot) return `${nodeName(n)} itself`;
  const slot = slotOf(n);
  const what = `<${n.t}${n.c ? `.${n.c.split(/\s+/)[0]}` : ""}>`;
  if (n.inst && !slot) return `fixed nested component ${what}`;
  if (!slot) return `fixed ${what}`;
  if (isItemsSlot(slot)) return `items slot “${slot.slot!.name || "unnamed"}” › fallback ${what}${n.inst ? " (its card component)" : ""}`;
  return `slot “${slot.slot!.name}” › fallback ${what}`;
}
export function templateNodeOfSelection(model = latest.model) {
  const s = deps().selection();
  const path = templatePath();
  if (!s || !path || s.path !== path || !s.node || !model) return undefined;
  return model.get(s.node);
}

// ---- Where a block may go (ticket 10, with ticket 04's items slots). ----
export type BlockKind = "section" | "div" | "image" | "heading" | "paragraph" | "button";
export const BLOCKS: { kind: BlockKind; name: string }[] = [
  { kind: "section", name: "Section" },
  { kind: "div", name: "Div" },
  { kind: "image", name: "Image" },
  { kind: "heading", name: "Heading" },
  { kind: "paragraph", name: "Paragraph" },
  { kind: "button", name: "Button" },
];
export interface Box { node?: TNode } // no node: the template's top level
export function allowed(kind: BlockKind, box: Box): { ok: boolean; reason?: string } {
  const n = box.node;
  if (kind === "section") return { ok: false, reason: "A Section is a page band; inside a component, build with a Div." };
  if (!n) return { ok: false, reason: "Blocks go inside the template's own element, not beside it." };
  // Round 2 (Lex): blocks may go into any slot's fallback, named slots too.
  if (n.slot) return { ok: true };
  if (n.inst) return { ok: false, reason: `<${n.t}> is its own component: open it (◇ ›) to build inside its template.` };
  if (CONTAINERS.has(n.t)) {
    return { ok: true };
  }
  return { ok: false, reason: "Not a container." };
}
export interface Target { box: Box; index: number; ok: boolean; reason?: string }
export const itemsOf = (box: Box): TNode[] => (box.node ? box.node.kids : latest.model?.roots ?? []);
export const visibleNode = (n: TNode) => !n.hid && n.r[2] + n.r[3] > 0;
export function boxName(box: Box) { return box.node ? nodeName(box.node) : "the template"; }
export function whereText(t: Target) {
  const items = itemsOf(t.box);
  const after = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
  const before = items.find((n) => n.p.at(-1)! >= t.index);
  const place = !items.length ? "empty" : after ? `after ${nodeName(after).replace(/ <.*>$/, "")}` : before ? `before ${nodeName(before).replace(/ <.*>$/, "")}` : "at the end";
  return `Into ${boxName(t.box)} › ${place}`;
}
/** Heading level from position: h2 at the template's top, h3 inside a Div or an items slot, capped at h4. */
export function headingLevel(box: Box) {
  let level = 2;
  for (let n = box.node; n; n = n.parent) if (n.t === "div" || isItemsSlot(n) || n.t === "article") level++;
  return Math.min(Math.max(level, 2), 4);
}
export const PLACEHOLDER = "images/placeholder.svg";
export function blockMarkup(kind: BlockKind, box: Box) {
  switch (kind) {
    case "section": return `<section class="flow"></section>`;
    case "div": return `<div class="flow"></div>`;
    case "heading": { const l = headingLevel(box); return `<h${l}>New heading</h${l}>`; }
    case "paragraph": return `<p>New paragraph.</p>`;
    case "button": return `<a class="btn" href="#">Button</a>`;
    case "image": return mediaImageMarkup({ path: PLACEHOLDER, alt: "", width: 640, height: 400 });
  }
}

// ---- Source edits of the template. ----
export interface Edit { start: number; end: number; text: string; original: string }
function indentAt(source: string, pos: number) {
  const line = source.lastIndexOf("\n", pos - 1) + 1;
  const lead = source.slice(line, pos);
  return /^[ \t]*$/.test(lead) ? lead : "";
}
const reindent = (markup: string, indent: string) => markup.replace(/\n/g, `\n${indent}`);
function childRanges(source: string, parent: readonly number[]) {
  const out = [];
  for (let k = 0; k < 500; k++) {
    const range = parent.length ? locateNativeElementRange(source, [...parent, k]) : locateNativeElementRange(source, [k]);
    if (!range) break;
    out.push(range);
  }
  return out;
}
/** Markup among a parent's children (a slot's fallback included). */
export function insertion(source: string, parentPath: readonly number[], index: number, markup: string): Edit | undefined {
  const kids = childRanges(source, parentPath);
  const next = kids[index], prev = kids[index - 1];
  if (next) {
    const ind = indentAt(source, next.start);
    return { start: next.start, end: next.start, text: `${reindent(markup, ind)}${ind ? `\n${ind}` : ""}`, original: "" };
  }
  if (prev) {
    const ind = indentAt(source, prev.start);
    return { start: prev.end, end: prev.end, text: `\n${ind}${reindent(markup, ind)}`, original: "" };
  }
  const parent = locateNativeElementRange(source, [...parentPath]);
  if (!parent?.close) return undefined;
  const outer = indentAt(source, parent.start), ind = `${outer}  `;
  const inner = source.slice(parent.tag.end, parent.close.start);
  const start = /^\s*$/.test(inner) ? parent.tag.end : parent.close.start;
  return { start, end: parent.close.start, text: `\n${ind}${reindent(markup, ind)}\n${outer}`, original: source.slice(start, parent.close.start) };
}
/** A block moved to another place in the template, as one edit. */
export function moveEdit(source: string, from: number[], parentPath: readonly number[], index: number): Edit | undefined {
  const moving = locateNativeElementRange(source, from);
  if (!moving) return undefined;
  const lineStart = source.lastIndexOf("\n", moving.start - 1) + 1;
  const lead = source.slice(lineStart, moving.start);
  const ws = /^[ \t]*$/.test(lead);
  const removeStart = ws && lineStart > 0 ? lineStart - 1 : moving.start;
  const removeEnd = moving.end;
  const markup = ws && lead ? source.slice(moving.start, moving.end).replace(new RegExp(`\\n${lead}`, "g"), "\n") : source.slice(moving.start, moving.end);
  const ins = insertion(source, parentPath, index, markup);
  if (!ins || (ins.start > removeStart && ins.start < removeEnd)) return undefined;
  if (ins.end <= removeStart) {
    const text = ins.text + source.slice(ins.end, removeStart);
    return { start: ins.start, end: removeEnd, text, original: source.slice(ins.start, removeEnd) };
  }
  const text = source.slice(removeEnd, ins.start) + ins.text;
  return { start: removeStart, end: ins.end, text, original: source.slice(removeStart, ins.end) };
}
/** The moved block's path after the move. */
export function pathAfterMove(from: readonly number[], parent: readonly number[], index: number) {
  const oldParent = from.slice(0, -1), oldIndex = from.at(-1)!;
  const out = [...parent];
  if (out.length > oldParent.length && oldParent.every((s, i) => out[i] === s) && out[oldParent.length] > oldIndex) out[oldParent.length]--;
  const same = oldParent.length === parent.length && oldParent.every((s, i) => parent[i] === s);
  return [...out, index - (same && oldIndex < index ? 1 : 0)];
}

/** A slot's fallback becomes fixed: the <slot> tags go, its content stays where it was. */
export function unwrapEdit(source: string, path: number[]): Edit | undefined {
  const r = locateNativeElementRange(source, path);
  if (!r?.close || r.tag.name !== "slot") return undefined;
  let inner = source.slice(r.tag.end, r.close.start);
  const ind = indentAt(source, r.start);
  if (/^\s*\n/.test(inner)) inner = inner.replace(/^\s*\n/, "").replace(/\n[ \t]*$/, "").replace(new RegExp(`(^|\\n)${ind}  `, "g"), `$1${ind}`).replace(/^[ \t]+/, "");
  if (!inner.trim()) return removeEdit(source, path);
  return { start: r.start, end: r.end, text: inner, original: source.slice(r.start, r.end) };
}
/** An element (a slot with its fallback) goes, with its line when it had one. */
export function removeEdit(source: string, path: number[]): Edit | undefined {
  const r = locateNativeElementRange(source, path);
  if (!r) return undefined;
  const lineStart = source.lastIndexOf("\n", r.start - 1) + 1;
  const whole = /^[ \t]*$/.test(source.slice(lineStart, r.start)) && /^[ \t]*(\n|$)/.test(source.slice(r.end));
  const start = whole && lineStart > 0 ? lineStart - 1 : r.start;
  const end = r.end;
  return { start, end, text: "", original: source.slice(start, end) };
}
/** A fixed part becomes a slot: `<slot name="…">` around the whole element (the settled rule). */
export function wrapEdit(source: string, path: number[], name: string): Edit | undefined {
  const r = locateNativeElementRange(source, path);
  if (!r) return undefined;
  const original = source.slice(r.start, r.end);
  return { start: r.start, end: r.end, text: `<slot name="${name}">${original}</slot>`, original };
}
export function renameEdit(source: string, path: number[], name: string): Edit | undefined {
  const tag = locateNativeElement(source, path);
  if (!tag || tag.name !== "slot") return undefined;
  const e = setAttributeEdit(source, tag, "name", name || undefined);
  return { start: e.start, end: e.end, text: e.text, original: source.slice(e.start, e.end) };
}
/** The name a new slot takes from its role (ticket 03 rule 4), numbered on repeats. */
export function roleName(n: TNode, taken: Set<string>) {
  const base = /^h[1-6]$/.test(n.t) ? "title" : n.t === "p" ? "text" : n.t === "img" || n.t === "picture" ? "image" : n.t === "a" ? "link" : n.t === "ul" || n.t === "ol" ? "list" : n.t.includes("-") ? n.t.replace(/^[a-z]+-/, "") : "part";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
export function slotNames(model = latest.model) { return new Set(model?.all().filter((n) => n.slot).map((n) => n.slot!.name) ?? []); }
/** Names made valid as typed (ticket 04): lowercase, spaces become hyphens, the rest dropped. */
export function normaliseName(value: string, final = false) {
  const out = value.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^[^a-z]+/, "");
  return final ? out.replace(/-+$/, "") : out;
}

/** The last write, for the readout. */
export const lastEdit: { text?: string; at?: number } = {};
const lineCol = (source: string, at: number) => { const lines = source.slice(0, at).split("\n"); return `${lines.length}:${lines.at(-1)!.length + 1}`; };
/**
 * One write to the open template: a guarded range edit through the code pane
 * (one undo step), with `companion` undone and redone with it.
 */
export function writeTemplate(edit: Edit, what: string, select?: number[], companion?: { undo: () => void; redo: () => void }) {
  const path = templatePath();
  const editor = deps().editor();
  if (!path || !editor || deps().currentPath() !== path) { deps().announce("The template is not open in the code pane."); return false; }
  const source = deps().sources()[path] ?? "";
  if (source.slice(edit.start, edit.end) !== edit.original) { deps().announce("The template changed meanwhile; nothing written."); return false; }
  if (select) deps().preview()?.selectAfterUpdate({ path, node: select });
  editor.replaceActiveRange({ path, start: edit.start, end: edit.end, expected: edit.original, text: edit.text }, false, companion);
  lastEdit.at = Date.now();
  const usage = usageOf(tagNow()!);
  lastEdit.text = `${what} · ${path} ${lineCol(source, edit.start)}–${lineCol(source, edit.end)} (bytes ${edit.start}–${edit.end}, −${edit.original.length} +${edit.text.length}) · 1 undo step · reaches ${usage.instances} instance${usage.instances === 1 ? "" : "s"} on ${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}`;
  // The code pane shows the change.
  setTimeout(() => {
    const now = deps().sources()[path] ?? "";
    const end = Math.min(edit.start + edit.text.length, now.length);
    if (deps().currentPath() === path) deps().editor()?.revealRange(path, edit.start, Math.max(end, edit.start));
  }, 60);
  return true;
}

/** A change of the template the prototype did not write (typing in the preview, Undo, Redo, the code pane). */
export function noticeChange(path: string, before: string, after: string) {
  if (Date.now() - (lastEdit.at ?? 0) < 700) return;
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let z = 0;
  while (z < before.length - a && z < after.length - a && before[before.length - 1 - z] === after[after.length - 1 - z]) z++;
  const removed = before.length - a - z, added = after.length - a - z;
  const usage = usageOf(tagNow()!);
  lastEdit.text = `Changed outside the prototype's chips (typing in place, Undo/Redo or code) · ${path} ${lineCol(before, a)}–${lineCol(before, before.length - z)} (bytes ${a}–${before.length - z}, −${removed} +${added}) · reaches ${usage.instances} instance${usage.instances === 1 ? "" : "s"} on ${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"}`;
}

// ---- Used on. ----
export function usageOf(tag: string) {
  const s = site();
  if (!s) return { instances: 0, pages: [], components: [] } as ReturnType<typeof componentUsage>;
  return componentUsage(s, deps().sources(), tag, (html) => { const b = nativePageBody(html); return html.slice(b.start, b.end); });
}
/** The markup inside the first `tag` instance written on a page (its slot content), if any. */
export function instanceContent(file: string, tag: string) {
  const html = deps().sources()[file];
  if (html === undefined) return undefined;
  const body = nativePageBody(html);
  const found = [...descendants(parseSource(html, body.start, body.end))].find((e) => e.name === tag);
  if (!found?.close) return undefined;
  return html.slice(found.tag.end, found.close.start);
}
export function pageName(file: string) { return deps().pageLabel(file) || file; }

// ---- The readout (bottom left). ----
let readoutEl: HTMLElement | undefined;
export function readout(title: string, lines: string[], tone: "idle" | "ok" | "refused" | "done" = "idle") {
  if (!readoutEl) {
    readoutEl = el("div", "cb14-readout");
    readoutEl.setAttribute("role", "status");
    document.body.append(readoutEl);
  }
  readoutEl.dataset.tone = tone;
  readoutEl.replaceChildren(el("div", "cb14-readout__head", `PROTOTYPE cb14 · ${title}`), ...lines.map((line) => el("div", "cb14-readout__line", line)));
}
