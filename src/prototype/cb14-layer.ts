// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// The layer over the preview frame while a template is edited (ticket 04's
// chips, carried into Edit component mode):
//   - a purple frame around the instance being edited; in A, the rest of the
//     page is shaded (still visible, not clickable; the wheel scrolls it)
//   - a chip on every slot: a click switches it to fixed (its fallback stays,
//     as fixed markup) and back; a double-click renames it, in the chip and in
//     Structure at once; × removes it (keep its fallback as fixed, or remove
//     it with its fallback)
//   - "+ slot" on a hovered fixed part (named from its role, ticket 03)
//   - "◇ card-project ›" on a nested component instance: drill into it
//   - an empty items slot's drop area, labelled

import {
  deps, el, latest, mode, variant, normaliseName, isItemsSlot, slotNames, roleName, writeTemplate, unwrapEdit, removeEdit, wrapEdit, renameEdit,
  templatePath, frameBox, framePost, frame, readout, usageOf, tagNow, instanceContent, itemsNames, type Model, type Rect, type TNode,
} from "./cb14-core";

export const hooks: { drill?: (n: TNode) => void; changed?: () => void; renameMirror?: (p: number[] | undefined, value: string) => void } = {};

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
// Chips are placed right-aligned to their part; one that would overlap a chip placed before it moves left.
let placed: { l: number; t: number; r: number; b: number }[] = [];
function placeChip(node: HTMLElement, right: number, top: number) {
  const w = node.offsetWidth || 60, h = node.offsetHeight || 20;
  let left = right - w;
  for (let guard = 0; guard < 12; guard++) {
    const hit = placed.find((o) => left < o.r + 3 && left + w > o.l - 3 && top < o.b + 2 && top + h > o.t - 2);
    if (!hit) break;
    left = hit.l - w - 4;
  }
  placed.push({ l: left, t: top, r: left + w, b: top + h });
  Object.assign(node.style, { left: `${left}px`, right: "auto", top: `${top}px` });
}
export function clearLayer() {
  for (const node of parts.values()) node.remove();
  parts.clear();
  plus.hidden = true;
}

// ---- Slots switched to fixed in this session, so their chip can switch them back. ----
export const formerSlots: { name: string; path: number[]; tag: string; items: boolean }[] = [];

// ---- Hover ("+ slot"). ----
let hoverPath: number[] | null = null;
export function setHover(p: number[] | null) { hoverPath = p; if (latest.model) drawLayer(latest.model); }
const plus = (() => {
  const b = el("button", "cb14-plus", "+ slot");
  b.type = "button";
  b.hidden = true;
  b.title = "Make this part a slot: each page can put its own element here";
  b.addEventListener("click", () => {
    const n = b.dataset.p ? latest.model?.get(b.dataset.p.split(".").map(Number)) : undefined;
    if (!n) return;
    const name = roleName(n, slotNames());
    const source = deps().sources()[templatePath()!] ?? "";
    const edit = wrapEdit(source, n.p, name);
    if (edit && writeTemplate(edit, `Made <${n.t}> a slot “${name}”`, n.p)) {
      b.hidden = true;
      done(`“+ slot” on <${n.t}>: now slot “${name}”`, [`Its markup is the slot's fallback; pages can fill <… slot="${name}">.`]);
    }
  });
  return b;
})();

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
  if (edit && writeTemplate(edit, `<${g.tag}> → slot “${g.name}” again`, g.path)) {
    formerSlots.splice(formerSlots.indexOf(g), 1);
    done(`Slot “${g.name}” is back`, ["Pages' own content for it shows again."]);
  }
}
export function removeSlot(n: TNode, keep: boolean) {
  const source = deps().sources()[templatePath()!] ?? "";
  const edit = keep ? unwrapEdit(source, n.p) : removeEdit(source, n.p);
  if (edit && writeTemplate(edit, keep ? `Removed slot “${n.slot!.name}”, fallback kept fixed` : `Removed slot “${n.slot!.name}” with its fallback`))
    done(`Slot “${n.slot!.name || "unnamed"}” removed`, [keep ? "Its fallback stays as fixed markup." : "The slot and its fallback are gone from the template."]);
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

// ---- The remove menu on a chip's ×. ----
let menu: HTMLElement | undefined;
function closeMenu() { menu?.remove(); menu = undefined; }
function openRemoveMenu(n: TNode, at: DOMRect) {
  closeMenu();
  menu = el("div", "cb14-menu");
  menu.setAttribute("role", "menu");
  const name = n.slot!.name || "unnamed";
  menu.append(el("div", "cb14-menu__title", `Remove slot “${name}”`));
  const keep = el("button", "cb14-menu__item", "Keep its fallback, as fixed markup");
  keep.type = "button";
  keep.addEventListener("click", () => { closeMenu(); removeSlot(n, true); });
  const drop = el("button", "cb14-menu__item is-danger", n.kids.length ? `Remove it with its fallback (${n.kids.map((k) => `<${k.t}>`).join(", ")})` : "Remove it");
  drop.type = "button";
  drop.addEventListener("click", () => { closeMenu(); removeSlot(n, false); });
  menu.append(keep, drop);
  document.body.append(menu);
  Object.assign(menu.style, { left: `${Math.min(at.left, innerWidth - 300)}px`, top: `${at.bottom + 6}px` });
  keep.focus();
  setTimeout(() => document.addEventListener("pointerdown", (e) => { if (!menu?.contains(e.target as Node)) closeMenu(); }, { once: true }), 0);
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeMenu(); } });
}

