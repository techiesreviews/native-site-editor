// Edit component mode, in place (wayfinder components-and-builder ticket 14,
// build slice 41). Loaded on first use by Edit component (components.ts).
//
// The instance Edit component was chosen on shows its template where it sits
// on the page, inside a frame, the rest of the page shaded (the preview's
// runtime draws both). The canvas bar becomes the mode's slim bar: "Editing
// <tag> · used on N pages ▾ · Show this page's content / Show placeholders ·
// Done". Placeholders (the template's fallbacks) show first. Every change is
// an edit of the template as it is made, so Done only leaves the mode. The
// preview is never reloaded for any of it: the frame gets the mode as a
// message and renders the instance again in place.
//
// Selecting a part of the template shows its slot chip after the element's
// name in the edit bar label (slot-chip.ts). The chip reports a click to the
// mode's owner as a window event, SLOT_CHIP_EVENT.

import { button, node } from "../ui/dom";
import { componentIcon } from "./component-icon";
import { slotChip } from "../components/slot-chip";
import type { EditComponentFrameMode } from "../components/native-preview";
import type { SlotChipState } from "./component-model";
import "./edit-component-mode.css";

export type EditComponentShow = EditComponentFrameMode["show"];

/** A slot chip's click, on `window`: toggle the part at `node` of `template` between slot and fixed. */
export const SLOT_CHIP_EVENT = "native-slot-chip";
export interface SlotChipReport {
  action: "toggle";
  template: string;
  node: number[];
  chip: SlotChipState;
}

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

  function send() {
    ports.frame(now && { path: now.path, node: [...now.node], tag: now.tag, show: now.show });
  }
  function render() {
    if (!now) return;
    title.replaceChildren(componentIcon(12), node("span", "edit-mode__verb", "Editing"), node("code", "edit-mode__tag", `<${now.tag}>`));
    for (const [value, choice] of choices) choice.setAttribute("aria-pressed", String(now.show === value));
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
    /** Starts the mode on `target`, its placeholders showing. */
    enter(target: EditComponentTarget) {
      now = { path: target.path, node: [...target.node], tag: target.tag, templatePath: target.templatePath, show: "placeholders" };
      render();
      send();
    },
    /** Ends the mode (the frame shows the page as it is); the instance it was on, if any. */
    leave() {
      const was = now;
      if (!was) return undefined;
      now = undefined;
      shownChip = undefined;
      send();
      return { path: was.path, node: [...was.node], tag: was.tag, templatePath: was.templatePath };
    },
    /** The mode now, or `undefined` when it is off. */
    active(): Readonly<EditComponentTarget & { show: EditComponentShow }> | undefined {
      return now && { ...now, node: [...now.node] };
    },
    setShow,
    /** The slot chip of the template's part at `node`, for the edit bar label. */
    chip(at: readonly number[], state: SlotChipState) {
      if (!now) return undefined;
      const template = now.templatePath;
      const key = JSON.stringify([template, at, state]);
      if (shownChip?.key !== key) {
        const report = (): SlotChipReport => ({ action: "toggle", template, node: [...at], chip: state });
        shownChip = { key, element: slotChip(state, { onToggle: () => window.dispatchEvent(new CustomEvent(SLOT_CHIP_EVENT, { detail: report() })) }) };
      }
      return shownChip;
    },
    /** The slim bar around the host's Used on and Done controls. */
    parts(usedOn: Element, done: Element) {
      return { lead: [title, dots[0], usedOn, dots[1], show], end: [done] };
    },
  };
}

export type EditComponentMode = ReturnType<typeof createEditComponentMode>;
