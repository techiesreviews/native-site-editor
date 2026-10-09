// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Building inside a template with ticket 12's icon rail, trimmed to what this
// prototype needs: a click inserts by the selection and the new block is
// selected, so the next click builds on it; a drag shows a line and a label
// on the canvas (innermost valid container, ~8 px from its edge escapes to the
// parent) and the same place as an indented line in Structure. Targets are
// the template's own containers and its items slots (a drop there goes into
// the slot's fallback); a named slot and a nested component refuse with the
// reason. Each insert is one write of the template file (one undo step).

import sectionIcon from "@phosphor-icons/core/regular/rows.svg?raw";
import divIcon from "@phosphor-icons/core/regular/rectangle-dashed.svg?raw";
import imageIcon from "@phosphor-icons/core/regular/image.svg?raw";
import headingIcon from "@phosphor-icons/core/regular/text-h.svg?raw";
import paragraphIcon from "@phosphor-icons/core/regular/text-align-left.svg?raw";
import buttonIcon from "@phosphor-icons/core/regular/cursor-click.svg?raw";
import {
  BLOCKS, CONTAINERS, PLACEHOLDER, allowed as allowedFor, blockMarkup, deps, el, frameBox, frameSelect, insertion, isItemsSlot, itemsOf, latest, measure, mode, nodeName,
  readout, slotOf, templateNodeOfSelection, templatePath, toFrame, visibleNode, wait, whereText, writeTemplate, boxName, frameEvents, moveEdit, pathAfterMove,
  type BlockKind, type Box, type Model, type Rect, type TNode, type Target,
} from "./cb14-core";
import { layerEl, hooks as layerHooks } from "./cb14-layer";
import { treeLine } from "./cb14-tree";

const ICONS: Record<BlockKind, string> = { section: sectionIcon, div: divIcon, image: imageIcon, heading: headingIcon, paragraph: paragraphIcon, button: buttonIcon };
export const buildHooks: { afterInsert?: (t: Target) => void } = {};

export function mountRail() {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace || workspace.querySelector(".cb14-rail")) return;
  const rail = el("nav", "cb14-rail");
  rail.setAttribute("aria-label", "Blocks");
  const tip = el("div", "cb14-rail__tip");
  tip.hidden = true;
  for (const block of BLOCKS) {
    const button = el("button", "cb14-rail__item");
    button.type = "button";
    button.dataset.block = block.kind;
    button.setAttribute("aria-label", block.name);
    button.innerHTML = ICONS[block.kind];
    const show = () => {
      const r = button.getBoundingClientRect();
      tip.textContent = block.name;
      Object.assign(tip.style, { left: `${r.right + 8}px`, top: `${r.top + r.height / 2}px` });
      tip.hidden = false;
    };
    button.addEventListener("pointerenter", show);
    button.addEventListener("pointerleave", () => { tip.hidden = true; });
    button.addEventListener("blur", () => { tip.hidden = true; });
    button.addEventListener("pointerdown", (event) => { tip.hidden = true; pressToDrag(event, button, block.kind); });
    button.addEventListener("click", () => { tip.hidden = true; if (!recentlyDragged()) void clickInsert(block.kind); });
    rail.append(button);
  }
  workspace.prepend(rail);
  document.body.append(tip);
  document.documentElement.classList.add("cb14-has-rail");
}

const nameOfBlock = (kind: BlockKind) => BLOCKS.find((b) => b.kind === kind)!.name;
const nameOf = (kind: BlockKind) => session?.move?.name ?? nameOfBlock(kind);
const cardName = (tag: string) => tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const refuseOutside = (kind: BlockKind) => readout(`${nameOf(kind)}: not here`, ["This prototype builds inside a component's template: select an instance and choose Edit component first."], "refused");

