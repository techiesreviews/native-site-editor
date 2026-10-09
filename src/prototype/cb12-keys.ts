// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// The keyboard alternatives:
//   A  a selected block: Alt+↑/↓ among its siblings, Alt+←/→ out of its
//      container / into the container above it, and a "Move to…" picker
//      (nativeElementMoveChoices plus the instances' items slots)
//   B  insert mode: pick a block (an Add tile, or Move… on a selected one);
//      the gap walks through every valid place in document order (↑/↓), out
//      of and into containers (←/→); Enter drops, Esc cancels
//   C  in Structure: Alt+arrows on the focused row move and indent/outdent it
// New blocks by keyboard: Enter on an Add tile puts the block at the
// selection (A, C), or starts insert mode with it (B).

import {
  allPlaces, announce, frameBox, drawn, boxOfChild, boxPath, btn, commit, containerKind, deps, draggedFor, el, endIndex, frameOp, framePost, fresh, itemsOf, measure,
  pagePath, previewMarkup, readTarget, readout, rowOf, targetFor, variant, boxRect, allowed, isBand,
  type BlockKind, type Box, type Done, type Dragged, type Model, type Target,
} from "./cb12-core";
import { clearLayer, rectEl, renderBoxes, setFrameState } from "./cb12-drag";
import { boxInside, rowFor } from "./cb12-tree";
import { nativeElementMoveChoices } from "../page-builder/native-move-choices";

function report(result: Done | undefined, title: string) {
  if (!result) return;
  readout(result.ok ? title : `${title}: not done`, [result.text], result.ok ? "done" : "refused");
  announce(result.text);
}

/** Alt+arrows on a block: siblings, outdent, indent. */
export async function moveBy(path: readonly number[], dir: "up" | "down" | "left" | "right"): Promise<Done | undefined> {
  const model = await measure();
  const node = model?.get(path);
  if (!model || !node) return undefined;
  const d = draggedFor(node);
  const box = boxOfChild(node);
  if (!box) { report({ ok: false, text: "This element sits in a part of a component the page does not own." }, "Move"); return undefined; }
  const items = itemsOf(box);
  const k = items.indexOf(node);
  let t: Target | undefined;
  let why = "";
  if (dir === "up") { if (k <= 0) why = `${d.name} is already first in ${boxPath(box)}.`; else t = targetFor(d, box, items[k - 1].p.at(-1)!); }
  if (dir === "down") { if (k >= items.length - 1) why = `${d.name} is already last in ${boxPath(box)}.`; else t = targetFor(d, box, items[k + 1].p.at(-1)! + 1); }
  if (dir === "right") {
    const prev = items[k - 1];
    const inside = prev && boxInside(prev);
    if (!inside) why = "Indent moves a block into the Section or Div just above it; there is none.";
    else t = targetFor(d, inside, endIndex(inside));
  }
  if (dir === "left") {
    const outer = boxOfChild(box.node);
    if (!outer) why = "Already at the top level.";
    else t = targetFor(d, outer, box.node.p.at(-1)! + 1);
  }
  if (!t) { report({ ok: false, text: why }, `${d.name}: ${dir}`); return undefined; }
  if (!t.ok) { report({ ok: false, text: `Refused: ${t.reason}` }, `${d.name}: ${dir}`); return undefined; }
  const result = await commit(d, t);
  report(result, `${d.name} moved (${dir === "left" ? "outdent" : dir === "right" ? "indent" : dir})`);
  return result;
}

/** Enter on an Add tile (A, C): the block goes into the selection, or after it, or after an ancestor; Sections at the end of Main. */
export async function insertAtSelection(d: Extract<Dragged, { kind: "new" }>): Promise<Done | undefined> {
  const model = await measure();
  if (!model) return undefined;
  const candidates: Target[] = [];
  const sel = deps().selection();
  if (sel?.node && sel.path === pagePath()) {
    const node = model.get(sel.node);
    const inside = node && boxInside(node);
    if (inside) candidates.push(targetFor(d, inside, endIndex(inside)));
    for (let n = node; n?.parent; n = n.parent) {
      const box = boxOfChild(n);
      if (box) candidates.push(targetFor(d, box, n.p.at(-1)! + 1));
    }
  }
  const main = model.main();
  if (main) candidates.push(targetFor(d, { node: main }, main.kids.length));
  const t = candidates.find((c) => c.ok);
  if (!t) { report({ ok: false, text: `Select a Section or a Div first: ${candidates[0]?.reason ?? ""}` }, `${d.name}`); return undefined; }
  const result = await commit(d, t);
  report(result, `${d.name} added (keyboard)`);
  return result;
}

