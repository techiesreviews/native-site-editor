// PROTOTYPE (wayfinder ticket 04, components-and-builder). Throwaway; not kept for the real build.
//
// Flow 1, Make component from built HTML, three ways:
// A: a modal dialog (name, slot checklist, notes, code preview);
// B: a mode in the preview (outlines + chips on the real page, a slim bar);
// C: a side drawer with Slots and Template tabs, then the template in the code pane.

import { planComponent, suggestName, type ComponentPlan, type PlannedSlot } from "./cb04-rule";
import {
  state, deps, el, btn, toast, takenTags, nameField, codeView, makeInPlace, targetAt, frameRects, scrollFrame,
  KIND_ICON, KIND_LABEL, type Rect, type Target,
} from "./cb04-core";

const slotTitle = (slot: PlannedSlot) => (slot.name ? slot.name : "items");
const chipText = (slot: PlannedSlot) => `${slotTitle(slot)}${slot.count > 1 ? ` ×${slot.count}` : ""}`;

function plan(target: Target, tag: string, fixed: Set<string>) {
  const made = planComponent(target.outer, tag || "x-component", fixed);
  return "error" in made ? undefined : made;
}

async function waitForComponent(tag: string) {
  for (let i = 0; i < 40 && !takenTags().includes(tag); i++) await new Promise((r) => setTimeout(r, 100));
}

async function create(target: Target, tag: string, fixed: Set<string>) {
  const now = targetAt(target.path, target.node);
  if (!now || now.outer !== target.outer) { toast("The element changed meanwhile; select it again."); return false; }
  const made = plan(now, tag, fixed);
  if (!made) return false;
  return makeInPlace(now, tag, made);
}

const openTemplate = (tag: string) => void state.host?.editComponent(tag);

// A slot row: checkbox (ticked = a slot; unticked = fixed in the template).
function slotRow(slot: PlannedSlot, fixed: Set<string>, onToggle: () => void, style: "check" | "switch") {
  const row = el("label", `cb04-slot cb04-slot--${style}`);
  row.classList.toggle("is-fixed", slot.fixed);
  const box = el("input");
  box.type = "checkbox";
  box.checked = !slot.fixed;
  if (style === "switch") box.setAttribute("role", "switch");
  box.addEventListener("change", () => {
    if (box.checked) fixed.delete(slot.key); else fixed.add(slot.key);
    onToggle();
  });
  const icon = el("span", `cb04-slot__icon cb04-slot__icon--${slot.kind}`, KIND_ICON[slot.kind]);
  const name = el("code", "cb04-slot__name", slot.name || "(unnamed)");
  const kind = el("span", "cb04-slot__kind", slot.kind === "items" ? `${KIND_LABEL.items} ×${slot.count}` : KIND_LABEL[slot.kind]);
  const text = el("span", "cb04-slot__text", slot.fixed ? "fixed in the template" : slot.excerpt);
  const main = el("span", "cb04-slot__main");
  const top = el("span", "cb04-slot__top");
  top.append(name, kind);
  if (slot.stretched) top.append(el("span", "cb04-slot__badge", "stretched link"));
  main.append(top, text);
  row.append(box, icon, main);
  return row;
}

function notesView(made: ComponentPlan | undefined) {
  const box = el("div", "cb04-notes");
  for (const note of made?.notes ?? []) box.append(el("p", "cb04-note", note));
  box.hidden = !box.childElementCount;
  return box;
}

