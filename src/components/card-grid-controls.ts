import { node, button } from "../ui/dom";
import { icon } from "../icons";
import { aOr } from "../page-builder/card-grid";
import { ghostInView, STRIP } from "./card-ghost-view";
import type { SitePage } from "../page-builder/page-choices";
import type { CardLinkPicker } from "./card-link-picker";
import type { CardLook } from "../page-builder/card-looks";
import type { ThumbnailInputs } from "../page-builder/thumbnail-doc";
import type { CardLookGallery } from "./card-look-gallery";
import type { VariantFiles } from "../../shared/variant-lookup";
import type { CardContent } from "../page-builder/card-swap";
import { HOST_SOURCE, type HostMessage } from "./preview-protocol";
import "./card-grid-controls.css";

// Add card places and selects a card immediately. Component cards and collection
// items then open Link to a page, including Create page; filling closes the
// picker. Card slots also offer the looks gallery.
// On a card component's combobox, a "Card: card-project ▾" chip
// opens the same looks and swaps the card's look in place; what the new look
// shows none of is kept aside on the linker while it is open (spec decision
// 12: never in the HTML), listed, and comes back on a swap to a look with a
// place for it.

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
  /** The host tracking request applied before this report was measured. */
  tracking?: number;
}

/** What the editor says a reported grid is; none when its source does not bear it out. */
export interface GridDescription {
  /** "card", "item", "link". */
  noun: string;
  /** The heading over it ("Recent work"). */
  label: string;
  /** The URL its items' pages are under (`/work/`), when it is a list of pages. */
  collection?: string;
  /** A card slot's own card component, whose ▾ offers the looks. */
  card?: string;
}

/** A new page for a grid: its title, the folder it goes in, and a new folder to make there first. */
export interface CardPageRequest {
  title: string;
  parent: string;
  newFolder?: string;
  /** An address typed verbatim, rather than a slug made from the title. */
  slug?: string;
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
  routes: Record<string, string>;
  folders: string[];
  folder?: string;
  exists(path: string): boolean;
}

/** A successful fill's page, used by the editor's announcements. */
export interface CardFilled {
  title: string;
  route: string;
}

/** A card swapped to another look: what to keep aside, what the look does not show, the card now. */
export interface CardSwapped {
  kept: CardContent;
  notShown: string[];
  text: string;
}

