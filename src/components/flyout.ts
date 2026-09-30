import "./flyout.css";

// A submenu beside a dropdown (components/dropdown.ts), out of one of its
// rows: the repository's branches, what a connected agent waits on. The
// flyout is a popover in the dropdown's panel, so the page keeps both open
// (a click elsewhere in the dropdown, or closing the dropdown, closes it);
// it stands to the right of the dropdown, top-aligned with its row, or to
// the left when there is no room.
//
// Hovering the row opens it after a moment, so passing over the row shows
// nothing, and it closes a moment after the pointer left both row and
// flyout, which covers a diagonal way into it. A click on the row or
// ArrowRight (the caller's Enter) opens it with the focus in it, held open
// until Esc or ArrowLeft (back to the row), a click elsewhere or the focus
// leaving; Up and Down move between its items.

const HOVER_OPEN = 100;
const HOVER_CLOSE = 250;
// Between the dropdown and the flyout, and the flyout and the window's edges.
const GAP = 4;
const MARGIN = 8;

export function mountFlyout(options: {
  panel: HTMLElement;
  label: string;
  /** Draws the flyout's content, just before it opens. */
  render: () => void;
  /** Whether the row opens it now. */
  enabled?: () => boolean;
  /** Focusing the row from the keyboard shows it, the focus staying on the row. */
  openOnFocus?: boolean;
  /** The item focused as it opens held (default: the first). */
  initial?: () => HTMLElement | null | undefined;
}) {
  const { panel } = options;
  panel.classList.add("flyout");
  panel.popover = "auto";
  panel.setAttribute("aria-label", options.label);
  let row: HTMLElement | undefined;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  // Held open (clicked, from the keyboard, or worked in), not just looked at.
  let held = false;
  // The row takes the focus back without opening the flyout again.
  let returning = false;
  const isOpen = () => panel.matches(":popover-open");
  const items = () =>
    [...panel.querySelectorAll<HTMLElement>('[role^="menuitem"], .flyout__item')].filter(
      (item) => !(item as HTMLButtonElement).disabled && !item.closest("[hidden]"),
    );
  const clear = () => {
    clearTimeout(opening);
    clearTimeout(closing);
  };

  // Beside the dropdown the row is in, its top with the row's.
  function place() {
    if (!row) return;
    const container = row.closest(".dropdown-panel") ?? row;
    const box = container.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const right = box.right + GAP + width <= innerWidth - MARGIN;
    panel.dataset.side = right ? "right" : "left";
    panel.style.left = `${right ? box.right + GAP : Math.max(MARGIN, box.left - GAP - width)}px`;
    panel.style.top = `${Math.max(MARGIN, Math.min(at.top - parseFloat(getComputedStyle(panel).paddingTop), innerHeight - MARGIN - height))}px`;
  }
  function open(focus = false) {
    clear();
    if (!row || options.enabled?.() === false || !row.isConnected) return;
    if (!isOpen()) {
      options.render();
      panel.showPopover();
    }
    held ||= focus;
    row.setAttribute("aria-expanded", "true");
    place();
    if (focus) (options.initial?.() ?? items()[0])?.focus();
  }
  function close(toRow = false) {
    clear();
    if (isOpen()) panel.hidePopover();
    if (toRow && row) {
      returning = true;
      row.focus();
      returning = false;
    }
  }
  function scheduleClose() {
    clearTimeout(opening);
    if (!isOpen() || held) return;
    clearTimeout(closing);
    closing = setTimeout(() => close(), HOVER_CLOSE);
  }

  // The row's listeners, on each row as it is drawn (a list draws its rows again).
  const controller = new AbortController();
  let rowController: AbortController | undefined;
  function attach(next: HTMLElement | undefined) {
    rowController?.abort();
    row = next;
    if (!row) {
      close();
      return;
    }
    rowController = new AbortController();
    const signal = rowController.signal;
    row.setAttribute("aria-haspopup", "menu");
    row.setAttribute("aria-controls", panel.id);
    row.setAttribute("aria-expanded", String(isOpen()));
    row.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(closing);
      if (isOpen() || options.enabled?.() === false) return;
      clearTimeout(opening);
      opening = setTimeout(() => open(), HOVER_OPEN);
    }, { signal });
    row.addEventListener("pointerleave", scheduleClose, { signal });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" || options.enabled?.() === false) return;
      event.preventDefault();
      open(true);
    }, { signal });
    if (options.openOnFocus)
      row.addEventListener("focus", () => {
        if (!returning && row?.matches(":focus-visible")) open();
      }, { signal });
    row.addEventListener("focusout", (event) => {
      const to = event.relatedTarget as Node | null;
      if (to && !panel.contains(to) && !held) close();
    }, { signal });
    if (isOpen()) place();
  }

  panel.addEventListener("pointerenter", () => clearTimeout(closing), { signal: controller.signal });
  panel.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") scheduleClose(); }, { signal: controller.signal });
  panel.addEventListener("pointerdown", () => { held = true; }, { signal: controller.signal });
  panel.addEventListener("focusin", () => { held = true; }, { signal: controller.signal });
  panel.addEventListener("focusout", (event) => {
    const to = event.relatedTarget as Node | null;
    if (to && !panel.contains(to) && to !== row) close();
  }, { signal: controller.signal });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? list[(index + 1) % list.length]
        : event.key === "ArrowUp" ? list[(index - 1 + list.length) % list.length]
          : event.key === "Home" ? list[0]
            : event.key === "End" ? list.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
  }, { signal: controller.signal });
  panel.addEventListener("toggle", () => {
    if (isOpen()) return;
    clear();
    held = false;
    row?.setAttribute("aria-expanded", "false");
  }, { signal: controller.signal });
  const onResize = () => { if (isOpen()) place(); };
  window.addEventListener("resize", onResize, { signal: controller.signal });

  return {
    attach,
    open,
    close,
    isOpen,
    /** Draw the open flyout again, as what it shows changed. */
    refresh() {
      if (!isOpen()) return;
      const focused = panel.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.key : undefined;
      options.render();
      place();
      if (focused) panel.querySelector<HTMLElement>(`[data-key="${CSS.escape(focused)}"]`)?.focus();
    },
    destroy() {
      clear();
      rowController?.abort();
      controller.abort();
    },
  };
}
