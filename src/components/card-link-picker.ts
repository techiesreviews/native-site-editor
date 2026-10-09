import { node } from "../ui/dom";
import { pageChoiceGroups, type PageChoice } from "../page-builder/page-choices";
import type { CardLinkPages, FrameBox } from "./card-grid-controls";
import "./card-link-picker.css";

// "Link to a page…" at the foot of a card just added (wayfinder
// components-and-builder ticket 09 §1–2): a combobox over the site's pages,
// those under the folder the grid's cards link into first, then "Other
// pages" (src/page-builder/page-choices.ts). Pages a card of the grid links
// to already are greyed, "In this grid", and can't be picked. Esc leaves the
// card blank. Loaded on the first Add card that places a fresh card
// (src/components/card-grid-controls.ts places and closes it).

export interface CardLinkPickerOptions {
  pages: CardLinkPages;
  onPick(page: PageChoice): void;
  /** Esc: the card stays as it is. */
  onEscape(): void;
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
  box.append(input, list, hint);
  box.hidden = true;
  pane.append(box);

  let entries: { option: HTMLElement; page: PageChoice }[] = [];
  let active = -1;
  const setActive = (index: number) => {
    active = index;
    entries.forEach(({ option }, at) => option.setAttribute("aria-selected", String(at === active)));
    const hit = entries[active];
    if (hit) {
      input.setAttribute("aria-activedescendant", hit.option.id);
      hit.option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
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
        const entry = { option, page };
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("pointerenter", () => { if (!page.inGrid) setActive(entries.indexOf(entry)); });
        option.addEventListener("click", () => pick(page));
        section.append(option);
        entries.push(entry);
      }
      list.append(section);
    }
    if (!groups.length) list.append(node("p", "card-link__empty", "No page matches."));
    setActive(entries.findIndex((entry) => !entry.page.inGrid));
  }

  // Up and down skip the pages that can't be picked.
  const step = (by: 1 | -1) => {
    const count = entries.length;
    for (let n = 1; n <= count; n++) {
      const at = ((active < 0 ? (by > 0 ? -1 : 0) : active) + by * n + count) % count;
      if (!entries[at].page.inGrid) { setActive(at); return; }
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
      if (hit) pick(hit.page);
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
  };
  box.addEventListener("focusin", () => showList(true));
  box.addEventListener("focusout", (event) => { if (!box.contains(event.relatedTarget as Node | null)) showList(false); });
  render();
  showList(false);

  let focused = false;
  return {
    /**
     * Hangs the combobox from the foot of `card` (pane pixels), over it when
     * there is no room below in `view` (the frame's box in the pane); hidden
     * while the card is out of view or unknown. The first time it shows, it
     * takes focus.
     */
    place(card: FrameBox | undefined, view: FrameBox) {
      const bottom = view.top + view.height;
      box.hidden = !card || card.top + card.height < view.top + 20 || card.top > bottom - 20;
      if (!card || box.hidden) return;
      const width = Math.min(Math.max(320, card.width), view.width - 16);
      box.style.width = `${width}px`;
      box.style.left = `${Math.max(view.left + 8, Math.min(card.left + (card.width - width) / 2, view.left + view.width - width - 8))}px`;
      const below = card.top + card.height - 6;
      list.style.maxHeight = `${Math.max(120, Math.min(280, bottom - below - 96))}px`;
      const height = box.offsetHeight;
      const above = card.top - height + 6;
      box.style.top = `${below + height <= bottom - 8 || above < view.top + 8 ? Math.min(below, bottom - height - 8) : above}px`;
      if (!focused) {
        focused = true;
        input.focus({ preventScroll: true });
      }
    },
    destroy() {
      box.remove();
    },
  };
}

export type CardLinkPicker = ReturnType<typeof createCardLinkPicker>;
