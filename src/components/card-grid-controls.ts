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
  /** Where one more item would go, in frame-viewport pixels; below the grid, it stops where the page's next content starts. */
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
  /** The folders a new page can go in, the default first. */
  folders?: string[];
  /** Whether a new folder can be made for it. */
  newFolders?: boolean;
  /** Why no page can be made from here now (its listing's settings are unread or unclear). */
  blocked?: string;
}

/** A new page for a grid: its title, the folder it goes in, and a new folder to make there first. */
export interface CardPageRequest {
  title: string;
  parent: string;
  newFolder?: string;
}

export interface CardGridHandlers {
  describe(grid: ItemGridReport): GridDescription | undefined;
  /** The URL the new page gets, or why it cannot be made. */
  plan(grid: ItemGridReport, request: CardPageRequest): Checked<{ route: string }>;
  /** Adds a card with placeholder text after the last one. */
  addCard(grid: ItemGridReport): void;
  /** Creates the page and its card; resolves to an error to show, or nothing. */
  addPage(grid: ItemGridReport, request: CardPageRequest): Promise<string | undefined>;
}

/** The least height of a ghost below a grid: its button, and a little more. */
const STRIP = 32;

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
    // Below a row of cards with no room for one before the page's next
    // content, the runtime reports a strip ending at that content: drawn as
    // a line with its button, not a card-sized box.
    const strip = grid.row && !grid.beside && box.height <= STRIP;
    ghost.classList.toggle("is-strip", strip);
    ghost.hidden = box.top > frameRect.height || box.top + box.height < 0;
    Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    ghost.classList.toggle("is-column", column);
    const name = about.noun;
    addLabel.textContent = `Add ${name}`;
    const where = about.label ? ` to ${about.label}` : "";
    add.setAttribute("aria-label", about.collection ? `Add ${aOr(name)} with its own page${where}` : `Add ${aOr(name)}${where}`);
    add.title = about.collection ? `New page and ${name}${where}` : `Add ${aOr(name)}${where}, a copy with placeholder text`;
    ghost.classList.toggle("is-compact", box.width < 120 || (!column && !strip && box.height < 40));
    // Below the last item, the button sits near the top, a short way from the items.
    ghost.classList.toggle("is-below", !grid.beside && !strip && box.height > 96);
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
    const input = node("input", "card-add__input inline-field");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "What is it called?";
    input.setAttribute("aria-describedby", "card-add-url card-add-message");
    field.append(fieldName, input);
    // The URL: its folder is a button opening the folders it can go in (the
    // current first, then "New folder"), in place under it.
    const url = node("div", "card-add__url");
    url.id = "card-add-url";
    let parent = about.collection!;
    let newFolder: string | undefined;
    const pathButton = node("button", "card-add__path");
    pathButton.type = "button";
    pathButton.setAttribute("aria-haspopup", "listbox");
    pathButton.setAttribute("aria-expanded", "false");
    pathButton.setAttribute("aria-controls", "card-add-folders");
    const slugText = node("code", "card-add__slug");
    const urlLabel = node("span", "card-add__url-label", "URL ");
    url.append(urlLabel, pathButton, slugText);
    const menu = node("div", "card-add__folders");
    menu.id = "card-add-folders";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Folder for the new page");
    menu.hidden = true;
    const folderField = node("input", "card-add__folder-input inline-field");
    folderField.type = "text";
    folderField.autocomplete = "off";
    folderField.placeholder = "folder-name";
    folderField.setAttribute("aria-label", "New folder's name");
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
    popover.replaceChildren(heading, where, field, url, menu, message, actions);
    let pending = false;
    // While a new folder is being named, its name so far (not yet chosen).
    let naming: string | undefined;
    const request = () => ({ title: input.value.trim(), parent, ...(naming !== undefined ? { newFolder: naming } : newFolder !== undefined ? { newFolder } : {}) });
    const check = (showEmpty = false) => {
      const title = input.value.trim();
      const folder = `${parent}${(naming ?? newFolder) ? `${(naming ?? newFolder)!.trim()}/` : ""}`;
      pathButton.textContent = folder;
      pathButton.setAttribute("aria-label", `Folder ${folder}, change`);
      const planned = about.blocked ? { ok: false as const, error: about.blocked } : title ? handlers.plan(grid, request()) : undefined;
      slugText.textContent = planned?.ok ? planned.value.route.slice(folder.length) || planned.value.route : "…";
      const error = planned && !planned.ok ? planned.error : !title && showEmpty ? "Enter the page's title." : "";
      message.textContent = error;
      message.hidden = !error;
      input.setAttribute("aria-invalid", String(Boolean(error) && !naming));
      folderField.setAttribute("aria-invalid", String(Boolean(error) && naming !== undefined));
      create.disabled = !planned?.ok || pending || naming !== undefined;
      return planned;
    };
    const options = () => [...menu.querySelectorAll<HTMLElement>("[role=option]")];
    let closeTimer = 0;
    const renderMenu = () => {
      const folders = about.folders?.length ? about.folders : [about.collection!];
      const items = folders.map((folder, index) => {
        const option = node("div", "card-add__folder", folder);
        option.id = `card-add-folder-${index}`;
        option.setAttribute("role", "option");
        option.tabIndex = -1;
        option.setAttribute("aria-selected", String(folder === parent && newFolder === undefined));
        option.dataset.folder = folder;
        return option;
      });
      if (about.newFolders) {
        const add = node("div", "card-add__folder card-add__folder--new", `New folder in ${parent}`);
        add.setAttribute("role", "option");
        add.tabIndex = -1;
        add.setAttribute("aria-selected", String(newFolder !== undefined));
        add.dataset.newFolder = "";
        items.push(add);
      }
      menu.replaceChildren(...items);
    };
    const showMenu = (focusOption = false) => {
      clearTimeout(closeTimer);
      if (menu.hidden) {
        renderMenu();
        menu.hidden = false;
        pathButton.setAttribute("aria-expanded", "true");
        placePopover();
      }
      if (focusOption) (options().find((option) => option.getAttribute("aria-selected") === "true") ?? options()[0])?.focus();
    };
    const hideMenu = (refocus = false) => {
      clearTimeout(closeTimer);
      if (naming !== undefined) { naming = undefined; check(); }
      peeking = false;
      if (menu.hidden) return;
      menu.hidden = true;
      pathButton.setAttribute("aria-expanded", "false");
      placePopover();
      if (refocus) pathButton.focus();
    };
    const choose = (option: HTMLElement) => {
      if (option.dataset.newFolder !== undefined) {
        // Names the new folder in place of the option, the URL following as it is typed.
        naming = newFolder ?? "";
        folderField.value = naming;
        const row = node("div", "card-add__folder card-add__folder--naming");
        row.append(node("span", "card-add__folder-prefix", parent), folderField, node("span", "card-add__folder-prefix", "/"));
        option.replaceWith(row);
        check();
        folderField.focus();
        return;
      }
      parent = option.dataset.folder!;
      newFolder = undefined;
      hideMenu(true);
      check();
    };
    const confirmFolder = () => {
      const name = (naming ?? "").trim();
      naming = undefined;
      newFolder = name || undefined;
      hideMenu(false);
      check();
      input.focus();
    };
    // A click opens the list (or keeps it, when pointing opened it) and goes into it; a second click closes it.
    let peeking = false;
    pathButton.addEventListener("click", () => {
      if (menu.hidden || peeking) { peeking = false; showMenu(true); } else hideMenu(true);
    });
    pathButton.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      showMenu(true);
    });
    // Hovering shows the folders, but never takes focus from what is being typed.
    for (const target of [pathButton, menu]) {
      target.addEventListener("pointerenter", (event) => {
        if ((event as PointerEvent).pointerType !== "mouse") return;
        if (menu.hidden) peeking = true;
        showMenu(false);
      });
      target.addEventListener("pointerleave", (event) => {
        if ((event as PointerEvent).pointerType !== "mouse") return;
        clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => { if (!menu.contains(document.activeElement) && naming === undefined) hideMenu(false); }, 250);
      });
    }
    menu.addEventListener("click", (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>("[role=option]");
      if (option) choose(option);
    });
    menu.addEventListener("keydown", (event) => {
      if (event.target === folderField) {
        if (event.key === "Enter") { event.preventDefault(); confirmFolder(); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); hideMenu(true); }
        return;
      }
      const list = options();
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        list[(at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        (event.key === "Home" ? list[0] : list.at(-1))?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (list[at]) choose(list[at]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hideMenu(true);
      } else if (event.key === "Tab") hideMenu(false);
    });
    folderField.addEventListener("input", () => { naming = folderField.value; check(); });
    // Focus leaving the list (not to its button) takes the new folder's name, else closes it.
    // Checked after the move settles: an option replaced by the name field also loses focus.
    menu.addEventListener("focusout", () => {
      setTimeout(() => {
        const now = document.activeElement;
        if (menu.hidden || !open || (now && (menu.contains(now) || now === pathButton))) return;
        if (naming !== undefined) confirmFolder();
        else if (now && now !== document.body) hideMenu(false);
      });
    });
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
        error = await handlers.addPage(grid, request());
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
    // For a ghost below the grid the popover grows up over the grid it adds
    // to, so the page's content after the grid stays clear and clickable:
    // beside the button it ends level with the button's bottom, else it ends
    // 8px above the button. When that does not fit under the pane's top (a
    // grid near the top, a short pane), it goes below the button as for any
    // other grid, never over the button itself; there, the next content is
    // covered while it is open.
    const up = side === undefined ? anchor.top - paneRect.top - 8 - height : anchor.bottom - paneRect.top - height;
    const upward = open && !open.grid.beside && up >= top + 12;
    const placedY = upward ? up
      : side === undefined ? (y === above ? above : below)
      : Math.min(anchor.top - paneRect.top, bottom - height);
    // Kept within the pane, except that below the button it keeps off the
    // button (a short pane scrolls the popover, which caps its height).
    const finalY = side === undefined && !upward && placedY === below ? below : Math.max(top + 12, placedY);
    if (finalY === below && side === undefined) popover.style.maxHeight = `${Math.max(120, bottom - below)}px`;
    popover.style.top = `${finalY}px`;
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
    if (event.key !== "Escape" || event.defaultPrevented) return;
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
