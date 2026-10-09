// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The searchable page list used by A (popover tab) and C (link combobox):
// pages under the grid's parent URL first, then all other pages; pages
// already in the grid are greyed with an "In this grid" mark.

import { el, pageGroups, type GridNow, type PageChoice } from "./cb09-core";

export interface PageListOptions {
  /** What a present page does: A picks it to jump to its card, C refuses it. */
  present: "jump" | "disabled";
  onPick(page: PageChoice): void;
  onActive?(page: PageChoice | undefined): void;
  placeholder?: string;
}

let lists = 0;

export function pageList(now: () => GridNow | undefined, options: PageListOptions) {
  const id = `cb09-list-${++lists}`;
  const input = el("input", "cb09-search");
  input.type = "search";
  input.placeholder = options.placeholder ?? "Search pages";
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  const list = el("div", "cb09-list");
  list.id = id;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Pages");
  let options_: { option: HTMLElement; page: PageChoice }[] = [];
  let active = -1;

  const pickable = (page: PageChoice) => !page.present || options.present === "jump";
  const setActive = (index: number) => {
    active = index;
    options_.forEach(({ option }, at) => option.setAttribute("aria-selected", String(at === active)));
    const hit = options_[active];
    if (hit) { input.setAttribute("aria-activedescendant", hit.option.id); hit.option.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
    options.onActive?.(hit?.page);
  };
  const render = () => {
    const grid = now();
    list.replaceChildren();
    options_ = [];
    if (!grid) return;
    const groups = pageGroups(grid, input.value);
    if (!groups.length) list.append(el("p", "cb09-list__empty", "No page matches."));
    for (const group of groups) {
      const head = el("div", "cb09-list__group", group.label);
      head.setAttribute("role", "presentation");
      list.append(head);
      for (const page of group.pages) {
        const option = el("div", `cb09-option${page.present ? " is-present" : ""}`);
        option.id = `${id}-${options_.length}`;
        option.setAttribute("role", "option");
        if (!pickable(page)) option.setAttribute("aria-disabled", "true");
        const main = el("span", "cb09-option__main");
        main.append(el("span", "cb09-option__title", page.title), el("code", "cb09-option__route", page.route));
        option.append(main);
        if (page.draft) option.append(el("span", "cb09-option__draft", "draft"));
        if (page.present) option.append(el("span", "cb09-option__present", options.present === "jump" ? "In this grid · show" : "In this grid"));
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("pointerenter", () => setActive(options_.findIndex((entry) => entry.option === option)));
        option.addEventListener("click", () => { if (pickable(page)) options.onPick(page); });
        list.append(option);
        options_.push({ option, page });
      }
    }
    // The first pickable page that isn't in the grid starts active.
    setActive(options_.findIndex(({ page }) => !page.present));
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const count = options_.length;
      if (count) setActive(active < 0 ? 0 : (active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const hit = options_[active];
      if (hit && pickable(hit.page)) options.onPick(hit.page);
    }
  });
  render();
  return { input, list, render };
}
