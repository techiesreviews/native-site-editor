// PROTOTYPE (wayfinder ticket 14, components-and-builder). Throwaway; not kept for the real build.
//
// Round 3 (Lex): a part's slot state lives in the edit bar's name label (the
// pill above the edit bar, "◇ Section work › Heading"), not in chips on the
// canvas. While a template is edited the label gains a toggle for the
// selected part, in ticket 04's making-mode language:
//   ◇ Section work › ✓ title · Heading     a slot: each page can change it
//   ◇ Section work › ○ Paragraph           fixed in the template
//   ◇ Section work › ✓ items ×1 · Card project
// A click on ✓/○ switches slot ↔ fixed (a fixed part becomes a slot named
// from its role; a slot unchecked keeps its fallback as fixed markup). A
// double-click on the slot name renames it in the label, with Structure's
// badge following. Parts that cannot be a slot (the component's root, an
// element holding slots) show no toggle.

import { el, latest, mode, isItemsSlot, slotOf, templateNodeOfSelection, type TNode } from "./cb14-core";
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

let clickTimer: ReturnType<typeof setTimeout> | undefined;
function toggle(state: State) {
  if (state.kind === "slot") toggleSlot(state.slot);
  else if (state.kind === "ghost") { const g = formerSlots.find((f) => f.path.join(".") === state.n.key); if (g) unfix(g); }
  else makeSlot(state.n);
}

function build(state: State) {
  const wrap = el("span", `cb14-state cb14-state--${state.kind}`);
  wrap.dataset.key = state.key;
  const on = state.kind === "slot";
  const items = on && isItemsSlot(state.slot);
  if (items) wrap.classList.add("is-items");
  const mark = el("button", "cb14-state__mark", on ? "✓" : "○");
  mark.type = "button";
  mark.setAttribute("aria-pressed", String(on));
  mark.title = on ? "A slot: each page can change it. Click to keep it fixed in the template." : "Fixed in the template. Click to make it a slot each page can change.";
  mark.setAttribute("aria-label", on ? "Slot (click: keep fixed)" : "Fixed (click: make a slot)");
  mark.addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(clickTimer); toggle(state); });
  wrap.append(mark);
  if (state.kind === "slot") {
    const name = el("span", "cb14-state__name", items ? `${state.slot.slot!.name || "items"} ×${state.slot.slot!.showsPage ? state.slot.slot!.assigned : state.slot.kids.length}` : state.slot.slot!.name);
    name.title = "Double-click to rename the slot";
    name.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(clickTimer); startRename(state.slot); });
    // A click on the name toggles too, as the chip did (a double-click renames instead).
    name.addEventListener("click", (e) => { e.stopPropagation(); clearTimeout(clickTimer); clickTimer = setTimeout(() => toggle(state), 240); });
    wrap.append(name);
  } else if (state.kind === "ghost") {
    wrap.append(el("span", "cb14-state__name is-off", state.name));
  }
  return wrap;
}

/** Puts the toggle into the edit bar's label (again after each render of the bar). */
export function decorateLabel() {
  const label = document.querySelector<HTMLElement>(".edit-bar .edit-bar__label");
  const old = label?.querySelector<HTMLElement>(":scope > .cb14-state");
  const state = label ? stateOf() : undefined;
  if (!label || !state) { old?.remove(); return; }
  const renamingHere = state.kind === "slot" && renaming.p?.join(".") === state.slot.key;
  const intact = Boolean(old && (state.kind === "fixed" || old.querySelector(".cb14-state__name")) && !old.querySelector("input"));
  if (old && old.dataset.key === state.key && !renamingHere && intact) return;
  const next = old && renamingHere && old.dataset.key === state.key ? old : build(state);
  if (renamingHere) {
    if (!renaming.chip) renaming.chip = renameInput(renaming.original ?? "", "cb14-state__field");
    const name = next.querySelector(".cb14-state__name");
    if (name) name.replaceWith(renaming.chip);
    else if (renaming.chip.parentElement !== next) next.append(renaming.chip);
  }
  if (next !== old) {
    old?.remove();
    const kind = label.querySelector(":scope > .edit-bar__kind, :scope > .edit-bar__component-name, :scope > .edit-bar__grip");
    if (kind) kind.before(next); else label.append(next);
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
