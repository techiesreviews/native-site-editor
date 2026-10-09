// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// Shared plumbing: the editor's deps, the frame's measurements (cb12-frame.js),
// the page as a tree of boxes, where each block may go (ticket 10 with the
// ticket 04 amendment), the target under a point, block markup, and the
// writes (one guarded range edit and one undo step each). Plain containers
// use the real nativeMarkupInsertEdit / nativeElementMovePlan; an instance's
// items slot (and moving a sealed instance itself) uses a small raw edit here,
// the one place the prototype bypasses the seal (native-operations.ts:112).

import type { Cb12Host, Cb12Variant } from "./cb12";
import { cb12Variant } from "./cb12";
import { locateNativeElementRange } from "../native-source-location";
import { nativeMarkupInsertEdit } from "../page-builder/native-operations";
import { nativeElementMovePlan } from "../page-builder/native-move-choices";
import { mediaImageMarkup } from "../page-builder/media-markup";

export const state: { host?: Cb12Host } = {};
export const deps = () => state.host!.deps;
export const variant: Cb12Variant = cb12Variant();
/** A's line and label on the canvas (A, D); C's Structure as the precise target (C, D). */
export const lineMode = variant === "A" || variant === "D";
export const treeLed = variant === "C" || variant === "D";

// ---- DOM helpers. ----
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
}
export function btn(text: string, run: () => void, cls = "cb12-btn") {
  const out = el("button", cls, text);
  out.type = "button";
  out.addEventListener("click", run);
  return out;
}
export const isTyping = () => {
  const active = document.activeElement as HTMLElement | null;
  return Boolean(active && (active.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']") || active.closest(".monaco-editor")));
};

// ---- The frame. ----
export type Rect = [number, number, number, number];
export interface RawSlot { name: string; a: number[]; r: Rect | null; pr: Rect; row: boolean; items: boolean; shown: boolean }
export interface RawNode { p: number[]; t: string; c: string; s: string | null; r: Rect; d: string; row: boolean; txt: string; n: number; hid: boolean; slots?: RawSlot[] }
export interface Dump { nodes: RawNode[]; live?: RawNode[]; ph: Rect | null; vw: number; vh: number; sy: number }
export interface PNode extends RawNode { key: string; parent?: PNode; kids: PNode[] }

export const frame = () => document.querySelector<HTMLIFrameElement>(".native-preview-frame");
export function frameBox() {
  const f = frame();
  if (!f) return undefined;
  const r = f.getBoundingClientRect();
  return { left: r.left + f.clientLeft, top: r.top + f.clientTop, width: f.clientWidth, height: f.clientHeight };
}
/** An editor point in the frame's viewport, and whether it is over the frame. */
export function toFrame(x: number, y: number) {
  const box = frameBox();
  if (!box) return undefined;
  const fx = x - box.left, fy = y - box.top;
  return { x: fx, y: fy, inside: fx >= 0 && fy >= 0 && fx <= box.width && fy <= box.height };
}

let ids = 0;
const waiting = new Map<number, (dump: Dump | undefined) => void>();
export const frameEvents: { key?: (key: string, alt: boolean, shift: boolean) => void } = {};
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; id?: number; type?: string; dump?: Dump; key?: string; alt?: boolean; shift?: boolean } | undefined;
  if (data?.source !== "cb12-proto") return;
  if (data.type === "key") { frameEvents.key?.(data.key ?? "", Boolean(data.alt), Boolean(data.shift)); return; }
  if (data.id === undefined) return;
  waiting.get(data.id)?.(data.dump);
  waiting.delete(data.id);
});
/** Sends an op to the frame script; resolves with a fresh measurement after it. */
export function frameOp(op: string, extra: Record<string, unknown> = {}): Promise<Model | undefined> {
  const f = frame();
  if (!f?.contentWindow) return Promise.resolve(undefined);
  const id = ++ids;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(undefined); }, 1500);
    waiting.set(id, (dump) => { clearTimeout(timer); const model = dump ? new Model(dump) : undefined; if (model) latest.model = model; resolve(model); });
    f.contentWindow!.postMessage({ source: "astro-native-preview-host", type: "cb12", op, id, ...extra }, "*");
  });
}
/** A fire-and-forget op (no measurement back). */
export function framePost(op: string, extra: Record<string, unknown> = {}) {
  frame()?.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "cb12", op, ...extra }, "*");
}
export const latest: { model?: Model } = {};
export const measure = () => frameOp("dump");
/** The measurement to draw with (B's open gap included). */
export const drawn = (m: Model | undefined) => m?.live ?? m;

