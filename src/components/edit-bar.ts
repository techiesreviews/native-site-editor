import { node, button } from "../ui/dom";
import { noteAnchor, noteTop, PIN_HEIGHT } from "./agent-pins";
import "./edit-bar.css";

// The edit bar: contextual controls anchored to the element selected in the
// native preview. It lives in the preview pane, over the frame, and follows
// the selection's rectangle as reported by the preview runtime. Geometry
// follows the User Editor reference: 8 px above the selection when that fits,
// below it otherwise, else pinned 4 px inside the frame top; never past the
// frame's sides; hidden while the selection is scrolled out of view.

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export type EditBarControl =
  | {
      kind: "button";
      label: string;
      // Drawn instead of the label (the label names the button).
      icon?: IconName;
      ariaLabel?: string;
      title?: string;
      disabled?: boolean;
      // A toggle, reflected as aria-pressed.
      pressed?: boolean;
      className?: string;
      onPress: () => void;
    }
  | {
      kind: "select";
      label: string;
      options: { label: string; value: string }[];
      value: string;
      onChange: (value: string) => void;
    }
  | {
      // A button that opens a menu of actions (More, Replace).
      kind: "menu";
      label: string;
      title?: string;
      items: { label: string; onSelect: () => void; disabled?: boolean; current?: boolean }[];
    }
  | {
      // A button opening one text field that applies as you type (Address,
      // Alt text, Label), with optional suggestions (pages of the site, images
      // of the repository) filtered by what is typed. Picking a suggestion
      // applies its value and closes; Enter closes (or picks the one
      // suggestion left); Escape closes. `onClose` ends the undo group.
      kind: "address";
      label: string;
      // Shown on the button instead of the label when the value needs attention.
      warning?: string;
      // The button shows this icon instead of the label (the label names it).
      icon?: "link";
      value: string;
      // A suggestion applied the moment the field opens (an alt from the file
      // name); typing replaces it.
      initial?: string;
      placeholder?: string;
      suggestions?: { label: string; value: string }[];
      // Files from the computer (an image's Upload…, or files dropped on
      // the field): `onFiles` adds them and resolves to the value to apply
      // (the uploaded file's path), or nothing when none was added.
      upload?: { label: string; accept?: string; onFiles: (files: File[]) => Promise<string | undefined> };
      // Opened, focused, as soon as the bar renders (a link just made).
      open?: boolean;
      // More fields under the address in the same popover (a link's Open in
      // new tab and title), applied as changed, in the same undo step.
      extras?: AddressExtra[];
      onInput: (value: string) => void;
      onClose?: () => void;
    }
  | {
      // A button opening a note to write a message about the selection (Ask
      // agent), over the selected element where its pin will stand: Enter
      // sends it, Shift+Enter starts a new line, Escape cancels. `onSend`
      // resolves to an error to show in the note, or to nothing once sent,
      // and the note closes into its pin.
      kind: "prompt";
      label: string;
      title?: string;
      placeholder?: string;
      maxLength?: number;
      onSend: (text: string) => Promise<string | undefined>;
    };

export type AddressExtra =
  | { kind: "checkbox"; label: string; checked: boolean; onChange: (checked: boolean) => void }
  | { kind: "text"; label: string; value: string; placeholder?: string; onInput: (value: string) => void };

type AddressControl = Extract<EditBarControl, { kind: "address" }>;
type PromptControl = Extract<EditBarControl, { kind: "prompt" }>;

export type IconName = "link" | "unlink" | "up" | "down" | "duplicate" | "remove" | "grip" | "ask";