// ---- A: Move to… ----
export async function openMoveTo(path: readonly number[]) {
  const model = await measure();
  const node = model?.get(path);
  const source = deps().sources()[pagePath() ?? ""];
  if (!model || !node || source === undefined) return;
  const d = draggedFor(node);
  const here = boxOfChild(node);
  const choices: { label: string; target: Target; note: string }[] = [];
  // The tested helper's plain containers, each proved by nativeMoveEdit, named the prototype's way.
  for (const choice of nativeElementMoveChoices(source, [...path])) {
    const parent = model.get(choice.destination.parent);
    if (!parent || !containerKind(parent)) continue;
    const t = targetFor(d, { node: parent }, choice.destination.index);
    if (t.ok) choices.push({ label: boxPath(t.box), target: t, note: "at the end" });
  }
  // Items slots, which the helper cannot see (instances are sealed there).
  for (const n of model.byKey.values()) {
    if (containerKind(n) !== "instance" || n.key.startsWith(d.key)) continue;
    for (const slot of n.slots ?? []) {
      if (!slot.items || !slot.shown) continue;
      const box: Box = { node: n, slot };
      if (here && here.node.key === n.key && here.slot?.name === slot.name) continue;
      const t = targetFor(d, box, endIndex(box));
      if (t.ok) choices.push({ label: boxPath(box), target: t, note: "at the end · items slot" });
    }
  }
  const dialog = el("dialog", "cb12-dialog cb12-moveto");
  const form = el("form", "cb12-dialog__form");
  form.method = "dialog";
  form.append(el("h2", "cb12-dialog__title", `Move ${d.name} to…`));
  const filter = el("input", "cb12-dialog__input");
  filter.placeholder = "Filter containers";
  filter.setAttribute("aria-label", "Filter containers");
  const list = el("div", "cb12-moveto__list");
  list.setAttribute("role", "listbox");
  let active = 0;
  let shown = choices;
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    shown = choices.filter((c) => !q || c.label.toLowerCase().includes(q));
    active = Math.min(active, Math.max(shown.length - 1, 0));
    list.replaceChildren(...shown.map((c, i) => {
      const option = btn("", () => choose(i), "cb12-moveto__option");
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(i === active));
      option.append(el("span", "cb12-moveto__label", c.label), el("span", "cb12-moveto__note", c.note));
      return option;
    }));
    if (!shown.length) list.append(el("p", "cb12-dialog__note", "No container takes this block."));
    list.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  };
  const choose = async (i: number) => {
    const c = shown[i];
    dialog.close();
    if (!c) return;
    const result = await commit(d, c.target);
    report(result, `${d.name} moved (Move to…)`);
  };
  filter.addEventListener("input", draw);
  form.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); draw(); }
    if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    if (e.key === "Enter") { e.preventDefault(); void choose(active); }
  });
  const actions = el("div", "cb12-dialog__actions");
  actions.append(btn("Cancel", () => dialog.close(), "cb12-btn"));
  form.append(el("p", "cb12-dialog__note", `${choices.length} containers take it. ↑/↓ and Enter, or click.`), filter, list, actions);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  draw();
  dialog.showModal();
  filter.focus();
  readout("Move to…", [`${d.name}: ${choices.length} destinations (nativeElementMoveChoices + items slots)`]);
}

// ---- B: insert mode. ----
interface InsertMode { d: Dragged; places: Target[]; i: number; banner: HTMLElement; model?: Model; busy: boolean }
let mode: InsertMode | undefined;
export const inInsertMode = () => Boolean(mode);

export async function startInsertMode(d: Dragged) {
  if (mode) endInsertMode();
  setFrameState("drag-b");
  if (d.kind === "move") framePost("mark", { node: d.path, mode: "hide" });
  const model = await measure();
  if (!model) return;
  const places = allPlaces(model, d);
  if (!places.length) { readout(`${d.name}: insert mode`, ["No valid place on this page."], "refused"); setFrameState(""); return; }
  let i = 0;
  if (d.kind === "move") {
    const parent = d.path.slice(0, -1).join(".");
    i = Math.max(0, places.findIndex((p) => p.box.node.key === parent && p.index === d.path.at(-1)));
  } else {
    const sel = deps().selection();
    const node = sel?.node ? model.get(sel.node) : undefined;
    const j = node ? places.findIndex((p) => p.box.node.key === node.key && p.index === endIndex(p.box)) : -1;
    const k = node?.parent ? places.findIndex((p) => p.box.node.key === node.parent!.key && p.index === node.p.at(-1)! + 1) : -1;
    const vh = frameBox()?.height ?? 600;
    const inView = places.findIndex((p) => { const r = boxRect(p.box); return r[1] + r[3] > 0 && r[1] < vh; });
    i = j >= 0 ? j : k >= 0 ? k : Math.max(inView, 0);
  }
  const banner = el("div", "cb12-insert-banner");
  banner.tabIndex = -1;
  banner.setAttribute("role", "status");
  banner.append(el("strong", "", `Insert mode · ${d.name}`), el("span", "", "↑/↓ next place · ← out · → in · Enter drop · Esc cancel"));
  document.body.append(banner);
  document.documentElement.classList.add("cb12-insert-mode");
  mode = { d, places, i, banner, model, busy: false };
  framePost("keys", { mode: "all" });
  window.addEventListener("keydown", onInsertKey, true);
  banner.focus();
  await showPlace();
}