export class Model {
  byKey = new Map<string, PNode>();
  roots: PNode[] = [];
  ph: Rect | null;
  /** As shown, with B's gap open (the model itself is measured without it). */
  live?: Model;
  constructor(dump: Dump) {
    this.ph = dump.ph;
    if (dump.live) this.live = new Model({ ...dump, nodes: dump.live, live: undefined });
    for (const raw of dump.nodes) {
      const node: PNode = { ...raw, key: raw.p.join("."), kids: [] };
      this.byKey.set(node.key, node);
      const parent = this.byKey.get(raw.p.slice(0, -1).join("."));
      if (parent) { node.parent = parent; parent.kids.push(node); } else this.roots.push(node);
    }
  }
  get(path: readonly number[]) { return this.byKey.get(path.join(".")); }
  main() { return [...this.byKey.values()].find((n) => n.t === "main"); }
}

// ---- What a thing is called. ----
export type BlockKind = "section" | "div" | "image" | "heading" | "paragraph" | "button";
export const BLOCKS: { kind: BlockKind; name: string; icon: string; hint: string }[] = [
  { kind: "section", name: "Section", icon: "▭", hint: "A page band" },
  { kind: "div", name: "Div", icon: "▦", hint: "Stack or grid" },
  { kind: "image", name: "Image", icon: "▣", hint: "From the site's images" },
  { kind: "heading", name: "Heading", icon: "H", hint: "Level from its place" },
  { kind: "paragraph", name: "Paragraph", icon: "¶", hint: "Text" },
  { kind: "button", name: "Button", icon: "⬭", hint: "A link styled .btn" },
];
export type Dragged =
  | { kind: "new"; block: BlockKind; layout: "flow" | "cards"; name: string }
  | { kind: "move"; path: number[]; key: string; tag: string; name: string; band: boolean };

const pretty = (tag: string) => tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
export function nodeName(n: PNode | undefined): string {
  if (!n) return "Page";
  const t = n.t;
  if (t === "main") return "Main";
  if (t === "section") return n.txt ? `Section “${short(n.txt)}”` : "Section";
  if (t === "div") return /\bcards\b/.test(n.c) ? "Div (grid)" : /\bflow\b/.test(n.c) ? "Div (stack)" : "Div";
  if (/^h[1-6]$/.test(t)) return "Heading";
  if (t === "p") return "Paragraph";
  if (t === "a") return /\bbtn\b/.test(n.c) ? "Button" : "Link";
  if (t === "img" || t === "picture") return "Image";
  if (t.includes("-")) return pretty(t);
  return `<${t}>`;
}
const short = (text: string) => (text.length > 22 ? `${text.slice(0, 21)}…` : text);
export function boxName(box: Box) {
  if (box.slot) return `${nodeName(box.node)} › ${box.slot.name ? `“${box.slot.name}”` : "unnamed"} slot`;
  return nodeName(box.node);
}
export function boxPath(box: Box) {
  const names: string[] = [];
  for (let n: PNode | undefined = box.node.parent; n; n = n.parent) if (n.t !== "body") names.unshift(nodeName(n));
  names.push(boxName(box));
  return names.join(" › ");
}
export const draggedName = (d: Dragged) => d.name;

// ---- Where blocks may go. ----
export interface Box { node: PNode; slot?: RawSlot; via?: PNode }
export type ContainerKind = "main" | "section" | "div" | "instance";
export function containerKind(n: PNode): ContainerKind | undefined {
  if (n.t === "main") return "main";
  if (n.t === "section") return "section";
  if (n.t === "div") return "div";
  if (n.t.includes("-") && n.slots?.length) return "instance";
  return undefined;
}
export const isBand = (d: Dragged) => (d.kind === "new" ? d.block === "section" : d.band);
export function within(n: PNode, ancestorKey: string) {
  for (let at: PNode | undefined = n; at; at = at.parent) if (at.key === ancestorKey) return true;
  return false;
}
export function allowed(d: Dragged, box: Box): { ok: boolean; reason?: string } {
  const kind = containerKind(box.node);
  if (d.kind === "move" && within(box.node, d.key)) return { ok: false, reason: "A block cannot go inside itself." };
  if (isBand(d)) {
    if (kind === "main") return { ok: true };
    return { ok: false, reason: `A Section goes only between page bands, not inside ${kind === "instance" ? "a component" : `a ${nodeName(box.node).split(" ")[0]}`}.` };
  }
  if (kind === "main") return { ok: false, reason: "Blocks go inside a Section or a Div, not straight between page bands." };
  if (kind === "section" || kind === "div") return { ok: true };
  if (kind === "instance") {
    if (!box.slot) return { ok: false, reason: "This part of the component is its template; it takes no drops." };
    if (box.slot.items) return { ok: true };
    return { ok: false, reason: `The “${box.slot.name}” slot is filled by editing its text, not by drops. Drop into the component's items instead.` };
  }
  return { ok: false, reason: "Not a container." };
}