// Stroke paths on a 16 px grid; a `fill` one is a solid shape instead.
const iconPaths: Record<IconName, string | { fill: string }> = {
  link: "M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8",
  // The link's two halves apart, with a spark at each break.
  unlink: "M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8M2.5 5.5h2M5.5 2.5v2M13.5 10.5h-2M10.5 13.5v-2",
  up: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
  down: "M8 3v10M3.5 8.5L8 13l4.5-4.5",
  duplicate: "M6 6h7v7H6zM10 6V3H3v7h3",
  remove: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M6.8 7v4M9.2 7v4",
  // Six dots in two columns, each a tiny closed arc.
  grip: [4, 8, 12].map((y) => [6, 10].map((x) => `M${x} ${y - 0.5}a.5.5 0 110 1a.5.5 0 110-1`).join("")).join(""),
  // The four-pointed star of the editor's mark (✦).
  ask: { fill: "M8 1.5C8.6 5.2 10.8 7.4 14.5 8C10.8 8.6 8.6 10.8 8 14.5C7.4 10.8 5.2 8.6 1.5 8C5.2 7.4 7.4 5.2 8 1.5Z" },
};

function icon(name: IconName) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("edit-bar__icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const shape = iconPaths[name];
  if (typeof shape === "string") {
    path.setAttribute("d", shape);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  } else {
    path.setAttribute("d", shape.fill);
    path.setAttribute("fill", "currentColor");
  }
  svg.append(path);
  return svg;
}

export interface EditBarModel {
  // Short kind label shown first: Heading, Paragraph, Link, Component…
  kind: string;
  controls: EditBarControl[];
  // Ctrl/⌘+B, Ctrl/⌘+I and Ctrl/⌘+K (link) with focus in the bar.
  onFormat?: (format: "strong" | "em" | "link") => void;
  // Alt+Up and Alt+Down with focus in the bar; set only for a movable section.
  onMove?: (direction: "up" | "down") => void;
  // A whole section: the bar's name is a grip that drags it in the page.
  draggable?: boolean;
}

// A point in the frame's viewport, as the page inside it measures it.
export interface FramePoint {
  x: number;
  y: number;
}

// What a drag from the grip does: the preview relays each step to the
// runtime, which owns the geometry and answers with the gap.
export interface EditBarDrag {
  start: (at: FramePoint) => void;
  move: (at: FramePoint) => void;
  end: (at: FramePoint) => void;
  cancel: () => void;
}

/**
 * The pins on the element at a rectangle (src/components/agent-pins.ts):
 * how far from the element's anchor the next one goes (0: none there), and
 * the number it will have.
 */
export type PinRow = (rect: SelectionRect) => { offset: number; next: number };

// Movement before a press on the grip becomes a drag.
const DRAG_THRESHOLD = 7;
// A sent note shrinking into its pin (edit-bar.css `edit-bar-note-sent`).
const NOTE_SENT_MS = 180;
// Six lines of the note's 14 px, where a browser without `field-sizing`
// sizes it here.
const NOTE_MAX_HEIGHT = 84;
const noteSizesItself = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Note {
  label: string;
  control: PromptControl;
  // The Ask agent button, replaced at each render.
  trigger: HTMLButtonElement;
  element: HTMLElement;
  number: HTMLElement;
  input: HTMLTextAreaElement;
  error: HTMLElement;
}

