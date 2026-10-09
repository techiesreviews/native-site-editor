import { node, button } from "../ui/dom";
import { icon } from "../icons";
import type { Checked } from "../native-create";
import { cardPrefixRequest } from "../page-builder/cards";
import { aOr } from "../page-builder/card-grid";
import type { SitePage } from "../page-builder/page-choices";
import type { CardFillRow } from "../page-builder/card-fill";
import type { CardLinkPicker } from "./card-link-picker";
import type { CardFillStrip } from "./card-fill-strip";
import type { CardLook } from "../page-builder/card-looks";
import type { ThumbnailInputs } from "../page-builder/thumbnail-doc";
import type { CardLookGallery } from "./card-look-gallery";
import "./card-grid-controls.css";

// "Add card" over the native preview: a dashed ghost where one more item of
// a grid would go (after its last item), with a "+ Add card" button in it,
// shown while the pointer is on an item of the grid or an item of it is
// selected (docs/page-builder/cards.md). For a grid that is a list of
// pages (its items link to pages under one URL) the button opens a small
// popover, Framer-like: the new page's title, the URL it gets, "Create page
// and card" (Enter) and "Card only"; for any other grid it adds the card at
// once. The preview runtime reports the grids (`item-grids`); the editor
// says what each is and does the adding. A fresh card of an instance's card
// slot gets "Link to a page…" at its foot (card-link-picker.ts, loaded then);
// picking a page fills the card and swaps the combobox for an information
// strip of where each slot's content came from (card-fill-strip.ts).
// A card slot's button is split, "+ │ ▾": the ▾ opens "Add card as…", a
// gallery of card looks (card-look-gallery.ts, loaded then), and places a
// blank card of the one picked.

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
  /** The item's index among the container's element children, its place among the items and their count (-1, -1 and 0 for an empty card slot). */
  index: number;
  position: number;
  count: number;
  /**
   * The container is an instance and these are its card slot's items (by
   * the slot's name, "" the unnamed one): an items slot whose fallback is a
   * card component, a grid with any number of items (src/page-builder/card-slot.ts).
   */
  slot?: string;
  /** Whether the items run in a row (left to right) rather than down a column, and whether one more fits beside the last. */
  row: boolean;
  beside: boolean;
  /** Where one more item would go, in frame-viewport pixels; below the grid, it stops where the page's next content starts. */
  ghost: FrameBox;
  /** The item's own box, in frame-viewport pixels (none for an empty card slot). */
  item?: FrameBox;
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
  /** A card slot's own card component, whose ▾ offers the looks. */
  card?: string;
}

/** A new page for a grid: its title, the folder it goes in, and a new folder to make there first. */
export interface CardPageRequest {
  title: string;
  parent: string;
  newFolder?: string;
}

/** A card just added that a page can be linked to: its page file and body path. */
export interface NewCard {
  path: string;
  node: number[];
}

/** What a new card can link to: the site's pages, the card's page file, and the pages its grid's other cards link to. */
export interface CardLinkPages {
  pages: SitePage[];
  own: string;
  inGrid: string[];
}

/** A card filled from a page: the rows of where its slots' content came from, the card before and after the fill. */
export interface CardFilled {
  rows: CardFillRow[];
  title: string;
  route: string;
  /** The card as it was before the first fill, which Change page fills again. */
  base: string;
  filled: string;
}

export interface CardGridHandlers {
  describe(grid: ItemGridReport): GridDescription | undefined;
  /** The URL the new page gets, or why it cannot be made. */
  plan(grid: ItemGridReport, request: CardPageRequest): Checked<{ route: string }>;
  /** Adds a card after the last one, a card slot's in `look` when given; resolves to it when a page can be linked to it (a card slot's fresh card). */
  addCard(grid: ItemGridReport, look?: CardLook): Promise<NewCard | undefined>;
  linkPages(card: NewCard): CardLinkPages | undefined;
  /** Fills the card from the page at `route`, from `base` when given (one undo step); undefined when it could not. */
  fillCard(card: NewCard, route: string, base?: string): CardFilled | undefined;
  /** The card's markup now; undefined once it is gone. */
  cardText(card: NewCard): string | undefined;
  /** Creates the page and its card; resolves to an error to show, or nothing. */
  addPage(grid: ItemGridReport, request: CardPageRequest): Promise<string | undefined>;
}