// ---- Geometry. ----
export interface Pt { x: number; y: number }
const inRect = (r: Rect | null | undefined, p: Pt) => Boolean(r && r[2] + r[3] > 0 && p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3]);
export const boxRect = (box: Box): Rect => (box.slot ? (box.slot.items ? box.slot.pr : box.slot.r ?? box.slot.pr) : box.node.r);
/** A box's items: its children, or for a slot the children assigned to it, with their source index. */
export function itemsOf(box: Box): PNode[] {
  if (!box.slot) return box.node.kids;
  return box.slot.a.map((i) => box.node.kids[i]).filter(Boolean);
}
export const rowOf = (box: Box) => (box.slot ? box.slot.row : box.node.row);
const visible = (n: PNode) => !n.hid && n.r[2] + n.r[3] > 0;
/** The source index for "at the end" of a box. */
export function endIndex(box: Box) {
  if (!box.slot) return box.node.kids.length;
  const items = itemsOf(box);
  return items.length ? items[items.length - 1].p.at(-1)! + 1 : box.node.kids.length;
}
/** The insertion index under the point among a box's items. */
export function indexAt(box: Box, p: Pt) {
  const items = itemsOf(box).filter(visible);
  const row = rowOf(box);
  for (const item of items) {
    const [x, y, w, h] = item.r;
    if (row ? p.y < y || (p.y <= y + h && p.x < x + w / 2) : p.y < y + h / 2) return item.p.at(-1)!;
  }
  return endIndex(box);
}
/** Before or after `via` (a child of the box), by which half of it the point is in. */
export function sideIndex(box: Box, via: PNode, p: Pt) {
  const [x, y, w, h] = via.r;
  const i = via.p.at(-1)!;
  return (rowOf(box) ? p.x < x + w / 2 : p.y < y + h / 2) ? i : i + 1;
}
/** The deepest page element under the point; the moving block counts as a leaf. */
export function deepestAt(model: Model, p: Pt, movingKey?: string) {
  let best: PNode | undefined;
  const visit = (list: PNode[]) => {
    for (const n of list) {
      if (n.hid) continue;
      const zero = n.r[2] + n.r[3] === 0;
      const hit = !zero && inRect(n.r, p);
      if (hit) best = n;
      if ((hit || zero) && n.key !== movingKey) visit(n.kids);
    }
  };
  visit(model.roots);
  return best;
}
function slotOfChild(inst: PNode, child: PNode) {
  const i = inst.kids.indexOf(child);
  return inst.slots?.find((s) => s.a.includes(i));
}
function slotAt(inst: PNode, p: Pt) {
  const slots = (inst.slots ?? []).filter((s) => s.shown);
  return slots.find((s) => !s.items && inRect(s.r, p)) ?? slots.find((s) => s.items && inRect(s.pr, p)) ?? slots.find((s) => inRect(s.r, p));
}
/** Drop containers under the point, innermost first; `via` is the chain's child in each. */
export function containersAt(model: Model, p: Pt, movingKey?: string): Box[] {
  const chain: Box[] = [];
  let child: PNode | undefined;
  for (let n = deepestAt(model, p, movingKey); n; child = n, n = n.parent) {
    const kind = containerKind(n);
    if (!kind || n.key === movingKey) continue;
    if (kind === "instance") {
      const slot = child ? slotOfChild(n, child) : slotAt(n, p);
      if (!slot) continue;
      chain.push({ node: n, slot, via: child });
    } else chain.push({ node: n, via: child });
  }
  return chain;
}
/** For an instance and a light-DOM index: the slot a drop there lands in (an items slot when either neighbour is in one). */
export function slotForIndex(inst: PNode, index: number): RawSlot | undefined {
  const slots = inst.slots ?? [];
  const of = (i: number) => slots.find((s) => s.a.includes(i));
  const next = of(index), prev = of(index - 1);
  if (next?.items) return next;
  if (prev?.items) return prev;
  return next ?? prev ?? slots.find((s) => s.items && s.shown);
}

