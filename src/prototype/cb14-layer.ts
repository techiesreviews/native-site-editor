// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// The layer over the preview frame while a template is edited. Round 2 (Lex
// picked A): ticket 04's making-mode chips (variant E), shown on hover:
//   - hovering a slot (or having a part of it selected) shows its outline and
//     its chip, "✓ title"; a click unchecks it (the slot goes, its fallback
//     stays as fixed markup) and the chip then reads "○ title" until checked
//     again; a double-click renames it, in the chip and in Structure at once
//   - hovering a fixed part shows the faint "+ slot"
//   - hovering a slot also shows a "+" at its end: a small picker adds a block
//     (or, for an items slot, its card component) into the slot's fallback
//   - "◇ card-project ›" on a hovered nested component instance: drill in
//   - in A the rest of the page is shaded (visible, not clickable)
// A chip stays a moment after the pointer leaves its part, so it can be reached.

import {
  deps, el, latest, mode, variant, normaliseName, isItemsSlot, slotNames, slotOf, roleName, writeTemplate, unwrapEdit, wrapEdit, renameEdit,
  templatePath, frameBox, framePost, frame, readout, usageOf, tagNow, instanceContent, itemsNames, templateNodeOfSelection,
  type Model, type Rect, type TNode,
} from "./cb14-core";

export const hooks: {
  drill?: (n: TNode) => void;
  changed?: () => void;
  renameMirror?: (p: number[] | undefined, value: string) => void;
  /** The "+" on a slot: the picker that adds into its fallback. */
  addInto?: (slot: TNode, at: DOMRect) => void;
  /** Canvas hover, for Structure to mirror. */
  hovered?: (keys: string[]) => void;
} = {};

let layer: HTMLElement | undefined;
export function layerEl() {
  if (!layer) {
    layer = el("div", "cb14-layer");
    document.body.append(layer);
  }
  const box = frameBox();
  if (box) Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  return layer;
}
const parts = new Map<string, HTMLElement>();
function part(key: string, make: () => HTMLElement) {
  let out = parts.get(key);
  if (!out) { out = make(); parts.set(key, out); layerEl().append(out); }
  out.dataset.seen = "1";
  return out;
}
function place(node: HTMLElement, r: Rect, pad = 0) {
  Object.assign(node.style, { left: `${r[0] - pad}px`, top: `${r[1] - pad}px`, width: `${Math.max(r[2] + pad * 2, 0)}px`, height: `${Math.max(r[3] + pad * 2, 0)}px` });
}
export function clearLayer() {
  for (const node of parts.values()) node.remove();
  parts.clear();
}

// ---- Slots switched to fixed in this session: their chip reads "○ name" and checks them again. ----
export const formerSlots: { name: string; path: number[]; tag: string; items: boolean }[] = [];

// ---- Hover. ----
const hover: { p: number[] | null; slot: number[] | null } = { p: null, slot: null };
/** Subjects shown a moment ago, kept while the pointer travels to their chip. */
let linger: { keys: string[]; until: number } = { keys: [], until: 0 };
let overChip = false;
let lingerTimer: ReturnType<typeof setTimeout> | undefined;
export function setHover(p: number[] | null, slot: number[] | null = null) {
  const before = subjectsKeys();
  hover.p = p;
  hover.slot = slot;
  const after = subjectsKeys();
  const gone = before.filter((k) => !after.includes(k));
  if (gone.length) {
    linger = { keys: gone, until: Date.now() + 900 };
    clearTimeout(lingerTimer);
    lingerTimer = setTimeout(() => { if (latest.model) drawLayer(latest.model); }, 950);
  }
  if (latest.model) drawLayer(latest.model);
}
/** Structure hovering a row shows the same chips. */
export function setHoverFromTree(key: string | undefined) {
  const n = key ? latest.model?.byKey.get(key) : undefined;
  const slot = n?.slot ? n : slotOf(n);
  setHover(n && !n.slot ? n.p : null, slot ? slot.p : null);
}
const chipEnter = () => { overChip = true; };
const chipLeave = () => { overChip = false; linger.until = Date.now() + 500; clearTimeout(lingerTimer); lingerTimer = setTimeout(() => { if (latest.model) drawLayer(latest.model); }, 550); };