// ---- Drawing. ----
let clickTimer: ReturnType<typeof setTimeout> | undefined;
function slotChip(n: TNode) {
  const key = `slot:${n.key}`;
  const chip = part(key, () => {
    const wrap = el("div", "cb14-chip");
    const main = el("button", "cb14-chip__main");
    main.type = "button";
    main.addEventListener("click", () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { const now = latest.model?.get(wrap.dataset.p!.split(".").map(Number)); if (now?.slot) toggleSlot(now); }, 240);
    });
    main.addEventListener("dblclick", (event) => {
      event.preventDefault();
      clearTimeout(clickTimer);
      const now = latest.model?.get(wrap.dataset.p!.split(".").map(Number));
      if (now?.slot) startRename(now);
    });
    const x = el("button", "cb14-chip__x", "×");
    x.type = "button";
    x.title = "Remove this slot…";
    x.addEventListener("click", () => { const now = latest.model?.get(wrap.dataset.p!.split(".").map(Number)); if (now?.slot) openRemoveMenu(now, x.getBoundingClientRect()); });
    wrap.append(main, x);
    return wrap;
  });
  chip.dataset.p = n.key;
  const items = isItemsSlot(n);
  chip.classList.toggle("is-items", items);
  chip.classList.toggle("is-page", Boolean(n.slot!.showsPage));
  const main = chip.firstElementChild as HTMLElement;
  const what = items ? `${n.slot!.name || "items"}` : n.slot!.name;
  const count = n.slot!.showsPage ? ` · this page ×${n.slot!.assigned}` : items ? ` · fallback ×${n.kids.length}` : "";
  main.textContent = `${items ? "▦" : "✓"} ${what}${count}`;
  main.title = `${items ? "Items slot" : "Slot"} “${n.slot!.name || "unnamed"}”: click to make it fixed · double-click to rename`;
  return chip;
}

