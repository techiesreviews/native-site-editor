import type { SlotChipState } from "./component-model";

/** Actions offered by the chip's state, shared by canvas and Structure menus. */
export function slotMenuItems(chip: SlotChipState | undefined): string[] {
  if (!chip) return [];
  return chip.state === "fixed" ? ["Make slot"] : ["Rename slot", "Remove slot"];
}