function done(title: string, lines: string[] = []) { hooks.changed?.(); readout(title, lines, "done"); }

// ---- Chip actions. ----
export function toggleSlot(n: TNode) {
  const source = deps().sources()[templatePath()!] ?? "";
  const name = n.slot!.name;
  const one = n.kids.length === 1 ? n.kids[0] : undefined;
  const edit = unwrapEdit(source, n.p);
  if (!edit) return;
  const usage = usageOf(tagNow()!);
  if (writeTemplate(edit, `Slot “${name || "unnamed"}” → fixed`, one ? n.p : undefined)) {
    if (one) formerSlots.push({ name, path: [...n.p], tag: one.t, items: isItemsSlot(n) });
    done(`Slot “${name || "unnamed"}” is fixed now`, [
      one ? `Its fallback <${one.t}> stays as fixed markup (click ○ ${name} to make it a slot again).` : "It had no fallback, so it is gone.",
      `Pages that put their own “${name}” content keep it in their source, but it no longer shows (${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"} use this component).`,
    ]);
  }
}
function unfix(g: (typeof formerSlots)[number]) {
  const source = deps().sources()[templatePath()!] ?? "";
  const edit = wrapEdit(source, g.path, g.name);
  if (edit && writeTemplate(edit, `<${g.tag}> → slot “${g.name}” again`, [...g.path, 0])) {
    formerSlots.splice(formerSlots.indexOf(g), 1);
    done(`Slot “${g.name}” is back`, ["Pages' own content for it shows again."]);
  }
}
export function renameSlot(n: TNode, name: string) {
  const source = deps().sources()[templatePath()!] ?? "";
  const old = n.slot!.name;
  if (name === old) return;
  // A renamed items slot stays one (ticket 04 rule 10: named items slots count).
  if (isItemsSlot(n) && name) itemsNames.add(name);
  const edit = renameEdit(source, n.p, name);
  const usage = usageOf(tagNow()!);
  if (edit && writeTemplate(edit, `Renamed slot “${old || "unnamed"}” → “${name || "unnamed"}”`))
    done(`Slot renamed: “${old || "unnamed"}” → “${name || "unnamed"}”`, [
      `Prototype: only the template is written. The real build renames slot="${old}" on the ${usage.pages.length} page${usage.pages.length === 1 ? "" : "s"} using it in the same undo step.`,
    ]);
}

// ---- Rename, in the chip and in Structure at once. ----
export const renaming: { p?: number[]; inputs: HTMLInputElement[]; original?: string; chip?: HTMLInputElement } = { inputs: [] };
export function startRename(n: TNode) {
  endRename(false);
  renaming.p = [...n.p];
  renaming.original = n.slot!.name;
  if (latest.model) drawLayer(latest.model);
  hooks.renameMirror?.(n.p, n.slot!.name);
  const first = renaming.chip ?? renaming.inputs[0];
  first?.focus();
  first?.select();
}
export function renameInput(initial: string, cls: string) {
  const input = el("input", `cb14-rename ${cls}`);
  input.value = initial;
  input.spellcheck = false;
  input.setAttribute("aria-label", "Slot name");
  input.addEventListener("input", () => {
    const caret = input.selectionStart ?? input.value.length;
    const before = normaliseName(input.value.slice(0, caret));
    input.value = normaliseName(input.value);
    input.setSelectionRange(before.length, before.length);
    for (const other of renaming.inputs) if (other !== input) other.value = input.value;
  });
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); endRename(true); }
    if (event.key === "Escape") { event.preventDefault(); endRename(false); }
  });
  input.addEventListener("blur", () => setTimeout(() => { if (renaming.inputs.length && !renaming.inputs.includes(document.activeElement as HTMLInputElement)) endRename(true); }, 120));
  renaming.inputs.push(input);
  return input;
}
export function endRename(commit: boolean) {
  if (!renaming.p) return;
  const p = renaming.p;
  const value = normaliseName((renaming.chip ?? renaming.inputs[0])?.value ?? "", true);
  for (const input of renaming.inputs) input.remove();
  renaming.inputs = [];
  renaming.chip = undefined;
  renaming.p = undefined;
  hooks.renameMirror?.(undefined, "");
  const n = latest.model?.get(p);
  const items = n && isItemsSlot(n);
  if (commit && n?.slot && (value || items) && !(value && slotNames().has(value) && value !== n.slot.name)) renameSlot(n, value);
  else if (latest.model) drawLayer(latest.model);
}

