import { button, node } from "../ui/dom";
import { icon } from "../icons";
import type { CardFillRow } from "../page-builder/card-fill";
import type { CardFilled, FrameBox } from "./card-grid-controls";
import { cardPopoverPlacement } from "./card-popover-placement";
import "./card-fill-strip.css";

// After "Link to a page…" fills a card (wayfinder components-and-builder
// ticket 09 §5): a strip on the card naming the page and, for each slot,
// where its content came from (h1, meta description, og:image, address, a
// matching element on the page, kept, not used). Information only: Change
// page opens the combobox again, × closes it; a card component's look chip
// sits beside Change page. Loaded with the first fill
// (src/components/card-grid-controls.ts places and closes it).

export interface CardFillStripOptions {
  filled: CardFilled;
  onChange(): void;
  onClose(): void;
  /** A card component's look chip, beside Change page; it takes the focus first with `focusLook` (after a swap). */
  look?: HTMLElement;
  focusLook?: boolean;
  /** What the card's look does not show, kept aside. */
  note?: string;
}

const STATUS: Record<CardFillRow["status"], string | undefined> = { filled: undefined, kept: "kept", "not-used": "not used", added: "added" };

function rowItem(row: CardFillRow) {
  const item = node("li", `card-fill__row is-${row.status}`);
  const value = row.role === "image" ? row.src : row.role === "link" ? row.href : row.text;
  const what = node("span", "card-fill__what");
  const status = STATUS[row.status];
  if (row.status === "filled" || row.status === "added") what.append(node("code", "card-fill__from", row.from === "matched" ? row.matched ?? "match" : row.from));
  if (status) what.append(node("span", "card-fill__badge", status));
  if (value) what.append(node("span", "card-fill__value", value));
  if (row.status === "added") what.append(node("span", "card-fill__why", "the title links to the page"));
  item.append(node("span", "card-fill__slot", row.label), what);
  return item;
}

export function createCardFillStrip(pane: HTMLElement, options: CardFillStripOptions) {
  const { filled } = options;
  const box = node("div", "card-fill");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Where the card's content came from");
  const head = node("div", "card-fill__head");
  const title = node("p", "card-fill__title");
  title.append("Filled from ", node("strong", "", filled.title), " ", node("code", "card-fill__route", filled.route));
  const close = button("", () => options.onClose(), "card-fill__close");
  close.setAttribute("aria-label", "Close");
  close.title = "Close";
  close.append(icon("x", 14));
  head.append(title, close);
  const list = node("ul", "card-fill__rows");
  list.append(...filled.rows.map(rowItem));
  const change = button("Change page", () => options.onChange(), "card-fill__change");
  const foot = node("div", "card-fill__foot");
  foot.append(change, ...(options.look ? [options.look] : []));
  box.append(head, list, ...(options.note ? [node("p", "card-look-note", options.note)] : []), foot);
  box.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    options.onClose();
  });
  box.hidden = true;
  pane.append(box);

  let focused = false;
  return {
    /** Below `card` and its edit bar (pane pixels), above both when there is no room below in `view`; hidden while the card is out of view or unknown. */
    place(card: FrameBox | undefined, view: FrameBox, bar?: FrameBox) {
      const bottom = view.top + view.height;
      box.hidden = !card || card.top + card.height < view.top + 20 || card.top > bottom - 20;
      if (!card || box.hidden) return;
      const width = Math.min(Math.max(320, card.width), view.width - 16);
      box.style.width = `${width}px`;
      box.style.left = `${Math.max(view.left + 8, Math.min(card.left + (card.width - width) / 2, view.left + view.width - width - 8))}px`;
      const height = box.offsetHeight;
      box.style.top = `${cardPopoverPlacement(card, view, height, bar).top}px`;
      // The combobox it replaces had focus: it moves here, once.
      if (!focused) {
        focused = true;
        (options.focusLook && options.look ? options.look : change).focus({ preventScroll: true });
      }
    },
    destroy() {
      box.remove();
    },
  };
}

export type CardFillStrip = ReturnType<typeof createCardFillStrip>;
