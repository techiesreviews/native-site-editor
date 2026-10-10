import { node } from "../ui/dom";
import { createPageOffer, pageChoiceGroups, type CreatePageOffer, type PageChoice } from "../page-builder/page-choices";
import type { CardLinkPages, FrameBox } from "./card-grid-controls";
import "./card-link-picker.css";

// "Link to a page…" at the foot of a card just added (wayfinder
// components-and-builder ticket 09 §1–3): a combobox over the site's pages,
// those under the folder the grid's cards link into first, then "Other
// pages" (src/page-builder/page-choices.ts); typed text that names no page
// offers "+ Create page /work/…/". Pages a card of the grid links to
// already are greyed, "In this grid", and can't be picked. Esc leaves the
// card blank. Loaded on the first Add card that places a fresh card
// (src/components/card-grid-controls.ts places and closes it).

export interface CardLinkPickerOptions {
  pages: CardLinkPages;
  onPick(page: PageChoice): void;
  onCreate(offer: CreatePageOffer): void;
  /** Esc: the card stays as it is. */
  onEscape(): void;
  /** A card component's look chip, at its foot; it takes the focus first with `focusLook` (after a swap). */
  look?: HTMLElement;
  focusLook?: boolean;
  /** What the card's look does not show, kept aside. */
  note?: string;
}

let pickers = 0;