export interface Target {
  box: Box;
  index: number;
  ok: boolean;
  reason?: string;
  /** Pointer escaped to a parent, or stepped up with Alt/Tab/wheel. */
  level?: number;
}
export function targetFor(d: Dragged, box: Box, index: number, level = 0): Target {
  const a = allowed(d, box);
  return { box, index, ok: a.ok, reason: a.reason, level };
}
/** Words for a target: "Into Div (stack) › after Heading". */
export function whereText(t: Target) {
  const items = itemsOf(t.box);
  const after = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
  const before = items.find((n) => n.p.at(-1)! >= t.index);
  const place = !items.length ? "empty" : after ? `after ${nodeName(after)}` : before ? `before ${nodeName(before)}` : "at the end";
  return `Into ${boxName(t.box)} › ${place}`;
}
export function sameTarget(a?: Target, b?: Target) {
  return Boolean(a && b && a.box.node.key === b.box.node.key && (a.box.slot?.name ?? null) === (b.box.slot?.name ?? null) && a.index === b.index && a.ok === b.ok);
}
/** Whether a move target is where the block already is. */
export function stays(d: Dragged, t: Target) {
  if (d.kind !== "move") return false;
  const parent = d.path.slice(0, -1).join("."), i = d.path.at(-1)!;
  return t.box.node.key === parent && (t.index === i || t.index === i + 1);
}

/** Every valid place for a block, in document order (variant B's keyboard walk). */
export function allPlaces(model: Model, d: Dragged): Target[] {
  const out: Target[] = [];
  const visit = (n: PNode) => {
    if (d.kind === "move" && n.key === d.key) return;
    const kind = containerKind(n);
    if (kind === "instance") {
      // Only the items slots' children are the page's to drop among.
      for (const slot of (n.slots ?? []).filter((s) => s.shown && s.items)) {
        const box: Box = { node: n, slot };
        if (!allowed(d, box).ok) continue;
        for (const kid of itemsOf(box)) { out.push(targetFor(d, box, kid.p.at(-1)!)); visit(kid); }
        out.push(targetFor(d, box, endIndex(box)));
      }
      return;
    }
    const box: Box | undefined = kind ? { node: n } : undefined;
    const ok = Boolean(box && allowed(d, box).ok);
    n.kids.forEach((kid, i) => { if (ok) out.push(targetFor(d, box!, i)); visit(kid); });
    if (ok) out.push(targetFor(d, box!, n.kids.length));
  };
  model.roots.forEach(visit);
  return out;
}

// ---- Block markup. ----
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Heading level from position (ticket 10): h2 in a Section, one below per Div, capped at h4; h3 in an items slot. */
export function headingLevel(box: Box) {
  if (box.slot) return 3;
  let divs = 0;
  for (let n: PNode | undefined = box.node; n; n = n.parent) {
    if (n.t === "section") return Math.min(2 + divs, 4);
    if (n.t === "div") divs++;
    if (n.t.includes("-")) return 3;
  }
  return Math.min(2 + divs, 4);
}
export function previewMarkup(d: Dragged, box?: Box) {
  if (d.kind === "move") return "";
  switch (d.block) {
    case "section": return `<section class="flow"><p>New section</p></section>`;
    case "div": return d.layout === "cards" ? `<div class="cards"><p>Grid</p><p>…</p></div>` : `<div class="flow"><p>Stack</p></div>`;
    case "heading": { const l = box ? headingLevel(box) : 2; return `<h${l}>New heading</h${l}>`; }
    case "paragraph": return `<p>New paragraph.</p>`;
    case "button": return `<a class="btn" href="#">Button</a>`;
    case "image": return `<div style="display:grid;place-items:center;height:96px;background:#0001;border-radius:8px">Image</div>`;
  }
}
/** The markup a new block writes; image and button ask first (undefined: cancelled). */
export async function blockMarkup(d: Extract<Dragged, { kind: "new" }>, box: Box): Promise<string | undefined> {
  switch (d.block) {
    case "section": return `<section class="flow"></section>`;
    case "div": return `<div class="${d.layout}"></div>`;
    case "heading": { const l = headingLevel(box); return `<h${l}>New heading</h${l}>`; }
    case "paragraph": return `<p>New paragraph. Select it to write.</p>`;
    case "button": {
      const answer = await askButton();
      return answer ? `<a class="btn" href="${escape(answer.href)}">${escape(answer.label)}</a>` : undefined;
    }
    case "image": {
      const answer = await askImage();
      return answer ? mediaImageMarkup({ path: answer.path, alt: answer.alt, width: answer.width, height: answer.height }) : undefined;
    }
  }
}

