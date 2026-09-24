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
      // A button that opens one text field with Apply (Alt text, Label).
      kind: "field";
      label: string;
      // Shown on the button instead of the label when the value needs attention.
      warning?: string;
      value: string;
      // Prefilled suggestion shown instead of `value` (Apply then applies it).
      initial?: string;
      placeholder?: string;
      hint?: string;
      // An extra action beside Apply, e.g. "Decorative" for an empty alt.
      extra?: { label: string; onPress: () => void };
      onApply: (value: string) => void;
    };

export interface EditBarModel {
  // Short kind label shown first: Heading, Paragraph, Link, Component…
  kind: string;
  controls: EditBarControl[];
  // Ctrl/⌘+B and Ctrl/⌘+I with focus in the bar.
  onFormat?: (format: "strong" | "em") => void;
}

export function createEditBar(pane: HTMLElement, frame: HTMLElement) {
  const bar = node("div", "edit-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Edit bar");
  bar.hidden = true;
  pane.append(bar);

  let rect: SelectionRect | undefined;
  let onFormat: EditBarModel["onFormat"];
  // The open menu or field, under its button.
  const popover = node("div", "edit-bar__popover");
  popover.hidden = true;
  pane.append(popover);
  let popoverButton: HTMLButtonElement | undefined;

  function focusable() {
    return [...bar.querySelectorAll<HTMLElement>(":scope > button:not([disabled]), :scope > select")];
  }

  function closePopover(restoreFocus: boolean) {
    if (popover.hidden) return;
    const trigger = popoverButton;
    popover.hidden = true;
    popover.replaceChildren();
    popoverButton = undefined;
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus();
  }
  function openPopover(trigger: HTMLButtonElement, content: HTMLElement[], role: string) {
    closePopover(false);
    popoverButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    popover.setAttribute("role", role);
    popover.setAttribute("aria-label", trigger.getAttribute("aria-label") ?? trigger.textContent ?? "");
    popover.replaceChildren(...content);
    popover.hidden = false;
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

  function render(model: EditBarModel) {
    closePopover(false);
    onFormat = model.onFormat;
    bar.replaceChildren(node("span", "edit-bar__kind", model.kind));
    for (const control of model.controls) {
      if (control.kind === "button") {
        const item = button(control.label, control.onPress, `edit-bar__button ${control.className ?? ""}`.trim());
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
      } else if (control.kind === "field") {
        const item = button(control.warning ?? control.label, () => {
          if (popoverButton === item) { closePopover(true); return; }
          const label = node("label", "edit-bar__field-label", control.label);
          const input = document.createElement("input");
          input.type = "text";
          input.className = "edit-bar__field-input";
          input.value = control.initial ?? control.value;
          input.placeholder = control.placeholder ?? "";
          label.append(input);
          const apply = () => {
            const value = input.value;
            closePopover(true);
            // Unchanged applies nothing.
            if (value !== control.value) control.onApply(value);
          };
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") { event.preventDefault(); apply(); }
          });
          const actions = node("div", "edit-bar__field-actions");
          actions.append(button("Apply", apply, "edit-bar__field-apply"));
          if (control.extra) {
            const extra = control.extra;
            actions.append(button(extra.label, () => { closePopover(true); extra.onPress(); }, "edit-bar__field-extra"));
          }
          const content: HTMLElement[] = [label];
          if (control.hint) content.push(node("p", "edit-bar__field-hint", control.hint));
          content.push(actions);
          openPopover(item, content, "dialog");
          input.focus();
          input.select();
        }, `edit-bar__button edit-bar__field${control.warning ? " edit-bar__field--warning" : ""}`);
        item.setAttribute("aria-haspopup", "dialog");
        item.setAttribute("aria-expanded", "false");
        if (control.warning) item.title = `${control.label}: ${control.warning}`;
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
  }

  return {
    element: bar,
    /** Render controls for the current selection at `at`, keeping focus where it is. */
    show(model: EditBarModel, at: SelectionRect) {
      const focused = bar.contains(document.activeElement)
        ? focusable().indexOf(document.activeElement as HTMLElement)
        : -1;
      render(model);
      rect = at;
      position();
      if (focused >= 0) focusable()[Math.min(focused, focusable().length - 1)]?.focus();
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
