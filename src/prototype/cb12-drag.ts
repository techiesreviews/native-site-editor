// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// One drag, whatever started it (an Add tile, the edit bar's grip, a
// Structure row): the editor keeps the pointer, measures the frame, asks the
// current variant for the target under the pointer and lets it draw; a
// release writes through commit(). The three variants differ only in how a
// target is picked and shown:
//   A "Line and label"   innermost valid container, ~8px edges escape to the
//                        parent, Alt or Tab steps up; a thin line and a label
//   B "Boxes and gaps"   every valid container outlined, the hovered one
//                        tinted, the gap opens in the page with a ghost
//   C "Structure-led"    the tree is the precise target: rows unfold, an
//                        indented line whose depth follows x; the canvas only
//                        tints the container

import {
  allowed, announce, boxName, boxPath, boxRect, commit, containerKind, containersAt, el, endIndex, frameBox, frameOp, framePost, fresh, indexAt, isBand,
  itemsOf, latest, lineGeom, drawn, nodeName, lineMode, treeLed, measure, previewMarkup, readTarget, readout, rowOf, sameTarget, sideIndex, stays, targetFor, toFrame, variant, whereText,
  type Box, type Dragged, type Model, type Pt, type Rect, type Target,
} from "./cb12-core";
import { expandTo, indentStep, overTree, pickDepth, pickZones, treeEl, treeLine } from "./cb12-tree";

// ---- Frame CSS (always on with the prototype; drag states by data-cb12 on the frame's root). ----
const BLUE = "oklch(54.6% 0.215 262.9)";
export const FRAME_CSS = `
#page .btn { display: inline-block; padding: var(--space-xs, .5rem) var(--space-m, 1rem); border: 2px solid var(--accent); border-radius: var(--radius-full, 999px); background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
#page .btn:hover { filter: brightness(0.92); }
#page .btn { justify-self: start; align-self: start; }
#page section:not(:has(> :not(.cb12-ph))), #page div.flow:not(:has(> :not(.cb12-ph))), #page div.cards:not(:has(> :not(.cb12-ph))) { min-height: 96px; display: grid; place-items: center; border-radius: var(--radius-m, 8px); outline: 1.5px dashed color-mix(in oklab, var(--accent) 45%, transparent); outline-offset: -2px; }
#page section:not(:has(*))::after { content: "Empty Section · drop blocks here"; }
#page div.flow:not(:has(*))::after { content: "Empty Div (stack) · drop blocks here"; }
#page div.cards:not(:has(*))::after { content: "Empty Div (grid) · drop blocks here"; }
#page section:not(:has(*))::after, #page div:not(:has(*))::after { font: 600 var(--text-s, 14px) / 1.4 var(--font-body, system-ui); color: color-mix(in oklab, var(--accent) 70%, var(--muted)); letter-spacing: .01em; }
[data-cb12-moving] { opacity: .45 !important; }
[data-cb12-hidden] { display: none !important; }
html[data-cb12="drag-b"] #page section:not(:has(> :not(.cb12-ph))), html[data-cb12="drag-b"] #page div.flow:not(:has(> :not(.cb12-ph))), html[data-cb12="drag-b"] #page div.cards:not(:has(> :not(.cb12-ph))) { min-height: 150px; align-content: center; outline: 2px dashed ${BLUE}; background: color-mix(in oklab, ${BLUE} 6%, transparent); }
html[data-cb12="drag-b"] #page section:not(:has(*))::after, html[data-cb12="drag-b"] #page div:not(:has(*))::after { content: "Drop here"; font-size: var(--text-l, 20px); color: ${BLUE}; }
.cb12-ph { box-sizing: border-box; position: relative; display: flex; align-items: center; min-height: 52px; padding: 10px 14px; border: 2px dashed ${BLUE}; border-radius: 10px; background: color-mix(in oklab, ${BLUE} 9%, transparent); animation: cb12-open 140ms ease-out; }
.cb12-ph--row { align-self: stretch; }
.cb12-ph__ghost { flex: 1; min-width: 0; opacity: .6; pointer-events: none; }
.cb12-ph__ghost > * { margin: 0 !important; }
.cb12-ph__label { position: absolute; top: -11px; left: 10px; padding: 0 7px; border-radius: 9px; background: ${BLUE}; color: #fff; font: 600 11px/19px system-ui, sans-serif; white-space: nowrap; }
#page :has(> .cb12-ph)::after { content: none !important; }
#page :is(section, div.flow, div.cards):has(> .cb12-ph):not(:has(> :not(.cb12-ph))) { place-items: stretch; align-content: center; padding: 12px; }
@keyframes cb12-open { from { opacity: 0; transform: scaleY(.6); } }
@media (prefers-reduced-motion: reduce) { .cb12-ph { animation: none; } }
`;
export const setFrameState = (stateName: string) => framePost("css", { css: FRAME_CSS, state: stateName });

