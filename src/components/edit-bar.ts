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

  function focusable() {
    return [...bar.querySelectorAll<HTMLElement>("button:not([disabled]), select")];
  }

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
      rect = undefined;
      delete bar.dataset.model;
      bar.hidden = true;
      bar.replaceChildren();
    },
    destroy() {
      resize.disconnect();
      bar.remove();
    },
  };
}

export type EditBar = ReturnType<typeof createEditBar>;
