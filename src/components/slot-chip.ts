// The slot chip (wayfinder components-and-builder ticket 14 §4, build slice
// 23): the one control that says whether a part of a component's template is
// a slot. It follows the element's name in Edit component mode's edit bar
// label ("◇ Section work › Heading [title]") and is the badge on Structure's
// rows. A slot is a solid purple chip with its name, an items slot a pink one
// ("items ×1"), a fixed part a muted grey chip with its name struck through
// (the name it had, or the one it would get). A click toggles slot ↔ fixed
// after a short wait (click-timing.ts), so a double-click, which renames in
// place, never flips it. The chip only reports; its owner changes the template.

import { clickTiming } from "./click-timing";
import type { SlotChipState } from "../page-builder/component-model";
import "./slot-chip.css";

export interface SlotChipActions {
  onToggle: () => void;
  onRename?: () => void;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The chip's text: the slot's name, "items ×N" for an items slot. */
export function slotChipText(chip: SlotChipState) {
  return chip.state === "items" ? `${chip.name || "items"} ×${chip.count}` : chip.name;
}

export function slotChip(chip: SlotChipState, actions: SlotChipActions) {
  const out = document.createElement("button");
  out.type = "button";
  out.className = `slot-chip slot-chip--${chip.state}`;
  out.textContent = slotChipText(chip);
  const on = chip.state !== "fixed";
  out.setAttribute("aria-pressed", String(on));
  out.setAttribute("aria-label", chip.state === "items"
    ? `Items slot${chip.name ? ` “${chip.name}”` : ""}, ${plural(chip.count, "item")}`
    : `Slot “${chip.name}”`);
  const rename = actions.onRename ? " Double-click to rename it." : "";
  out.title = chip.state === "fixed"
    ? `Fixed: the same on every page. Click to make it the slot “${chip.name}” each page can change.`
    : `${chip.state === "items" ? "Items slot: each page puts its own items here" : `Slot “${chip.name}”: each page can change it`}. Click to keep it fixed.${rename}`;
  // A click still waiting when the chip has gone (another part selected) reports nothing.
  const timing = clickTiming(() => { if (out.isConnected) actions.onToggle(); }, () => actions.onRename?.());
  out.addEventListener("click", (event) => {
    event.stopPropagation();
    timing.click(event.detail);
  });
  out.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    timing.doubleClick();
  });
  return out;
}