// ---- The overlay over the frame (clipped to it) and the tree line. ----
let layer: HTMLElement | undefined;
function layerEl() {
  if (!layer) { layer = el("div", "cb12-layer"); layer.setAttribute("aria-hidden", "true"); document.body.append(layer); }
  const box = frameBox();
  if (box) Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  return layer;
}
export function clearLayer() { layer?.replaceChildren(); }
export function rectEl(cls: string, r: Rect, text = "") {
  const out = el("div", cls, text);
  Object.assign(out.style, { left: `${r[0]}px`, top: `${r[1]}px`, width: `${Math.max(r[2], 0)}px`, height: `${Math.max(r[3], 0)}px` });
  layerEl().append(out);
  return out;
}
let treeMark: HTMLElement | undefined;
let treeRowMarked: HTMLElement | undefined;
export function showTreeLine(line: { y: number; level: number } | undefined, ok: boolean, row?: HTMLElement, reason = "") {
  const tree = treeEl();
  treeRowMarked?.classList.remove("cb12-row-target", "cb12-row-refused");
  treeRowMarked = undefined;
  if (!line || !tree) { treeMark?.remove(); treeMark = undefined; return; }
  if (!treeMark) { treeMark = el("div", "cb12-tree-line"); document.body.append(treeMark); }
  const r = tree.getBoundingClientRect();
  const left = r.left + 10 + (line.level - 1) * indentStep();
  Object.assign(treeMark.style, { left: `${left}px`, top: `${line.y - 1}px`, width: `${Math.max(r.right - left - 10, 24)}px` });
  treeMark.classList.toggle("is-refused", !ok);
  treeMark.dataset.reason = ok ? "" : reason;
  if (row) { row.classList.add(ok ? "cb12-row-target" : "cb12-row-refused"); treeRowMarked = row; }
}

// ---- A drag. ----
export interface Session {
  d: Dragged;
  model?: Model;
  target?: Target;
  over: "canvas" | "tree" | "none";
  x: number; y: number;
  alt: boolean; tabs: number; inner?: string;
  line?: { y: number; level: number }; row?: HTMLElement;
  ghost: HTMLElement;
  measuring: boolean;
  phKey?: string;
}
let current: Session | undefined;
let lastDragEnd = 0;
export const dragging = () => Boolean(current);
/** A drag is on, or ended just now (the click that follows a release is not a click). */
export const recentlyDragged = () => Boolean(current) || Date.now() - lastDragEnd < 400;
const movingKey = (s: Session) => (s.d.kind === "move" ? s.d.key : undefined);
const nearEdge = (p: Pt, r: Rect, d: number) => p.x - r[0] < d || r[0] + r[2] - p.x < d || p.y - r[1] < d || r[1] + r[3] - p.y < d;

/** The innermost valid container under the point; A also escapes at edges and steps up. */
function pickCanvas(s: Session, p: Pt): Target | undefined {
  const model = s.model!;
  const chain = containersAt(model, p, movingKey(s));
  if (!chain.length) return undefined;
  const innerKey = `${chain[0].node.key}/${chain[0].slot?.name ?? ""}`;
  if (innerKey !== s.inner) { s.inner = innerKey; s.tabs = 0; }
  const level = lineMode ? (s.alt ? 1 : 0) + s.tabs : 0;
  // A named slot that is not an items slot refuses, visibly, instead of passing the drop up.
  if (level === 0 && chain[0].slot && !isBand(s.d) && !allowed(s.d, chain[0]).ok) return targetFor(s.d, chain[0], indexAt(chain[0], p));
  let i = 0;
  if (lineMode) while (i < chain.length - 1 && nearEdge(p, boxRect(chain[i]), 8)) i++;
  i = Math.min(i + level, chain.length - 1);
  for (let j = i; j < chain.length; j++) {
    const box = chain[j];
    if (!allowed(s.d, box).ok) continue;
    const index = j === 0 ? indexAt(box, p) : sideIndex(box, box.via!, p);
    return { ...targetFor(s.d, box, index), level: j };
  }
  return { ...targetFor(s.d, chain[i], i === 0 ? indexAt(chain[i], p) : sideIndex(chain[i], chain[i].via!, p)), level: i };
}

