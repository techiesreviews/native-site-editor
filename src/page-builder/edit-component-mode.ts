// Edit component mode, in place (wayfinder components-and-builder ticket 14,
// build slice 41). Loaded on first use by Edit component (components.ts).
//
// The instance Edit component was chosen on shows its template where it sits
// on the page, inside a frame, the rest of the page shaded (the preview's
// runtime draws both). The canvas bar becomes the mode's slim bar: "Editing
// <tag> · used on N pages ▾ · note · Done". The template's placeholders
// always show. Opened by Make component (build slice 22), the bar also holds
// the plan's notes until dismissed. Every change edits the template as it is
// made, so Done only leaves the mode. The
// preview is never reloaded for any of it: the frame gets the mode as a
// message and renders the instance again in place.
//
// Nested instances add levels to the chain; crumbs return to earlier templates.
// The page instance stays the target for Done; placeholders show every
// level's own fallbacks.
//
// The component's tag in the bar is renamed in place (build slice 76): a
// double-click (or F2) puts a caret in its text, edited like the slot chips'
// names, made valid as typed, a muted prefix (section-, card-, block-) shown
// before a name with no dash. Enter or leaving commits, Esc cancels; the owner
// renames the component everywhere and tells the mode (`retag`), or refuses,
// and the old name comes back with the reason under the bar.
//
// Selecting a part of the template shows its slot chip after the element's
// name in the edit bar label (slot-chip.ts). The chip reports a click, and a
// slot renamed in place, to the mode's owner as a window event,
// SLOT_CHIP_EVENT.

import { drillChain, backChain, type EditComponentLevel } from "./edit-component-chain";
import { EDIT_MODE_FITS, editModeBarFit } from "./edit-mode-bar-fit";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import infoIcon from "@phosphor-icons/core/regular/info.svg?raw";
import { mountDropdown } from "../components/dropdown";
import { componentIcon } from "./component-icon";
import { slotChip } from "../components/slot-chip";
import { refuse } from "../components/refusal-note";
import { normaliseField, normaliseName, previewComponentTag, type NameSource } from "./component-names";
import { templateNameSource } from "./component-rename";
import type { EditComponentFrameMode } from "../components/native-preview";
import type { SlotChipState } from "./component-model";
import "./edit-component-mode.css";

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
  back: (index: number) => void;
  /** The source of the template the mode edits now, for a new name's prefix. */
  template: () => string | undefined;
  /** Renames the component the mode edits now to `tag` (a valid name): resolves to the reason it was refused, if so. */
  rename: (tag: string) => Promise<string | undefined>;
}