// ---- Click to insert, following the selection. ----
function boxOfChild(n: TNode): Box { return { node: n.parent }; }
function clickTarget(model: Model, kind: BlockKind): Target | undefined {
  const top = model.roots.find((n) => CONTAINERS.has(n.t) && !n.slot) ?? model.roots[0];
  const sel = templateNodeOfSelection(model);
  const into = (box: Box): Target => {
    const a = allowed(kind, box);
    return { box, index: itemsOf(box).length ? itemsOf(box).at(-1)!.p.at(-1)! + 1 : 0, ok: a.ok, reason: a.reason };
  };
  const after = (n: TNode): Target => {
    // A part in a named slot's fallback: the block goes after the slot, not into it.
    const slot = n.parent?.slot && !isItemsSlot(n.parent) ? n.parent : undefined;
    const anchor = slot ?? n;
    const box = boxOfChild(anchor);
    const a = allowed(kind, box);
    return { box, index: anchor.p.at(-1)! + 1, ok: a.ok, reason: a.reason };
  };
  if (kind === "section") return into({ node: top });
  if (!sel) return top ? into({ node: top }) : undefined;
  if (!sel.inst && CONTAINERS.has(sel.t)) {
    const t = into({ node: sel });
    return t.ok ? t : after(sel);
  }
  return after(sel);
}

export async function clickInsert(kind: BlockKind) {
  if (!mode.now) { refuseOutside(kind); return; }
  const model = await measure();
  if (!model?.ok) return;
  const t = clickTarget(model, kind);
  if (!t) return;
  if (!t.ok) {
    flash(t.box.node?.r ?? model.host!, `✕ ${t.reason ?? "Not here"}`, true);
    readout(`${nameOf(kind)}: refused (click)`, [`Container: ${boxName(t.box)}`, `Reason: ${t.reason ?? ""}`], "refused");
    return;
  }
  await commit(kind, t, "click");
}

// ---- Writing a block into the template. ----
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <!-- PROTOTYPE cb14 draft: a placeholder image, replaced with Choose image… -->
  <rect width="640" height="400" fill="#e3e6e0"/>
  <circle cx="232" cy="150" r="34" fill="#c5cbc1"/>
  <path d="M120 310 L260 190 L350 270 L420 215 L540 310 Z" fill="#c5cbc1"/>