// ---------------------------------------------------------------- A: dialog.
export function makeDialog(target: Target) {
  const fixed = new Set<string>();
  const dialog = el("dialog", "create-dialog cb04-dialog");
  dialog.setAttribute("aria-label", "Make component");
  const form = el("form", "create-dialog__form");
  form.method = "dialog";
  const title = el("h2", "create-dialog__title", "Make component");
  const from = el("p", "create-dialog__result", `From the <${target.tag}> on ${target.path}. It is replaced by an instance; the content stays in the page.`);
  const name = nameField(suggestName(target.outer, takenTags()), () => render());
  const listHead = el("div", "cb04-dialog__list-head");
  listHead.append(el("strong", "", "Slots"), el("span", "", "Ticked parts are filled in by each page. Untick to keep a part fixed in the template."));
  const list = el("div", "cb04-slots");
  const notes = el("div");
  const details = el("details", "cb04-dialog__code");
  details.append(el("summary", "", "Code preview"));
  const codes = el("div", "cb04-codes");
  details.append(codes);
  const actions = el("div", "create-dialog__actions");
  const cancel = btn("Cancel", () => dialog.close(), "button secondary");
  const ok = el("button", "button primary", "Create component");
  ok.type = "submit";
  actions.append(cancel, ok);
  form.append(title, from, name.wrap, listHead, list, notes, details, actions);
  dialog.append(form);
  document.body.append(dialog);

  function render() {
    const made = plan(target, name.value(), fixed);
    list.replaceChildren(...(made?.slots ?? []).map((slot) => slotRow(slot, fixed, render, "check")));
    notes.replaceChildren(notesView(made));
    const tag = name.value() || "x-component";
    codes.replaceChildren(
      codeView(`components/${tag}/${tag}.html`, made?.template ?? ""),
      codeView(`${target.path} (the instance)`, made?.instance ?? ""),
      codeView(`components/${tag}/${tag}.css`, made?.css ?? ""),
    );
    ok.disabled = Boolean(name.problem());
  }
  render();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (name.problem()) { name.input.focus(); return; }
    const tag = name.value();
    dialog.close();
    if (await create(target, tag, fixed)) {
      await waitForComponent(tag);
      toast(`Made <${tag}>`, { label: "Open template", run: () => openTemplate(tag) });
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  name.input.select();
}

// ---------------------------------------------------------------- B: in the preview.
let modeCleanup: (() => void) | undefined;
export function makeInPreview(target: Target, options: { heading?: string; onCancel?: () => void } = {}) {
  modeCleanup?.();
  document.querySelector(".cb04-toast")?.remove();
  const fixed = new Set<string>();
  document.documentElement.classList.add("cb04-moding");
  const layer = el("div", "cb04-mode");
  const clip = el("div", "cb04-mode__clip");
  const frameBox = el("div", "cb04-mode__frame");
  frameBox.append(el("span", "cb04-mode__frame-label", `Making a component from this <${target.tag}>`));
  clip.append(frameBox);
  layer.append(clip);
  // The slim bar: name, tag preview, summary, Cancel / Create.
  const bar = el("div", "cb04-mode__bar");
  const name = nameField(suggestName(target.outer, takenTags()), () => renderBar());
  name.wrap.classList.add("cb04-name--inline");
  const summary = el("span", "cb04-mode__summary");
  const cancel = btn("Cancel", () => finish(), "button secondary");
  const ok = btn("Create", () => void submit(), "button primary");
  if (options.heading) bar.append(el("strong", "cb04-mode__heading", options.heading));
  bar.append(name.wrap, summary, cancel, ok);
  layer.append(bar);
  document.body.append(layer);

  let made = plan(target, name.value(), fixed);
  const boxes = new Map<string, { box: HTMLElement; chip: HTMLButtonElement }>();
  const toggle = (slot: PlannedSlot) => {
    if (fixed.has(slot.key)) fixed.delete(slot.key); else fixed.add(slot.key);
    made = plan(target, name.value(), fixed);
    renderBoxes();
    renderBar();
  };
  for (const slot of made?.slots ?? []) {
    const box = el("div", `cb04-mode__slot cb04-mode__slot--${slot.kind}`);
    const chip = btn("", () => toggle(slot), "cb04-mode__chip");
    box.addEventListener("click", (event) => { if (event.target === box) toggle(slot); });
    box.addEventListener("wheel", (event) => scrollFrame(event.deltaY), { passive: true });
    box.append(chip);
    clip.append(box);
    boxes.set(slot.key, { box, chip });
  }
  function renderBoxes() {
    for (const slot of made?.slots ?? []) {
      const parts = boxes.get(slot.key);
      if (!parts) continue;
      parts.box.classList.toggle("is-fixed", slot.fixed);
      parts.chip.textContent = `${slot.fixed ? "○" : "✓"} ${chipText(slot)}`;
      parts.chip.title = slot.fixed ? `Fixed in the template: click to make “${slotTitle(slot)}” a slot` : `Slot “${slotTitle(slot)}”: click to keep it fixed`;
      parts.chip.setAttribute("aria-pressed", String(!slot.fixed));
    }
  }
  function renderBar() {
    const slots = made?.slots ?? [];
    const kept = slots.filter((slot) => !slot.fixed).length;
    summary.textContent = `${kept} slot${kept === 1 ? "" : "s"}${slots.length - kept ? ` · ${slots.length - kept} fixed` : ""} · click a chip to toggle`;
    ok.disabled = Boolean(name.problem());
  }
  renderBoxes();
  renderBar();

  // Follow the page (scrolling, re-renders) by asking the frame for rects.
  let alive = true;
  const union = (rects: (Rect | null)[]) => {
    const hits = rects.filter((r): r is Rect => Boolean(r));
    if (!hits.length) return undefined;
    const x = Math.min(...hits.map((r) => r.x)), y = Math.min(...hits.map((r) => r.y));
    return { x, y, w: Math.max(...hits.map((r) => r.x + r.w)) - x, h: Math.max(...hits.map((r) => r.y + r.h)) - y };
  };
  const place = (node: HTMLElement, r: Rect | undefined, pad = 0) => {
    node.hidden = !r;
    if (!r) return;
    Object.assign(node.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px` });
  };
  async function follow() {
    if (!alive) return;
    const slots = made?.slots ?? [];
    const nodes = [target.node, ...slots.flatMap((slot) => slot.paths.map((p) => [...target.node, ...p]))];
    const rects = await frameRects(target.path, nodes);
    const f = document.querySelector(".native-preview-frame")?.getBoundingClientRect();
    if (f) place(clip, { x: f.left, y: f.top, w: f.width, h: f.height });
    const offset = (r: Rect | undefined) => (r && f ? { ...r, x: r.x - f.left, y: r.y - f.top } : r);
    place(frameBox, offset(rects[0] ?? undefined), 6);
    let at = 1;
    for (const slot of slots) {
      const own = rects.slice(at, at + slot.paths.length);
      at += slot.paths.length;
      const parts = boxes.get(slot.key);
      if (parts) {
        const r = offset(union(own));
        place(parts.box, r, 2);
        parts.box.classList.toggle("chip-left", Boolean(r && r.x > 96));
      }
    }
    if (f) Object.assign(bar.style, { left: `${f.left + f.width / 2}px`, top: `${f.top + 12}px` });
    setTimeout(() => void follow(), 120);
  }
  void follow();

  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(); } };
  document.addEventListener("keydown", onKey, true);
  function finish(cancelled = true) {
    alive = false;
    layer.remove();
    document.documentElement.classList.remove("cb04-moding");
    document.removeEventListener("keydown", onKey, true);
    modeCleanup = undefined;
    if (cancelled) options.onCancel?.();
  }
  modeCleanup = () => finish(false);
  async function submit() {
    if (name.problem()) { name.input.focus(); return; }
    const tag = name.value();
    finish(false);
    if (await create(target, tag, fixed)) {
      await waitForComponent(tag);
      toast(`Made <${tag}> in place`, { label: "Open template", run: () => openTemplate(tag) });
    }
  }
  name.input.focus();
  name.input.select();
}

// ---------------------------------------------------------------- C: side drawer.
export function makeDrawer(target: Target) {
  document.querySelector(".cb04-drawer")?.remove();
  const fixed = new Set<string>();
  const drawer = el("aside", "cb04-drawer");
  drawer.setAttribute("aria-label", "Make component");
  const head = el("div", "cb04-drawer__head");
  head.append(el("h2", "cb04-drawer__title", "Make component"), btn("×", () => drawer.remove(), "cb04-drawer__close"));
  const from = el("p", "cb04-drawer__from", `From the <${target.tag}> on ${target.path}`);
  const name = nameField(suggestName(target.outer, takenTags()), () => render());
  const tabs = el("div", "cb04-tabs");
  tabs.setAttribute("role", "tablist");
  const slotsTab = btn("Slots", () => show("slots"), "cb04-tab");
  const codeTab = btn("Template", () => show("code"), "cb04-tab");
  for (const t of [slotsTab, codeTab]) t.setAttribute("role", "tab");
  tabs.append(slotsTab, codeTab);
  const slotsPanel = el("div", "cb04-drawer__panel");
  const codePanel = el("div", "cb04-drawer__panel");
  const body = el("div", "cb04-drawer__body");
  body.append(slotsPanel, codePanel);
  const foot = el("div", "cb04-drawer__foot");
  const ok = btn("Create component", () => void submit(), "button primary");
  foot.append(el("span", "cb04-drawer__foot-note", "Opens the template in the code pane"), btn("Cancel", () => drawer.remove(), "button secondary"), ok);
  drawer.append(head, from, name.wrap, tabs, body, foot);
  document.body.append(drawer);
  let tab: "slots" | "code" = "slots";
  function show(next: "slots" | "code") {
    tab = next;
    slotsTab.setAttribute("aria-selected", String(tab === "slots"));
    codeTab.setAttribute("aria-selected", String(tab === "code"));
    slotsPanel.hidden = tab !== "slots";
    codePanel.hidden = tab !== "code";
  }
  function render() {
    const made = plan(target, name.value(), fixed);
    const rows = (made?.slots ?? []).map((slot) => {
      const row = slotRow(slot, fixed, render, "switch");
      row.addEventListener("pointerenter", () => void highlight(target, slot));
      row.addEventListener("pointerleave", () => highlight(undefined));
      return row;
    });
    slotsPanel.replaceChildren(el("p", "cb04-drawer__hint", "Each page fills in the switched-on parts. Switch one off to keep it fixed in the template. Hover a row to see it on the page."), ...rows, notesView(made));
    const tag = name.value() || "x-component";
    codePanel.replaceChildren(
      codeView(`components/${tag}/${tag}.html`, made?.template ?? ""),
      codeView(`components/${tag}/${tag}.css`, made?.css ?? ""),
      codeView(`${target.path} (the instance)`, made?.instance ?? ""),
    );
    ok.disabled = Boolean(name.problem());
  }
  render();
  show("slots");
  async function submit() {
    if (name.problem()) { name.input.focus(); return; }
    const tag = name.value();
    drawer.remove();
    highlight(undefined);
    if (!(await create(target, tag, fixed))) return;
    await waitForComponent(tag);
    // Edit component: the template in the code pane, the page (and its new instance) still in the preview.
    await state.host?.editComponent(tag);
    toast(`Made <${tag}> · its template is open in the code pane`);
  }
  name.input.focus();
}

// A box over one slot while its drawer row is hovered.
let lit: HTMLElement | undefined;
let litToken = 0;
async function highlight(target: Target | undefined, slot?: PlannedSlot) {
  const token = ++litToken;
  if (!target || !slot) { lit?.remove(); lit = undefined; return; }
  const rects = (await frameRects(target.path, slot.paths.map((p) => [...target.node, ...p]))).filter((r): r is Rect => Boolean(r));
  if (token !== litToken || !rects.length) return;
  lit ??= el("div", "cb04-lit");
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  Object.assign(lit.style, { left: `${x - 3}px`, top: `${y - 3}px`, width: `${Math.max(...rects.map((r) => r.x + r.w)) - x + 6}px`, height: `${Math.max(...rects.map((r) => r.y + r.h)) - y + 6}px` });
  lit.dataset.label = chipText(slot);
  document.body.append(lit);
}
