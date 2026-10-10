import { node, button } from "../ui/dom";
import { cardLooks, type CardLook } from "../page-builder/card-looks";
import { freshCardMarkup } from "../page-builder/card-slot";
import { cardSwap, type CardContent } from "../page-builder/card-swap";
import { createThumbnail, type Thumbnail } from "../page-builder/thumbnail";
import { thumbnailDocument, type ThumbnailInputs } from "../page-builder/thumbnail-doc";
import { expandStyleImports } from "../../shared/css-imports";
import { nativeComponentCssPath, nativeDefaultRoute, nativePageStylesheets } from "../../shared/native-project";
import { startTags } from "../../shared/html-source";
import { scriptsSetAttributes } from "../../shared/variants";
import "./card-look-gallery.css";

// "Add card as…" from the ▾ of a card slot's Add card (wayfinder
// components-and-builder ticket 09 §7 and §9): every card look
// (src/page-builder/card-looks.ts) as a blank card rendered with the site's
// CSS in a live thumbnail (src/page-builder/thumbnail.ts); picking one
// places a blank card of it, and "Link to a page…" follows as for the plus.
// From a card's look chip (§8) the same looks show that card's own content
// (src/page-builder/card-swap.ts), its look marked, and picking one swaps it.
// Loaded on the first ▾ or chip (src/components/card-grid-controls.ts opens it).

export interface CardLookGalleryOptions {
  /** What the preview renders: the site, its sources, styles and images, the route on show. */
  inputs(): ThumbnailInputs | undefined;
  /** Asks for the stylesheets of components not read yet; `refresh` follows when they are. */
  prepare(tags: string[]): void;
  /** The slot's own card component: "usual", and its variants follow the components. */
  card: string;
  /** "card". */
  noun: string;
  /** The site's scripts: the attributes they set are no looks (as the edit bar leaves them out). */
  scripts(): { path: string; source: string }[];
  /** A card's look chip: the card's markup now, its look, and what was kept aside from earlier looks. */
  swap?: { card: string; look: CardLook; kept?: CardContent };
  /** A card's width in the grid, in canvas pixels. */
  cardWidth: number;
  /** With the attributes the looks set, which give way to the one picked. */
  onPick(look: CardLook, variants: string[]): void;
  /** Esc (`focus`: back to ▾) or a press outside it. */
  onClose(focus: boolean): void;
}

// A thumbnail's height over its width.
const ASPECT = 0.6;
// Room around the card in a thumbnail, in canvas pixels (the page's own padding is inside it).
const MARGIN = 48;

/** The site's stylesheets the page on show links, imports expanded. */
function pageSheets(inputs: ThumbnailInputs) {
  const { site, sources } = inputs;
  const file = site.routes[inputs.route] ?? site.routes[nativeDefaultRoute(site)];
  const linked = file ? nativePageStylesheets(sources[file] ?? "", file).filter((path) => sources[path] !== undefined) : [];
  return expandStyleImports(linked, (path) => sources[path]).sheets;
}

/** The looks for `card`'s slot, as the site reads now. */
function looksOf(inputs: ThumbnailInputs, card: string, scriptAttributes: Iterable<string>) {
  const { site, sources } = inputs;
  const templateOf = (tag: string) => Object.hasOwn(site.components, tag) ? sources[site.components[tag]] : undefined;
  const css = Object.hasOwn(site.components, card) ? sources[inputs.componentStyles[card] ?? nativeComponentCssPath(site.components[card])] : undefined;
  return { templateOf, looks: cardLooks({ tags: Object.keys(site.components), templateOf, current: card, css, sheets: pageSheets(inputs), scriptAttributes }) };
}

/** The card components and every component their templates use, nested, for their stylesheets. */
function cardTagsAndParts(inputs: ThumbnailInputs) {
  const { site, sources } = inputs;
  const seen = new Set<string>();
  const visit = (tag: string) => {
    if (seen.has(tag) || !Object.hasOwn(site.components, tag)) return;
    seen.add(tag);
    for (const part of startTags(sources[site.components[tag]] ?? "")) visit(part.name);
  };
  Object.keys(site.components).filter((tag) => tag.startsWith("card-")).forEach(visit);
  return [...seen];
}

const lookKey = (look: CardLook) => `${look.tag}|${look.attribute?.name ?? ""}|${String(look.attribute?.value ?? "")}`;