</svg>
`;
async function placeholderFile(): Promise<{ undo: () => void; redo: () => void } | undefined | false> {
  if (deps().images().includes(PLACEHOLDER) || deps().sources()[PLACEHOLDER] !== undefined) return undefined;
  const result = await deps().createFiles([{ path: PLACEHOLDER, content: PLACEHOLDER_SVG }]);
  if ("error" in result) return false;
  return { undo: () => result.receipt.undo(), redo: () => void result.receipt.redo() };
}
async function commit(kind: BlockKind, t: Target, how: "click" | "drag" | "+", card?: string) {
  const path = templatePath();
  const source = path ? deps().sources()[path] : undefined;
  if (!path || source === undefined || !t.box.node) return;
  const markup = card ? `<${card}></${card}>` : blockMarkup(kind, t.box);
  const nameOf = (k: BlockKind) => (card ? cardName(card) : nameOfBlock(k));
  const edit = insertion(source, t.box.node.p, t.index, markup);
  if (!edit) { readout(`${nameOf(kind)}: not added`, ["The template's markup has no place there."], "refused"); return; }
  const select = [...t.box.node.p, t.index];
  const where = whereText(t);
  const file = kind === "image" ? await placeholderFile() : undefined;
  if (file === false) { readout("Image: not added", ["Could not write the placeholder image."], "refused"); return; }
  if (!writeTemplate({ ...edit, original: edit.original }, `Inserted <${markup.match(/^<([a-z0-9]+)/i)?.[1]}> (${how}) ${where.replace(/^Into/, "into")}`, select, file || undefined)) { if (file) file.undo(); return; }
  buildHooks.afterInsert?.(t);
  readout(`${nameOf(kind)} added (${how})`, [where, `Selected: the new ${nameOf(kind)}; the next click builds ${CONTAINERS.has(markup.match(/^<([a-z0-9]+)/i)?.[1] ?? "") ? "inside it" : "after it"}.`], "done");
  // Selected once the frame shows it; its label flashes there.
  const key = select.join(".");
  for (let i = 0; i < 16; i++) {
    await wait(110);
    const now = await measure();
    const added = now?.byKey.get(key);
    if (added && visibleNode(added)) {
      await frameSelect(select);
      frameReveal(select);
      flash(added.r, where, false);
      return;
    }
  }
}
function frameReveal(p: number[]) { document.querySelector<HTMLIFrameElement>(".native-preview-frame")?.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "cb14", op: "reveal", p, block: "nearest" }, "*"); }

let flashed: HTMLElement[] = [];
let flashTimer: ReturnType<typeof setTimeout> | undefined;
function flash(r: Rect, text: string, refused: boolean) {
  for (const old of flashed) old.remove();
  const layer = layerEl();
  const outline = el("div", `cb14-flash${refused ? " is-refused" : ""}`);
  Object.assign(outline.style, { left: `${r[0]}px`, top: `${r[1]}px`, width: `${r[2]}px`, height: `${r[3]}px` });
  const label = el("div", `cb14-flash-label${refused ? " is-refused" : ""}`, text);
  Object.assign(label.style, { left: `${Math.min(r[0] + r[2], layer.clientWidth - 8)}px`, top: `${Math.max(r[1] - 30, 2)}px` });
  layer.append(outline, label);
  flashed = [outline, label];
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { for (const old of flashed) old.remove(); flashed = []; }, refused ? 2600 : 1700);
}

// ---- Dragging a block from the rail. ----
interface Moving { p: number[]; key: string; t: string; name: string }
interface Session { kind: BlockKind; move?: Moving; x: number; y: number; target?: Target; ghost: HTMLElement; model?: Model; parts: HTMLElement[] }
/** What a moved block counts as (ticket 10's rules): its tag's block. */
const kindOfTag = (t: string): BlockKind => (t === "section" ? "section" : t === "div" || t === "article" ? "div" : /^h[1-6]$/.test(t) ? "heading" : t === "img" || t === "picture" ? "image" : t === "a" ? "button" : "paragraph");
let movingKey: string | undefined;
/** Where a block may go; a moved block never into itself. */
function allowed(kind: BlockKind, box: Box) {
  if (movingKey && box.node && (box.node.key === movingKey || box.node.key.startsWith(`${movingKey}.`))) return { ok: false, reason: "A block cannot go inside itself." };
  return allowedFor(kind, box);
}
let session: Session | undefined;
let lastEnd = 0;
export const recentlyDragged = () => Boolean(session) || Date.now() - lastEnd < 400;
export const dragging = () => Boolean(session);

function pressToDrag(event: PointerEvent, handle: HTMLElement, kind: BlockKind) {
  if (event.button !== 0) return;
  const x0 = event.clientX, y0 = event.clientY, id = event.pointerId;
  handle.setPointerCapture(id);
  const move = (e: PointerEvent) => {
    if (!session && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
    if (!session) {
      if (!mode.now) { finish(); refuseOutside(kind); return; }
      start(kind, e.clientX, e.clientY);
    }
    session!.x = e.clientX; session!.y = e.clientY;
    void track();
  };
  const up = () => { finish(); if (session) void drop(); };
  const cancel = () => { finish(); if (session) end(); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" && session) { e.preventDefault(); finish(); readout(`${nameOf(kind)}: drag cancelled`, ["Esc: nothing inserted."]); end(); } };
  function finish() {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", cancel);
    removeEventListener("keydown", key, true);
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
  }
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", cancel);
  addEventListener("keydown", key, true);
}
function start(kind: BlockKind, x: number, y: number, move?: Moving) {
  const ghost = el("div", "cb14-ghost");
  document.body.append(ghost);
  session = { kind, move, x, y, ghost, parts: [] };
  movingKey = move?.key;
  document.documentElement.classList.add("cb14-dragging");
  void measure().then((m) => { if (session) { session.model = m; void track(); } });
}
function end() {
  if (!session) return;
  for (const p of session.parts) p.remove();
  session.ghost.remove();
  session = undefined;
  movingKey = undefined;
  lastEnd = Date.now();
  treeLine(undefined);
  document.documentElement.classList.remove("cb14-dragging");
}
async function drop() {
  const s = session;
  if (!s) return;
  const t = s.target;
  end();
  if (s.move) { if (t?.ok) moveTo(s.move, t); else readout(`${s.move.name}: not moved`, [t?.reason ?? "Dropped nowhere."], "refused"); return; }
  if (!t) { readout(`${nameOf(s.kind)}: dropped nowhere`, ["Drop it on the template or in Structure."]); return; }
  if (!t.ok) { flash(t.box.node?.r ?? latest.model?.host ?? [0, 0, 0, 0], `✕ ${t.reason ?? "Not here"}`, true); readout(`${nameOf(s.kind)}: refused`, [t.reason ?? ""], "refused"); return; }
  await commit(s.kind, t, "drag");
}

const inRect = (r: Rect, x: number, y: number) => r[2] + r[3] > 0 && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const nearEdge = (r: Rect, x: number, y: number, d: number) => x - r[0] < d || r[0] + r[2] - x < d || y - r[1] < d || r[1] + r[3] - y < d;
function deepestAt(model: Model, x: number, y: number) {
  let best: TNode | undefined;
  const visit = (list: TNode[]) => {
    for (const n of list) {
      if (n.hid && !n.slot?.drop) continue;
      if (movingKey && (n.key === movingKey || n.key.startsWith(`${movingKey}.`))) continue;
      const hit = inRect(n.r, x, y);
      if (hit) best = n;
      if (hit || n.slot) visit(n.kids);
    }
  };
  visit(model.roots);
  return best;
}
function indexAt(box: Box, x: number, y: number) {
  const items = itemsOf(box).filter(visibleNode);
  const row = box.node?.slot ? box.node.row : box.node?.row ?? false;
  for (const item of items) {
    const [ix, iy, w, h] = item.r;
    if (row ? y < iy || (y <= iy + h && x < ix + w / 2) : y < iy + h / 2) return item.p.at(-1)!;
  }
  return items.length ? items.at(-1)!.p.at(-1)! + 1 : (box.node?.kids.length ?? 0);
}
function canvasTarget(model: Model, kind: BlockKind, x: number, y: number): Target | undefined {
  const deepest = deepestAt(model, x, y);
  if (!deepest) return undefined;
  const chain: TNode[] = [];
  for (let n: TNode | undefined = deepest; n; n = n.parent) chain.push(n);
  let i = 0;
  while (i < chain.length - 1 && (!allowed(kind, { node: chain[i] }).ok || nearEdge(chain[i].r, x, y, 8) && allowed(kind, { node: chain[i + 1] }).ok && !chain[i].slot)) i++;
  const box: Box = { node: chain[i] };
  const a = allowed(kind, box);
  if (!a.ok) return { box, index: 0, ok: false, reason: a.reason };
  const via = i > 0 ? chain[i - 1] : undefined;
  let index = indexAt(box, x, y);
  if (via && box.node!.kids.includes(via)) {
    const [vx, vy, w, h] = via.r;
    index = (box.node!.row ? x < vx + w / 2 : y < vy + h / 2) ? via.p.at(-1)! : via.p.at(-1)! + 1;
  }
  return { box, index, ok: true };
}
function treeTarget(model: Model, kind: BlockKind, y: number): Target | undefined {
  const row = [...document.querySelectorAll<HTMLElement>(".cb14-tree .cb14-row[data-p]")].find((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y <= b.bottom; });
  const n = row ? model.get(row.dataset.p!.split(".").map(Number)) : undefined;
  if (!n) return undefined;
  const into = allowed(kind, { node: n });
  if (into.ok) return { box: { node: n }, index: n.kids.length ? n.kids.at(-1)!.p.at(-1)! + 1 : 0, ok: true };
  const slot = n.parent?.slot && !isItemsSlot(n.parent) ? n.parent : undefined;
  const anchor = slot ?? n;
  const box: Box = { node: anchor.parent };
  const a = allowed(kind, box);
  return { box, index: anchor.p.at(-1)! + 1, ok: a.ok, reason: a.reason ?? into.reason };
}
function lineGeom(box: Box, index: number): Rect | undefined {
  const items = itemsOf(box).filter(visibleNode);
  if (!items.length) return undefined;
  const next = items.find((n) => n.p.at(-1)! >= index);
  const prev = [...items].reverse().find((n) => n.p.at(-1)! < index);
  const bottom = (r: Rect) => r[1] + r[3], right = (r: Rect) => r[0] + r[2];
  if (!box.node?.row) {
    const y = prev && next ? (bottom(prev.r) + next.r[1]) / 2 : next ? next.r[1] - 4 : bottom(prev!.r) + 4;
    const left = Math.min(prev?.r[0] ?? Infinity, next?.r[0] ?? Infinity);
    const r = Math.max(prev ? right(prev.r) : -Infinity, next ? right(next.r) : -Infinity);
    return [left, y - 1.5, r - left, 3];
  }
  if (next && prev && Math.abs(prev.r[1] - next.r[1]) < 2) return [(right(prev.r) + next.r[0]) / 2 - 1.5, next.r[1], 3, next.r[3]];
  if (next) return [next.r[0] - 6, next.r[1], 3, next.r[3]];
  return [right(prev!.r) + 3, prev!.r[1], 3, prev!.r[3]];
}
async function track() {
  const s = session;
  if (!s) return;
  const model = latest.model ?? s.model;
  const f = toFrame(s.x, s.y);
  const tree = document.querySelector(".cb14-tree")?.getBoundingClientRect();
  let target: Target | undefined;
  let over = "none";
  if (model?.ok && f?.inside) { target = canvasTarget(model, s.kind, f.x, f.y); over = "canvas"; }
  else if (model?.ok && tree && s.x >= tree.left && s.x <= tree.right && s.y >= tree.top && s.y <= tree.bottom) { target = treeTarget(model, s.kind, s.y); over = "Structure"; }
  s.target = target;
  for (const p of s.parts) p.remove();
  s.parts = [];
  const layer = layerEl();
  const add = (cls: string, r: Rect, text = "") => { const n = el("div", cls, text); Object.assign(n.style, { left: `${r[0]}px`, top: `${r[1]}px`, width: `${Math.max(r[2], 0)}px`, height: `${Math.max(r[3], 0)}px` }); layer.append(n); s.parts.push(n); return n; };
  const where = target ? (target.ok ? whereText(target) : `✕ ${target.reason}`) : over === "none" ? "Drop on the template or in Structure" : "No place here";
  if (target?.box.node) {
    const r = target.box.node.r;
    if (!target.ok) add("cb14-drag-refused", r);
    else {
      const line = lineGeom(target.box, target.index);
      if (line) {
        add(`cb14-drag-line${line[2] < line[3] ? " is-v" : ""}`, line);
        add("cb14-drag-label", [Math.min(line[0] + line[2], (frameBox()?.width ?? 2000) - 8), Math.max(line[1] - 26, 2), 0, 0], where);
      } else {
        add("cb14-drag-empty", r, `Drop into the empty ${nodeName(target.box.node)}`);
      }
    }
  }
  treeLine(target);
  s.ghost.textContent = "";
  s.ghost.append(el("strong", "", nameOf(s.kind)), el("span", "", where));
  s.ghost.classList.toggle("is-ok", Boolean(target?.ok));
  s.ghost.classList.toggle("is-refused", Boolean(target && !target.ok));
  s.ghost.style.transform = `translate(${Math.min(s.x + 14, innerWidth - 300)}px, ${s.y + 14}px)`;
  readout(`dragging ${nameOf(s.kind)} · over ${over}`, target ? [`Container: ${boxName(target.box)}${target.box.node && slotOf(target.box.node) ? ` (inside slot “${slotOf(target.box.node)!.slot!.name}”'s fallback)` : ""}`, `Index: ${target.index}`, target.ok ? "Allowed ✓" : `Refused ✕ ${target.reason}`] : ["No target"], target ? (target.ok ? "ok" : "refused") : "idle");
}

// ---- Moving a block of the template by dragging it on the canvas. ----
function moveTo(m: Moving, t: Target) {
  const path = templatePath();
  const source = path ? deps().sources()[path] : undefined;
  if (!path || source === undefined || !t.box.node) return;
  const parent = t.box.node.p;
  const from = m.p;
  const same = from.slice(0, -1).join(".") === parent.join(".");
  if (same && (t.index === from.at(-1) || t.index === from.at(-1)! + 1)) { readout(`${m.name} stayed in place`, []); return; }
  const edit = moveEdit(source, from, parent, t.index);
  if (!edit) { readout(`${m.name}: not moved`, ["This move could not be written."], "refused"); return; }
  const select = pathAfterMove(from, parent, t.index);
  if (writeTemplate(edit, `Moved <${m.t}> ${whereText(t).replace(/^Into/, "into")}`, select)) {
    buildHooks.afterInsert?.(t);
    readout(`${m.name} moved`, [whereText(t), "One write of the template: one undo step."], "done");
    void (async () => { for (let i = 0; i < 12; i++) { await wait(110); const now = await measure(); const n = now?.get(select); if (n && visibleNode(n)) { await frameSelect(select); flash(n.r, whereText(t), false); return; } } })();
  }
}
frameEvents.press = (press) => {
  const box = frameBox();
  if (!box) return;
  const x = box.left + press.x, y = box.top + press.y;
  if (press.phase === "start") {
    if (!mode.now || session) return;
    const n = press.p ? latest.model?.get(press.p) : undefined;
    if (!n) return;
    start(kindOfTag(n.t), x, y, { p: [...n.p], key: n.key, t: n.t, name: nodeName(n).replace(/ <.*>$/, "") });
    return;
  }
  if (!session?.move) return;
  if (press.phase === "move") { session.x = x; session.y = y; void track(); return; }
  if (press.phase === "end") void drop();
  else end();
};
addEventListener("keydown", (e) => { if (e.key === "Escape" && session?.move) { e.preventDefault(); readout(`${session.move.name}: move cancelled`, ["Esc: nothing moved."]); end(); } }, true);

// ---- Round 2: the "+" on a hovered slot, a small picker that adds into its fallback. ----
let picker: HTMLElement | undefined;
function closePicker() { picker?.remove(); picker = undefined; }
layerHooks.addInto = (slot, at) => openPicker(slot, at);
function openPicker(slot: TNode, at: DOMRect) {
  closePicker();
  const items = isItemsSlot(slot);
  // The items slot's card component: its fallback's instance, else the one the page fills it with.
  const card = items ? slot.kids.find((k) => k.inst)?.t ?? slot.pageItems?.find((i) => i.t.includes("-"))?.t : undefined;
  const menu = el("div", "cb14-picker");
  menu.setAttribute("role", "menu");
  menu.append(el("div", "cb14-picker__title", `Add to “${slot.slot!.name || "unnamed"}”`));
  const t = (): Target => {
    const now = latest.model?.byKey.get(slot.key) ?? slot;
    return { box: { node: now }, index: now.kids.length ? now.kids.at(-1)!.p.at(-1)! + 1 : 0, ok: true };
  };
  const option = (icon: string, text: string, run: () => void, note = "", disabled = "") => {
    const b = el("button", "cb14-picker__item");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    const ic = el("span", "cb14-picker__icon");
    ic.innerHTML = icon;
    b.append(ic, el("span", "cb14-picker__name", text));
    if (note) b.append(el("span", "cb14-picker__note", note));
    if (disabled) { b.disabled = true; b.title = disabled; }
    b.addEventListener("click", () => { closePicker(); run(); });
    menu.append(b);
    return b;
  };
  if (card) {
    option("◇", cardName(card), () => void commit("div", t(), "+", card), "the slot's card");
    menu.append(el("hr", "cb14-picker__sep"));
  }
  for (const block of BLOCKS) {
    const why = block.kind === "section" ? allowedFor("section", { node: slot }).reason ?? "" : "";
    option(ICONS[block.kind], block.name, () => void commit(block.kind, t(), "+"), "", why);
  }
  document.body.append(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  Object.assign(menu.style, { left: `${Math.min(at.left, innerWidth - w - 8)}px`, top: `${at.bottom + 6 + h > innerHeight - 8 ? at.top - h - 6 : at.bottom + 6}px` });
  picker = menu;
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  menu.addEventListener("keydown", (e) => {
    const list = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePicker(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus(); }
  });
  setTimeout(() => document.addEventListener("pointerdown", (e) => { if (picker === menu && !menu.contains(e.target as Node)) closePicker(); }, { once: true }), 0);
}