export function createEditBar(pane: HTMLElement, frame: HTMLElement, drag?: EditBarDrag, pinRow?: PinRow) {
  const bar = node("div", "edit-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Edit bar");
  bar.hidden = true;
  pane.append(bar);

  let rect: SelectionRect | undefined;
  let onFormat: EditBarModel["onFormat"];
  let onMove: EditBarModel["onMove"];
  // The open menu or field, under its button.
  const popover = node("div", "edit-bar__popover");
  popover.hidden = true;
  pane.append(popover);
  let popoverButton: HTMLButtonElement | undefined;
  // The open address field, kept across re-renders while its control persists.
  let openAddress: { label: string; opened: string; input: HTMLInputElement; list: HTMLElement; control: AddressControl } | undefined;
  // Ask agent's note, kept across re-renders with what is typed in it, and
  // a sent one shrinking away, which the bar keeps clear of until it is gone.
  let note: Note | undefined;
  let leaving: HTMLElement | undefined;

  const controlLabel = (item: HTMLElement) => item.getAttribute("aria-label") ?? item.textContent ?? "";

  function focusable() {
    return [...bar.querySelectorAll<HTMLElement>(":scope > button:not([disabled]), :scope > select")];
  }

  function closePopover(restoreFocus: boolean) {
    if (popover.hidden) return;
    const trigger = popoverButton;
    const address = openAddress;
    openAddress = undefined;
    popover.hidden = true;
    popover.replaceChildren();
    popoverButton = undefined;
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus();
    address?.control.onClose?.();
  }
  function openPopover(trigger: HTMLButtonElement, content: HTMLElement[], role: string) {
    closePopover(false);
    popoverButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    popover.setAttribute("role", role);
    popover.setAttribute("aria-label", trigger.getAttribute("aria-label") ?? trigger.textContent ?? "");
    popover.replaceChildren(...content);
    popover.hidden = false;
    placePopover(trigger);
  }
  function placePopover(trigger: HTMLElement) {
    // Under the button, kept inside the frame's width.
    const paneRect = pane.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const width = popover.offsetWidth;
    const left = Math.max(frameRect.left - paneRect.left + 8, Math.min(anchor.left - paneRect.left, frameRect.right - paneRect.left - width - 8));
    const below = anchor.bottom - paneRect.top + 4;
    const fits = below + popover.offsetHeight <= frameRect.bottom - paneRect.top - 4;
    popover.style.left = `${left}px`;
    popover.style.top = `${fits ? below : Math.max(frameRect.top - paneRect.top + 4, anchor.top - paneRect.top - 4 - popover.offsetHeight)}px`;
  }
  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover(true);
      return;
    }
    if (popover.getAttribute("role") !== "menu") return;
    const items = [...popover.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not([disabled])")];
    const index = items.indexOf(event.target as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  });
  popover.addEventListener("focusout", (event) => {
    const to = event.relatedTarget as Node | null;
    if (to && (popover.contains(to) || popoverButton?.contains(to))) return;
    queueMicrotask(() => {
      if (!popover.contains(document.activeElement)) closePopover(false);
    });
  });
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (popover.hidden || popover.contains(target) || popoverButton?.contains(target)) return;
    closePopover(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);

  // The grip: a press on it moved 7 px or more drags the selected section.
  // The editor keeps the pointer (captured on the grip) for the whole drag,
  // so nothing inside the frame is pressed or text-selected; the pointer's
  // place in the frame goes to the runtime at each move. The grip element
  // lasts across renders, and a render asked for during a drag waits for its
  // end, so the capture is never lost to a re-render.
  // It is the bar's name with small dots before it, so the section is
  // picked up by its name, with no separate handle.
  const grip = button("", () => undefined, "edit-bar__button edit-bar__grip");
  const gripDots = icon("grip");
  gripDots.classList.add("edit-bar__grip-dots");
  const gripName = node("span", "edit-bar__kind");
  grip.append(gripDots, gripName);
  grip.setAttribute("aria-label", "Drag to move");
  grip.title = "Drag to move";
  let press: { pointerId: number; x: number; y: number; dragging: boolean } | undefined;
  let userSelect = "";
  let pending: { model: EditBarModel; at: SelectionRect } | undefined;

  function framePoint(event: PointerEvent): FramePoint {
    const box = frame.getBoundingClientRect();
    return { x: event.clientX - box.left - frame.clientLeft, y: event.clientY - box.top - frame.clientTop };
  }
  function inFrame(event: PointerEvent) {
    const box = frame.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  }
  // Back to rest: capture released, the other controls usable, a render
  // that waited applied. Nothing is sent to the runtime from here.
  function stopDrag() {
    const current = press;
    press = undefined;
    if (!current) return;
    if (grip.hasPointerCapture(current.pointerId)) grip.releasePointerCapture(current.pointerId);
    if (!current.dragging) return;
    document.documentElement.style.userSelect = userSelect;
    bar.classList.remove("is-dragging");
    for (const item of bar.children) item.removeAttribute("inert");
    const waiting = pending;
    pending = undefined;
    if (waiting) show(waiting.model, waiting.at);
    else position();
  }
  function cancelDrag() {
    const dragging = press?.dragging;
    stopDrag();
    if (dragging) drag?.cancel();
  }
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || press || !drag) return;
    // No focus move and no text selection from the press itself.
    event.preventDefault();
    grip.focus();
    press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    try { grip.setPointerCapture(event.pointerId); } catch { /* a pointer that is gone already */ }
  });
  grip.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    event.preventDefault();
    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return;
      press.dragging = true;
      userSelect = document.documentElement.style.userSelect;
      document.documentElement.style.userSelect = "none";
      document.getSelection()?.removeAllRanges();
      closePopover(false);
      bar.classList.add("is-dragging");
      for (const item of bar.children) if (item !== grip && item.localName !== "span") item.setAttribute("inert", "");
      drag?.start(framePoint(event));
      return;
    }
    drag?.move(framePoint(event));
  });
  grip.addEventListener("pointerup", (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const dragging = press.dragging;
    stopDrag();
    if (!dragging) return;
    // A release outside the frame drops nowhere.
    if (inFrame(event)) drag?.end(framePoint(event));
    else drag?.cancel();
  });
  grip.addEventListener("pointercancel", (event) => {
    if (press && event.pointerId === press.pointerId) cancelDrag();
  });
  grip.addEventListener("lostpointercapture", (event) => {
    if (press && event.pointerId === press.pointerId) cancelDrag();
  });
  function onDragKey(event: KeyboardEvent) {
    if (!press?.dragging || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  }
  window.addEventListener("keydown", onDragKey, true);

  bar.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    // The grip is a move handle: plain Up/Down move the section too.
    if (target === grip && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && onMove) {
      event.preventDefault();
      event.stopPropagation();
      onMove(event.key === "ArrowUp" ? "up" : "down");
      return;
    }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "b" || key === "i" || key === "k") && onFormat) {
      event.preventDefault();
      onFormat(key === "b" ? "strong" : key === "i" ? "em" : "link");
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && onMove) {
      event.preventDefault();
      event.stopPropagation();
      onMove(event.key === "ArrowUp" ? "up" : "down");
      return;
    }
    // Roving focus along the bar; a native select keeps its own arrow keys.
    if (target.tagName === "SELECT") return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const items = focusable();
    const index = items.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  });

  function position() {
    // Held where it is during a drag, so the grip stays under the pointer's capture.
    if (press?.dragging) return;
    if (!rect || bar.hidden && !bar.dataset.model) return;
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < frameRect.height && rect.right > 0 && rect.left < frameRect.width;
    if (note) note.element.hidden = !visible;
    if (!visible) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const frameLeft = frameRect.left - paneRect.left;
    const frameTop = frameRect.top - paneRect.top;
    const frameRight = frameRect.right - paneRect.left;
    const frameBottom = frameRect.bottom - paneRect.top;
    bar.style.maxWidth = `${Math.max(180, frameRect.width - 16)}px`;
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    const gap = 8;
    // Clear of the selection and of the notes on it (its pins, Ask agent's note).
    const row = placeNote(rect, frameRect, frameLeft, frameTop);
    const above = frameTop + Math.min(rect.top, row?.top ?? rect.top) - height - gap;
    const below = frameTop + Math.max(rect.bottom, row?.bottom ?? rect.bottom) + gap;
    let top = above;
    let side = "above";
    if (above < frameTop + 4) {
      if (below + height <= frameBottom - 4) { top = below; side = "below"; }
      else { top = frameTop + 4; side = "pinned"; }
    }
    bar.dataset.side = side;
    bar.style.left = `${Math.max(frameLeft + 8, Math.min(frameLeft + rect.left, frameRight - width - 8))}px`;
    bar.style.top = `${top}px`;
  }
  const resize = new ResizeObserver(() => position());
  resize.observe(frame);
  resize.observe(pane);
  resize.observe(bar);

  // The note after the selection's pins, where the next pin will stand,
  // and that row's extent in frame coordinates.
  function placeNote(at: SelectionRect, frameRect: DOMRect, frameLeft: number, frameTop: number) {
    const slot = pinRow?.(at);
    const anchor = noteAnchor(at, frameRect);
    if (note) {
      const { element } = note;
      note.number.textContent = slot ? `${slot.next}.` : "";
      element.classList.toggle("is-below", anchor.below);
      element.style.maxWidth = `${Math.max(120, frameRect.width - 8)}px`;
      const x = Math.max(4, Math.min(anchor.x + (slot?.offset ?? 0), frameRect.width - element.offsetWidth - 4));
      element.style.left = `${frameLeft + x}px`;
      element.style.top = `${frameTop + Math.max(2, noteTop(anchor, element.offsetHeight))}px`;
    }
    const height = Math.max((note?.element ?? leaving)?.offsetHeight ?? 0, slot?.offset ? PIN_HEIGHT : 0);
    if (!height) return undefined;
    const top = noteTop(anchor, height);
    return { top, bottom: top + height };
  }

  // The address field's suggestion list: pages matching the typed text, all
  // of them while the field still holds the value it opened with; the one
  // equal to the value is marked.
  function renderSuggestions(address: NonNullable<typeof openAddress>) {
    const value = address.input.value.trim();
    const typed = value === address.opened ? "" : value.toLowerCase();
    const matches = (address.control.suggestions ?? []).filter((entry) =>
      !typed || entry.label.toLowerCase().includes(typed) || entry.value.toLowerCase().includes(typed));
    address.list.replaceChildren(...matches.map((entry) => {
      const option = button(entry.label, () => {
        address.input.value = entry.value;
        address.control.onInput(entry.value);
        closePopover(true);
      }, "edit-bar__menu-item edit-bar__option");
      option.setAttribute("role", "option");
      option.tabIndex = -1;
      if (entry.value === address.input.value.trim()) option.setAttribute("aria-selected", "true");
      return option;
    }));
    address.list.hidden = !matches.length;
    if (address.control.suggestions) address.input.setAttribute("aria-expanded", String(matches.length > 0));
    return matches;
  }
  function openAddressField(item: HTMLButtonElement, control: AddressControl) {
    const label = node("label", "edit-bar__field-label", control.label);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "edit-bar__field-input";
    input.value = control.initial ?? control.value;
    input.placeholder = control.placeholder ?? "";
    if (control.suggestions) {
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
    }
    input.autocomplete = "off";
    input.spellcheck = false;
    label.append(input);
    const list = node("div", "edit-bar__options");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Pages of this site");
    list.id = "edit-bar-address-options";
    input.setAttribute("aria-controls", list.id);
    const address = { label: control.label, opened: input.value.trim(), input, list, control };
    input.addEventListener("input", () => {
      renderSuggestions(address);
      // Applied as typed, as one undo step until the field closes.
      address.control.onInput(input.value.trim());
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const matches = renderSuggestions(address);
        if (matches.length === 1 && matches[0].value !== input.value.trim()) {
          input.value = matches[0].value;
          address.control.onInput(matches[0].value);
        }
        closePopover(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        list.querySelector<HTMLButtonElement>("[role='option']")?.focus();
      }
    });
    list.addEventListener("keydown", (event) => {
      const options = [...list.querySelectorAll<HTMLButtonElement>("[role='option']")];
      const index = options.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      if (event.key === "ArrowDown") { event.preventDefault(); options[Math.min(index + 1, options.length - 1)]?.focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) input.focus(); else options[index - 1]?.focus(); }
      else if (event.key === "Home") { event.preventDefault(); options[0]?.focus(); }
      else if (event.key === "End") { event.preventDefault(); options[options.length - 1]?.focus(); }
      else if (event.key.length === 1 || event.key === "Backspace") input.focus();
    });
    // The extras call the handlers of the control as it is now, since the
    // bar re-renders after each change and hands the field a new control.
    const extras = (control.extras ?? []).map((extra, index) => {
      const current = () => address.control.extras?.[index];
      if (extra.kind === "checkbox") {
        const box = node("label", "edit-bar__check");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = extra.checked;
        check.addEventListener("change", () => {
          const now = current();
          if (now?.kind === "checkbox") now.onChange(check.checked);
        });
        box.append(check, document.createTextNode(extra.label));
        return box;
      }
      const field = node("label", "edit-bar__field-label", extra.label);
      const text = document.createElement("input");
      text.type = "text";
      text.className = "edit-bar__field-input";
      text.value = extra.value;
      text.placeholder = extra.placeholder ?? "";
      text.autocomplete = "off";
      text.addEventListener("input", () => {
        const now = current();
        if (now?.kind === "text") now.onInput(text.value.trim());
      });
      text.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        closePopover(true);
      });
      field.append(text);
      return field;
    });
    const content = [label, ...(control.suggestions ? [list] : []), ...extras];
    if (control.upload) content.push(uploadRow(address));
    openPopover(item, content, "dialog");
    openAddress = address;
    renderSuggestions(address);
    input.focus();
    input.select();
    if (control.initial !== undefined && control.initial !== control.value) control.onInput(control.initial);
  }
  // Upload…: a file picker, and the whole field takes a file dropped on it.
  // The uploaded file's path applies as a picked suggestion does.
  function uploadRow(address: NonNullable<typeof openAddress>) {
    const row = node("div", "edit-bar__upload");
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    input.className = "edit-bar__upload-input";
    if (address.control.upload?.accept) input.accept = address.control.upload.accept;
    input.setAttribute("aria-label", address.control.upload?.label ?? "Upload");
    const pick = button(address.control.upload?.label ?? "Upload…", () => input.click(), "edit-bar__menu-item edit-bar__upload-button");
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      input.value = "";
      void uploadInto(address, files);
    });
    row.append(pick, node("span", "edit-bar__upload-hint", "or drop a file here"), input);
    return row;
  }
  async function uploadInto(address: NonNullable<typeof openAddress>, files: File[]) {
    const upload = address.control.upload;
    if (!upload || !files.length) return;
    popover.classList.add("is-uploading");
    let value: string | undefined;
    try {
      value = await upload.onFiles(files.slice(0, 1));
    } finally {
      popover.classList.remove("is-uploading");
    }
    if (value === undefined) return;
    address.input.value = value;
    address.control.onInput(value);
    if (openAddress === address) closePopover(true);
  }
  popover.addEventListener("dragover", (event) => {
    if (!openAddress?.control.upload || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    popover.classList.add("is-drop-target");
  });
  popover.addEventListener("dragleave", (event) => {
    if (!popover.contains(event.relatedTarget as Node | null)) popover.classList.remove("is-drop-target");
  });
  popover.addEventListener("drop", (event) => {
    popover.classList.remove("is-drop-target");
    const address = openAddress;
    if (!address?.control.upload || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    void uploadInto(address, [...event.dataTransfer.files]);
  });

  // Ask agent's note: one line that grows with what is typed (edit-bar.css),
  // the number its request will have before it.
  function openNote(trigger: HTMLButtonElement, control: PromptControl) {
    closePopover(false);
    closeNote(false);
    const element = node("div", "edit-bar__note");
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", control.label);
    const number = node("span", "edit-bar__note-number");
    number.setAttribute("aria-hidden", "true");
    const input = document.createElement("textarea");
    input.className = "edit-bar__note-input";
    input.rows = 1;
    input.setAttribute("aria-label", control.label);
    input.placeholder = control.placeholder ?? "";
    if (control.maxLength) input.maxLength = control.maxLength;
    const line = node("div", "edit-bar__note-line");
    line.append(number, input);
    const error = node("p", "edit-bar__note-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    element.append(line, error);
    pane.append(element);
    const current: Note = { label: control.label, control, trigger, element, number, input, error };
    note = current;
    trigger.setAttribute("aria-expanded", "true");
    input.addEventListener("input", () => fitNote(current));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeNote(true);
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      void sendNote(current);
    });
    // An empty note closes as the focus leaves it; one with words in it
    // waits for Enter or Escape (and follows a newly selected element).
    element.addEventListener("focusout", (event) => {
      const to = event.relatedTarget as Node | null;
      if (to && (element.contains(to) || current.trigger.contains(to))) return;
      queueMicrotask(() => {
        if (note === current && !element.contains(document.activeElement) && !input.value.trim()) closeNote(false);
      });
    });
    resize.observe(element);
    fitNote(current);
    position();
    input.focus();
  }
  function fitNote(current: Note) {
    if (noteSizesItself) return;
    current.input.style.height = "auto";
    current.input.style.height = `${Math.min(current.input.scrollHeight, NOTE_MAX_HEIGHT)}px`;
  }
  async function sendNote(current: Note) {
    const text = current.input.value.trim();
    if (!text || current.input.readOnly) return;
    current.input.readOnly = true;
    current.element.classList.add("is-sending");
    let problem: string | undefined;
    try {
      problem = await current.control.onSend(text);
    } catch (caught) {
      problem = (caught as Error).message || "It could not be sent.";
    } finally {
      current.input.readOnly = false;
      current.element.classList.remove("is-sending");
    }
    if (note !== current) return;
    if (problem) {
      current.error.textContent = problem;
      current.error.hidden = false;
      current.input.focus();
      return;
    }
    closeNote(true, true);
  }
  // A sent note shrinks into the spot its pin takes as the pin pops in.
  function closeNote(restoreFocus: boolean, sent = false) {
    const current = note;
    if (!current) return;
    note = undefined;
    current.trigger.setAttribute("aria-expanded", "false");
    resize.unobserve(current.element);
    if (restoreFocus) current.trigger.focus();
    const { element } = current;
    if (sent && !reducedMotion()) {
      leaving?.remove();
      leaving = element;
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
      element.classList.add("is-sent");
      setTimeout(() => {
        element.remove();
        if (leaving !== element) return;
        leaving = undefined;
        position();
      }, NOTE_SENT_MS);
    } else {
      element.remove();
    }
    position();
  }

  function addressButton(control: AddressControl) {
    const item = button(control.icon ? "" : control.warning ?? control.label, () => {
      if (popoverButton === item) { closePopover(true); return; }
      openAddressField(item, control);
    }, `edit-bar__button edit-bar__address${control.warning ? " edit-bar__field--warning" : ""}${control.icon ? " edit-bar__address--icon" : ""}`);
    if (control.icon) {
      item.append(icon("link"));
      if (control.warning) item.append(document.createTextNode(control.warning));
      item.setAttribute("aria-label", control.label);
      item.title = control.warning ? `${control.label}: ${control.warning}` : control.value ? `${control.label}: ${control.value}` : control.label;
    } else if (control.warning) {
      item.title = `${control.label}: ${control.warning}`;
    }
    item.setAttribute("aria-haspopup", "dialog");
    item.setAttribute("aria-expanded", "false");
    return item;
  }

  function render(model: EditBarModel) {
    let opening: { item: HTMLButtonElement; control: AddressControl } | undefined;
    // An open address field stays open while the new model still offers it
    // (the source re-renders after each keystroke); its handlers move over.
    const kept = openAddress && model.controls.find((control): control is AddressControl =>
      control.kind === "address" && control.label === openAddress?.label);
    // Ask agent's note stays open the same way, with its text.
    const keptPrompt = note && model.controls.find((control): control is PromptControl =>
      control.kind === "prompt" && control.label === note?.label);
    if (kept && openAddress) openAddress.control = kept;
    else closePopover(false);
    if (keptPrompt && note) note.control = keptPrompt;
    else closeNote(false);
    onFormat = model.onFormat;
    onMove = model.onMove;
    if (model.draggable && drag) {
      gripName.textContent = model.kind;
      bar.replaceChildren(grip);
    } else bar.replaceChildren(node("span", "edit-bar__kind", model.kind));
    for (const control of model.controls) {
      if (control.kind === "button") {
        const item = button(control.icon ? "" : control.label, control.onPress, `edit-bar__button ${control.icon ? "edit-bar__button--icon " : ""}${control.className ?? ""}`.trim());
        if (control.icon) {
          item.append(icon(control.icon));
          item.setAttribute("aria-label", control.label);
          item.title = control.title ?? control.label;
        }
        if (control.ariaLabel) item.setAttribute("aria-label", control.ariaLabel);
        if (control.title) item.title = control.title;
        if (control.pressed !== undefined) item.setAttribute("aria-pressed", String(control.pressed));
        item.disabled = Boolean(control.disabled);
        bar.append(item);
      } else if (control.kind === "menu") {
        const item = button(control.label, () => {
          if (popoverButton === item) { closePopover(true); return; }
          const items = control.items.map((entry) => {
            const option = button(entry.label, () => { closePopover(false); entry.onSelect(); }, "edit-bar__menu-item");
            option.setAttribute("role", "menuitem");
            option.disabled = Boolean(entry.disabled);
            if (entry.current) option.setAttribute("aria-current", "true");
            return option;
          });
          openPopover(item, items, "menu");
          items.find((option) => !option.disabled)?.focus();
        }, "edit-bar__button edit-bar__menu");
        item.setAttribute("aria-haspopup", "menu");
        item.setAttribute("aria-expanded", "false");
        if (control.title) item.title = control.title;
        bar.append(item);
      } else if (control.kind === "address") {
        const item = addressButton(control);
        if (kept === control && openAddress) {
          popoverButton = item;
          item.setAttribute("aria-expanded", "true");
          renderSuggestions(openAddress);
        } else if (control.open && !kept) {
          opening = { item, control };
        }
        bar.append(item);
      } else if (control.kind === "prompt") {
        const item = button("", () => {
          if (note?.trigger === item) { closeNote(true); return; }
          openNote(item, control);
        }, "edit-bar__button edit-bar__button--icon edit-bar__ask");
        item.append(icon("ask"));
        item.setAttribute("aria-label", control.label);
        item.title = control.title ?? control.label;
        item.setAttribute("aria-haspopup", "dialog");
        item.setAttribute("aria-expanded", String(keptPrompt === control));
        if (keptPrompt === control && note) note.trigger = item;
        bar.append(item);
      } else {
        const select = document.createElement("select");
        select.className = "edit-bar__select";
        select.setAttribute("aria-label", control.label);
        select.title = control.label;
        for (const option of control.options) select.append(new Option(option.label, option.value));
        select.value = control.value;
        select.addEventListener("change", () => {
          if (select.value !== control.value) control.onChange(select.value);
        });
        bar.append(select);
      }
    }
    bar.dataset.model = "1";
    if (kept && popoverButton) placePopover(popoverButton);
    return opening;
  }

  function show(model: EditBarModel, at: SelectionRect) {
    // A drag holds the bar as it is; the newest model waits for its end.
    if (press?.dragging) {
      pending = { model, at };
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const focused = active && bar.contains(active) ? focusable().indexOf(active) : -1;
    const label = focused >= 0 ? controlLabel(active!) : "";
    const opening = render(model);
    rect = at;
    position();
    // A field asked to open does so once the bar is in place, and keeps the focus.
    if (opening) {
      openAddressField(opening.item, opening.control);
      return;
    }
    if (focused < 0) return;
    // The same control again when it is still there and enabled, else its neighbour.
    const items = focusable();
    (items.find((item) => controlLabel(item) === label) ?? items[Math.min(focused, items.length - 1)])?.focus();
  }

  return {
    element: bar,
    /** Render controls for the current selection at `at`, keeping focus where it is. */
    show,
    /** The selection moved (scroll, resize, reflow) without changing. */
    move(at: SelectionRect) {
      rect = at;
      if (pending) pending.at = at;
      position();
    },
    /** The pins moved or changed: the bar and Ask agent's note keep to them. */
    refit() {
      position();
    },
    /** The runtime ended the drag (dropped, or cancelled on its side): the grip lets go. */
    dragEnded() {
      stopDrag();
    },
    hide() {
      cancelDrag();
      pending = undefined;
      closePopover(false);
      closeNote(false);
      rect = undefined;
      delete bar.dataset.model;
      bar.hidden = true;
      bar.replaceChildren();
    },
    destroy() {
      stopDrag();
      window.removeEventListener("keydown", onDragKey, true);
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      closeNote(false);
      leaving?.remove();
      popover.remove();
      bar.remove();
    },
  };
}

export type EditBar = ReturnType<typeof createEditBar>;
