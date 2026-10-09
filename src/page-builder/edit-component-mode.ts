// Edit component mode, in place (wayfinder components-and-builder ticket 14,
// build slice 41). Loaded on first use by Edit component (components.ts).
//
// The instance Edit component was chosen on shows its template where it sits
// on the page, inside a frame, the rest of the page shaded (the preview's
// runtime draws both). The canvas bar becomes the mode's slim bar: "Editing
// <tag> · used on N pages ▾ · Show this page's content / Show placeholders ·
// Done". Placeholders (the template's fallbacks) show first. Opened by Make
// component (build slice 22), the bar also holds the plan's notes until they
// are dismissed. Every change is
// an edit of the template as it is made, so Done only leaves the mode. The
// preview is never reloaded for any of it: the frame gets the mode as a
// message and renders the instance again in place.
//
// Selecting a part of the template shows its slot chip after the element's
// name in the edit bar label (slot-chip.ts). The chip reports a click, and a
// slot renamed in place, to the mode's owner as a window event,
// SLOT_CHIP_EVENT.

import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { mountDropdown } from "../components/dropdown";
import { componentIcon } from "./component-icon";
import { slotChip } from "../components/slot-chip";
import type { EditComponentFrameMode } from "../components/native-preview";
import type { SlotChipState } from "./component-model";
import "./edit-component-mode.css";

export type EditComponentShow = EditComponentFrameMode["show"];

/**
 * A slot chip's report, on `window`: toggle the part at `node` of `template`
 * between slot and fixed, or rename its slot to `name` (already valid). A
 * rename is cancelable: the owner calls `preventDefault()` to refuse it, and
 * the chip shows the old name again.
 */
export const SLOT_CHIP_EVENT = "native-slot-chip";
export type SlotChipReport = {
  template: string;
  node: number[];
  chip: SlotChipState;
} & ({ action: "toggle" } | { action: "rename"; name: string });

/** The instance edited: where it is on the page shown, and its template. */
export interface EditComponentTarget {
  path: string;
  node: readonly number[];
  tag: string;
  templatePath: string;
}

export interface EditComponentModePorts {
  /** Sends the mode to the preview's frame; `undefined` ends it there. */
  frame: (mode: EditComponentFrameMode | undefined) => void;
  /** The slim bar changed: the canvas bar takes its parts again. */
  changed: () => void;
  announce: (text: string) => void;
}

