import { node, button } from "../ui/dom";
import { icon } from "../icons";
import type { Checked } from "../native-create";
import { aOr } from "../page-builder/card-grid";
import "./card-grid-controls.css";

// "Add card" over the native preview: a dashed ghost where one more item of
// a grid would go (after its last item), with a "+ Add card" button in it,
// shown while the pointer is on an item of the grid or an item of it is
// selected (docs/page-builder/cards.md). For a grid that is a list of
// pages (its items link to pages under one URL) the button opens a small
// popover, Framer-like: the new page's title, the URL it gets, "Create page
// and card" (Enter) and "Card only"; for any other grid it adds the card at
// once. The preview runtime reports the grids (`item-grids`); the editor
// says what each is and does the adding.

export interface FrameBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** A grid of repeated items as the runtime reports it, for the item under the pointer or the selection. */
export interface ItemGridReport {
  /** The page file. */
  path: string;
  /** The container's element-child indexes from the page root. */
  parent: number[];
  /** The item's index among the container's element children, its place among the items and their count. */
  index: number;
  position: number;
  count: number;
  /** Whether the items run in a row (left to right) rather than down a column, and whether one more fits beside the last. */
  row: boolean;
  beside: boolean;
  /** Where one more item would go, in frame-viewport pixels. */
  ghost: FrameBox;
}

export interface ItemGridsReport {
  hover: ItemGridReport | null;
  selected: ItemGridReport | null;
}

/** What the editor says a reported grid is; none when its source does not bear it out. */
export interface GridDescription {
  /** "card", "item", "link". */
  noun: string;
  /** The heading over it ("Recent work"). */
  label: string;
  /** The URL its items' pages are under (`/work/`), when it is a list of pages. */
  collection?: string;
}

export interface CardGridHandlers {
  describe(grid: ItemGridReport): GridDescription | undefined;
  /** The URL a new page titled `title` gets, or why it cannot be made. */
  plan(grid: ItemGridReport, title: string): Checked<{ route: string }>;
  /** Adds a card with placeholder text after the last one. */
  addCard(grid: ItemGridReport): void;
  /** Creates the page and its card; resolves to an error to show, or nothing. */
  addPage(grid: ItemGridReport, title: string): Promise<string | undefined>;
}

