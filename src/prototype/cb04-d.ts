// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// Variant D, "Slot marking" (Lex, 2026-10-08):
// - Make component starts from the edit bar, the Structure row ⋯ menu, or a
//   right-click (in the preview, forwarded by the runtime, or on a Structure row).
// - Making mode: ticket 03's slots are pre-marked in purple on the page and in
//   Structure; selecting a part shows a purple Editable toggle (+ slot name) in
//   the edit bar; the context menu toggles and renames; a slim bar names the
//   component and creates it; then Edit component mode opens.
// - New component: "+ New component" at the top of the Add panel's components,
//   a tiny form (name + tag), then a blank component placed and opened in Edit
//   component mode.

import { cb04Hooks, cb04Variant } from "./cb04";
import type { NativePreviewSelection } from "../components/native-preview";
import type { EditBarControl } from "../components/edit-bar";
import { planComponent, suggestName, instanceFromTemplate, type ComponentPlan, type PlannedSlot } from "./cb04-rule";
import {
  state, deps, el, btn, toast, takenTags, nameField, makeInPlace, makeAndPlace, targetAt, targetOf,
  frameRects, frameEvents, scrollFrame, normaliseName, normaliseInput, type Rect, type Target,
} from "./cb04-core";

const SLOT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CONTAINERS = new Set(["section", "article", "header", "footer", "aside", "nav", "figure", "div", "form"]);

interface Making {
  target: Target;
  fixed: Set<string>;
  forced: Set<string>;
  names: Map<string, string>;
  plan?: ComponentPlan;
  name: ReturnType<typeof nameField>;
  count: HTMLElement;
  create: HTMLButtonElement;
  stop: () => void;
}
let making: Making | undefined;
let barRel: number[] | undefined;