export function createEditComponentMode(ports: EditComponentModePorts) {
  let now: (EditComponentTarget & { show: EditComponentShow }) | undefined;
  // The chip shown, kept while it says the same of the same part.
  let shownChip: { key: string; element: HTMLElement } | undefined;
  let notes: string[] = [];

  const title = node("span", "edit-mode__title");
  const show = node("span", "edit-mode__show");
  show.setAttribute("role", "group");
  show.setAttribute("aria-label", "Slot content");
  const choices: [EditComponentShow, HTMLButtonElement][] = [
    ["page", button("Show this page's content", () => setShow("page"), "edit-mode__show-item")],
    ["placeholders", button("Show placeholders", () => setShow("placeholders"), "edit-mode__show-item")],
  ];
  for (const [value, choice] of choices) {
    choice.title = value === "page" ? "The slots show what this page puts in them" : "The slots show the template's fallbacks";
    show.append(choice);
  }
  const dot = () => {
    const out = node("span", "edit-mode__dot", "·");
    out.setAttribute("aria-hidden", "true");
    return out;
  };
  const dots = [dot(), dot()];

  // The notes: the first in the bar, all of them in a panel it opens; × dismisses them.
  const note = node("span", "edit-mode__note");
  note.setAttribute("role", "note");
  const noteButton = node("button", "edit-mode__note-text");
  noteButton.type = "button";
  const noteLabel = node("span", "edit-mode__note-label");
  noteButton.append(node("span", "edit-mode__note-kind", "Note"), noteLabel);
  const noteList = node("ul", "edit-mode__notes");
  noteList.id = "edit-mode-notes";
  noteList.setAttribute("aria-label", "Notes");
  document.body.append(noteList);
  const noteDropdown = mountDropdown({ trigger: noteButton, panel: noteList, anchor: "--edit-mode-notes" });
  let doneButton: HTMLElement | undefined;
  const dismiss = button("", () => {
    const focused = note.contains(document.activeElement);
    notes = [];
    noteDropdown.close();
    ports.changed();
    // The focus doesn't go with the note: Done takes it.
    if (focused) doneButton?.focus();
  }, "edit-mode__note-dismiss");
  dismiss.setAttribute("aria-label", "Dismiss the notes");
  dismiss.title = "Dismiss";
  dismiss.append(icon("x", 12));
  note.append(noteButton, dismiss);

  function send() {
    ports.frame(now && { path: now.path, node: [...now.node], tag: now.tag, show: now.show });
  }
  function render() {
    if (!now) return;
    title.replaceChildren(componentIcon(12), node("span", "edit-mode__verb", "Editing"), node("code", "edit-mode__tag", `<${now.tag}>`));
    for (const [value, choice] of choices) choice.setAttribute("aria-pressed", String(now.show === value));
    noteLabel.textContent = notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0] ?? "";
    noteButton.title = notes.join("\n");
    noteList.replaceChildren(...notes.map((text) => node("li", "edit-mode__notes-item", text)));
  }
  function setShow(next: EditComponentShow) {
    if (!now || now.show === next) return;
    now.show = next;
    render();
    send();
    ports.changed();
    ports.announce(next === "page" ? "Showing this page's content in the slots." : "Showing the template's placeholders in the slots.");
  }

  return {
    /** Starts the mode on `target`, its placeholders showing, with `notes` to tell in the bar. */
    enter(target: EditComponentTarget, withNotes: readonly string[] = []) {
      now = { path: target.path, node: [...target.node], tag: target.tag, templatePath: target.templatePath, show: "placeholders" };
      notes = [...withNotes];
      render();
      send();
    },
    /** Ends the mode (the frame shows the page as it is); the instance it was on, if any. */
    leave() {
      const was = now;
      if (!was) return undefined;
      now = undefined;
      shownChip = undefined;
      notes = [];
      noteDropdown.close();
      send();
      return { path: was.path, node: [...was.node], tag: was.tag, templatePath: was.templatePath };
    },
    /** The mode now, or `undefined` when it is off. */
    active(): Readonly<EditComponentTarget & { show: EditComponentShow }> | undefined {
      return now && { ...now, node: [...now.node] };
    },
    setShow,
    /** An operation refused its optimistic rename: draw the name from source again. */
    resetChip() { shownChip = undefined; },
    /** The slot chip of the template's part at `node`, for the edit bar label. */
    chip(at: readonly number[], state: SlotChipState) {
      if (!now) return undefined;
      const template = now.templatePath;
      const key = JSON.stringify([template, at, state]);
      if (shownChip?.key !== key) {
        const report = (detail: SlotChipReport) => window.dispatchEvent(new CustomEvent(SLOT_CHIP_EVENT, { detail, cancelable: detail.action === "rename" }));
        const part = { template, node: [...at], chip: state };
        shownChip = {
          key,
          element: slotChip(state, {
            onToggle: () => { report({ action: "toggle", ...part, node: [...at] }); },
            onRename: (name) => report({ action: "rename", ...part, node: [...at], name }),
            // Every chip of this slot (the label, its Structure badge) shows the name as typed.
            group: state.state === "fixed" ? undefined : JSON.stringify([template, state.slot]),
          }),
        };
      }
      return shownChip;
    },
    /** The slim bar around the host's Used on and Done controls. */
    parts(usedOn: Element, done: HTMLElement) {
      doneButton = done;
      return { lead: [title, dots[0], usedOn, dots[1], show, ...(notes.length ? [note] : [])], end: [done] };
    },
  };
}

export type EditComponentMode = ReturnType<typeof createEditComponentMode>;