async function showPlace() {
  const m = mode;
  if (!m) return;
  const t = m.places[m.i];
  const box = fresh(t.box, m.model) ?? t.box;
  const items = itemsOf(box);
  const sample = items.find((n) => n.r[2] > 0);
  const row = rowOf(box);
  const model = await frameOp("placeholder", {
    parent: t.box.node.p, index: t.index, slot: t.box.slot?.name || undefined, row, reveal: true,
    h: row && sample ? Math.min(Math.round(sample.r[3]), 220) : 52,
    html: m.d.kind === "new" ? previewMarkup(m.d, t.box) : `<p><strong>${m.d.name}</strong> goes here</p>`, label: m.d.name,
  });
  if (mode !== m) return;
  if (model) m.model = model;
  clearLayer();
  renderBoxes(m, drawn(m.model));
  const now = fresh(t.box, drawn(m.model));
  if (now) rectEl("cb12-box cb12-box--hover", boxRect(now)).append(el("span", "cb12-box__name", `${m.i + 1}/${m.places.length} · ${boxPath(now)}`));
  readTarget(m.d, t, "↑/↓ next place · ←/→ out/in · Enter drop · Esc cancel", "insert mode ·");
}

function endInsertMode() {
  const m = mode;
  mode = undefined;
  if (!m) return;
  window.removeEventListener("keydown", onInsertKey, true);
  m.banner.remove();
  document.documentElement.classList.remove("cb12-insert-mode");
  clearLayer();
  framePost("keys", { mode: "alt" });
  framePost("placeholder", {});
  framePost("mark", {});
  setFrameState("");
}

/** Keys in insert mode, from the editor or forwarded by the frame. */
export function insertKey(key: string) {
  const m = mode;
  if (!m || m.busy) return;
  const t = m.places[m.i];
  const find = (pred: (p: Target) => boolean) => m.places.findIndex(pred);
  if (key === "Escape") { endInsertMode(); readout(`${m.d.name}: insert mode cancelled`, ["Nothing changed."]); return; }
  if (key === "Enter") {
    m.busy = true;
    endInsertMode();
    void commit(m.d, t).then((result) => report(result, `${m.d.name} ${m.d.kind === "new" ? "added" : "moved"} (insert mode)`));
    return;
  }
  let next = m.i;
  if (key === "ArrowUp") next = Math.max(0, m.i - 1);
  if (key === "ArrowDown") next = Math.min(m.places.length - 1, m.i + 1);
  if (key === "ArrowLeft") {
    // Out: just after the current container, in its parent (further up when that refuses).
    for (let n = t.box.node; n.parent; n = n.parent) {
      const j = find((p) => p.box.node.key === n.parent!.key && p.index === n.p.at(-1)! + 1);
      if (j >= 0) { next = j; break; }
    }
  }
  if (key === "ArrowRight") {
    // In: the first place inside the container right after the gap, else the last inside the one before it.
    const items = itemsOf(t.box);
    const after = items.find((n) => n.p.at(-1)! >= t.index);
    const before = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
    const j = after ? find((p) => p.box.node.key === after.key) : -1;
    let k = -1;
    if (j < 0 && before) for (let x = m.places.length - 1; x >= 0; x--) if (m.places[x].box.node.key === before.key) { k = x; break; }
    if (j >= 0) next = j; else if (k >= 0) next = k;
  }
  if (next !== m.i) { m.i = next; void showPlace(); }
}
function onInsertKey(e: KeyboardEvent) {
  if (!mode) return;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  insertKey(e.key);
}

/** After a keyboard move in Structure (C), focus the moved row once the tree has it. */
export function focusRowSoon(path: number[] | undefined) {
  if (!path) return;
  const key = path.join(".");
  let tries = 0;
  const look = () => {
    const row = rowFor(key);
    if (row) { row.tabIndex = 0; row.focus(); return; }
    if (++tries < 30) setTimeout(look, 100);
  };
  setTimeout(look, 150);
}

export { allowed, isBand };
export type { BlockKind };