// ---- Small dialogs (stubs for the media picker and the address field). ----
function dialogShell(title: string) {
  const dialog = el("dialog", "cb12-dialog");
  const form = el("form", "cb12-dialog__form");
  form.method = "dialog";
  form.append(el("h2", "cb12-dialog__title", title));
  dialog.append(form);
  document.body.append(dialog);
  return { dialog, form };
}
const KNOWN_SIZES: Record<string, [number, number]> = { "images/studio-desk.svg": [800, 600], "images/social-card.png": [1200, 630] };
export function askImage(): Promise<{ path: string; alt: string; width?: number; height?: number } | undefined> {
  return new Promise((resolve) => {
    const { dialog, form } = dialogShell("Choose an image");
    form.append(el("p", "cb12-dialog__note", "Prototype stand-in for the media picker: the site's images."));
    const list = el("div", "cb12-dialog__choices");
    const images = deps().images();
    let chosen = images.find((p) => p.includes("studio")) ?? images[0];
    for (const path of images) {
      const option = el("label", "cb12-dialog__choice");
      const radio = el("input");
      radio.type = "radio"; radio.name = "cb12-image"; radio.value = path; radio.checked = path === chosen;
      radio.addEventListener("change", () => { chosen = path; });
      option.append(radio, el("span", "", path));
      list.append(option);
    }
    const alt = el("input", "cb12-dialog__input");
    alt.placeholder = "Alt text (describe the image)";
    alt.value = "A studio desk with printed page layouts";
    const altLabel = el("label", "cb12-dialog__field");
    altLabel.append(el("span", "", "Alt text"), alt);
    const actions = el("div", "cb12-dialog__actions");
    const cancel = btn("Cancel", () => dialog.close("cancel"), "cb12-btn");
    const ok = el("button", "cb12-btn cb12-btn--primary", "Insert image");
    ok.value = "ok";
    actions.append(cancel, ok);
    form.append(list, altLabel, actions);
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue === "ok" && chosen ? { path: chosen, alt: alt.value.trim(), width: KNOWN_SIZES[chosen]?.[0], height: KNOWN_SIZES[chosen]?.[1] } : undefined;
      dialog.remove();
      resolve(value);
    });
    dialog.showModal();
    ok.focus();
  });
}
export function askButton(): Promise<{ label: string; href: string } | undefined> {
  return new Promise((resolve) => {
    const { dialog, form } = dialogShell("New button");
    const label = el("input", "cb12-dialog__input");
    label.value = "Button";
    const href = el("input", "cb12-dialog__input");
    href.value = "#";
    href.setAttribute("list", "cb12-links");
    const options = el("datalist");
    options.id = "cb12-links";
    for (const link of deps().links()) { const o = el("option"); o.value = link.value; o.label = link.label; options.append(o); }
    const f1 = el("label", "cb12-dialog__field"); f1.append(el("span", "", "Label"), label);
    const f2 = el("label", "cb12-dialog__field"); f2.append(el("span", "", "Address"), href, options);
    const actions = el("div", "cb12-dialog__actions");
    const ok = el("button", "cb12-btn cb12-btn--primary", "Insert button");
    ok.value = "ok";
    actions.append(btn("Cancel", () => dialog.close("cancel"), "cb12-btn"), ok);
    form.append(f1, f2, actions);
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue === "ok" && label.value.trim() && href.value.trim() ? { label: label.value.trim(), href: href.value.trim() } : undefined;
      dialog.remove();
      resolve(value);
    });
    dialog.showModal();
    href.focus();
    href.select();
  });
}