// ---- What shows a chip now: the hovered part and slot, the selection, and what lingers. ----
type Subject = { kind: "slot"; n: TNode } | { kind: "ghost"; n: TNode; g: (typeof formerSlots)[number] } | { kind: "plus"; n: TNode } | { kind: "drill"; n: TNode };
const keyOf = (s: Subject) => `${s.kind}:${s.n.key}`;
function eligiblePlus(model: Model, n: TNode) {
  return !n.slot && !n.inSlot && n.p.length > 1 && !n.hid && !model.all().some((d) => d.slot && d.key.startsWith(`${n.key}.`));
}
function subjectsFor(model: Model, p: number[] | null, slotPath: number[] | null): Subject[] {
  const out: Subject[] = [];
  const n = p ? model.get(p) : undefined;
  const slot = slotPath ? model.get(slotPath) : n ? (n.slot ? n : slotOf(n)) : undefined;
  if (slot?.slot) out.push({ kind: "slot", n: slot });
  if (n && !n.slot && !slotOf(n)) {
    const g = formerSlots.find((f) => f.path.join(".") === n.key);
    if (g) out.push({ kind: "ghost", n, g });
    else if (eligiblePlus(model, n)) out.push({ kind: "plus", n });
  }
  if (n?.inst) out.push({ kind: "drill", n });
  return out;
}
function subjects(model = latest.model): Subject[] {
  if (!model) return [];
  const sel = templateNodeOfSelection(model);
  const list = [...subjectsFor(model, hover.p, hover.slot), ...(sel ? subjectsFor(model, sel.p, null) : [])];
  if (renaming.p) { const r = model.get(renaming.p); if (r?.slot) list.push({ kind: "slot", n: r }); }
  if (overChip || Date.now() < linger.until) {
    for (const key of linger.keys) {
      const [kind, k] = key.split(/:(.*)/s);
      const n = model.byKey.get(k);
      if (!n) continue;
      if (kind === "slot" && n.slot) list.push({ kind: "slot", n });
      else if (kind === "plus") list.push({ kind: "plus", n });
      else if (kind === "drill") list.push({ kind: "drill", n });
      else if (kind === "ghost") { const g = formerSlots.find((f) => f.path.join(".") === n.key); if (g) list.push({ kind: "ghost", n, g }); }
    }
  }
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(keyOf(s)) ? false : (seen.add(keyOf(s)), true)));
}
function subjectsKeys() { return subjects().map(keyOf); }

let clickTimer: ReturnType<typeof setTimeout> | undefined;
/** Click: check / uncheck (after a moment, so a double-click never flips it); double-click: rename. */
function chipButton(onClick: () => void, onDouble?: () => void) {
  const b = el("button", "cb14-mode__chip");
  b.type = "button";
  b.addEventListener("click", () => { clearTimeout(clickTimer); clickTimer = setTimeout(onClick, onDouble ? 240 : 0); });
  if (onDouble) b.addEventListener("dblclick", (e) => { e.preventDefault(); clearTimeout(clickTimer); onDouble(); });
  b.addEventListener("pointerenter", chipEnter);
  b.addEventListener("pointerleave", chipLeave);
  return b;
}
const byKey = (k: string | undefined) => (k ? latest.model?.byKey.get(k) : undefined);