export function drawLayer(model: Model) {
  const box = frameBox();
  if (!mode.now || !model.ok || !box) { clearLayer(); return; }
  const root = layerEl();
  placed = [];
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
  // Slots: an area and a chip each.
  const top = (r: Rect) => (r[1] > 26 ? r[1] - 24 : r[1] + 4);
  for (const n of model.all()) {
    if (!n.slot || (n.hid && !n.slot.drop)) continue;
    const r = n.r;
    if (r[2] + r[3] === 0) continue;
    const area = part(`area:${n.key}`, () => el("div", "cb14-area"));
    area.classList.toggle("is-items", isItemsSlot(n));
    area.classList.toggle("is-drop", n.slot.drop);
    place(area, r, 2);
    if (n.slot.drop) {
      area.textContent = `Empty items slot “${n.slot.name || "unnamed"}” · click a block in the rail, or drop one here`;
    } else area.textContent = "";
    const chip = slotChip(n);
    chip.classList.toggle("is-renaming", renaming.p?.join(".") === n.key);
    // At the area's top right (the edit bar takes the top left).
    placeChip(chip, Math.min(r[0] + r[2], box.width - 2), top(r));
    if (renaming.p?.join(".") === n.key) {
      if (!renaming.chip) { renaming.chip = renameInput(renaming.original ?? "", "cb14-rename--chip"); root.append(renaming.chip); }
      Object.assign(renaming.chip.style, { left: "auto", right: `${Math.max(box.width - (r[0] + r[2]), 0)}px`, top: `${top(r)}px` });
    }
  }
  // Slots switched to fixed this session: their chip, to switch back.
  for (const g of [...formerSlots]) {
    const n = model.get(g.path);
    if (!n || n.t !== g.tag || n.slot || n.inSlot) { formerSlots.splice(formerSlots.indexOf(g), 1); continue; }
    const ghost = part(`ghost:${g.name}`, () => {
      const b = el("button", "cb14-chip cb14-chip--ghost");
      b.type = "button";
      b.addEventListener("click", () => { const now = formerSlots.find((f) => f.name === b.dataset.name); if (now) unfix(now); });
      return b;
    });
    ghost.dataset.name = g.name;
    ghost.textContent = `○ ${g.name}`;
    ghost.title = `Fixed now: click to make <${g.tag}> the slot “${g.name}” again`;
    placeChip(ghost, Math.min(n.r[0] + n.r[2], box.width - 2), top(n.r));
  }
  // Nested components: drill in.
  for (const n of model.all()) {
    if (!n.inst || n.hid || n.r[2] + n.r[3] === 0) continue;
    const chip = part(`inst:${n.key}`, () => {
      const b = el("button", "cb14-drill");
      b.type = "button";
      b.addEventListener("click", () => { const now = latest.model?.get(b.dataset.p!.split(".").map(Number)); if (now) hooks.drill?.(now); });
      return b;
    });
    chip.dataset.p = n.key;
    chip.textContent = `◇ ${n.t} ›`;
    chip.title = `Open <${n.t}>'s own template (its fallback card here)`;
    placeChip(chip, n.r[0] + n.r[2] - 8, Math.max(n.r[1] - 10, 2));
  }
  for (const n of model.all()) {
    if (!n.slot?.showsPage || !n.pageItems) continue;
    n.pageItems.forEach((item, i) => {
      if (!item.t.includes("-")) return;
      const chip = part(`pinst:${n.key}:${i}`, () => {
        const b = el("button", "cb14-drill cb14-drill--page");
        b.type = "button";
        b.addEventListener("click", () => { const now = latest.model?.get(b.dataset.p!.split(".").map(Number)); const first = now?.kids.find((k) => k.t === b.dataset.t); if (first) hooks.drill?.(first); else readout("Not in the template", [`This page's <${b.dataset.t}> is page content; the slot's fallback has none to open. Edit it from the page after Done.`], "refused"); });
        return b;
      });
      chip.dataset.p = n.key;
      chip.dataset.t = item.t;
      chip.textContent = `◇ ${item.t} ›`;
      chip.title = `This page's <${item.t}>: open the component's template`;
      placeChip(chip, item.r[0] + item.r[2] - 8, Math.max(item.r[1] - 10, 2));
    });
  }
  // "+ slot" on a hovered fixed part.
  const hovered = hoverPath ? model.get(hoverPath) : undefined;
  const offer = hovered && !hovered.slot && !hovered.inSlot && hovered.p.length > 1 && !hovered.hid
    && !model.all().some((d) => d.slot && d.key.startsWith(`${hovered.key}.`));
  if (offer) {
    root.append(plus);
    plus.hidden = false;
    plus.dataset.p = hovered.key;
    Object.assign(plus.style, { left: `${hovered.r[0] + hovered.r[2] - 4}px`, top: `${hovered.r[1] + 2}px` });
  } else if (!plus.matches(":hover")) plus.hidden = true;
  for (const [key, node] of parts) if (!node.dataset.seen) { node.remove(); parts.delete(key); }
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