export function installD() {
  cb04Hooks.making = () => Boolean(making);
  cb04Hooks.marking = markingControls;
  frameEvents.contextmenu = (x, y) => void setTimeout(() => openContextMenu(x, y), 150);
  frameEvents.hover = (path, node) => onHover?.(path, node);
  // The frame forwards right-clicks once asked (and again after it reloads).
  const ping = () => { const path = deps().currentPath(); if (path) void frameRects(path, [], { contextmenu: true }); };
  setInterval(ping, 1500);
  ping();
  watchStructureD();
  new MutationObserver(() => { if (document.querySelector(".edit-bar .cb04-editable-toggle:not([data-synced])")) syncEditBar(); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("contextmenu", (event) => {
    const row = (event.target as Element).closest?.<HTMLElement>(".page-structure__row[data-node]");
    if (!row) return;
    event.preventDefault();
    const path = deps().currentPath();
    if (path) deps().preview()?.selectNode({ path, node: row.dataset.node!.split(".").map(Number) });
    const { clientX: x, clientY: y } = event;
    setTimeout(() => openContextMenu(x, y), 200);
  }, true);
}

export const canMake = (selection: NativePreviewSelection | undefined) =>
  Boolean(selection && !selection.host && selection.node && CONTAINERS.has(selection.tag) && targetOf(selection));

// ---------------------------------------------------------------- the plan and the user's choices.
const tagOrDefault = () => making?.name.value() || "x-component";
function replan() {
  if (!making) return;
  const made = planComponent(making.target.outer, tagOrDefault(), making.fixed, { names: making.names, forced: making.forced });
  making.plan = "error" in made ? undefined : made;
  const slots = making.plan?.slots ?? [];
  const on = slots.filter((slot) => !slot.fixed).length;
  making.count.textContent = `${on} slot${on === 1 ? "" : "s"} · ${slots.length - on} fixed`;
  const problem = slots.some((slot) => !slot.fixed && nameProblem(slot));
  making.count.classList.toggle("is-warning", problem);
  if (problem) making.count.textContent += " · check the slot names";
  making.create.disabled = Boolean(making.name.problem());
  decorateStructure();
  syncEditBar();
}

function nameProblem(slot: PlannedSlot) {
  if (slot.kind === "items") return undefined;
  if (cb04Variant() !== "E" && !SLOT_NAME.test(slot.name)) return "Use lowercase letters, digits and single dashes";
  if (making?.plan?.slots.some((other) => other !== slot && !other.fixed && other.name === slot.name)) return `“${slot.name}” is used twice`;
  return undefined;
}

/** The selected element's index path inside the section being made (the root itself excluded). */
function relOf(selection: NativePreviewSelection | undefined) {
  if (!making || !selection) return undefined;
  const t = making.target;
  const node = selection.host?.node && selection.host.path === t.path ? selection.host.node : selection.path === t.path ? selection.node : undefined;
  if (!node || node.length <= t.node.length || !t.node.every((n, i) => node[i] === n)) return undefined;
  return node.slice(t.node.length);
}

interface Hit { key: string; slot?: PlannedSlot; inside?: PlannedSlot }
function hitFor(rel: number[]): Hit {
  const key = rel.join(".");
  const slots = making?.plan?.slots ?? [];
  const own = slots.find((slot) => slot.paths.some((p) => p.join(".") === key))
    // A repeated group is marked on its container.
    ?? slots.find((slot) => slot.kind === "items" && slot.paths.every((p) => p.slice(0, -1).join(".") === key));
  if (own) return { key, slot: own };
  return { key, inside: slots.find((slot) => slot.paths.some((p) => key.startsWith(`${p.join(".")}.`))) };
}
const isOn = (hit: Hit) => Boolean(hit.slot && !hit.slot.fixed);

function setEditable(hit: Hit, on: boolean) {
  if (!making || hit.inside) return;
  if (hit.slot) {
    if (!on && making.forced.has(hit.slot.key)) making.forced.delete(hit.slot.key);
    else if (on) making.fixed.delete(hit.slot.key);
    else making.fixed.add(hit.slot.key);
  } else if (on) making.forced.add(hit.key);
  replan();
}

function rename(slot: PlannedSlot, name: string) {
  if (!making) return;
  making.names.set(slot.key, name.trim());
  replan();
}

// ---------------------------------------------------------------- making mode.
export function startMakingD(target: Target) {
  making?.stop();
  document.querySelector(".cb04-toast")?.remove();
  const layer = el("div", "cb04-d");
  const clip = el("div", "cb04-d__clip");
  const frameBox = el("div", "cb04-d__frame");
  frameBox.append(el("span", "cb04-d__frame-label", `Making a component from this <${target.tag}>`));
  clip.append(frameBox);
  const bar = el("div", "cb04-d__bar");
  const name = nameField(suggestName(target.outer, takenTags()), () => replan());
  name.wrap.classList.add("cb04-name--inline");
  const count = el("span", "cb04-d__count");
  const create = btn("Create", () => void submit(), "button primary");
  bar.append(el("strong", "cb04-d__title", "Make component"), name.wrap, count,
    el("span", "cb04-d__hint", "Select a part: Editable in the edit bar, or right-click"),
    btn("Cancel", () => stop(true), "button secondary"), create);
  layer.append(clip);
  // The markers sit under the editor's edit bar (z-index 30); the slim bar above everything.
  document.body.append(layer, bar);
  const boxes = new Map<string, HTMLElement>();
  let alive = true;
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || (event.target as Element).closest?.(".cb04-rename, .cb04-editable-name-wrap, .cb04-menu")) return;
    event.preventDefault();
    event.stopPropagation();
    stop(true);
  };
  document.addEventListener("keydown", onKey, true);
  function stop(reselect: boolean) {
    alive = false;
    layer.remove();
    bar.remove();
    document.removeEventListener("keydown", onKey, true);
    making = undefined;
    decorateStructure();
    closeRename();
    if (reselect) deps().preview()?.selectNode({ path: target.path, node: target.node });
  }
  making = { target, fixed: new Set(), forced: new Set(), names: new Map(), name, count, create, stop: () => stop(false) };
  replan();
  // Show the bar's Make component button gone and the toggle ready: select the section again.
  deps().preview()?.selectNode({ path: target.path, node: target.node });

  const union = (rects: (Rect | null)[]) => {
    const hits = rects.filter((r): r is Rect => Boolean(r));
    if (!hits.length) return undefined;
    const x = Math.min(...hits.map((r) => r.x)), y = Math.min(...hits.map((r) => r.y));
    return { x, y, w: Math.max(...hits.map((r) => r.x + r.w)) - x, h: Math.max(...hits.map((r) => r.y + r.h)) - y };
  };
  const place = (node: HTMLElement, r: Rect | undefined, pad = 0) => {
    node.hidden = !r;
    if (r) Object.assign(node.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px` });
  };
  async function follow() {
    if (!alive || !making) return;
    const slots = (making.plan?.slots ?? []).filter((slot) => !slot.fixed);
    const rects = await frameRects(target.path, [target.node, ...slots.flatMap((slot) => slot.paths.map((p) => [...target.node, ...p]))], { contextmenu: true });
    if (!alive) return;
    const f = document.querySelector(".native-preview-frame")?.getBoundingClientRect();
    if (!f) { setTimeout(() => void follow(), 150); return; }
    place(clip, { x: f.left, y: f.top, w: f.width, h: f.height });
    const offset = (r: Rect | null | undefined) => (r ? { ...r, x: r.x - f.left, y: r.y - f.top } : undefined);
    place(frameBox, offset(rects[0]), 6);
    const seen = new Set<string>();
    let at = 1;
    for (const slot of slots) {
      const own = rects.slice(at, at + slot.paths.length);
      at += slot.paths.length;
      seen.add(slot.key);
      let box = boxes.get(slot.key);
      if (!box) {
        box = el("div", "cb04-d__slot");
        box.append(el("span", "cb04-d__badge"));
        box.addEventListener("wheel", (event) => scrollFrame(event.deltaY), { passive: true });
        clip.append(box);
        boxes.set(slot.key, box);
      }
      const r = offset(union(own));
      place(box, r, 2);
      const problem = nameProblem(slot);
      box.classList.toggle("is-items", slot.kind === "items");
      box.classList.toggle("is-warning", Boolean(problem));
      box.classList.toggle("badge-inside", Boolean(r && r.x < 70));
      (box.firstChild as HTMLElement).textContent = slot.kind === "items" ? `items ×${slot.count}` : `${slot.name}${problem ? " ⚠" : ""}`;
      box.title = problem ?? "";
    }
    for (const [key, box] of boxes) if (!seen.has(key)) { box.remove(); boxes.delete(key); }
    Object.assign(bar.style, { left: `${f.left + f.width / 2}px`, top: `${f.top + 10}px` });
    setTimeout(() => void follow(), 120);
  }
  void follow();

  async function submit() {
    if (!making) return;
    if (name.problem()) { name.input.focus(); return; }
    const slots = making.plan?.slots ?? [];
    const bad = slots.find((slot) => !slot.fixed && nameProblem(slot));
    if (bad) { toast(`Slot “${bad.name}”: ${nameProblem(bad)}`); return; }
    const tag = name.value();
    const now = targetAt(target.path, target.node);
    const choices = { names: making.names, forced: making.forced };
    const fixed = making.fixed;
    stop(false);
    if (!now || now.outer !== target.outer) { toast("The section changed meanwhile; select it again."); return; }
    const made = planComponent(now.outer, tag, fixed, choices);
    if ("error" in made || !(await makeInPlace(now, tag, made))) return;
    for (let i = 0; i < 40 && !takenTags().includes(tag); i++) await new Promise((r) => setTimeout(r, 100));
    await state.host?.editComponent(tag);
    toast(`Made <${tag}> · Edit component mode: its template is in the code pane`);
  }
  name.input.focus();
  name.input.select();
}

// ---------------------------------------------------------------- edit bar: the purple Editable toggle.
function markingControls(selection: NativePreviewSelection): EditBarControl[] {
  // Variant E: no toggle in the edit bar (the chips on the page are the toggle).
  if (cb04Variant() === "E") { barRel = undefined; return []; }
  const rel = relOf(selection);
  barRel = rel;
  if (!rel) return [];
  const hit = hitFor(rel);
  if (hit.inside) {
    const what = hit.inside.kind === "items" ? `items ×${hit.inside.count}` : `“${hit.inside.name}”`;
    return [{ kind: "button", label: hit.inside.fixed ? "In a fixed part" : `In slot ${what}`, className: "cb04-editable-toggle is-inside", disabled: true, title: hit.inside.fixed ? "Part of an element kept fixed in the template" : hit.inside.kind === "items" ? "Part of the page's repeated items (the unnamed slot): each page keeps its own" : `Part of the slot ${what}: the page supplies the whole element`, onPress: () => undefined }];
  }
  const on = isOn(hit);
  return [{
    kind: "button", label: "Editable", pressed: on, className: `cb04-editable-toggle${on ? " is-on" : ""}`,
    title: "On: a slot each page fills in. Off: fixed in the template.",
    onPress: () => { const now = hitFor(rel); setEditable(now, !isOn(now)); },
  }];
}

/** The toggle's state and the slot name field beside it, kept up to date. */
function syncEditBar() {
  const toggle = document.querySelector<HTMLButtonElement>(".edit-bar .cb04-editable-toggle");
  if (!toggle) return;
  toggle.dataset.synced = "";
  let wrap = toggle.parentElement?.querySelector<HTMLElement>(".cb04-editable-name-wrap") ?? undefined;
  if (!making || !barRel || toggle.classList.contains("is-inside")) { wrap?.remove(); return; }
  const hit = hitFor(barRel);
  const on = isOn(hit);
  toggle.setAttribute("aria-pressed", String(on));
  toggle.classList.toggle("is-on", on);
  if (!on || !hit.slot) { wrap?.remove(); return; }
  const slot = hit.slot;
  if (!wrap) {
    wrap = el("span", "cb04-editable-name-wrap");
    const input = el("input", "cb04-editable-name");
    input.type = "text";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Slot name");
    input.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") input.blur(); });
    input.addEventListener("input", () => { const now = barRel && hitFor(barRel).slot; if (now) rename(now, input.value); });
    wrap.append(el("span", "cb04-editable-name-label", "slot"), input, el("span", "cb04-editable-warn"));
    toggle.after(wrap);
  }
  const input = wrap.querySelector<HTMLInputElement>("input")!;
  input.disabled = slot.kind === "items";
  if (document.activeElement !== input) input.value = slot.kind === "items" ? `items ×${slot.count} (unnamed)` : slot.name;
  const problem = nameProblem(slot);
  wrap.classList.toggle("is-warning", Boolean(problem));
  wrap.querySelector(".cb04-editable-warn")!.textContent = problem ?? "";
}

// ---------------------------------------------------------------- Structure: purple slot rows.
function rowKeyFor(slot: PlannedSlot) {
  const t = making!.target.node;
  return slot.kind === "items" ? [...t, ...slot.paths[0].slice(0, -1)].join(".") : [...t, ...slot.paths[0]].join(".");
}
function decorateStructure() {
  const want = new Map<string, PlannedSlot>();
  if (making) for (const slot of making.plan?.slots ?? []) if (!slot.fixed) want.set(rowKeyFor(slot), slot);
  for (const row of document.querySelectorAll<HTMLElement>(".page-structure__row[data-node]")) {
    const slot = want.get(row.dataset.node!);
    row.classList.toggle("cb04-srow", Boolean(slot));
    const root = Boolean(making && row.dataset.node === making.target.node.join("."));
    row.classList.toggle("cb04-srow--root", root);
    // One outline around the section's row and its child rows (the group after it).
    const group = row.nextElementSibling instanceof HTMLElement && row.nextElementSibling.classList.contains("page-structure__group") && !row.nextElementSibling.hidden && row.nextElementSibling.childElementCount ? row.nextElementSibling : undefined;
    row.classList.toggle("cb04-srow--root-alone", root && !group);
    if (group) group.classList.toggle("cb04-sgroup", root);
    else if (!root && row.nextElementSibling?.classList.contains("cb04-sgroup")) row.nextElementSibling.classList.remove("cb04-sgroup");
    let badge = row.querySelector<HTMLButtonElement>(":scope > .cb04-sbadge");
    if (!slot) { badge?.remove(); continue; }
    if (!badge) {
      badge = el("button", "cb04-sbadge");
      badge.type = "button";
      badge.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const now = making?.plan?.slots.find((s) => s.key === badge!.dataset.key);
        if (now && now.kind !== "items") renameSlot(now, badge!.getBoundingClientRect());
      });
      row.append(badge);
    }
    const problem = nameProblem(slot);
    badge.dataset.key = slot.key;
    badge.textContent = slot.kind === "items" ? `items ×${slot.count}` : `${slot.name}${problem ? " ⚠" : ""}`;
    badge.title = slot.kind === "items" ? "The unnamed slot: the page's repeated items" : problem ?? "Slot name: click (or double-click the row) to rename";
    badge.classList.toggle("is-warning", Boolean(problem));
  }
}
function watchStructureD() {
  setInterval(() => { if (making || document.querySelector(".cb04-srow, .cb04-srow--root")) decorateStructure(); }, 300);
  document.addEventListener("dblclick", (event) => {
    const row = (event.target as Element).closest?.<HTMLElement>(".page-structure__row.cb04-srow");
    const slot = row && making?.plan?.slots.find((s) => s.key === row.querySelector<HTMLElement>(".cb04-sbadge")?.dataset.key);
    if (!row || !slot || slot.kind === "items") return;
    event.preventDefault();
    event.stopPropagation();
    renameSlot(slot, row.querySelector(".cb04-sbadge")!.getBoundingClientRect());
  }, true);
}

// A floating field over a badge (Structure) or at the menu (context menu).
let renameEl: HTMLElement | undefined;
function closeRename() { renameEl?.remove(); renameEl = undefined; }
function openRename(slot: PlannedSlot, at: { left: number; top: number; width?: number }) {
  closeRename();
  const box = el("div", "cb04-rename");
  const input = el("input", "cb04-rename__input");
  input.value = slot.name;
  input.spellcheck = false;
  input.setAttribute("aria-label", "Slot name");
  const warn = el("span", "cb04-rename__warn");
  const check = () => {
    const name = input.value.trim();
    const why = !SLOT_NAME.test(name) ? "Use lowercase letters, digits and single dashes" : making?.plan?.slots.some((s) => s.key !== slot.key && !s.fixed && s.name === name) ? `“${name}” is used already` : "";
    warn.textContent = why;
    box.classList.toggle("is-warning", Boolean(why));
  };
  input.addEventListener("input", check);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { rename(slot, input.value); closeRename(); }
    if (event.key === "Escape") closeRename();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (renameEl === box) { rename(slot, input.value); closeRename(); } }, 100));
  box.append(el("span", "cb04-rename__label", "Slot name"), input, warn);
  Object.assign(box.style, { left: `${Math.min(at.left - 8, innerWidth - 240)}px`, top: `${at.top - 6}px` });
  document.body.append(box);
  renameEl = box;
  check();
  input.focus();
  input.select();
}

// ---------------------------------------------------------------- the context menu (preview and Structure).
let menuEl: HTMLElement | undefined;
function closeMenu() { menuEl?.remove(); menuEl = undefined; }
export function openContextMenu(x: number, y: number) {
  closeMenu();
  const selection = deps().selection();
  type Item = { label: string; run?: () => void; disabled?: boolean; slot?: boolean } | "-";
  const items: Item[] = [];
  const rel = relOf(selection);
  if (making && rel) {
    const hit = hitFor(rel);
    const on = isOn(hit);
    items.push(
      { label: "Make editable (slot)", slot: true, disabled: on || Boolean(hit.inside), run: () => setEditable(hit, true) },
      { label: "Keep fixed", slot: true, disabled: !on || Boolean(hit.inside), run: () => setEditable(hit, false) },
      { label: "Rename slot…", slot: true, disabled: !on || hit.slot?.kind === "items", run: () => { const now = hitFor(rel).slot; if (now) renameSlot(now, { left: x, top: y }); } },
      "-",
    );
  } else if (!making && canMake(selection)) {
    items.push({ label: "Make component…", run: () => { const t = selection && targetOf(selection); if (t) (cb04Variant() === "E" ? startMakingE : startMakingD)(t); } }, "-");
  }
  const node = selection?.host?.node ?? selection?.node;
  const path = selection?.host?.path ?? selection?.path;
  items.push(
    { label: "Select parent", disabled: !node || !path || node.length <= 1, run: () => { if (path && node) deps().preview()?.selectNode({ path, node: selection?.host ? node : node.slice(0, -1) }); } },
    { label: "Duplicate", disabled: true },
    { label: "Delete", disabled: true },
  );
  const menu = el("div", "cb04-menu");
  menu.setAttribute("role", "menu");
  for (const item of items) {
    if (item === "-") { menu.append(el("hr", "cb04-menu__sep")); continue; }
    const entry = btn(item.label, () => { closeMenu(); item.run?.(); }, `cb04-menu__item${item.slot ? " is-slot" : ""}`);
    entry.setAttribute("role", "menuitem");
    entry.disabled = Boolean(item.disabled || !item.run);
    menu.append(entry);
  }
  menu.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); closeMenu(); } });
  document.body.append(menu);
  const box = menu.getBoundingClientRect();
  Object.assign(menu.style, { left: `${Math.min(x, innerWidth - box.width - 8)}px`, top: `${Math.min(y, innerHeight - box.height - 8)}px` });
  menuEl = menu;
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  setTimeout(() => document.addEventListener("pointerdown", (event) => { if (!menu.contains(event.target as Node)) closeMenu(); }, { once: true }), 0);
}

// ---------------------------------------------------------------- New component.
const BLANK_TEMPLATE = `<section class="flow">
  <slot name="title"><h2>New section</h2></slot>
  <slot></slot>
</section>
`;
const BLANK_CSS = `:host {
  display: block;
}

/* Slots are display: contents, so .flow's margins between children do not
   reach what a page slots in: the component spaces its parts with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
`;

/** The tiny form: name, tag preview, Create. */
export function newForm(onDone: () => void) {
  const form = el("form", "cb04-dform");
  const taken = new Set(takenTags());
  let first = "section-new";
  for (let n = 2; taken.has(first); n++) first = `section-new-${n}`;
  const name = nameField(first, () => { create.disabled = Boolean(name.problem()); });
  const create = el("button", "button primary", "Create");
  create.type = "submit";
  const actions = el("div", "cb04-dform__actions");
  actions.append(el("span", "cb04-dform__note", "A blank section with a title and room for items; it opens in Edit component mode."), btn("Cancel", onDone), create);
  form.append(name.wrap, actions);
  form.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") onDone(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (name.problem()) return;
    const tag = name.value();
    onDone();
    document.querySelector<HTMLButtonElement>(".pb-add-panel:not([hidden]) .pb-add-panel__close")?.click();
    if (!(await makeAndPlace(tag, BLANK_TEMPLATE, BLANK_CSS, instanceFromTemplate(BLANK_TEMPLATE, tag)))) return;
    for (let i = 0; i < 40 && !takenTags().includes(tag); i++) await new Promise((r) => setTimeout(r, 100));
    await state.host?.editComponent(tag);
    toast(`Made <${tag}> · placed on the page and open in Edit component mode`);
  });
  setTimeout(() => { name.input.focus(); name.input.select(); });
  return form;
}

/** From ⌘K or Files: the same form in a small dialog. */
export function newComponentD() {
  const dialog = el("dialog", "create-dialog cb04-dialog cb04-dialog--small");
  dialog.setAttribute("aria-label", "New component");
  dialog.append(el("h2", "create-dialog__title cb04-dform__title", "New component"), newForm(() => dialog.close()));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/** The Add panel: "+ New component" at the top of its components. */
export function decorateAddPanelD(panel: HTMLElement) {
  if (panel.querySelector(".cb04-dnew")) return;
  const group = [...panel.querySelectorAll<HTMLElement>(".pb-add-group")].find((g) => g.querySelector(".pb-add-group__title"));
  const title = group?.querySelector(".pb-add-group__title");
  if (!group || !title) return;
  const entry = el("div", "cb04-dnew");
  const open = btn("", () => {
    entry.replaceChildren(newForm(() => entry.replaceChildren(open)));
  }, "cb04-dnew__open");
  open.append(el("span", "cb04-dnew__plus", "+"), el("span", "cb04-dnew__text", "New component"));
  entry.append(open);
  title.after(entry);
}

// ======================================================================
// Variant E, "Chips" (Lex: "B is more subtle and feels integrated"):
// B's framing, chips and slim bar; D's Structure panel and context menus;
// nothing in the edit bar. A click on a chip toggles slot / fixed; a
// double-click renames (the single click waits a moment, so a double-click
// never flips the toggle); hovering a non-default part offers "+ slot".

let onHover: ((path: string | null, node: number[] | null) => void) | undefined;

/** Rename from Structure or the context menu: D's floating field, E's chip + Structure fields. */
function renameSlot(slot: PlannedSlot, at: { left: number; top: number }) {
  if (cb04Variant() === "E") startChipRename?.(slot.key);
  else openRename(slot, at);
}
let startChipRename: ((key: string) => void) | undefined;

export function startMakingE(target: Target) {
  making?.stop();
  document.querySelector(".cb04-toast")?.remove();
  const layer = el("div", "cb04-mode cb04-mode--e");
  const clip = el("div", "cb04-mode__clip");
  const frameBox = el("div", "cb04-mode__frame");
  frameBox.append(el("span", "cb04-mode__frame-label", `Making a component from this <${target.tag}>`));
  clip.append(frameBox);
  const plus = btn("+ slot", () => {
    if (!plusKey || !making) return;
    making.forced.add(plusKey);
    plusKey = undefined;
    plus.hidden = true;
    replan();
  }, "cb04-mode__plus");
  plus.hidden = true;
  plus.title = "Make this part a slot";
  clip.append(plus);
  layer.append(clip);
  // B's slim bar.
  const bar = el("div", "cb04-mode__bar cb04-mode__bar--e");
  const name = nameField(suggestName(target.outer, takenTags()), () => replan(), { normalise: true });
  name.wrap.classList.add("cb04-name--inline");
  // Not shown in E (Lex: no count); replan still writes to it.
  const count = el("span", "cb04-mode__summary");
  const create = btn("Create", () => void submit(), "button primary");
  bar.append(name.wrap, btn("Cancel", () => stop(true), "button secondary"), create);
  document.body.append(layer, bar);
  // No edit bar while a component is being made.
  document.documentElement.classList.add("cb04-moding");

  const boxes = new Map<string, { box: HTMLElement; chip: HTMLButtonElement }>();
  let alive = true;
  let hoverNode: number[] | undefined;
  let hoverSeen = 0;
  let plusKey: string | undefined;
  onHover = (path, node) => {
    if (path === target.path && node && node.length > target.node.length && target.node.every((n, i) => node[i] === n)) { hoverNode = node; hoverSeen = Date.now(); }
  };

  // ---- Rename: the chip's field and the Structure badge's field, as one.
  let renaming: { key: string; original: string; chipInput: HTMLInputElement; treeInput: HTMLInputElement } | undefined;
  const renameKey = (key: string) => {
    if (!making) return;
    let slot = making.plan?.slots.find((s) => s.key === key);
    if (!slot || slot.kind === "items") return;
    if (slot.fixed) { setEditable({ key, slot }, true); slot = making.plan?.slots.find((s) => s.key === key); }
    if (!slot) return;
    endRename(false);
    const original = slot.name;
    const make = (cls: string) => {
      const input = el("input", `cb04-chip-field ${cls}`);
      input.value = original;
      input.spellcheck = false;
      input.setAttribute("aria-label", "Slot name");
      return input;
    };
    const chipInput = make("cb04-chip-field--chip");
    const treeInput = make("cb04-chip-field--tree");
    const sync = (from: HTMLInputElement, to: HTMLInputElement) => {
      normaliseInput(from);
      to.value = from.value;
      const name = normaliseName(from.value, true);
      const why = making?.plan?.slots.some((s) => s.key !== key && !s.fixed && s.name === name) ? `“${name}” is used already` : "";
      for (const input of [chipInput, treeInput]) { input.classList.toggle("is-warning", Boolean(why)); input.title = why; }
    };
    for (const [from, to] of [[chipInput, treeInput], [treeInput, chipInput]] as const) {
      from.addEventListener("input", () => sync(from, to));
      from.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") { event.preventDefault(); endRename(true); }
        if (event.key === "Escape") { event.preventDefault(); endRename(false); }
      });
      from.addEventListener("blur", () => setTimeout(() => {
        if (renaming?.key === key && document.activeElement !== chipInput && document.activeElement !== treeInput) endRename(true);
      }, 120));
    }
    renaming = { key, original, chipInput, treeInput };
    clip.append(chipInput);
    document.body.append(treeInput);
    place();
    chipInput.focus();
    chipInput.select();
    // The Structure field shows the same text, selected, at the same moment.
    treeInput.classList.add("is-mirror");
  };
  startChipRename = renameKey;
  function endRename(commit: boolean) {
    if (!renaming) return;
    const { key, original, chipInput, treeInput } = renaming;
    renaming = undefined;
    chipInput.remove();
    treeInput.remove();
    const slot = making?.plan?.slots.find((s) => s.key === key);
    const next = normaliseName(chipInput.value, true);
    if (slot && commit && next && next !== original) rename(slot, next);
    else replan();
  }

  // ---- Chips, positioned on the page.
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  const toggleKey = (key: string) => {
    const slot = making?.plan?.slots.find((s) => s.key === key);
    if (slot) setEditable({ key, slot }, slot.fixed);
  };
  const union = (rects: (Rect | null)[]) => {
    const hits = rects.filter((r): r is Rect => Boolean(r));
    if (!hits.length) return undefined;
    const x = Math.min(...hits.map((r) => r.x)), y = Math.min(...hits.map((r) => r.y));
    return { x, y, w: Math.max(...hits.map((r) => r.x + r.w)) - x, h: Math.max(...hits.map((r) => r.y + r.h)) - y };
  };
  const put = (node: HTMLElement, r: Rect | undefined, pad = 0) => {
    node.hidden = !r;
    if (r) Object.assign(node.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px` });
  };
  // The rename fields follow their chip and their Structure badge.
  function place() {
    if (!renaming) return;
    const parts = boxes.get(renaming.key);
    if (parts) {
      const clipBox = clip.getBoundingClientRect(), chip = parts.chip.getBoundingClientRect();
      Object.assign(renaming.chipInput.style, { left: `${chip.left - clipBox.left}px`, top: `${chip.top - clipBox.top}px` });
    }
    const slot = making?.plan?.slots.find((s) => s.key === renaming!.key);
    const badge = slot && document.querySelector<HTMLElement>(`.page-structure__row[data-node="${rowKeyFor(slot)}"] .cb04-sbadge`);
    renaming.treeInput.hidden = !badge;
    if (badge) {
      const r = badge.getBoundingClientRect();
      Object.assign(renaming.treeInput.style, { left: `${r.right - 120}px`, top: `${r.top - 2}px` });
    }
  }
  async function follow() {
    if (!alive || !making) return;
    const slots = making.plan?.slots ?? [];
    const hoverRel = hoverNode && Date.now() - hoverSeen < 4000 ? hoverNode.slice(target.node.length) : undefined;
    const nodes = [target.node, ...slots.flatMap((slot) => slot.paths.map((p) => [...target.node, ...p]))];
    if (hoverRel) nodes.push([...target.node, ...hoverRel]);
    const rects = await frameRects(target.path, nodes, { contextmenu: true, hover: true });
    if (!alive || !making) return;
    const f = document.querySelector(".native-preview-frame")?.getBoundingClientRect();
    if (!f) { setTimeout(() => void follow(), 150); return; }
    put(clip, { x: f.left, y: f.top, w: f.width, h: f.height });
    const offset = (r: Rect | null | undefined) => (r ? { ...r, x: r.x - f.left, y: r.y - f.top } : undefined);
    put(frameBox, offset(rects[0]), 6);
    const seen = new Set<string>();
    let at = 1;
    for (const slot of slots) {
      const own = rects.slice(at, at + slot.paths.length);
      at += slot.paths.length;
      seen.add(slot.key);
      let parts = boxes.get(slot.key);
      if (!parts) {
        const box = el("div", `cb04-mode__slot cb04-mode__slot--${slot.kind}`);
        const key = slot.key;
        const chip = btn("", () => {
          clearTimeout(clickTimer);
          clickTimer = setTimeout(() => toggleKey(key), 230);
        }, "cb04-mode__chip");
        chip.addEventListener("dblclick", (event) => { event.preventDefault(); clearTimeout(clickTimer); renameKey(key); });
        if (slot.kind === "items") box.classList.add("is-items-group");
        box.append(chip);
        clip.append(box);
        parts = { box, chip };
        boxes.set(slot.key, parts);
      }
      const r = offset(union(own));
      put(parts.box, r, 2);
      const problem = nameProblem(slot);
      parts.box.classList.toggle("is-fixed", slot.fixed);
      parts.box.classList.toggle("is-warning", !slot.fixed && Boolean(problem));
      parts.box.classList.toggle("chip-left", Boolean(r && r.x > 96) && slot.kind !== "items");
      parts.box.classList.toggle("is-renaming", renaming?.key === slot.key);
      parts.chip.textContent = `${slot.fixed ? "○" : "✓"} ${slot.kind === "items" ? `items ×${slot.count}` : slot.name}${problem && !slot.fixed ? " ⚠" : ""}`;
      // The unnamed slot: no rename; a note says why.
      if (slot.kind === "items") parts.chip.append(el("span", "cb04-mode__chip-note", "Repeated items: no name, so Add card works"));
      parts.chip.title = slot.kind === "items" ? (slot.fixed ? "Fixed in the template: click to make the repeated items a slot again" : "The page's repeated items (the unnamed slot): click to keep them fixed in the template") : slot.fixed ? "Fixed in the template: click to make it a slot" : `${problem ? `${problem}. ` : ""}Click: keep fixed · double-click: rename`;
    }
    for (const [key, parts] of boxes) if (!seen.has(key)) { parts.box.remove(); boxes.delete(key); }
    // "+ slot" on a hovered part that is not a slot and not inside one.
    const hoverRect = hoverRel ? rects[rects.length - 1] : undefined;
    const hit = hoverRel ? hitFor(hoverRel) : undefined;
    if (hoverRel && hoverRect && hit && !hit.slot && (!hit.inside || hit.inside.fixed)) {
      plusKey = hit.key;
      const r = offset(hoverRect)!;
      plus.hidden = false;
      Object.assign(plus.style, { left: `${r.x + r.w - 4}px`, top: `${r.y + 2}px` });
    } else if (!plus.matches(":hover")) { plus.hidden = true; plusKey = undefined; }
    place();
    Object.assign(bar.style, { left: `${f.left + f.width / 2}px`, top: `${f.top + 12}px` });
    setTimeout(() => void follow(), 120);
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || renaming || (event.target as Element).closest?.(".cb04-rename, .cb04-menu")) return;
    event.preventDefault();
    event.stopPropagation();
    stop(true);
  };
  document.addEventListener("keydown", onKey, true);
  function stop(reselect: boolean) {
    alive = false;
    endRename(false);
    layer.remove();
    bar.remove();
    document.documentElement.classList.remove("cb04-moding");
    document.removeEventListener("keydown", onKey, true);
    making = undefined;
    onHover = undefined;
    startChipRename = undefined;
    decorateStructure();
    if (reselect) deps().preview()?.selectNode({ path: target.path, node: target.node });
  }
  making = { target, fixed: new Set(), forced: new Set(), names: new Map(), name, count, create, stop: () => stop(false) };
  replan();
  deps().preview()?.selectNode({ path: target.path, node: target.node });
  void follow();

  async function submit() {
    if (!making) return;
    endRename(true);
    if (name.problem()) { name.input.focus(); return; }
    const bad = (making.plan?.slots ?? []).find((slot) => !slot.fixed && nameProblem(slot));
    if (bad) { toast(`Slot “${bad.name}”: ${nameProblem(bad)}`); return; }
    const tag = name.value();
    const now = targetAt(target.path, target.node);
    const choices = { names: making.names, forced: making.forced };
    const fixed = making.fixed;
    stop(false);
    if (!now || now.outer !== target.outer) { toast("The section changed meanwhile; select it again."); return; }
    const made = planComponent(now.outer, tag, fixed, choices);
    if ("error" in made || !(await makeInPlace(now, tag, made))) return;
    for (let i = 0; i < 40 && !takenTags().includes(tag); i++) await new Promise((r) => setTimeout(r, 100));
    await state.host?.editComponent(tag);
    toast(`Made <${tag}> · Edit component mode: its template is in the code pane`);
  }
  name.input.focus();
  name.input.select();
}