export function createCardLinkPicker(pane: HTMLElement, options: CardLinkPickerOptions) {
  const id = `card-link-${++pickers}`;
  const box = node("div", "card-link");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Link the new card to a page");
  const input = node("input", "card-link__input");
  input.type = "text";
  input.placeholder = "Link to a page…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Link to a page");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", `${id}-list`);
  const list = node("div", "card-link__list");
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Pages");
  const hint = node("p", "card-link__hint", "Esc leaves the card blank");
  const foot = node("div", "card-link__foot");
  foot.append(hint, ...(options.look ? [options.look] : []));
  box.append(input, list, ...(options.note ? [node("p", "card-look-note", options.note)] : []), foot);
  box.hidden = true;
  pane.append(box);

  let entries: { option: HTMLElement; disabled: boolean; pick(): void }[] = [];
  let active = -1;
  const setActive = (index: number) => {
    active = index;
    entries.forEach(({ option }, at) => option.setAttribute("aria-selected", String(at === active)));
    const hit = entries[active];
    if (hit) input.setAttribute("aria-activedescendant", hit.option.id);
    else input.removeAttribute("aria-activedescendant");
    reveal();
  };
  // The active page in view within the list (only the list scrolls, never the pane).
  const reveal = () => {
    const option = entries[active]?.option;
    if (!option || list.hidden) return;
    const top = option.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + option.offsetHeight - list.clientHeight;
  };
  const pick = (page: PageChoice) => {
    if (!page.inGrid) options.onPick(page);
  };

  function render() {
    list.replaceChildren();
    entries = [];
    const groups = pageChoiceGroups({ ...options.pages, query: input.value });
    for (const [at, group] of groups.entries()) {
      const section = node("div", "card-link__group");
      section.setAttribute("role", "group");
      const label = node("div", "card-link__group-label", group.label);
      label.id = `${id}-group-${at}`;
      section.setAttribute("aria-labelledby", label.id);
      section.append(label);
      for (const page of group.pages) {
        const option = node("div", "card-link__option");
        option.id = `${id}-option-${entries.length}`;
        option.setAttribute("role", "option");
        const main = node("span", "card-link__main");
        main.append(node("span", "card-link__title", page.title), node("code", "card-link__route", page.route));
        option.append(main);
        if (page.inGrid) {
          option.setAttribute("aria-disabled", "true");
          option.append(node("span", "card-link__present", "In this grid"));
        }
        const entry = { option, disabled: page.inGrid, pick: () => pick(page) };
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("pointerenter", () => { if (!page.inGrid) setActive(entries.indexOf(entry)); });
        option.addEventListener("click", () => pick(page));
        section.append(option);
        entries.push(entry);
      }
      list.append(section);
    }
    const offer = createPageOffer({ ...options.pages, query: input.value });
    if (offer) {
      const section = node("div", "card-link__group");
      section.setAttribute("role", "group");
      section.setAttribute("aria-label", "New page");
      section.append(node("div", "card-link__group-label", "New page"));
      const option = node("div", "card-link__option");
      option.id = `${id}-option-${entries.length}`;
      option.setAttribute("role", "option");
      const main = node("span", "card-link__main");
      main.append(node("span", "card-link__title", `+ Create page ${offer.route}`),
        node("span", "card-link__sub", offer.error ?? `“${offer.title}”, from a sibling page's structure`));
      option.append(main);
      if (offer.error) option.setAttribute("aria-disabled", "true");
      const entry = { option, disabled: Boolean(offer.error), pick: () => { if (!offer.error) options.onCreate(offer); } };
      option.addEventListener("pointerdown", event => event.preventDefault());
      option.addEventListener("pointerenter", () => { if (!entry.disabled) setActive(entries.indexOf(entry)); });
      option.addEventListener("click", entry.pick);
      entries.push(entry);
      section.append(option);
      list.append(section);
    }
    if (!groups.length && !offer) list.append(node("p", "card-link__empty", "No page matches."));
    setActive(entries.findIndex(entry => !entry.disabled));
  }

  // Up and down skip the pages that can't be picked.
  const step = (by: 1 | -1) => {
    const count = entries.length;
    for (let n = 1; n <= count; n++) {
      const at = ((active < 0 ? (by > 0 ? -1 : 0) : active) + by * n + count) % count;
      if (!entries[at].disabled) { setActive(at); return; }
    }
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = entries[active];
      if (hit && !hit.disabled) hit.pick();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onEscape();
    }
  });
  // The list shows while the combobox has focus; elsewhere it folds to its field.
  const showList = (shown: boolean) => {
    list.hidden = !shown;
    input.setAttribute("aria-expanded", String(shown));
    reveal();
  };
  box.addEventListener("focusin", () => showList(true));
  box.addEventListener("focusout", (event) => { if (!box.contains(event.relatedTarget as Node | null)) showList(false); });
  render();
  showList(false);

  let focused = false;
  // Where it was last placed: a search or focus that changes its height places it again.
  let last: [FrameBox | undefined, FrameBox] | undefined;
  const again = () => { if (last && !box.hidden) place(...last); };
  input.addEventListener("input", again);
  box.addEventListener("focusin", again);
  box.addEventListener("focusout", again);
  return {
    place,
    destroy() {
      box.remove();
    },
  };

  /**
   * Hangs the combobox from the foot of `card` (pane pixels), over it when
   * there is no room below in `view` (the frame's box in the pane); hidden
   * while the card is out of view or unknown. The first time it shows it
   * takes focus; then, with `scroll`, when it does not fit below, it stays
   * hidden and returns how far the page should scroll up to make room
   * (keeping the card's top and the edit bar over it in view).
   */
  function place(card: FrameBox | undefined, view: FrameBox, scroll = false): number {
    last = [card, view];
    const bottom = view.top + view.height;
    box.hidden = !card || card.top + card.height < view.top + 20 || card.top > bottom - 20;
    if (!card || box.hidden) return 0;
    // Measured as it first shows: with its list open, as it is while focused.
    if (!focused) showList(true);
    const width = Math.min(Math.max(320, card.width), view.width - 16);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(view.left + 8, Math.min(card.left + (card.width - width) / 2, view.left + view.width - width - 8))}px`;
    const below = card.top + card.height - 6;
    list.style.maxHeight = "280px";
    const short = below + box.offsetHeight - (bottom - 8);
    const room = Math.min(short, card.top - view.top - 72);
    if (scroll && short > 0 && room > 0) {
      box.hidden = true;
      return room;
    }
    list.style.maxHeight = `${Math.max(120, Math.min(280, bottom - below - 96))}px`;
    reveal();
    const height = box.offsetHeight;
    const above = card.top - height + 6;
    box.style.top = `${below + height <= bottom - 8 || above < view.top + 8 ? Math.min(below, bottom - height - 8) : above}px`;
    if (!focused) {
      focused = true;
      (options.focusLook && options.look ? options.look : input).focus({ preventScroll: true });
    }
    return 0;
  }
}

export type CardLinkPicker = ReturnType<typeof createCardLinkPicker>;