export interface CardGridHandlers {
  describe(grid: ItemGridReport): GridDescription | undefined;
  /** Places a card immediately; resolves to it when it can be filled from a page. A card slot accepts `look`. */
  addCard(grid: ItemGridReport, look?: CardLook): Promise<NewCard | undefined>;
  linkPages(card: NewCard): CardLinkPages | undefined;
  /** Fills the card from the page at `route` (one undo step); undefined when it could not. */
  fillCard(card: NewCard, route: string): CardFilled | undefined | Promise<CardFilled | undefined>;
  /** Swaps the card to `look` in place (one undo step), its content carried, `kept` from earlier looks; the attributes the looks set (`variants`) give way. */
  swapCard(card: NewCard, look: CardLook, from: { kept?: CardContent; variants: string[] }): Promise<CardSwapped | undefined>;
  /** The card's markup now; undefined once it is gone. */
  cardText(card: NewCard): string | undefined;
  /** Creates a page and fills the placed card as one undo step. */
  createPage(card: NewCard, request: CardPageRequest): CardFilled | undefined | Promise<CardFilled | undefined>;
  /** The site's files for its Variant lookup (shared/variant-lookup.ts): the card's Variants as the edit bar has them. */
  variantFiles: VariantFiles;
}

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

  pane.append(layer);

  let reports: ItemGridsReport = { hover: null, selected: null };
  // The grid on show and what the editor says it is.
  let shown: { grid: ItemGridReport; about: GridDescription } | undefined;
  let trackingRequest = 0;
  let pointerOnAdd = false;
  let leaveTimer = 0;
  let hoverGone = false;
  let lastHover: ItemGridReport | undefined;
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
    const about = grid ? handlers.describe(grid) : undefined;
    if (!grid || !about) {
      shown = undefined;
      ghost.hidden = true;
      return;
    }
    shown = { grid, about };
    // Down a column (a list), the button starts the line, as a list's next item would, and keeps clear of the section plus.
    const column = !grid.row;
    const reported = { ...grid.ghost, height: column ? Math.max(grid.ghost.height, STRIP) : grid.ghost.height };
    const view = ghostInView(reported, frameRect.height, grid.item, grid.beside);
    const box = view?.box ?? reported;
    const clipped = view?.clipped ?? false;
    // Below a row of cards with no room for one before the page's next
    // content, the runtime reports a strip ending at that content, and a
    // ghost cut at the frame's bottom edge can be one: drawn as a line with
    // its button, not a card-sized box.
    const strip = (grid.row || clipped) && !grid.beside && box.height <= STRIP;
    ghost.classList.toggle("is-strip", strip);
    ghost.hidden = !view;
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
    add.setAttribute("aria-label", `Add ${aOr(name)}${where}`);
    add.title = `Add ${aOr(name)}${where}`;
    if (about.card || about.collection) add.setAttribute("aria-haspopup", "listbox");
    else add.removeAttribute("aria-haspopup");
    ghost.classList.toggle("is-compact", box.width < 120 || (!column && !strip && box.height < 40));
    // Below the last item, the button sits near the top, a short way from the items.
    ghost.classList.toggle("is-below", !grid.beside && !strip && box.height > 96);
    gallery?.view?.place();
  }
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (pointerOnAdd || gallery) return;
      hoverGone = false;
      layout();
    }, 300);
  }

  function activate(grid = shown?.grid) {
    if (!grid) return;
    closeGallery(false);
    addCard(grid);
  }

  // "Link to a page…" stays on the selected new card until it is filled.
  // A card slot's card has a look chip and content earlier looks kept aside.
  interface Linker {
    card: NewCard;
    picker?: CardLinkPicker;
    filling?: boolean;
    seen: boolean;
    scrolled?: boolean;
    /** The slot's own card component and the card's look, for its chip. */
    usual?: string;
    look?: CardLook;
    chip?: HTMLButtonElement;
    kept?: CardContent;
    notShown?: string[];
    /** The card as the last swap wrote it: another text means it was undone or edited. */
    swapped?: string;
  }
  let linker: Linker | undefined;

  function addCard(grid: ItemGridReport, look?: CardLook) {
    closeLinker();
    const usual = lookSupport && grid.slot !== undefined ? handlers.describe(grid)?.card : undefined;
    void handlers.addCard(grid, look).then((card) => {
      if (!card || !handlers.linkPages(card)) return;
      closeLinker();
      const entry: Linker = { card, seen: false, ...(usual ? { usual, look: look ?? { tag: usual, label: usual } } : {}) };
      linker = entry;
      openPicker(entry);
    });
  }

  /** "Card: card-project ▾" for a card slot's card. */
  function lookChip(entry: Linker) {
    if (!entry.look) return undefined;
    const chip = button("", () => toggleLooks(entry), "card-look-chip");
    chip.setAttribute("aria-haspopup", "dialog");
    chip.setAttribute("aria-expanded", "false");
    chip.title = "Change the card's look";
    chip.append(node("span", "card-look-chip__what", "Card:"), " ", node("span", "card-look-chip__name", entry.look.label), icon("caret-down", 12));
    entry.chip = chip;
    return chip;
  }

  const notShownNote = (entry: Linker) => entry.notShown?.length && entry.look
    ? `Not shown by ${entry.look.label}: ${entry.notShown.join(", ")}. Kept aside while the combobox is open: it comes back with a look that has a place for it.`
    : undefined;

  // The looks from a card's chip, for the linker it was opened on.
  interface LooksMenu { entry: Linker; view?: CardLookGallery }
  let looksMenu: LooksMenu | undefined;

  function toggleLooks(entry: Linker) {
    if (looksMenu) { closeLooks(true); return; }
    const chip = entry.chip;
    const card = handlers.cardText(entry.card);
    if (!chip || !entry.look || !entry.usual || card === undefined || !lookSupport) return;
    closeGallery(false);
    const menu: LooksMenu = { entry };
    looksMenu = menu;
    chip.setAttribute("aria-expanded", "true");
    const width = reports.selected?.item?.width;
    import("./card-look-gallery").then(({ createCardLookGallery }) => {
      if (looksMenu !== menu || linker !== entry) return;
      menu.view = createCardLookGallery(pane, chip, {
        inputs: () => lookSupport.inputs(),
        prepare: (tags) => lookSupport.prepare(tags),
        variantFiles: handlers.variantFiles,
        card: entry.usual!,
        noun: "card",
        cardWidth: Math.max(220, Math.min(420, width ?? 320)),
        swap: { card, look: entry.look!, kept: entry.kept },
        onPick: (look, variants) => {
          closeLooks(false);
          void swap(entry, look, variants);
        },
        onClose: (focus) => closeLooks(focus),
      });
      // Focus moved into it: the combobox folds its list, and the chip with it.
      menu.view.place();
    }).catch(() => { if (looksMenu === menu) closeLooks(false); });
  }

  function closeLooks(restoreFocus: boolean) {
    if (!looksMenu) return;
    const { entry } = looksMenu;
    looksMenu.view?.destroy();
    looksMenu = undefined;
    entry.chip?.setAttribute("aria-expanded", "false");
    if (restoreFocus && entry.chip?.isConnected) entry.chip.focus();
  }

  const lookKey = (look: CardLook) => `${look.tag}|${look.attribute?.name ?? ""}|${String(look.attribute?.value ?? "")}`;

  async function swap(entry: Linker, look: CardLook, variants: string[]) {
    if (entry.look && lookKey(entry.look) === lookKey(look)) { entry.chip?.focus(); return; }
    // Its own edit does not close the combobox (sourcesChanged).
    entry.filling = true;
    let done: CardSwapped | undefined;
    try {
      done = await handlers.swapCard(entry.card, look, { kept: entry.kept, variants });
    } finally {
      entry.filling = false;
    }
    if (!done || linker !== entry) return;
    Object.assign(entry, { look, kept: done.kept, notShown: done.notShown, swapped: done.text, seen: false });
    openPicker(entry, true);
  }

  function openPicker(entry: Linker, focusLook = false) {
    const pages = handlers.linkPages(entry.card);
    if (!pages) { closeLinker(); return; }
    import("./card-link-picker").then(({ createCardLinkPicker }) => {
      if (linker !== entry) return;
      entry.picker?.destroy();
      entry.picker = createCardLinkPicker(pane, {
        pages,
        look: lookChip(entry),
        note: notShownNote(entry),
        focusLook,
        onPick: (page) => void fill(entry, () => handlers.fillCard(entry.card, page.route)),
        onCreate: (offer) => void fill(entry, () => handlers.createPage(entry.card, offer.request)),
        onEscape: closeAndFocus,
      });
      placeLinker();
    }).catch(() => { if (linker === entry) linker = undefined; });
  }

  async function fill(entry: Linker, run: () => CardFilled | undefined | Promise<CardFilled | undefined>) {
    // Its own edit does not close the combobox (sourcesChanged).
    if (entry.filling) return;
    entry.filling = true;
    let filled: CardFilled | undefined;
    try {
      filled = await run();
    } finally {
      entry.filling = false;
    }
    if (linker !== entry) return;
    if (filled) closeAndFocus();
    // A change to the card while a fill that did not land was loading is seen now.
    else dropStale();
  }

  /** Close an open combobox when its swapped card was undone or edited. */
  function dropStale() {
    const written = linker?.swapped;
    if (linker && written !== undefined && !linker.filling && handlers.cardText(linker.card) !== written) closeLinker();
  }

  function closeAndFocus() {
    closeLinker();
    if (!ghost.hidden) add.focus();
    else frame.focus();
  }

  // Hung from the card while the selection is the card (the runtime reports
  // its box); gone once the selection has been it and moved on (another
  // element, or Undo took the card away).
  pane.addEventListener("edit-bar-layout", placeLinker);

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
    const element = pane.querySelector<HTMLElement>(".edit-bar:not([hidden])");
    const rect = element?.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const bar = rect && { left: rect.left - paneRect.left, top: rect.top - paneRect.top, width: rect.width, height: rect.height };
    const dy = linker.picker?.place(mine && { ...mine, left: left + mine.left, top: top + mine.top }, view, bar, !linker.scrolled) ?? 0;
    looksMenu?.view?.place();
    // Once, when it does not fit below the card: the page scrolls up to make room (its report places it again).
    if (dy > 0 && frame instanceof HTMLIFrameElement) {
      const entry = linker;
      entry.scrolled = true;
      frame.contentWindow?.postMessage({ source: HOST_SOURCE, type: "scroll-by", dy } satisfies HostMessage, "*");
      // A page that could not scroll sends no new report: it shows where it fits then.
      window.setTimeout(() => { if (linker === entry) placeLinker(); }, 250);
    }
  }

  function closeLinker() {
    closeLooks(false);
    linker?.picker?.destroy();
    linker = undefined;
  }

  // "Add card as…" for the card slot it was opened on.
  interface GalleryEntry { grid: ItemGridReport; tracking: number; view?: CardLookGallery }
  let gallery: GalleryEntry | undefined;

  function toggleGallery() {
    const grid = shown?.grid;
    const card = shown?.about.card;
    if (gallery) { closeGallery(true); return; }
    if (!grid || !card || !lookSupport) return;
    closeLooks(false);
    closeLinker();
    const entry: GalleryEntry = { grid, tracking: trackGrid(grid) };
    gallery = entry;
    looks.setAttribute("aria-expanded", "true");
    ghost.classList.add("is-looking");
    // A card's width in the grid, so each look shows as it would there.
    const width = grid.item?.width ?? (grid.beside ? grid.ghost.width : 320);
    import("./card-look-gallery").then(({ createCardLookGallery }) => {
      if (gallery !== entry) return;
      entry.view = createCardLookGallery(pane, looks, {
        inputs: () => lookSupport.inputs(),
        prepare: (tags) => lookSupport.prepare(tags),
        variantFiles: handlers.variantFiles,
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
    const tracking = ++trackingRequest;
    if (frame instanceof HTMLIFrameElement)
      frame.contentWindow?.postMessage({ source: HOST_SOURCE, type: "item-grid-track", grid, tracking } satisfies HostMessage, "*");
    return tracking;
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    // A press elsewhere while the gallery is still loading: it does not open (once open, it closes itself).
    if (gallery && !gallery.view && !looks.contains(target)) closeGallery(false);
    if (looksMenu && !looksMenu.view && !looksMenu.entry.chip?.contains(target)) closeLooks(false);
  }
  document.addEventListener("pointerdown", onPointerDown, true);

  return {
    /** The runtime reported the grids under the pointer and around the selection. */
    update(next: ItemGridsReport) {
      const hoverLeft = Boolean(reports.hover) && !next.hover;
      const looking = gallery ? [next.hover, next.selected].find((grid) => grid && gridKey(grid) === gridKey(gallery!.grid)) : undefined;
      if (gallery && looking) gallery.grid = looking;
      const unchanged = sameReport(reports.hover, next.hover) && sameReport(reports.selected, next.selected);
      if (hoverLeft) lastHover = reports.hover ?? undefined;
      reports = next;
      // A queued pointer-leave report predates tracking this opening. Only
      // its own tracking response can say the gallery's grid has disappeared.
      if (gallery && next.tracking === gallery.tracking && !looking) closeGallery(false);
      if (unchanged) return;
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
     * follow; an open combobox closes if its swapped card was undone or edited.
     */
    sourcesChanged() {
      gallery?.view?.refresh();
      looksMenu?.view?.refresh();
      dropStale();
    },
    /** A file the Variant lookup asked for was read late: the looks follow. */
    refreshLooks() {
      gallery?.view?.refresh();
      looksMenu?.view?.refresh();
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
      addCard(grid);
    },
    clear() {
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
      pane.removeEventListener("edit-bar-layout", placeLinker);
      resize.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      closeLinker();
      gallery?.view?.destroy();
      gallery = undefined;
      layer.remove();
      pane.dispatchEvent(new Event("card-controls-layout"));
    },
  };
}

export type CardGridControls = ReturnType<typeof createCardGridControls>;