export function drawLayer(model: Model) {
  const box = frameBox();
  if (!mode.now || !model.ok || !box) { clearLayer(); return; }
  layerEl();
  for (const node of parts.values()) node.dataset.seen = "";
  const host = model.host!;
  // The frame around the instance being edited.
  const focus = part("focus", () => { const f = el("div", "cb14-focus"); f.append(el("span", "cb14-focus__label")); return f; });
  place(focus, host, variant === "A" ? 6 : 10);
  (focus.firstElementChild as HTMLElement).textContent = variant === "A"
    ? `template of <${model.tag}> · ${mode.now.show === "fallbacks" ? "placeholders" : "this page's content in its slots"}`
    : `<${model.tag}> · ${mode.now.contentFrom ? `content from ${deps().pageLabel(mode.now.contentFrom)}` : "placeholders"}`;
  // A: the rest of the page, shaded but visible.
  if (variant === "A") {
    const W = box.width, H = box.height, pad = 6;
    const [x, y, w, h] = [host[0] - pad, host[1] - pad, host[2] + pad * 2, host[3] + pad * 2];
    const shades: [string, Rect][] = [
      ["shade:t", [0, 0, W, Math.max(y, 0)]],
      ["shade:b", [0, y + h, W, Math.max(H - y - h, 0)]],
      ["shade:l", [0, Math.max(y, 0), Math.max(x, 0), Math.max(Math.min(h, H - y), 0)]],
      ["shade:r", [x + w, Math.max(y, 0), Math.max(W - x - w, 0), Math.max(Math.min(h, H - y), 0)]],
    ];
    for (const [key, r] of shades) {
      const shade = part(key, () => {
        const s = el("div", "cb14-shade");
        s.addEventListener("wheel", (event) => { event.preventDefault(); frame()?.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "scroll-by", dy: event.deltaY }, "*"); }, { passive: false });
        s.addEventListener("click", () => readout("Outside the component", ["The rest of the page stays as it is while the template is edited. Done (top) returns to the page."], "refused"));
        return s;
      });
      place(shade, r);
    }
  }
  // An empty items slot keeps its drop area labelled (a place to build, not a label).
  for (const n of model.all()) {
    if (!n.slot?.drop || n.r[2] + n.r[3] === 0) continue;
    const area = part(`drop:${n.key}`, () => el("div", "cb14-area is-drop"));
    place(area, n.r, 2);
    area.textContent = `Empty slot “${n.slot.name || "unnamed"}” · + or a rail block adds into it`;
  }
  const list = subjects(model);
  hooks.hovered?.(list.map((s) => s.n.key));
  for (const s of list) {
    const n = s.n;
    const r = n.r;
    if (r[2] + r[3] === 0) continue;
    if (s.kind === "slot") {
      const items = isItemsSlot(n);
      const boxEl = part(`slot:${n.key}`, () => {
        const b = el("div", "cb14-mode__slot");
        b.dataset.k = n.key;
        const chip = chipButton(() => { const now = byKey(b.dataset.k); if (now?.slot) toggleSlot(now); }, () => { const now = byKey(b.dataset.k); if (now?.slot) startRename(now); });
        b.append(chip);
        return b;
      });
      boxEl.dataset.k = n.key;
      boxEl.classList.toggle("cb14-mode__slot--items", items);
      boxEl.classList.toggle("is-items-group", items);
      boxEl.classList.toggle("is-renaming", renaming.p?.join(".") === n.key);
      boxEl.classList.toggle("is-low", r[1] < 26);
      place(boxEl, r, 2);
      const count = n.slot!.showsPage ? n.slot!.assigned : n.kids.length;
      const chip = boxEl.firstElementChild as HTMLElement;
      chip.textContent = items ? `✓ ${n.slot!.name || "items"} ×${count}` : `✓ ${n.slot!.name}`;
      if (n.slot!.showsPage) chip.append(el("span", "cb14-mode__chip-note", "this page"));
      chip.title = `${items ? "Items slot" : "Slot"} “${n.slot!.name || "unnamed"}”: click to uncheck (keep it fixed) · double-click to rename`;
      if (renaming.p?.join(".") === n.key) {
        if (!renaming.chip) { renaming.chip = renameInput(renaming.original ?? "", "cb14-mode__field cb14-mode__field--chip"); layerEl().append(renaming.chip); }
        Object.assign(renaming.chip.style, { left: `${r[0] + r[2] - 118}px`, top: `${items || r[1] < 26 ? r[1] + 4 : r[1] - 24}px` });
      }
      // "+" at the slot's end: add into its fallback.
      const add = part(`add:${n.key}`, () => {
        const b = el("button", "cb14-slot-add", "+");
        b.type = "button";
        b.addEventListener("pointerenter", chipEnter);
        b.addEventListener("pointerleave", chipLeave);
        b.addEventListener("click", () => { const now = byKey(b.dataset.k); if (now?.slot) hooks.addInto?.(now, b.getBoundingClientRect()); });
        return b;
      });
      add.dataset.k = n.key;
      add.title = items ? `Add to “${n.slot!.name || "unnamed"}”: its card or a block` : `Add a block into the “${n.slot!.name}” slot's fallback`;
      const row = n.row;
      Object.assign(add.style, row
        ? { left: `${r[0] + r[2] + 4}px`, top: `${r[1] + r[3] / 2 - 11}px` }
        : { left: `${r[0] + r[2] / 2 - 11}px`, top: `${r[1] + r[3] - 9}px` });
    } else if (s.kind === "ghost") {
      const boxEl = part(`ghost:${n.key}`, () => {
        const b = el("div", "cb14-mode__slot is-fixed");
        b.dataset.k = n.key;
        b.append(chipButton(() => { const g = formerSlots.find((f) => f.path.join(".") === b.dataset.k); if (g) unfix(g); }));
        return b;
      });
      boxEl.dataset.k = n.key;
      boxEl.classList.toggle("is-low", r[1] < 26);
      place(boxEl, r, 2);
      const chip = boxEl.firstElementChild as HTMLElement;
      chip.textContent = `○ ${s.g.name}`;
      chip.title = `Fixed: click to check it, making <${n.t}> the slot “${s.g.name}” again`;
    } else if (s.kind === "plus") {
      const b = part(`plus:${n.key}`, () => {
        const x = el("button", "cb14-mode__plus", "+ slot");
        x.type = "button";
        x.dataset.k = n.key;
        x.title = "Make this part a slot: each page can put its own element here";
        x.addEventListener("pointerenter", chipEnter);
        x.addEventListener("pointerleave", chipLeave);
        x.addEventListener("click", () => { const now = byKey(x.dataset.k); if (now) makeSlot(now); });
        return x;
      });
      Object.assign(b.style, { left: `${r[0] + r[2] - 4}px`, top: `${r[1] + 2}px` });
    } else if (s.kind === "drill") {
      const b = part(`drill:${n.key}`, () => {
        const x = el("button", "cb14-drill");
        x.type = "button";
        x.dataset.k = n.key;
        x.addEventListener("pointerenter", chipEnter);
        x.addEventListener("pointerleave", chipLeave);
        x.addEventListener("click", () => { const now = byKey(x.dataset.k); if (now) hooks.drill?.(now); });
        return x;
      });
      b.textContent = `◇ ${n.t} ›`;
      b.title = `Open <${n.t}>'s own template`;
      Object.assign(b.style, { left: `${r[0] + 10}px`, top: `${Math.max(r[1] - 11, 2)}px` });
    }
  }
  for (const [key, node] of parts) if (!node.dataset.seen) { node.remove(); parts.delete(key); }
}

function makeSlot(n: TNode) {
  const name = roleName(n, slotNames());
  const source = deps().sources()[templatePath()!] ?? "";
  const edit = wrapEdit(source, n.p, name);
  if (edit && writeTemplate(edit, `Made <${n.t}> a slot “${name}”`, [...n.p, 0]))
    done(`“+ slot” on <${n.t}>: now slot “${name}”`, [`Its markup is the slot's fallback; pages can fill <… slot="${name}">.`]);
}

export function setFrameState(on: boolean) {
  const now = mode.now;
  const tags = now?.chain ?? [];
  framePost("state", {
    state: on && now ? {
      on: true,
      variant,
      top: { tag: tags[0].tag, node: now.topNode ?? null },
      drill: tags.slice(1).map((s) => ({ tag: s.tag, path: s.path ?? [] })),
      show: now.show,
      content: variant !== "A" && now.contentFrom ? stageContent(now.contentFrom, tags.at(-1)!.tag) : null,
      width: variant === "B" ? now.width ?? null : null,
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
    } : { on: false },
  });
}
function stageContent(file: string, tag: string) { return instanceContent(file, tag) ?? null; }
