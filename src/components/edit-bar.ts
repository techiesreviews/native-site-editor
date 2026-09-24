import { node, button } from "../ui/dom";
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
      onInput: (value: string) => void;
      onClose?: () => void;
    };

type AddressControl = Extract<EditBarControl, { kind: "address" }>;

export type IconName = "link" | "up" | "down" | "duplicate" | "remove";

// Stroke paths on a 16 px grid.
const iconPaths: Record<IconName, string> = {
  link: "M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8",
  up: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
  down: "M8 3v10M3.5 8.5L8 13l4.5-4.5",
  duplicate: "M6 6h7v7H6zM10 6V3H3v7h3",
  remove: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M6.8 7v4M9.2 7v4",
};

function icon(name: IconName) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("edit-bar__icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPaths[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

export interface EditBarModel {
  // Short kind label shown first: Heading, Paragraph, Link, Component…
  kind: string;
  controls: EditBarControl[];
  // Ctrl/⌘+B and Ctrl/⌘+I with focus in the bar.
  onFormat?: (format: "strong" | "em") => void;
  // Alt+Up and Alt+Down with focus in the bar; set only for a movable section.
  onMove?: (direction: "up" | "down") => void;
}

export function createEditBar(pane: HTMLElement, frame: HTMLElement) {
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

  bar.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "b" || key === "i") && onFormat) {
      event.preventDefault();
      onFormat(key === "b" ? "strong" : "em");
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
    if (!rect || bar.hidden && !bar.dataset.model) return;
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < frameRect.height && rect.right > 0 && rect.left < frameRect.width;
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
    const above = frameTop + rect.top - height - gap;
    const below = frameTop + rect.bottom + gap;
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
    openPopover(item, control.suggestions ? [label, list] : [label], "dialog");
    openAddress = address;
    renderSuggestions(address);
    input.focus();
    input.select();
    if (control.initial !== undefined && control.initial !== control.value) control.onInput(control.initial);
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
    // An open address field stays open while the new model still offers it
    // (the source re-renders after each keystroke); its handlers move over.
    const kept = openAddress && model.controls.find((control): control is AddressControl =>
      control.kind === "address" && control.label === openAddress?.label);
    if (kept && openAddress) openAddress.control = kept;
    else closePopover(false);
    onFormat = model.onFormat;
    onMove = model.onMove;
    bar.replaceChildren(node("span", "edit-bar__kind", model.kind));
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
        }
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
  }

  return {
    element: bar,
    /** Render controls for the current selection at `at`, keeping focus where it is. */
    show(model: EditBarModel, at: SelectionRect) {
      const active = document.activeElement as HTMLElement | null;
      const focused = active && bar.contains(active) ? focusable().indexOf(active) : -1;
      const label = focused >= 0 ? controlLabel(active!) : "";
      render(model);
      rect = at;
      position();
      if (focused < 0) return;
      // The same control again when it is still there and enabled, else its neighbour.
      const items = focusable();
      (items.find((item) => controlLabel(item) === label) ?? items[Math.min(focused, items.length - 1)])?.focus();
    },
    /** The selection moved (scroll, resize, reflow) without changing. */
    move(at: SelectionRect) {
      rect = at;
      position();
    },
    hide() {
      closePopover(false);
      rect = undefined;
      delete bar.dataset.model;
      bar.hidden = true;
      bar.replaceChildren();
    },
    destroy() {
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      popover.remove();
      bar.remove();
    },
  };
}

export type EditBar = ReturnType<typeof createEditBar>;