export function createCardLookGallery(pane: HTMLElement, anchor: HTMLElement, options: CardLookGalleryOptions) {
  const box = node("div", "card-looks");
  box.setAttribute("role", "dialog");
  const { swap } = options;
  const title = node("p", "card-looks__title", swap ? `${options.noun[0].toUpperCase()}${options.noun.slice(1)} look` : `Add ${options.noun} as…`);
  title.id = "card-looks-title";
  box.setAttribute("aria-labelledby", title.id);
  const sub = node("p", "card-looks__sub", swap
    ? `Card components and their variants, with this ${options.noun}'s content. It keeps its title, text, image and link; what a look has no place for is kept aside while the page is open.`
    : "Card components and their variants, with the site's styles. A blank card of the look goes after the last one; link it to a page next.");
  const grid = node("div", "card-looks__grid");
  box.append(title, sub, grid);
  pane.append(box);

  let tiles: { key: string; tile: HTMLButtonElement; thumb: Thumbnail; look: CardLook }[] = [];
  const canvas = Math.round(options.cardWidth + MARGIN);

  function render() {
    const inputs = options.inputs();
    if (!inputs) return;
    const { templateOf, looks } = looksOf(inputs, options.card, scriptsSetAttributes(options.scripts()));
    const keys = looks.map(lookKey);
    const variants = [...new Set(looks.flatMap((look) => look.attribute ? [look.attribute.name] : []))];
    // The same looks: only their pictures follow the sources.
    if (keys.join("\n") !== tiles.map((entry) => entry.key).join("\n")) {
      // The tile with focus keeps it when the looks change (a stylesheet read late adds variants).
      const focused = tiles.find((entry) => entry.tile === document.activeElement)?.key;
      for (const entry of tiles) entry.thumb.destroy();
      tiles = looks.map((look, at) => {
        const tile = button("", () => options.onPick(look, variants), "card-looks__tile");
        const current = swap && lookKey(look) === lookKey(swap.look);
        if (swap) tile.setAttribute("aria-pressed", String(Boolean(current)));
        const thumb = createThumbnail("card-looks__thumb", ASPECT, 200);
        const label = node("span", "card-looks__label");
        label.append(node("span", "card-looks__name", look.label));
        if (look.tag === options.card && !look.attribute) label.append(node("span", "card-looks__badge", "usual"));
        if (current) label.append(node("span", "card-looks__badge is-current", "current"));
        tile.append(thumb.root, label);
        tile.setAttribute("aria-label", `${look.label}${look.tag === options.card && !look.attribute ? ", the usual card" : ""}`);
        return { key: keys[at], tile, thumb, look };
      });
      grid.replaceChildren(...tiles.map((entry) => entry.tile));
      if (!tiles.length) grid.append(node("p", "card-looks__empty", "No card components on this site."));
      if (focused !== undefined) (tiles.find((entry) => entry.key === focused) ?? tiles[0])?.tile.focus({ preventScroll: true });
      if (placed) place();
    }
    const own = swap && templateOf(swap.look.tag);
    for (const { thumb, look } of tiles) {
      const lookTemplate = own === undefined ? undefined : templateOf(look.tag);
      // The card in each look, as a swap to it would write it.
      const markup = swap && own !== undefined && lookTemplate !== undefined
        ? cardSwap({ card: swap.card, template: own, look, lookTemplate, kept: swap.kept, variants }).markup
        : freshCardMarkup(look.tag, templateOf, look.attribute) ?? "";
      thumb.render(thumbnailDocument(inputs, `<div style="width:${Math.round(options.cardWidth)}px;margin-inline:auto">${markup}</div>`), canvas);
    }
  }

  let placed = false;
  const inputs = options.inputs();
  if (inputs) options.prepare(cardTagsAndParts(inputs));
  render();

  // Arrows move between tiles, row by row; Esc closes.
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onClose(true);
      return;
    }
    const at = tiles.findIndex((entry) => entry.tile === document.activeElement);
    if (at < 0) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
    const by = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, at + by))].tile.focus();
  });
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!box.contains(target) && !anchor.contains(target)) options.onClose(false);
  };
  document.addEventListener("pointerdown", onPointerDown, true);

  /** Below ▾ when it fits in the pane, else above it, within the pane's sides. */
  function place() {
    const paneRect = pane.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const width = Math.min(560, paneRect.width - 24);
    box.style.width = `${width}px`;
    box.style.maxHeight = `${Math.max(160, paneRect.height - 24)}px`;
    const height = box.offsetHeight;
    const below = a.bottom - paneRect.top + 8;
    const above = a.top - paneRect.top - 8 - height;
    const top = below + height <= paneRect.height - 12 || above < 12 ? Math.max(12, Math.min(below, paneRect.height - 12 - height)) : above;
    box.style.top = `${top}px`;
    box.style.left = `${Math.max(12, Math.min(a.right - paneRect.left - width, paneRect.width - 12 - width))}px`;
    placed = true;
  }
  place();
  (tiles.find((entry) => entry.tile.getAttribute("aria-pressed") === "true") ?? tiles[0])?.tile.focus({ preventScroll: true });

  return {
    place,
    /** The preview's sources or styles changed: looks and pictures follow. */
    refresh: render,
    destroy() {
      document.removeEventListener("pointerdown", onPointerDown, true);
      for (const entry of tiles) entry.thumb.destroy();
      box.remove();
    },
  };
}

export type CardLookGallery = ReturnType<typeof createCardLookGallery>;