/** The label by the pointer, kept inside the window. */
function placeGhost(s: Session) {
  const w = s.ghost.offsetWidth, h = s.ghost.offsetHeight;
  const x = Math.max(8, Math.min(s.x + 14, innerWidth - w - 8));
  const y = s.y + 12 + h > innerHeight - 8 ? s.y - h - 12 : s.y + 12;
  s.ghost.style.transform = `translate(${x}px, ${y}px)`;
}

function render(s: Session) {
  clearLayer();
  const t = s.target;
  const model = drawn(latest.model ?? s.model);
  const box = t && fresh(t.box, model);
  if (variant === "B") renderBoxes(s, model);
  if (t && box) {
    const r = boxRect(box);
    const empty = !itemsOf(box).length;
    if (lineMode) {
      rectEl(t.ok ? "cb12-box cb12-box--target" : "cb12-box cb12-box--refused", r);
      if (t.ok && !stays(s.d, t)) {
        const line = lineGeom(box, t.index);
        if (line && !empty) rectEl(`cb12-line${rowOf(box) ? " cb12-line--v" : ""}`, line);
        else rectEl("cb12-drop-area", [r[0] + 4, r[1] + 4, r[2] - 8, r[3] - 8], `Drop into the empty ${boxName(box)}`);
      }
    } else if (variant === "B") {
      if (!t.ok) {
        const out = rectEl("cb12-box cb12-box--refused cb12-box--b", r);
        out.append(el("span", "cb12-box__reason", `✕ ${t.reason ?? "Not here"}`));
      } else rectEl("cb12-box cb12-box--hover", r).append(el("span", "cb12-box__name", boxName(box)));
    } else {
      const soft = rectEl(t.ok ? "cb12-soft" : "cb12-soft cb12-soft--refused", r);
      soft.append(el("span", "cb12-soft__name", t.ok ? boxPath(box) : `✕ ${boxName(box)}`));
    }
  }
  // The label by the pointer.
  const label = s.ghost.querySelector<HTMLElement>(".cb12-ghost__where")!;
  if (!t) label.textContent = s.over === "none" ? "Release to cancel" : "No place here";
  else if (!t.ok) label.textContent = `✕ ${t.reason ?? "Not here"}`;
  else if (stays(s.d, t)) label.textContent = "Stays where it is";
  else label.textContent = lineMode ? `${whereText(t)}${t.level ? `  ·  ↑${t.level}` : ""}` : variant === "B" ? whereText(t) : `Into ${boxPath(t.box)}`;
  placeGhost(s);
  s.ghost.classList.toggle("is-refused", Boolean(t && !t.ok));
  s.ghost.classList.toggle("is-ok", Boolean(t?.ok));
  // The tree: its line, wherever the target came from (C unfolds rows to show it).
  if (t && (s.over === "tree" || treeLed)) {
    if (treeLed && s.over === "canvas") expandTo(t.box.node.key);
    const line = s.over === "tree" && s.line ? s.line : treeLine(t);
    showTreeLine(line, t.ok, s.row ?? (line ? treeLine(t)?.row : undefined), t.reason);
  } else showTreeLine(undefined, true);
  readTarget(s.d, t, lineMode ? "Alt or Tab: up a level · Shift+Tab: back · Esc: cancel" : "Esc: cancel");
}

/** Variant B: every valid container dashed, empty ones say Drop here. */
export function renderBoxes(s: Pick<Session, "d">, model: Model | undefined) {
  if (!model) return;
  const vw = frameBox()?.height ?? 900;
  for (const node of model.byKey.values()) {
    const kind = containerKind(node);
    if (!kind || node.hid || (s.d.kind === "move" && node.key.startsWith(s.d.key))) continue;
    const boxes: Box[] = kind === "instance" ? (node.slots ?? []).filter((slot) => slot.shown && (slot.items || !isBand(s.d))).map((slot) => ({ node, slot })) : [{ node }];
    for (const box of boxes) {
      const r = boxRect(box);
      if (!r || r[1] > vw || r[1] + r[3] < 0 || r[2] * r[3] === 0) continue;
      const ok = allowed(s.d, box).ok;
      if (!ok && !box.slot) continue;
      rectEl(ok ? "cb12-box cb12-box--valid" : "cb12-box cb12-box--slot-refused", r);
    }
  }
}

