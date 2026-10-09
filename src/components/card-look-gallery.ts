import { node, button } from "../ui/dom";
import { cardLooks, type CardLook } from "../page-builder/card-looks";
import { freshCardMarkup } from "../page-builder/card-slot";
import { createThumbnail, type Thumbnail } from "../page-builder/thumbnail";
import { thumbnailDocument, type ThumbnailInputs } from "../page-builder/thumbnail-doc";
import { expandStyleImports } from "../../shared/css-imports";
import { nativeComponentCssPath, nativeDefaultRoute, nativePageStylesheets } from "../../shared/native-project";
import "./card-look-gallery.css";

// "Add card as…" from the ▾ of a card slot's Add card (wayfinder
// components-and-builder ticket 09 §7 and §9): every card look
// (src/page-builder/card-looks.ts) as a blank card rendered with the site's
// CSS in a live thumbnail (src/page-builder/thumbnail.ts); picking one
// places a blank card of it, and "Link to a page…" follows as for the plus.
// Loaded on the first ▾ (src/components/card-grid-controls.ts opens it).

export interface CardLookGalleryOptions {
  /** What the preview renders: the site, its sources, styles and images, the route on show. */
  inputs(): ThumbnailInputs | undefined;
  /** Asks for the stylesheets of components not read yet; `refresh` follows when they are. */
  prepare(tags: string[]): void;
  /** The slot's own card component: "usual", and its variants follow the components. */
  card: string;
  /** "card". */
  noun: string;
  /** A card's width in the grid, in canvas pixels. */
  cardWidth: number;
  onPick(look: CardLook): void;
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
function looksOf(inputs: ThumbnailInputs, card: string) {
  const { site, sources } = inputs;
  const templateOf = (tag: string) => Object.hasOwn(site.components, tag) ? sources[site.components[tag]] : undefined;
  const css = Object.hasOwn(site.components, card) ? sources[inputs.componentStyles[card] ?? nativeComponentCssPath(site.components[card])] : undefined;
  return { templateOf, looks: cardLooks({ tags: Object.keys(site.components), templateOf, current: card, css, sheets: pageSheets(inputs) }) };
}

const lookKey = (look: CardLook) => `${look.tag}|${look.attribute?.name ?? ""}|${String(look.attribute?.value ?? "")}`;

export function createCardLookGallery(pane: HTMLElement, anchor: HTMLElement, options: CardLookGalleryOptions) {
  const box = node("div", "card-looks");
  box.setAttribute("role", "dialog");
  const title = node("p", "card-looks__title", `Add ${options.noun} as…`);
  title.id = "card-looks-title";
  box.setAttribute("aria-labelledby", title.id);
  const sub = node("p", "card-looks__sub", "Card components and their variants, with the site's styles. A blank card of the look goes after the last one; link it to a page next.");
  const grid = node("div", "card-looks__grid");
  box.append(title, sub, grid);
  pane.append(box);

  let tiles: { key: string; tile: HTMLButtonElement; thumb: Thumbnail; look: CardLook }[] = [];
  const canvas = Math.round(options.cardWidth + MARGIN);

  function render() {
    const inputs = options.inputs();
    if (!inputs) return;
    const { templateOf, looks } = looksOf(inputs, options.card);
    const keys = looks.map(lookKey);
    // The same looks: only their pictures follow the sources.
    if (keys.join("\n") !== tiles.map((entry) => entry.key).join("\n")) {
      for (const entry of tiles) entry.thumb.destroy();
      tiles = looks.map((look, at) => {
        const tile = button("", () => options.onPick(look), "card-looks__tile");
        const thumb = createThumbnail("card-looks__thumb", ASPECT, 200);
        const label = node("span", "card-looks__label");
        label.append(node("span", "card-looks__name", look.label));
        if (look.tag === options.card && !look.attribute) label.append(node("span", "card-looks__badge", "usual"));
        tile.append(thumb.root, label);
        tile.setAttribute("aria-label", `${look.label}${look.tag === options.card && !look.attribute ? ", the usual card" : ""}`);
        return { key: keys[at], tile, thumb, look };
      });
      grid.replaceChildren(...tiles.map((entry) => entry.tile));
      if (!tiles.length) grid.append(node("p", "card-looks__empty", "No card components on this site."));
    }
    for (const { thumb, look } of tiles) {
      const markup = freshCardMarkup(look.tag, templateOf, look.attribute) ?? "";
      thumb.render(thumbnailDocument(inputs, `<div style="width:${Math.round(options.cardWidth)}px;margin-inline:auto">${markup}</div>`), canvas);
    }
  }

  const inputs = options.inputs();
  if (inputs) options.prepare(Object.keys(inputs.site.components).filter((tag) => tag.startsWith("card-")));
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
  }
  place();
  tiles[0]?.tile.focus({ preventScroll: true });

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