const gridKey = (grid: ItemGridReport) => `${grid.path}|${grid.parent.join(".")}`;
const sameReport = (a: ItemGridReport | null | undefined, b: ItemGridReport | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function createCardGridControls(pane: HTMLElement, frame: HTMLElement, handlers: CardGridHandlers) {
  const layer = node("div", "card-grid-layer");
  const ghost = node("div", "card-ghost");
  ghost.hidden = true;
  const add = button("", () => activate(), "card-ghost__add");
  add.setAttribute("aria-haspopup", "dialog");
  const addLabel = node("span", "card-ghost__label", "Add card");
  add.append(icon("plus", 14), addLabel);
  ghost.append(add);
  layer.append(ghost);

  const popover = node("form", "card-add");
  popover.setAttribute("role", "dialog");
  popover.hidden = true;
  popover.noValidate = true;
  pane.append(layer, popover);

  let reports: ItemGridsReport = { hover: null, selected: null };
  // The grid on show and what the editor says it is.
  let shown: { grid: ItemGridReport; about: GridDescription } | undefined;
  // The grid the popover is open for.
  let open: { grid: ItemGridReport; about: GridDescription; live: boolean } | undefined;
  let pointerOnAdd = false;
  let leaveTimer = 0;
  let hoverGone = false;
  let lastHover: ItemGridReport | undefined;

  add.addEventListener("pointerenter", () => {
    pointerOnAdd = true;
    clearTimeout(leaveTimer);
  });
  add.addEventListener("pointerleave", () => {
    pointerOnAdd = false;
    if (hoverGone) scheduleLeave();
  });

  function geometry() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return { frameRect, paneRect, left: frameRect.left - paneRect.left, top: frameRect.top - paneRect.top };
  }

  function current(): ItemGridReport | undefined {
    if (open) return open.grid;
    // Just after the pointer left the grid (on its way to the button), the grid it left.
    return reports.hover ?? (hoverGone ? lastHover : undefined) ?? reports.selected ?? undefined;
  }

  function layout() {
    pane.dispatchEvent(new Event("card-controls-layout"));
    const { frameRect, left, top } = geometry();
    Object.assign(layer.style, { left: `${left}px`, top: `${top}px`, width: `${frameRect.width}px`, height: `${frameRect.height}px` });
    const grid = current();
    const about = grid ? (open && gridKey(open.grid) === gridKey(grid) ? open.about : handlers.describe(grid)) : undefined;
    if (!grid || !about) {
      shown = undefined;
      ghost.hidden = true;
      return;
    }
    shown = { grid, about };
    // Down a column (a list), the button starts the line, as a list's next item would, and keeps clear of the section plus.
    const column = !grid.row;
    const box = { ...grid.ghost, height: column ? Math.max(grid.ghost.height, 32) : grid.ghost.height };
    ghost.hidden = box.top > frameRect.height || box.top + box.height < 0;
    Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    ghost.classList.toggle("is-column", column);
    const name = about.noun;
    addLabel.textContent = `Add ${name}`;
    const where = about.label ? ` to ${about.label}` : "";
    add.setAttribute("aria-label", about.collection ? `Add ${aOr(name)} with its own page${where}` : `Add ${aOr(name)}${where}`);
    add.title = about.collection ? `New page and ${name}${where}` : `Add ${aOr(name)}${where}, a copy with placeholder text`;
    ghost.classList.toggle("is-compact", box.width < 120 || (!column && box.height < 40));
    // Below the last item, the button sits near the top, a short way from the items.
    ghost.classList.toggle("is-below", !grid.beside && box.height > 96);
    if (open) placePopover();
  }
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (pointerOnAdd || open) return;
      hoverGone = false;
      layout();
    }, 300);
  }

  function activate(grid = shown?.grid, about = shown?.about) {
    if (!grid || !about) return;
    if (!about.collection) {
      close(false);
      handlers.addCard(grid);
      return;
    }
    if (open && gridKey(open.grid) === gridKey(grid)) {
      close(true);
      return;
    }
    openPopover(grid, about);
  }

  function trackGrid(grid?: ItemGridReport) {
    if (!(frame instanceof HTMLIFrameElement)) return;
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "item-grid-track", grid }, "*");
  }

  function openPopover(grid: ItemGridReport, about: GridDescription) {
    open = { grid, about, live: false };
    trackGrid(grid);
    add.setAttribute("aria-expanded", "true");
    ghost.classList.add("is-open");
    const titleId = "card-add-title";
    const heading = node("h2", "card-add__title", `New ${about.noun} with its own page`);
    heading.id = titleId;
    popover.setAttribute("aria-labelledby", titleId);
    const where = node("p", "card-add__where", `In “${about.label}”, linking to a new page under ${about.collection}.`);
    const field = node("label", "card-add__field");
    const fieldName = node("span", "card-add__label", "Page title");
    const input = node("input", "card-add__input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "What is it called?";
    input.setAttribute("aria-describedby", "card-add-url card-add-message");
    field.append(fieldName, input);
    const url = node("p", "card-add__url");
    url.id = "card-add-url";
    const message = node("p", "card-add__message");
    message.id = "card-add-message";
    message.setAttribute("aria-live", "polite");
    const create = node("button", "card-add__create", "Create page and card");
    create.type = "submit";
    const only = button(`${about.noun[0].toUpperCase()}${about.noun.slice(1)} only`, () => {
      const target = open?.grid;
      close(false);
      if (target) handlers.addCard(target);
    }, "card-add__only");
    only.title = `Add ${aOr(about.noun)} with placeholder text and no page`;
    const actions = node("div", "card-add__actions");
    actions.append(only, create);
    popover.replaceChildren(heading, where, field, url, message, actions);
    let pending = false;
    const check = (showEmpty = false) => {
      const title = input.value.trim();
      const planned = title ? handlers.plan(grid, title) : undefined;
      url.replaceChildren(node("span", "card-add__url-label", "URL "), node("code", "", planned?.ok ? planned.value.route : `${about.collection}…`));
      const error = planned && !planned.ok ? planned.error : !title && showEmpty ? "Enter the page's title." : "";
      message.textContent = error;
      message.hidden = !error;
      input.setAttribute("aria-invalid", String(Boolean(error)));
      create.disabled = !planned?.ok || pending;
      return planned;
    };
    input.addEventListener("input", () => check());
    popover.onsubmit = async (event) => {
      event.preventDefault();
      if (pending) return;
      const planned = check(true);
      if (!planned?.ok) { input.focus(); return; }
      pending = true;
      create.disabled = true;
      let error: string | undefined;
      try {
        error = await handlers.addPage(grid, input.value.trim());
      } catch (thrown) {
        error = thrown instanceof Error ? thrown.message : "The page could not be created.";
      } finally {
        pending = false;
      }
      if (!error) { close(false); return; }
      // The failure stays shown until the title changes; the button can try again.
      if (!open) return;
      check();
      message.textContent = error;
      message.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
    };
    check();
    popover.hidden = false;
    placePopover();
    input.focus();
  }

  function placePopover() {
    const { frameRect, paneRect, left, top } = geometry();
    const anchor = add.getBoundingClientRect();
    const width = Math.min(320, frameRect.width - 24);
    popover.style.width = `${width}px`;
    popover.style.maxHeight = `${Math.max(120, frameRect.height - 24)}px`;
    const height = popover.offsetHeight;
    const below = anchor.bottom - paneRect.top + 8;
    const above = anchor.top - paneRect.top - 8 - height;
    const bottom = top + frameRect.height - 12;
    const y = below + height <= bottom || above < top + 12 ? Math.min(below, bottom - height) : above;
    const right = anchor.right - paneRect.left + 12;
    const before = anchor.left - paneRect.left - width - 12;
    const side = right + width <= left + frameRect.width - 12 ? right : before >= left + 12 ? before : undefined;
    const x = side ?? anchor.left - paneRect.left + anchor.width / 2 - width / 2;
    const placedY = side === undefined ? y : Math.min(anchor.top - paneRect.top, bottom - height);
    popover.style.top = `${Math.max(top + 12, placedY)}px`;
    popover.style.left = `${Math.max(left + 12, Math.min(x, left + frameRect.width - 12 - width))}px`;
    pane.dispatchEvent(new Event("card-controls-layout"));
  }

  function close(restoreFocus: boolean) {
    if (!open) return;
    open = undefined;
    trackGrid();
    popover.hidden = true;
    popover.replaceChildren();
    add.setAttribute("aria-expanded", "false");
    ghost.classList.remove("is-open");
    layout();
    if (restoreFocus && !ghost.hidden) add.focus();
  }

  popover.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (!open || popover.contains(target) || add.contains(target)) return;
    close(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);

  return {
    /** The runtime reported the grids under the pointer and around the selection. */
    update(next: ItemGridsReport) {
      const hoverLeft = Boolean(reports.hover) && !next.hover;
      const latest = open ? [next.hover, next.selected].find((grid) => grid && gridKey(grid) === gridKey(open!.grid)) : undefined;
      if (open && latest) {
        open.grid = latest;
        open.live = true;
      }
      if (sameReport(reports.hover, next.hover) && sameReport(reports.selected, next.selected)) return;
      if (hoverLeft) lastHover = reports.hover ?? undefined;
      reports = next;
      if (open?.live && !latest) close(false);
      if (next.hover) {
        hoverGone = false;
        clearTimeout(leaveTimer);
      } else if (hoverLeft) {
        // Moving from an item onto the button (outside the frame) keeps it shown a moment.
        hoverGone = true;
        scheduleLeave();
      }
      layout();
    },
    /** The grid around the selection, as last reported. */
    selected() {
      return reports.selected ?? undefined;
    },
    /** Add to the grid around the selection, as its button does (the edit bar's Add card). */
    addToSelected() {
      const grid = reports.selected;
      const about = grid ? handlers.describe(grid) : undefined;
      if (!grid || !about) return;
      if (!about.collection) { handlers.addCard(grid); return; }
      reports = { ...reports, hover: null };
      layout();
      openPopover(grid, about);
      layout();
    },
    clear() {
      close(false);
      clearTimeout(leaveTimer);
      hoverGone = false;
      reports = { hover: null, selected: null };
      layout();
    },
    destroy() {
      clearTimeout(leaveTimer);
      trackGrid();
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      layer.remove();
      popover.remove();
      pane.dispatchEvent(new Event("card-controls-layout"));
    },
  };
}

export type CardGridControls = ReturnType<typeof createCardGridControls>;