/** B: the gap opens at the target (a placeholder in the page with the block's ghost). */
async function syncPlaceholder(s: Session) {
  if (variant !== "B") return;
  const t = s.target;
  const key = t?.ok && !stays(s.d, t) ? `${t.box.node.key}/${t.box.slot?.name ?? ""}/${t.index}` : "";
  if (key === s.phKey) return;
  s.phKey = key;
  if (!key || !t) { const m = await frameOp("placeholder", {}); if (m && current === s) { s.model = m; render(s); } return; }
  const items = itemsOf(t.box);
  const row = rowOf(t.box);
  const sample = items.find((n) => n.r[2] > 0);
  const html = s.d.kind === "new" ? previewMarkup(s.d, t.box) : `<p><strong>${s.d.name}</strong> goes here</p>`;
  const m = await frameOp("placeholder", {
    parent: t.box.node.p, index: t.index, slot: t.box.slot?.name || undefined, row,
    h: row && sample ? Math.min(Math.round(sample.r[3]), 220) : 52,
    html, label: s.d.name,
  });
  if (m && current === s) { s.model = m; render(s); }
}

function retarget(s: Session) {
  const f = toFrame(s.x, s.y);
  let next: Target | undefined;
  s.line = undefined; s.row = undefined;
  if (!s.model) { s.over = "none"; }
  else if (overTree(s.x, s.y)) {
    s.over = "tree";
    const pick = treeLed ? pickDepth(s.model, s.d, s.x, s.y) : pickZones(s.model, s.d, s.x, s.y);
    next = pick.target; s.line = pick.line; s.row = pick.row;
  } else if (f?.inside) {
    s.over = "canvas";
    // B picks from the page as measured without its open gap, so the gap never moves the target.
    next = pickCanvas(s, { x: f.x, y: f.y });
  } else s.over = "none";
  const changed = !sameTarget(next, s.target) || next?.level !== s.target?.level;
  s.target = next;
  render(s);
  if (changed) void syncPlaceholder(s);
}

function remeasure(s: Session) {
  if (s.measuring) return;
  s.measuring = true;
  void measure().then((m) => { s.measuring = false; if (m && current === s) { s.model = m; retarget(s); } });
}

/**
 * Starts a drag of `d`; `source` already holds the pointer capture. Resolves
 * when the drag ends (dropped, refused or cancelled).
 */