export function createEditComponentMode(ports: EditComponentModePorts) {
  let now: (EditComponentTarget & { chain: EditComponentLevel[] }) | undefined;
  // The chip shown, kept while it says the same of the same part.
  let shownChip: { key: string; element: HTMLElement } | undefined;
  let notes: string[] = [];

  const title = node("span", "edit-mode__title");
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
  const noteCount = node("span", "edit-mode__note-count");
  // Shrunk, the note is an info mark and its count (not a page icon: "1 page" sits beside it).
  const noteMark = document.createElement("template");
  noteMark.innerHTML = infoIcon.replace("<svg ", `<svg class="icon" width="12" height="12" aria-hidden="true" focusable="false" `);
  noteCount.append(noteMark.content.firstElementChild!, node("span", "edit-mode__note-number"));
  const noteLabel = node("span", "edit-mode__note-label");
  noteButton.append(node("span", "edit-mode__note-kind", "Note"), noteLabel, noteCount);
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

  let fitBar: HTMLElement | undefined;
  let fitObserver: ResizeObserver | undefined;
  let fitFrame: number | undefined;
  let fitKey = "";
  let widths: Record<typeof EDIT_MODE_FITS[number], number> | undefined;
  function applyFit() {
    if (!fitBar || !widths) return;
    const stage = editModeBarFit(fitBar.getBoundingClientRect().width, widths);
    if (fitBar.dataset.fit !== stage) fitBar.dataset.fit = stage;
  }
  function fit() {
    if (!now) return;
    const bar = title.closest<HTMLElement>(".canvas-bar");
    if (!bar) return;
    if (fitBar !== bar) {
      fitObserver?.disconnect();
      fitBar = bar;
      let observedWidth = -1;
      fitObserver = new ResizeObserver(([entry]) => {
        const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
        if (width === observedWidth) return;
        observedWidth = width;
        // A stage can change the observed bar's height. Write outside observer
        // delivery, and ignore height-only changes, to avoid resize-loop errors.
        if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
        fitFrame = requestAnimationFrame(() => {
          fitFrame = undefined;
          applyFit();
        });
      });
      fitObserver.observe(bar);
      fitKey = "";
    }
    const key = JSON.stringify([title.textContent, notes, bar.querySelector(".canvas-component__used")?.getAttribute("aria-label")]);
    if (key !== fitKey) {
      fitKey = key;
      // Off-screen copies measure natural widths once per content change. Resize
      // callbacks only compare cached numbers: changing height cannot feed back
      // into width measurement or oscillate between fit stages.
      const copies = EDIT_MODE_FITS.map((stage) => {
        const copy = bar.cloneNode(true) as HTMLElement;
        copy.dataset.fit = stage;
        copy.classList.add("edit-mode--measure");
        copy.setAttribute("aria-hidden", "true");
        copy.inert = true;
        copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
        document.body.append(copy);
        return copy;
      });
      widths = Object.fromEntries(copies.map((copy, index) => [EDIT_MODE_FITS[index], Math.ceil(copy.getBoundingClientRect().width)])) as Record<typeof EDIT_MODE_FITS[number], number>;
      copies.forEach((copy) => copy.remove());
    }
    applyFit();
  }

  // ---- The tag renamed in place. ----
  let renaming: { before: string; name: HTMLElement; prefix: HTMLElement; source: NameSource } | undefined;
  // A committed name waiting for the owner: the tag shows it, not editable again until told.
  let pending = false;
  // Committed from the keyboard: the renamed tag takes the focus back (the operation opens the moved template meanwhile).
  let refocus = false;
  const showPrefix = () => {
    if (!renaming) return;
    const typed = renaming.name.textContent ?? "";
    const tag = previewComponentTag(typed, renaming.source);
    renaming.prefix.textContent = tag === normaliseName(typed) ? "" : tag.slice(0, tag.length - normaliseName(typed).length);
  };
  function startRename(tag: HTMLElement) {
    const name = tag.querySelector<HTMLElement>(".edit-mode__name"), prefix = tag.querySelector<HTMLElement>(".edit-mode__prefix");
    const template = ports.template();
    if (renaming || pending || !name || !prefix || template === undefined) return;
    renaming = { before: name.textContent ?? "", name, prefix, source: templateNameSource(template) };
    tag.classList.add("edit-mode__tag--renaming");
    try { name.contentEditable = "plaintext-only"; } catch { /* below */ }
    if (name.contentEditable !== "plaintext-only") name.contentEditable = "true";
    name.spellcheck = false;
    name.setAttribute("role", "textbox");
    name.setAttribute("aria-label", "Component name");
    name.focus();
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
    const { name, prefix } = was;
    const tag = name.parentElement!;
    const focused = document.activeElement === name;
    tag.classList.remove("edit-mode__tag--renaming");
    name.removeAttribute("contenteditable");
    name.removeAttribute("role");
    name.removeAttribute("aria-label");
    const typed = normaliseName(name.textContent ?? "", true);
    const next = commit && typed ? previewComponentTag(typed, was.source) : was.before;
    prefix.textContent = "";
    name.textContent = next;
    if (focused) tag.focus();
    if (next === was.before) return;
    pending = true;
    refocus = focused;
    void ports.rename(next).then((reason) => reason, (error: unknown) => error instanceof Error ? error.message : "The component could not be renamed.").then((reason) => {
      pending = false;
      if (!reason) return;
      refocus = false;
      if (name.isConnected) name.textContent = was.before;
      refuse(reason, { anchor: tag.isConnected ? tag : undefined });
    });
  }
  /** The current level's tag: its name takes a caret on a double-click or F2. */
  function tagLabel(text: string) {
    const out = node("code", "edit-mode__tag");
    const prefix = node("span", "edit-mode__prefix");
    prefix.setAttribute("aria-hidden", "true");
    const name = node("span", "edit-mode__name", text);
    out.append("<", prefix, name, ">");
    out.tabIndex = 0;
    out.setAttribute("aria-current", "true");
    out.setAttribute("aria-label", `<${text}>, the component edited. Double-click or F2 to rename it.`);
    out.title = "Double-click to rename the component";
    out.addEventListener("dblclick", (event) => {
      event.preventDefault();
      startRename(out);
    });
    name.addEventListener("input", (event) => {
      if (!renaming || (event as InputEvent).isComposing) return;
      if (name.childElementCount) name.textContent = name.textContent;
      normaliseField(name);
      showPrefix();
    });
    name.addEventListener("compositionend", () => { if (renaming) { normaliseField(name); showPrefix(); } });
    name.addEventListener("beforeinput", (event) => {
      if (renaming && (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak")) event.preventDefault();
    });
    name.addEventListener("focusout", () => queueMicrotask(() => {
      if (renaming?.name === name && document.activeElement !== name) endRename(true);
    }));
    out.addEventListener("keydown", (event) => {
      if (renaming) {
        // The name's own keys: nothing reaches the editor's shortcuts.
        event.stopPropagation();
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          endRename(event.key === "Enter");
        }
        return;
      }
      if (event.key === "F2" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        startRename(out);
      }
    });
    return out;
  }

  function send() {
    ports.frame(now && { path: now.path, node: [...now.node], tag: now.tag,
      nested: now.chain.slice(1).map(({ tag, node }) => ({ tag, node: [...node] })) });
  }
  function render() {
    if (!now) return;
    // A rename typed when the mode moves on is dropped.
    if (renaming) { renaming.name.textContent = renaming.before; endRename(false); }
    title.replaceChildren(componentIcon(12), node("span", "edit-mode__verb", "Editing"));
    now.chain.forEach((level, index) => {
      if (index) title.append(node("span", "edit-mode__separator", "›"));
      const current = index === now!.chain.length - 1;
      const crumb = current ? tagLabel(level.tag)
        : button(`<${level.tag}>`, () => ports.back(index), "edit-mode__tag edit-mode__crumb");
      if (!current) crumb.setAttribute("aria-label", `Back to <${level.tag}>`);
      title.append(crumb);
    });
    noteLabel.textContent = notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0] ?? "";
    noteButton.title = notes.join("\n");
    noteButton.setAttribute("aria-label", `Note: ${notes.join("; ")} (${notes.length} ${notes.length === 1 ? "note" : "notes"})`);
    noteCount.lastElementChild!.textContent = String(notes.length);
    noteList.replaceChildren(...notes.map((text) => node("li", "edit-mode__notes-item", text)));
  }

  function makeChip(at: readonly number[], state: SlotChipState) {
    if (!now) return undefined;
    const template = now.chain.at(-1)!.templatePath;
    const report = (detail: SlotChipReport) => window.dispatchEvent(new CustomEvent(SLOT_CHIP_EVENT, { detail, cancelable: detail.action === "rename" }));
    const part = { template, node: [...at], chip: state };
    return slotChip(state, {
      onToggle: () => { report({ action: "toggle", ...part, node: [...at] }); },
      onRename: name => report({ action: "rename", ...part, node: [...at], name }),
      group: state.state === "fixed" ? undefined : JSON.stringify([template, state.slot]),
    });
  }

  return {
    /** Starts the mode on `target`, its placeholders showing, with `notes` to tell in the bar. */
    enter(target: EditComponentTarget, withNotes: readonly string[] = []) {
      now = { path: target.path, node: [...target.node], tag: target.tag, templatePath: target.templatePath, chain: [{ tag: target.tag, templatePath: target.templatePath, node: [...target.node] }] };
      notes = [...withNotes];
      render();
      send();
    },
    /** Ends the mode (the frame shows the page as it is); the instance it was on, if any. */
    leave() {
      const was = now;
      if (!was) return undefined;
      if (renaming) { renaming.name.textContent = renaming.before; endRename(false); }
      fitObserver?.disconnect();
      if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
      fitFrame = undefined;
      if (fitBar) delete fitBar.dataset.fit;
      fitBar = undefined;
      fitKey = "";
      now = undefined;
      shownChip = undefined;
      notes = [];
      noteDropdown.close();
      send();
      return { path: was.path, node: [...was.node], tag: was.tag, templatePath: was.templatePath };
    },
    /** The mode now, or `undefined` when it is off. */
    active() {
      const level = now?.chain.at(-1);
      return now && level && { ...now, tag: level.tag, templatePath: level.templatePath,
        node: [...now.node], chain: now.chain.map((step) => ({ ...step, node: [...step.node] })) };
    },
    drill(step: EditComponentLevel) {
      if (!now) return;
      now.chain = drillChain(now.chain, step);
      render();
      send();
      ports.changed();
    },
    back(index: number) {
      if (!now) return;
      now.chain = backChain(now.chain, index);
      render();
      send();
      ports.changed();
    },
    /**
     * The component at `from` is now `to` (renamed, or that undone or redone): the levels that
     * edit it follow, the frame is told, and `withNotes` replace the bar's notes.
     */
    retag(from: string, to: { tag: string; templatePath: string }, withNotes: readonly string[] = []) {
      if (!now) return;
      for (const level of now.chain) if (level.templatePath === from) Object.assign(level, to);
      if (now.templatePath === from) Object.assign(now, to);
      notes = [...withNotes];
      // The tag committed from the keyboard keeps the focus (F2 renames it again).
      const focused = title.contains(document.activeElement) || refocus;
      refocus = false;
      render();
      send();
      ports.changed();
      // After the bar is drawn again (it moves the title).
      if (focused) title.querySelector<HTMLElement>(".edit-mode__tag[aria-current]")?.focus();
    },
    /** An operation refused its optimistic rename: draw the name from source again. */
    resetChip() { shownChip = undefined; },
    /** A separate element for a Structure badge, sharing the label's reports and rename group. */
    badge: makeChip,
    /** The slot chip of the template's part at `node`, for the edit bar label. */
    chip(at: readonly number[], state: SlotChipState) {
      if (!now) return undefined;
      const template = now.chain.at(-1)!.templatePath;
      const key = JSON.stringify([template, at, state]);
      if (shownChip?.key !== key) {
        shownChip = {
          key,
          element: makeChip(at, state)!,
        };
      }
      return shownChip;
    },
    /** The slim bar around the host's Used on and Done controls. */
    parts(usedOn: Element, done: HTMLElement) {
      doneButton = done;
      queueMicrotask(fit);
      return { lead: [title, dots[0], usedOn, ...(notes.length ? [dots[1], note] : [])], end: [done] };
    },
  };
}

export type EditComponentMode = ReturnType<typeof createEditComponentMode>;
