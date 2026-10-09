// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Round 3 (Lex): a part's slot state lives in the edit bar's name label (the
// pill above the edit bar, "◇ Section work › Heading"), not in chips on the
// canvas. While a template is edited the label gains a toggle for the
// selected part after its name, the same chip as Structure's slot badge:
//   ◇ Section work › Heading [title]            a slot: each page can change it
//   ◇ Section work › Paragraph [t̶e̶x̶t̶]            fixed (struck: the name it would get)
//   ◇ Section work › Card project [items]
// A click switches slot ↔ fixed (a fixed part becomes a slot under that name;
// a slot unchecked keeps its fallback as fixed markup). A double-click on a
// slot renames it in the chip, with Structure's badge following. Parts that
// cannot be a slot (the component's root, an element holding slots) show none.

import { deps, el, latest, mode, isItemsSlot, roleName, slotNames, slotOf, templateNodeOfSelection, type FixedClick, type TNode } from "./cb14-core";
import { eligiblePlus, formerSlots, makeSlot, renameInput, renaming, startRename, toggleSlot, unfix, hooks as layerHooks } from "./cb14-layer";

type State =
  | { kind: "slot"; slot: TNode; key: string }
  | { kind: "ghost"; n: TNode; name: string; key: string }
  | { kind: "fixed"; n: TNode; key: string };

/** The selected part's slot state, or none when it cannot be a slot. */
function stateOf(): State | undefined {
  const model = latest.model;
  const n = templateNodeOfSelection(model);
  if (!mode.now || !model || !n) return undefined;
  const slot = n.slot ? n : slotOf(n);
  if (slot?.slot) return { kind: "slot", slot, key: `slot:${slot.key}:${slot.slot.name}:${slot.slot.showsPage ? slot.slot.assigned : slot.kids.length}` };
  const g = formerSlots.find((f) => f.path.join(".") === n.key);
  if (g) return { kind: "ghost", n, name: g.name, key: `ghost:${n.key}:${g.name}` };
  if (eligiblePlus(model, n)) return { kind: "fixed", n, key: `fixed:${n.key}` };
  return undefined;
}

function toggle(state: State) {
  if (state.kind === "slot") toggleSlot(state.slot);
  else if (state.kind === "ghost") { const g = formerSlots.find((f) => f.path.join(".") === state.n.key); if (g) unfix(g); }
  else makeSlot(state.n);
}

/**
 * The slot chip after the element's name, the same control as Structure's badge: purple with the
 * slot's name when it is a slot; muted and struck through when the part is fixed (with the name it
 * had, or the name it would get). Click: slot ↔ fixed (after a moment, so a double-click never
 * flips it); double-click on a slot: rename, in the chip and in Structure at once.
 */
export function slotBadge(opts: { name: string; on: boolean; items?: boolean; onToggle: () => void; onRename?: () => void }) {
  const b = el("button", `cb14-sbadge${opts.items ? " is-items" : ""}${opts.on ? "" : " is-off"}`, opts.name || "items");
  b.type = "button";
  b.setAttribute("aria-pressed", String(opts.on));
  b.title = opts.on
    ? `Slot “${opts.name || "unnamed"}”: each page can change it · click: keep it fixed · double-click: rename`
    : `Fixed in the template · click: make it the slot “${opts.name}” each page can change`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  b.addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(timer); timer = setTimeout(opts.onToggle, 240); });
  b.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(timer); if (opts.onRename) opts.onRename(); else opts.onToggle(); });
  return b;
}

function build(state: State) {
  const wrap = el("span", `cb14-state cb14-state--${state.kind}`);
  wrap.dataset.key = state.key;
  if (state.kind === "slot") {
    wrap.append(slotBadge({ name: state.slot.slot!.name, on: true, items: isItemsSlot(state.slot), onToggle: () => toggle(state), onRename: () => startRename(state.slot) }));
  } else if (state.kind === "ghost") {
    wrap.append(slotBadge({ name: state.name, on: false, onToggle: () => toggle(state) }));
  } else {
    wrap.append(slotBadge({ name: roleName(state.n, slotNames()), on: false, onToggle: () => toggle(state) }));
  }
  return wrap;
}

// ---- Outside Edit component mode: a fixed part is locked on the page. ----
// The runtime already selects the instance for a click on its template and offers no editing; the
// label says why and leads into Edit component with that part selected.
export const lock: { click?: FixedClick & { page: string; at: number }; edit?: (tag: string, part: number[]) => void } = {};
function lockState() {
  const c = lock.click;
  const sel = deps().selection();
  if (mode.now || !c?.tag || !c.p || !sel || sel.path !== c.page || sel.tag !== c.tag || JSON.stringify(sel.node) !== JSON.stringify(c.host) || Date.now() - c.at > 120000) return undefined;
  return c;
}
function decorateLock(label: HTMLElement | null) {
  const old = label?.querySelector<HTMLElement>(":scope > .cb14-lock");
  const c = label ? lockState() : undefined;
  if (!label || !c) { old?.remove(); return; }
  const key = `${c.tag}:${c.p!.join(".")}`;
  if (old?.dataset.key === key) return;
  old?.remove();
  const hint = el("span", "cb14-lock");
  hint.dataset.key = key;
  const kind = c.t && /^h[1-6]$/.test(c.t) ? "Heading" : c.t === "p" ? "Paragraph" : c.t === "img" ? "Image" : c.t === "a" ? "Link" : `<${c.t}>`;
  hint.title = `This ${kind.toLowerCase()} is fixed in the component's template: it is the same on every page. Edit component to change it, or tick it there to make it a slot each page can change.`;
  hint.append(el("span", "cb14-lock__mark", "○"), el("span", "cb14-lock__text", `${kind} fixed in <${c.tag}>`));
  const go = el("button", "cb14-lock__go", "Edit component");
  go.type = "button";
  go.addEventListener("click", (e) => { e.stopPropagation(); lock.edit?.(c.tag!, c.p!); });
  hint.append(go);
  label.append(hint);
  label.classList.add("cb14-has-state");
}

/** Puts the toggle into the edit bar's label (again after each render of the bar). */
export function decorateLabel() {
  const label = document.querySelector<HTMLElement>(".edit-bar .edit-bar__label");
  decorateLock(label);
  const old = label?.querySelector<HTMLElement>(":scope > .cb14-state");
  const state = label ? stateOf() : undefined;
  if (!label || !state) { old?.remove(); return; }
  const renamingHere = state.kind === "slot" && renaming.p?.join(".") === state.slot.key;
  const intact = Boolean(old && old.querySelector(".cb14-sbadge") && !old.querySelector("input"));
  if (old && old.dataset.key === state.key && !renamingHere && intact) return;
  const next = old && renamingHere && old.dataset.key === state.key ? old : build(state);
  if (renamingHere) {
    if (!renaming.chip) renaming.chip = renameInput(renaming.original ?? "", "cb14-state__field");
    const name = next.querySelector(".cb14-sbadge");
    if (name) name.replaceWith(renaming.chip);
    else if (renaming.chip.parentElement !== next) next.append(renaming.chip);
  }
  if (next !== old) {
    old?.remove();
    // After the element's name: "◇ Section work › Heading [title]".
    label.append(next);
  }
  label.classList.add("cb14-has-state");
  if (renamingHere && document.activeElement !== renaming.chip) { renaming.chip!.focus(); renaming.chip!.select(); }
}

export function watchLabel() {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; decorateLabel(); });
  }).observe(document.body, { childList: true, subtree: true });
  layerHooks.renameStart = () => decorateLabel();
}