/** The least height of a ghost below a grid: its button, and a little more. */
const STRIP = 32;

// A card slot is its own grid: an instance can hold several (`slot`).
const gridKey = (grid: ItemGridReport) => `${grid.path}|${grid.parent.join(".")}${grid.slot === undefined ? "" : `|${grid.slot}`}`;
const sameReport = (a: ItemGridReport | null | undefined, b: ItemGridReport | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What the looks gallery renders thumbnails with (the preview's page builder inputs). */
export interface CardLookSupport {
  inputs(): ThumbnailInputs | undefined;
  prepare(tags: string[]): void;
}

export function createCardGridControls(pane: HTMLElement, frame: HTMLElement, handlers: CardGridHandlers, lookSupport?: CardLookSupport) {
  const layer = node("div", "card-grid-layer");
  const ghost = node("div", "card-ghost");
  ghost.hidden = true;
  const add = button("", () => activate(), "card-ghost__add");
  add.setAttribute("aria-haspopup", "dialog");
  const addLabel = node("span", "card-ghost__label", "Add card");
  add.append(icon("plus", 14), addLabel);
  // A card slot's ▾: "Add card as…".
  const looks = button("", () => toggleGallery(), "card-ghost__looks");
  looks.setAttribute("aria-haspopup", "dialog");
  looks.setAttribute("aria-expanded", "false");
  looks.append(icon("caret-down", 14));
  looks.hidden = true;
  // Esc on ▾ while the gallery is still loading: nothing opens.
  looks.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !gallery) return;
    event.preventDefault();
    event.stopPropagation();
    closeGallery(true);
  });
  const buttons = node("span", "card-ghost__buttons");
  buttons.append(add, looks);
  ghost.append(buttons);
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
  // Places the open popover's folder list again, after the popover moves.
  let menuPlacer: (() => void) | undefined;
  // The open popover's folder list.
  let folderMenu: HTMLElement | undefined;

  buttons.addEventListener("pointerenter", () => {
    pointerOnAdd = true;
    clearTimeout(leaveTimer);
  });
  buttons.addEventListener("pointerleave", () => {
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
    if (gallery) return gallery.grid;
    // Just after the pointer left the grid (on its way to the button), the grid it left;
    // the selection's report of that grid is newer (the card just added is selected in it).
    const left = hoverGone && lastHover && !(reports.selected && gridKey(reports.selected) === gridKey(lastHover)) ? lastHover : undefined;
    return reports.hover ?? left ?? reports.selected ?? undefined;
  }

  function layout() {
    pane.dispatchEvent(new Event("card-controls-layout"));
    placeLinker();
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
    const split = Boolean(lookSupport && about.card && grid.slot !== undefined);
    looks.hidden = !split;
    buttons.classList.toggle("is-split", split);
    looks.setAttribute("aria-label", `Add ${aOr(name)}${where} as…`);
    looks.title = `Choose the ${name}'s look`;
    add.setAttribute("aria-label", about.collection ? `Add ${aOr(name)} with its own page${where}` : `Add ${aOr(name)}${where}`);
    add.title = about.collection ? `New page and ${name}${where}` : grid.slot !== undefined ? `Add ${aOr(name)}${where}` : `Add ${aOr(name)}${where}, a copy with placeholder text`;
    ghost.classList.toggle("is-compact", box.width < 120 || (!column && !strip && box.height < 40));
    // Below the last item, the button sits near the top, a short way from the items.
    ghost.classList.toggle("is-below", !grid.beside && !strip && box.height > 96);
    if (open) placePopover();
    gallery?.view?.place();
  }
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (pointerOnAdd || open || gallery) return;
      hoverGone = false;
      layout();
    }, 300);
  }

  function activate(grid = shown?.grid, about = shown?.about) {
    if (!grid || !about) return;
    closeGallery(false);
    if (!about.collection) {
      close(false);
      addCard(grid);
      return;
    }
    if (open && gridKey(open.grid) === gridKey(grid)) {
      close(true);
      return;
    }
    openPopover(grid, about);
  }

  // "Link to a page…" on the card just added, while it stays selected; after
  // a page is picked, the strip of where its content came from instead.
  let linker: { card: NewCard; picker?: CardLinkPicker; strip?: CardFillStrip; filled?: CardFilled; filling?: boolean; seen: boolean; scrolled?: boolean } | undefined;

  function addCard(grid: ItemGridReport, look?: CardLook) {
    closeLinker();
    void handlers.addCard(grid, look).then((card) => {
      if (!card || !handlers.linkPages(card)) return;
      closeLinker();
      const entry: NonNullable<typeof linker> = { card, seen: false };
      linker = entry;
      openPicker(entry);
    });
  }

  function openPicker(entry: NonNullable<typeof linker>) {
    const pages = handlers.linkPages(entry.card);
    if (!pages) { closeLinker(); return; }
    import("./card-link-picker").then(({ createCardLinkPicker }) => {
      if (linker !== entry) return;
      entry.strip?.destroy();
      entry.strip = undefined;
      entry.picker = createCardLinkPicker(pane, {
        pages,
        onPick: (page) => fill(entry, page.route),
        onEscape: () => {
          // From Change page, Esc goes back to the strip; on a blank card it closes.
          if (entry.filled) { showStrip(entry, entry.filled); return; }
          closeLinker();
          if (!ghost.hidden) add.focus();
        },
      });
      placeLinker();
    }).catch(() => { if (linker === entry) linker = undefined; });
  }

  function fill(entry: NonNullable<typeof linker>, route: string) {
    // Its own edit is not a change to the card that drops the strip (sourcesChanged).
    entry.filling = true;
    const filled = handlers.fillCard(entry.card, route, entry.filled?.base);
    entry.filling = false;
    if (!filled || linker !== entry) return;
    entry.filled = filled;
    // The page shows the filled card after its next report: until then the selection may not name it.
    entry.seen = false;
    showStrip(entry, filled);
  }

  function showStrip(entry: NonNullable<typeof linker>, filled: CardFilled) {
    import("./card-fill-strip").then(({ createCardFillStrip }) => {
      if (linker !== entry || entry.filled !== filled) return;
      entry.picker?.destroy();
      entry.picker = undefined;
      entry.strip?.destroy();
      entry.strip = createCardFillStrip(pane, {
        filled,
        onChange: () => openPicker(entry),
        onClose: () => {
          closeLinker();
          if (!ghost.hidden) add.focus();
        },
      });
      placeLinker();
    }).catch(() => { if (linker === entry) closeLinker(); });
  }

  // Hung from the card while the selection is the card (the runtime reports
  // its box); gone once the selection has been it and moved on (another
  // element, or Undo took the card away).
  function placeLinker() {
    if (!linker) return;
    const grid = reports.selected;
    const node = linker.card.node;
    const mine = grid?.item && grid.path === linker.card.path && grid.parent.length === node.length - 1 &&
      [...grid.parent, grid.index].every((step, at) => step === node[at]) ? grid.item : undefined;
    if (!mine && linker.seen) { closeLinker(); return; }
    linker.seen ||= Boolean(mine);
    const { frameRect, left, top } = geometry();
    const view = { left, top, width: frameRect.width, height: frameRect.height };
    if (linker.strip) {
      linker.strip.place(mine && { ...mine, left: left + mine.left, top: top + mine.top }, view);
      return;
    }
    const dy = linker.picker?.place(mine && { ...mine, left: left + mine.left, top: top + mine.top }, view, !linker.scrolled) ?? 0;
    // Once, when it does not fit below the card: the page scrolls up to make room (its report places it again).
    if (dy > 0 && frame instanceof HTMLIFrameElement) {
      const entry = linker;
      entry.scrolled = true;
      frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "scroll-by", dy }, "*");
      // A page that could not scroll sends no new report: it shows where it fits then.
      window.setTimeout(() => { if (linker === entry) placeLinker(); }, 250);
    }
  }

  function closeLinker() {
    linker?.picker?.destroy();
    linker?.strip?.destroy();
    linker = undefined;
  }

  // "Add card as…" for the card slot it was opened on.
  interface GalleryEntry { grid: ItemGridReport; live: boolean; view?: CardLookGallery }
  let gallery: GalleryEntry | undefined;

  function toggleGallery() {
    const grid = shown?.grid;
    const card = shown?.about.card;
    if (gallery) { closeGallery(true); return; }
    if (!grid || !card || !lookSupport) return;
    close(false);
    closeLinker();
    const entry: GalleryEntry = { grid, live: false };
    gallery = entry;
    trackGrid(grid);
    looks.setAttribute("aria-expanded", "true");
    ghost.classList.add("is-looking");
    // A card's width in the grid, so each look shows as it would there.
    const width = grid.item?.width ?? (grid.beside ? grid.ghost.width : 320);
    import("./card-look-gallery").then(({ createCardLookGallery }) => {
      if (gallery !== entry) return;
      entry.view = createCardLookGallery(pane, looks, {
        inputs: () => lookSupport.inputs(),
        prepare: (tags) => lookSupport.prepare(tags),
        card,
        noun: shown?.about.noun ?? "card",
        cardWidth: Math.max(220, Math.min(420, width)),
        onPick: (look) => {
          const target = gallery?.grid ?? grid;
          closeGallery(false);
          addCard(target, look);
        },
        onClose: (focus) => closeGallery(focus),
      });
    }).catch(() => { if (gallery === entry) closeGallery(false); });
  }

  function closeGallery(restoreFocus: boolean) {
    if (!gallery) return;
    gallery.view?.destroy();
    gallery = undefined;
    trackGrid();
    looks.setAttribute("aria-expanded", "false");
    ghost.classList.remove("is-looking");
    layout();
    if (restoreFocus && !ghost.hidden && !looks.hidden) looks.focus();
  }

  function trackGrid(grid?: ItemGridReport) {
    if (!(frame instanceof HTMLIFrameElement)) return;
    frame.contentWindow?.postMessage({ source: "astro-native-preview-host", type: "item-grid-track", grid }, "*");
  }

  function openPopover(grid: ItemGridReport, about: GridDescription) {
    closeLinker();
    closeGallery(false);
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
    const url = node("div", "card-add__url");
    url.id = "card-add-url";
    const prefixInput = node("input", "card-add__path inline-field");
    prefixInput.type = "text";
    prefixInput.value = about.collection!;
    prefixInput.autocomplete = "off";
    prefixInput.setAttribute("role", "combobox");
    prefixInput.setAttribute("aria-label", "URL prefix");
    prefixInput.setAttribute("aria-autocomplete", "list");
    prefixInput.setAttribute("aria-expanded", "false");
    prefixInput.setAttribute("aria-controls", "card-add-folders");
    prefixInput.setAttribute("aria-describedby", "card-add-message");
    const slugText = node("code", "card-add__slug");
    url.append(node("span", "card-add__url-label", "URL "), prefixInput, slugText);
    const menu = node("div", "card-add__folders");
    menu.id = "card-add-folders-menu";
    menu.hidden = true;
    const list = node("div", "card-add__folder-list");
    list.id = "card-add-folders";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Folder for the new page");
    menu.append(list);
    const message = node("p", "card-add__message");
    message.id = "card-add-message";
    message.setAttribute("aria-live", "polite");
    const create = node("button", "card-add__create", "Create page and card");
    create.type = "submit";
    const only = button(`${about.noun[0].toUpperCase()}${about.noun.slice(1)} only`, () => {
      const target = open?.grid;
      close(false);
      if (target) addCard(target);
    }, "card-add__only");
    only.title = `Add ${aOr(about.noun)} with placeholder text and no page`;
    const actions = node("div", "card-add__actions");
    actions.append(only, create);
    popover.replaceChildren(heading, where, field, url, message, actions);
    // Beside the popover in the pane, not in it: the popover's opening
    // animation moves it, and that would carry a fixed list with it.
    folderMenu?.remove();
    folderMenu = menu;
    pane.append(menu);
    let pending = false;
    const allowed = about.folders?.length ? about.folders : [about.collection!];
    const request = () => cardPrefixRequest(input.value.trim(), prefixInput.value, allowed, Boolean(about.newFolders));
    const check = (showEmpty = false) => {
      const title = input.value.trim();
      prefixInput.style.width = `${Math.max(4, prefixInput.value.length + 1)}ch`;
      const parsed = request();
      const planned = !parsed.ok ? parsed : title ? handlers.plan(grid, parsed.value) : undefined;
      slugText.textContent = planned?.ok ? planned.value.route.slice(prefixInput.value.length) : "…";
      const error = planned && !planned.ok ? planned.error : !title && showEmpty ? "Enter the page's title." : "";
      message.textContent = error;
      message.hidden = !error;
      input.setAttribute("aria-invalid", String(Boolean(error) && parsed.ok));
      prefixInput.setAttribute("aria-invalid", String(!parsed.ok));
      create.disabled = !planned?.ok || pending;
      return planned;
    };
    const options = () => [...list.querySelectorAll<HTMLElement>("[role=option]")];
    let active = -1;
    const setActive = (index: number) => {
      active = index;
      const items = options();
      items.forEach((option, at) => option.setAttribute("aria-selected", String(at === active)));
      if (items[active]) {
        prefixInput.setAttribute("aria-activedescendant", items[active].id);
        items[active].scrollIntoView({ block: "nearest" });
      } else prefixInput.removeAttribute("aria-activedescendant");
    };
    const renderMenu = () => {
      const query = prefixInput.value.toLowerCase();
      list.replaceChildren(...allowed.filter((folder) => folder.toLowerCase().includes(query)).map((folder, index) => {
        const option = node("div", "card-add__folder", folder);
        option.id = `card-add-folder-${index}`;
        option.setAttribute("role", "option");
        option.dataset.folder = folder;
        return option;
      }));
      setActive(-1);
    };
    // Under the URL's folder (above it only when not even a row fits below),
    // in the pane, never over the popover's own Add button.
    const placeMenu = () => {
      if (menu.hidden) return;
      const anchor = prefixInput.getBoundingClientRect();
      const form = popover.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const button = add.getBoundingClientRect();
      const left = form.left + 8;
      const width = form.width - 16;
      let limit = Math.min(paneRect.bottom, window.innerHeight) - 8;
      if (!ghost.hidden && button.left < left + width && button.right > left && button.top >= anchor.bottom) limit = Math.min(limit, button.top - 6);
      menu.style.left = `${left}px`;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = "";
      const wanted = menu.scrollHeight;
      const below = limit - anchor.bottom - 4;
      const above = anchor.top - Math.max(paneRect.top, 0) - 12;
      // Below it, scrolling, while a row fits there: above it, it would cover the title being typed.
      const up = below < 40 && above > below;
      const room = Math.max(56, up ? above : below);
      menu.style.maxHeight = `${room}px`;
      menu.classList.toggle("is-above", up);
      menu.style.top = `${up ? anchor.top - 4 - Math.min(wanted, room) : anchor.bottom + 4}px`;
    };
    menuPlacer = placeMenu;
    const showMenu = () => {
      renderMenu();
      menu.hidden = options().length === 0;
      prefixInput.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) {
        popover.setAttribute("aria-owns", menu.id);
        placeMenu();
      } else popover.removeAttribute("aria-owns");
    };
    const closeList = () => {
      menu.hidden = true;
      prefixInput.setAttribute("aria-expanded", "false");
      prefixInput.removeAttribute("aria-activedescendant");
      popover.removeAttribute("aria-owns");
      active = -1;
    };
    const choose = (option: HTMLElement) => {
      prefixInput.value = option.dataset.folder!;
      closeList();
      check();
      prefixInput.focus();
    };
    prefixInput.addEventListener("focus", showMenu);
    prefixInput.addEventListener("click", showMenu);
    prefixInput.addEventListener("input", () => { check(); showMenu(); });
    prefixInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (menu.hidden) showMenu();
        const count = options().length;
        if (count) setActive(active < 0 ? (event.key === "ArrowDown" ? 0 : count - 1) : (active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      } else if (event.key === "Enter" && !menu.hidden && active >= 0) {
        event.preventDefault();
        choose(options()[active]);
      } else if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeList();
      } else if (event.key === "Tab") closeList();
    });
    list.addEventListener("pointerdown", (event) => event.preventDefault());
    list.addEventListener("click", (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>("[role=option]");
      if (option) choose(option);
    });
    prefixInput.addEventListener("blur", closeList);
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
        const parsed = request();
        if (!parsed.ok) return;
        error = await handlers.addPage(grid, parsed.value);
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
    menuPlacer?.();
    pane.dispatchEvent(new Event("card-controls-layout"));
  }

  function close(restoreFocus: boolean) {
    if (!open) return;
    open = undefined;
    menuPlacer = undefined;
    folderMenu?.remove();
    folderMenu = undefined;
    popover.removeAttribute("aria-owns");
    trackGrid();
    popover.hidden = true;
    popover.replaceChildren();
    add.setAttribute("aria-expanded", "false");
    ghost.classList.remove("is-open");
    layout();
    if (restoreFocus && !ghost.hidden) add.focus();
  }

  // A short pane scrolls the popover: the list follows its folder.
  popover.addEventListener("scroll", () => menuPlacer?.(), { passive: true });
  popover.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    // A press elsewhere while the gallery is still loading: it does not open (once open, it closes itself).
    if (gallery && !gallery.view && !looks.contains(target)) closeGallery(false);
    if (!open || popover.contains(target) || add.contains(target) || folderMenu?.contains(target)) return;
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
      const looking = gallery ? [next.hover, next.selected].find((grid) => grid && gridKey(grid) === gridKey(gallery!.grid)) : undefined;
      if (gallery && looking) {
        gallery.grid = looking;
        gallery.live = true;
      }
      if (sameReport(reports.hover, next.hover) && sameReport(reports.selected, next.selected)) return;
      if (hoverLeft) lastHover = reports.hover ?? undefined;
      reports = next;
      if (open?.live && !latest) close(false);
      if (gallery?.live && !looking) closeGallery(false);
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
    /**
     * The page's text, styles or images changed: the looks gallery's pictures
     * follow; a filled card that is not as it was filled (undone, edited) drops its strip.
     */
    sourcesChanged() {
      gallery?.view?.refresh();
      if (linker?.filled && !linker.filling && handlers.cardText(linker.card) !== linker.filled.filled) closeLinker();
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
      if (!about.collection) { addCard(grid); return; }
      reports = { ...reports, hover: null };
      layout();
      openPopover(grid, about);
      layout();
    },
    clear() {
      close(false);
      closeGallery(false);
      closeLinker();
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
      closeLinker();
      gallery?.view?.destroy();
      gallery = undefined;
      layer.remove();
      popover.remove();
      folderMenu?.remove();
      pane.dispatchEvent(new Event("card-controls-layout"));
    },
  };
}

export type CardGridControls = ReturnType<typeof createCardGridControls>;