export function startDrag(d: Dragged, from: HTMLElement, pointerId: number, x: number, y: number): Promise<void> {
  if (current) return Promise.resolve();
  // The pointer moves to an element of our own, so a re-render of the edit
  // bar or the tree (or B hiding the selection) never loses it.
  let source = from;
  const catcher = el("div", "cb12-catcher");
  document.body.append(catcher);
  try { catcher.setPointerCapture(pointerId); source = catcher; } catch { /* keep the original holder */ }
  // Keys (Escape, Alt, Tab) come to the editor even when the page had focus.
  const before = document.activeElement as HTMLElement | null;
  catcher.tabIndex = -1;
  catcher.focus({ preventScroll: true });
  const ghost = el("div", "cb12-ghost");
  ghost.append(el("span", "cb12-ghost__name", d.name), el("span", "cb12-ghost__where", "…"));
  document.body.append(ghost);
  const s: Session = { d, over: "none", x, y, alt: false, tabs: 0, ghost, measuring: false };
  current = s;
  placeGhost(s);
  const userSelect = document.documentElement.style.userSelect;
  document.documentElement.style.userSelect = "none";
  document.getSelection()?.removeAllRanges();
  document.documentElement.classList.add("cb12-is-dragging");
  // C: the Add panel steps aside so the tree (the precise target) shows.
  const panel = document.querySelector<HTMLElement>(".pb-add-panel:not([hidden])");
  if (treeLed && d.kind === "new") panel?.classList.add("cb12-tucked");
  setFrameState(`drag-${variant.toLowerCase()}`);
  if (d.kind === "move") framePost("mark", { node: d.path, mode: variant === "B" ? "hide" : "fade" });
  void measure().then((m) => {
    if (!m || current !== s) return;
    s.model = m;
    // The drag may have started before a measurement: name the block from it.
    const node = d.kind === "move" ? m.get(d.path) : undefined;
    if (node && d.kind === "move") { d.name = nodeName(node); d.band = node.parent?.t === "main" || node.t === "section"; ghost.querySelector(".cb12-ghost__name")!.textContent = d.name; }
    retarget(s);
  });

  let frameId = 0;
  const tick = () => {
    const box = frameBox();
    if (box && s.over !== "tree") {
      const fy = s.y - box.top;
      const inX = s.x >= box.left && s.x <= box.left + box.width;
      const band = Math.min(72, box.height / 4);
      let speed = 0;
      if (inX && fy < band) speed = -Math.min(14, Math.ceil((14 * (band - fy)) / band));
      else if (inX && fy > box.height - band) speed = Math.min(14, Math.ceil((14 * (fy - box.height + band)) / band));
      if (speed) { framePost("scroll", { dy: speed }); remeasure(s); }
    }
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);

  return new Promise((resolve) => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      s.x = e.clientX; s.y = e.clientY;
      if (s.alt !== e.altKey) s.alt = e.altKey;
      placeGhost(s);
      retarget(s);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === "Alt") { e.preventDefault(); s.alt = e.type === "keydown"; retarget(s); return; }
      if (e.key === "Tab" && e.type === "keydown" && lineMode) {
        e.preventDefault(); e.stopPropagation();
        s.tabs = Math.max(0, s.tabs + (e.shiftKey ? -1 : 1));
        retarget(s);
      }
    };
    let done = false;
    const finish = async (drop: boolean) => {
      if (done) return;
      done = true;
      lastDragEnd = Date.now();
      source.removeEventListener("pointermove", onMove);
      source.removeEventListener("pointerup", onUp);
      source.removeEventListener("pointercancel", onCancel);
      source.removeEventListener("lostpointercapture", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      cancelAnimationFrame(frameId);
      try { if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId); } catch { /* gone */ }
      catcher.remove();
      if (before && before.isConnected && before.localName !== "iframe") before.focus({ preventScroll: true });
      const t = s.target;
      ghost.remove();
      clearLayer();
      showTreeLine(undefined, true);
      panel?.classList.remove("cb12-tucked");
      if (treeLed) expandTo(undefined, drop && t?.ok ? t.box.node.key : undefined);
      document.documentElement.style.userSelect = userSelect;
      document.documentElement.classList.remove("cb12-is-dragging");
      framePost("placeholder", {});
      framePost("mark", {});
      setFrameState("");
      current = undefined;
      if (!drop || !t || s.over === "none") {
        readout(`${d.name}: drag cancelled`, ["Nothing changed."]);
        announce(`${d.name}: drag cancelled`);
      } else if (!t.ok) {
        readout(`${d.name}: refused`, [`Container: ${boxPath(t.box)}`, `Reason: ${t.reason ?? ""}`], "refused");
        announce(`Not here: ${t.reason ?? ""}`);
      } else if (stays(d, t)) {
        readout(`${d.name}: stayed`, ["Dropped where it already is; nothing written."]);
      } else {
        readout(`${d.name}: dropped`, [whereText(t), d.kind === "new" && (d.block === "image" || d.block === "button") ? "Waiting for the dialog…" : "Writing…"], "ok");
        const result = await commit(d, t);
        readout(result.ok ? "drop written" : `${d.name}: not written`, [result.text], result.ok ? "done" : "refused");
        announce(result.ok ? `${d.name} ${d.kind === "new" ? "added" : "moved"}` : result.text);
      }
      resolve();
    };
    const onUp = (e: PointerEvent) => { if (e.pointerId === pointerId) { s.x = e.clientX; s.y = e.clientY; retarget(s); void finish(true); } };
    const onCancel = (e: PointerEvent) => { if (e.pointerId === pointerId) void finish(false); };
    source.addEventListener("pointermove", onMove);
    source.addEventListener("pointerup", onUp);
    source.addEventListener("pointercancel", onCancel);
    source.addEventListener("lostpointercapture", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
  });
}

/** A press on `source` that becomes a drag after `threshold` px; a plain press stays a click. */
export function pressToDrag(event: PointerEvent, source: HTMLElement, make: () => Dragged | undefined, threshold = 7, onDragged?: () => void) {
  if (event.button !== 0 || !event.isPrimary || current) return;
  const startX = event.clientX, startY = event.clientY, id = event.pointerId;
  try { source.setPointerCapture(id); } catch { return; }
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id || Math.hypot(e.clientX - startX, e.clientY - startY) < threshold) return;
    stop();
    const d = make();
    if (!d) return;
    onDragged?.();
    void startDrag(d, source, id, e.clientX, e.clientY);
  };
  const stop = () => {
    source.removeEventListener("pointermove", move);
    source.removeEventListener("pointerup", up);
    source.removeEventListener("pointercancel", up);
  };
  const up = (e: PointerEvent) => { if (e.pointerId !== id) return; stop(); try { source.releasePointerCapture(id); } catch { /* gone */ } };
  source.addEventListener("pointermove", move);
  source.addEventListener("pointerup", up);
  source.addEventListener("pointercancel", up);
}

export { endIndex };
