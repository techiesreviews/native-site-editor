// The slot chip (wayfinder components-and-builder ticket 14 §4, build slices
// 23–24): the one control that says whether a part of a component's template
// is a slot. It follows the element's name in Edit component mode's edit bar
// label ("◇ Section work › Heading [title]") and is the badge on Structure's
// rows. A slot is a solid purple chip with its name, an items slot a pink one
// ("items ×1"), a fixed part a muted grey chip with its name struck through
// (the name it had, or the one it would get). A click toggles slot ↔ fixed
// after a short wait (click-timing.ts), so a double-click never flips it.
//
// A double-click on a slot's chip renames it in place: a caret in the chip's
// own text, edited like any text (never an input field), the name made valid
// as typed (component-names.ts). Enter or leaving commits, Esc cancels. Every
// chip of the same slot (the same `group`) shows the name as it is typed.
// The chip only reports; its owner changes the template.

import { clickTiming } from "./click-timing";
import { committedSlotName, normaliseField } from "../page-builder/component-names";
import type { SlotChipState } from "../page-builder/component-model";
import "./slot-chip.css";

export interface SlotChipActions {
  onToggle: () => void;
  /** A rename committed with this valid name; returning false refuses it and the old name comes back. */
  onRename?: (name: string) => boolean | void;
  /** Chips of the same slot share a group: each shows the name as it is typed in any of them. */
  group?: string;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The chip's text: the slot's name, "items ×N" for an items slot. */
export function slotChipText(chip: SlotChipState) {
  return chip.state === "items" ? `${chip.name || "items"} ×${chip.count}` : chip.name;
}

/** The other chips of a group in this document, by their name part. */
function groupNames(chip: HTMLElement) {
  const group = chip.dataset.slotChipGroup;
  if (!group) return [];
  return [...chip.ownerDocument.querySelectorAll<HTMLElement>(".slot-chip[data-slot-chip-group]")]
    .filter((other) => other !== chip && other.dataset.slotChipGroup === group)
    .map((other) => other.querySelector<HTMLElement>(":scope > .slot-chip__name")!);
}

export function slotChip(chip: SlotChipState, actions: SlotChipActions) {
  // A span acting as a button, so its name can take a caret when renamed.
  const out = document.createElement("span");
  out.className = `slot-chip slot-chip--${chip.state}`;
  out.setAttribute("role", "button");
  out.tabIndex = 0;
  const name = document.createElement("span");
  name.className = "slot-chip__name";
  // An unnamed items slot reads "items"; renaming it starts from that.
  const shownName = chip.state === "items" ? chip.name || "items" : chip.name;
  name.textContent = shownName;
  out.append(name);
  if (chip.state === "items") out.append(Object.assign(document.createElement("span"), { className: "slot-chip__count", textContent: ` ×${chip.count}` }));
  const on = chip.state !== "fixed";
  out.setAttribute("aria-pressed", String(on));
  const label = chip.state === "items"
    ? `Items slot${chip.name ? ` “${chip.name}”` : ""}, ${plural(chip.count, "item")}`
    : `Slot “${chip.name}”`;
  out.setAttribute("aria-label", label);
  const renames = Boolean(actions.onRename) && on;
  const rename = renames ? " Double-click or F2 to rename it." : "";
  out.title = chip.state === "fixed"
    ? `Fixed: the same on every page. Click to make it the slot “${chip.name}” each page can change.`
    : `${chip.state === "items" ? "Items slot: each page puts its own items here" : `Slot “${chip.name}”: each page can change it`}. Click to keep it fixed.${rename}`;
  if (actions.group && renames) out.dataset.slotChipGroup = actions.group;

  // ---- Renaming in place. ----
  let renaming: { before: string; mirrors: HTMLElement[] } | undefined;
  const mirror = (text: string) => renaming?.mirrors.forEach((other) => { if (other.isConnected) other.textContent = text; });
  function startRename() {
    if (!renames || renaming) return;
    renaming = { before: name.textContent ?? "", mirrors: groupNames(out) };
    out.classList.add("slot-chip--renaming");
    name.contentEditable = "plaintext-only";
    // A browser without plain-text editing takes rich text; each input is made plain again.
    if (name.contentEditable !== "plaintext-only") name.contentEditable = "true";
    name.spellcheck = false;
    name.setAttribute("role", "textbox");
    name.setAttribute("aria-label", "Slot name");
    name.focus();
    // The whole name selected: typing replaces it, an arrow key puts the caret in it.
    const range = document.createRange();
    range.selectNodeContents(name);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  function endRename(commit: boolean) {
    const was = renaming;
    if (!was) return;
    renaming = undefined;
    // Ended from the keyboard, the focus stays on the chip.
    const focused = document.activeElement === name;
    out.classList.remove("slot-chip--renaming");
    name.removeAttribute("contenteditable");
    name.removeAttribute("role");
    name.removeAttribute("aria-label");
    // An unnamed items slot left reading "items" stays unnamed.
    const next = commit ? committedSlotName(was.before, name.textContent ?? "") : undefined;
    const text = next !== undefined && actions.onRename?.(next) !== false ? next : was.before;
    name.textContent = text;
    was.mirrors.forEach((other) => { if (other.isConnected) other.textContent = text; });
    if (focused) out.focus();
  }
  name.addEventListener("input", (event) => {
    if (!renaming || (event as InputEvent).isComposing) return;
    normaliseField(name);
    mirror(name.textContent ?? "");
  });
  name.addEventListener("compositionend", () => {
    if (!renaming) return;
    normaliseField(name);
    mirror(name.textContent ?? "");
  });
  name.addEventListener("beforeinput", (event) => {
    if (renaming && (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak")) event.preventDefault();
  });
  // Leaving commits. A render of the chip's owner that moves it puts the caret
  // back (edit-bar.ts), so a focus lost for a moment is checked once settled.
  name.addEventListener("focusout", () => queueMicrotask(() => {
    if (renaming && name.ownerDocument.activeElement !== name) endRename(true);
  }));

  // ---- Clicks and keys. ----
  // A click still waiting when the chip has gone (another part selected) reports nothing.
  const timing = clickTiming(() => { if (out.isConnected && !renaming) actions.onToggle(); }, startRename);
  out.addEventListener("click", (event) => {
    event.stopPropagation();
    if (renaming) return;
    timing.click(event.detail);
  });
  out.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    if (renaming) return;
    event.preventDefault();
    timing.doubleClick();
  });
  out.addEventListener("keydown", (event) => {
    if (renaming) {
      // The name's own keys: nothing reaches the edit bar or the editor's shortcuts.
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        endRename(event.key === "Enter");
      }
      return;
    }
    if (event.target !== out || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      timing.click(0);
    } else if (event.key === "F2" && renames) {
      event.preventDefault();
      event.stopPropagation();
      startRename();
    }
  });
  return out;
}