// ---- Writes. ----
interface Edit { start: number; end: number; text: string; original: string }
function indentAt(source: string, pos: number) {
  const line = source.lastIndexOf("\n", pos - 1) + 1;
  const lead = source.slice(line, pos);
  return /^[ \t]*$/.test(lead) ? lead : "";
}
const reindent = (markup: string, indent: string) => markup.replace(/\n/g, `\n${indent}`);
const dedent = (markup: string, indent: string) => (indent ? markup.replace(new RegExp(`\\n${indent}`, "g"), "\n") : markup);
function childRanges(source: string, parent: readonly number[]) {
  const out = [];
  for (let k = 0; k < 500; k++) {
    const range = locateNativeElementRange(source, [...parent, k]);
    if (!range) break;
    out.push(range);
  }
  return out;
}
/** Where markup goes among a parent's children, without the seal (instances' items slots). */
function rawInsertion(source: string, parentPath: readonly number[], index: number, markup: string): Edit | undefined {
  const parent = locateNativeElementRange(source, [...parentPath]);
  if (!parent?.close) return undefined;
  const kids = childRanges(source, parentPath);
  const next = kids[index], prev = kids[index - 1];
  if (next) {
    const ind = indentAt(source, next.start);
    return { start: next.start, end: next.start, text: `${reindent(markup, ind)}\n${ind}`, original: "" };
  }
  if (prev) {
    const ind = indentAt(source, prev.start);
    return { start: prev.end, end: prev.end, text: `\n${ind}${reindent(markup, ind)}`, original: "" };
  }
  const outer = indentAt(source, parent.start), ind = `${outer}  `;
  const inner = source.slice(parent.tag.end, parent.close.start);
  const replace = /^\s*$/.test(inner);
  const start = replace ? parent.tag.end : parent.close.start;
  return { start, end: parent.close.start, text: `\n${ind}${reindent(markup, ind)}\n${outer}`, original: source.slice(start, parent.close.start) };
}
/** The first start tag gets `slot="name"`, or loses its slot (null). */
export function withSlot(markup: string, name: string | null) {
  const open = /^<([a-z][\w-]*)([^>]*)>/i.exec(markup);
  if (!open) return markup;
  const attrs = open[2].replace(/\s+slot\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
  const slot = name ? ` slot="${escape(name)}"` : "";
  return `<${open[1]}${slot}${attrs}>${markup.slice(open[0].length)}`;
}
function rawMove(source: string, from: readonly number[], parentPath: readonly number[], index: number, slot: string | null | undefined): Edit | undefined {
  const moving = locateNativeElementRange(source, [...from]);
  if (!moving) return undefined;
  const lineStart = source.lastIndexOf("\n", moving.start - 1) + 1;
  const lead = source.slice(lineStart, moving.start);
  const ws = /^[ \t]*$/.test(lead);
  const removeStart = ws && lineStart > 0 ? lineStart - 1 : moving.start;
  const removeEnd = moving.end;
  let markup = dedent(source.slice(moving.start, moving.end), ws ? lead : "");
  if (slot !== undefined) markup = withSlot(markup, slot);
  const ins = rawInsertion(source, parentPath, index, markup);
  if (!ins || (ins.start > removeStart && ins.start < removeEnd)) return undefined;
  if (ins.end <= removeStart) {
    const text = ins.text + source.slice(ins.end, removeStart);
    return { start: ins.start, end: removeEnd, text, original: source.slice(ins.start, removeEnd) };
  }
  const text = source.slice(removeEnd, ins.start) + ins.text;
  return { start: removeStart, end: ins.end, text, original: source.slice(removeStart, ins.end) };
}
/** The moved element's path after the move (nativeElementMovePlan's rule). */
function pathAfterMove(from: readonly number[], parent: readonly number[], index: number) {
  const oldParent = from.slice(0, -1), oldIndex = from.at(-1)!;
  const out = [...parent];
  if (out.length > oldParent.length && oldParent.every((s, i) => out[i] === s) && out[oldParent.length] > oldIndex) out[oldParent.length]--;
  const same = oldParent.length === parent.length && oldParent.every((s, i) => parent[i] === s);
  return [...out, index - (same && oldIndex < index ? 1 : 0)];
}

export const pagePath = () => deps().previewPage() ?? deps().currentPath();
export interface Done { ok: boolean; text: string; select?: number[] }
function apply(path: string, edit: Edit, select: number[]): boolean {
  const editor = deps().editor();
  const source = deps().sources()[path];
  if (!editor || source === undefined || source.slice(edit.start, edit.end) !== edit.original) return false;
  deps().preview()?.selectAfterUpdate({ path, node: select });
  editor.replaceActiveRange({ path, start: edit.start, end: edit.end, expected: edit.original, text: edit.text });
  return true;
}
const describe = (edit: Edit) => `source ${edit.start}–${edit.end}: −${edit.original.length} +${edit.text.length} chars, 1 undo step`;

/** Writes a drop: a new block or a move, through the code pane's range edit. */
export async function commit(d: Dragged, t: Target, opts: { wrap?: boolean } = {}): Promise<Done> {
  const path = pagePath();
  if (!t.ok) return { ok: false, text: `Refused: ${t.reason ?? "not here"}` };
  if (!path) return { ok: false, text: "No page open." };
  const parent = t.box.node.p;
  const instance = containerKind(t.box.node) === "instance";
  const slotName = instance ? (t.box.slot?.name || null) : undefined;
  // Inside an instance's light DOM (an items slot's card), source ops stop at the seal too.
  const underInstance = (n?: PNode) => { for (let a = n; a; a = a.parent) if (containerKind(a) === "instance") return true; return false; };
  const insideInstance = underInstance(t.box.node);
  if (d.kind === "new") {
    const markup0 = await blockMarkup(d, t.box);
    if (!markup0) return { ok: false, text: `${d.name}: cancelled, nothing inserted.` };
    const source = deps().sources()[path] ?? "";
    // D's click with nothing selected and no Section on the page: a new Section around the block.
    const wrapped = opts.wrap ? `<section class="flow">\n  ${markup0.replace(/\n/g, "\n  ")}\n</section>` : markup0;
    const markup = slotName ? withSlot(wrapped, slotName) : wrapped;
    let edit: Edit | undefined;
    if (insideInstance) edit = rawInsertion(source, parent, t.index, markup);
    else {
      const guarded = nativeMarkupInsertEdit(source, parent, t.index, markup);
      edit = guarded && { start: guarded.start, end: guarded.end, text: guarded.text, original: guarded.original };
    }
    if (!edit) return { ok: false, text: "HTML content rules refuse this block here (nativeMarkupInsertEdit)." };
    const select = opts.wrap ? [...parent, t.index, 0] : [...parent, t.index];
    if (!apply(path, edit, select)) return { ok: false, text: "The page changed meanwhile; nothing written." };
    return { ok: true, select, text: `Inserted ${markup.match(/^<[a-z0-9]+/i)?.[0]}> ${whereText(t).replace(/^Into/, "into")} (index ${t.index}${insideInstance ? ", seal bypassed: the page's items" : ""}) · ${describe(edit)}` };
  }
  if (stays(d, t)) return { ok: false, text: `${d.name} stayed in place.` };
  const source = deps().sources()[path] ?? "";
  const model = latest.model;
  const movingNode = model?.get(d.path);
  const fromInstance = Boolean(movingNode?.parent && containerKind(movingNode.parent) === "instance");
  const sealed = insideInstance || underInstance(movingNode?.parent) || d.tag.includes("-");
  let edit: Edit | undefined;
  let select: number[];
  if (sealed) {
    const slot = instance ? slotName ?? null : fromInstance ? null : undefined;
    edit = rawMove(source, d.path, parent, t.index, slot);
    select = pathAfterMove(d.path, parent, t.index);
  } else {
    const plan = nativeElementMovePlan(source, d.path, { parent: [...parent], index: t.index });
    if (plan.status === "stayed") return { ok: false, text: `${d.name} stayed in place.` };
    if (plan.status === "refused") return { ok: false, text: `Refused by nativeMoveEdit: ${plan.error}` };
    edit = { start: plan.edit.start, end: plan.edit.end, text: plan.edit.text, original: plan.edit.original };
    select = plan.selection;
  }
  if (!edit) return { ok: false, text: "This move could not be written." };
  if (!apply(path, edit, select)) return { ok: false, text: "The page changed meanwhile; nothing written." };
  return { ok: true, select, text: `Moved ${d.name} ${whereText(t).replace(/^Into/, "into")} (index ${t.index}${sealed ? ", raw edit: instance involved" : ""}) · ${describe(edit)}` };
}

// ---- The readout (bottom-left) and a toast. ----
let readoutEl: HTMLElement | undefined;
export function readout(title: string, lines: string[], tone: "idle" | "ok" | "refused" | "done" = "idle") {
  if (!readoutEl) {
    readoutEl = el("div", "cb12-readout");
    readoutEl.setAttribute("role", "status");
    document.body.append(readoutEl);
  }
  readoutEl.dataset.tone = tone;
  // Bottom left of the canvas, clear of the sidebar and the Add panel.
  const box = frameBox();
  if (box) readoutEl.style.left = `${Math.max(box.left + 12, (document.querySelector<HTMLElement>(".pb-add-panel:not([hidden])")?.getBoundingClientRect().right ?? 0) + 12)}px`;
  readoutEl.replaceChildren(el("div", "cb12-readout__head", `PROTOTYPE cb12 · ${title}`), ...lines.map((line) => el("div", "cb12-readout__line", line)));
}
export function readTarget(d: Dragged, t: Target | undefined, extra = "", verb = "dragging") {
  if (!t) { readout(`${verb} ${d.name}`, ["No target here (off the page)", extra].filter(Boolean)); return; }
  const lines = [
    `Container: ${boxPath(t.box)}`,
    `Index: ${t.index}${t.box.slot ? ` (light DOM of <${t.box.node.t}>)` : ""}${t.level ? ` · ${t.level} level${t.level > 1 ? "s" : ""} above the pointer` : ""}`,
    t.ok ? (stays(d, t) ? "Allowed · stays in place" : "Allowed ✓") : `Refused ✕ ${t.reason ?? ""}`,
  ];
  if (extra) lines.push(extra);
  readout(`${verb} ${d.name}`, lines, t.ok ? "ok" : "refused");
}
export function announce(text: string) { deps().announce(text); }

/** The same box in a newer measurement (geometry moves; keys and slot names stay). */
export function fresh(box: Box, model: Model | undefined): Box | undefined {
  const node = model?.byKey.get(box.node.key);
  if (!node) return undefined;
  if (!box.slot) return { node };
  const slot = node.slots?.find((s) => s.name === box.slot!.name);
  return slot ? { node, slot } : undefined;
}
export const visibleNode = (n: PNode) => !n.hid && n.r[2] + n.r[3] > 0;
/** A thin bar where a drop goes among a box's items (variant A's line), or undefined for an empty box. */
export function lineGeom(box: Box, index: number): Rect | undefined {
  const items = itemsOf(box).filter(visibleNode);
  if (!items.length) return undefined;
  const next = items.find((n) => n.p.at(-1)! >= index);
  const prev = [...items].reverse().find((n) => n.p.at(-1)! < index);
  const bottom = (r: Rect) => r[1] + r[3], right = (r: Rect) => r[0] + r[2];
  if (!rowOf(box)) {
    const y = prev && next ? (bottom(prev.r) + next.r[1]) / 2 : next ? next.r[1] - 4 : bottom(prev!.r) + 4;
    const left = Math.min(prev?.r[0] ?? Infinity, next?.r[0] ?? Infinity);
    const r = Math.max(prev ? right(prev.r) : -Infinity, next ? right(next.r) : -Infinity);
    return [left, y - 1.5, r - left, 3];
  }
  if (next && prev && Math.abs(prev.r[1] - next.r[1]) < 2) return [(right(prev.r) + next.r[0]) / 2 - 1.5, next.r[1], 3, next.r[3]];
  if (next) return [next.r[0] - 6, next.r[1], 3, next.r[3]];
  return [right(prev!.r) + 3, prev!.r[1], 3, prev!.r[3]];
}
export function draggedFor(n: PNode): Extract<Dragged, { kind: "move" }> {
  return { kind: "move", path: [...n.p], key: n.key, tag: n.t, name: nodeName(n), band: n.parent?.t === "main" || n.t === "section" };
}
/** The box a node sits in (for an instance parent: the slot it is assigned to). */
export function boxOfChild(child: PNode): Box | undefined {
  const parent = child.parent;
  if (!parent) return undefined;
  if (containerKind(parent) !== "instance") return { node: parent };
  const i = parent.kids.indexOf(child);
  const slot = parent.slots?.find((s) => s.a.includes(i));
  return slot ? { node: parent, slot } : undefined;
}
