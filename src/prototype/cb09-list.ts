// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The "Link to a page…" combobox list: every page of the site, those under
// the folder the grid's cards link to first, then all other pages; pages
// already in the grid greyed with "In this grid". Typed text that names no
// page offers "Create page /work/hello/" at the end.

import { el, pageGroups, type GridNow, type PageChoice } from "./cb09-core";

export interface CreateOffer { route: string; title: string; parent: string; error?: string }

export interface PageListOptions {
  onPick(page: PageChoice): void;
  /** What typed text would create (its address and title, or why it can't), when it names no page. */
  create?(query: string): CreateOffer | undefined;
  onCreate?(offer: CreateOffer): void;
  placeholder?: string;
}

let lists = 0;

type Entry = { option: HTMLElement; page?: PageChoice; offer?: CreateOffer };

export function pageList(now: () => GridNow | undefined, options: PageListOptions) {
  const id = `cb09-list-${++lists}`;
  const input = el("input", "cb09-search");
  input.type = "text";
  input.placeholder = options.placeholder ?? "Search pages";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  const list = el("div", "cb09-list");
  list.id = id;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Pages");
  let entries: Entry[] = [];
  let active = -1;

  const pickable = (entry: Entry) => (entry.page ? !entry.page.present : Boolean(entry.offer && !entry.offer.error));
  const setActive = (index: number) => {
    active = index;
    entries.forEach(({ option }, at) => option.setAttribute("aria-selected", String(at === active)));
    const hit = entries[active];
    if (hit) { input.setAttribute("aria-activedescendant", hit.option.id); hit.option.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const pick = (entry: Entry) => {
    if (!pickable(entry)) return;
    if (entry.page) options.onPick(entry.page);
    else if (entry.offer) options.onCreate?.(entry.offer);
  };
  const add = (option: HTMLElement, entry: Omit<Entry, "option">) => {
    option.id = `${id}-${entries.length}`;
    option.setAttribute("role", "option");
    const full = { option, ...entry };
    if (!pickable(full)) option.setAttribute("aria-disabled", "true");
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("pointerenter", () => setActive(entries.indexOf(full)));
    option.addEventListener("click", () => pick(full));
    list.append(option);
    entries.push(full);
  };
  const render = () => {
    const grid = now();
    list.replaceChildren();
    entries = [];
    if (!grid) return;
    const groups = pageGroups(grid, input.value);
    for (const group of groups) {
      const head = el("div", "cb09-list__group", group.label);
      head.setAttribute("role", "presentation");
      list.append(head);
      for (const page of group.pages) {
        const option = el("div", `cb09-option${page.present ? " is-present" : ""}`);
        const main = el("span", "cb09-option__main");
        main.append(el("span", "cb09-option__title", page.title), el("code", "cb09-option__route", page.route));
        option.append(main);
        if (page.draft) option.append(el("span", "cb09-option__draft", "draft"));
        if (page.present) option.append(el("span", "cb09-option__present", "In this grid"));
        add(option, { page });
      }
    }
    const offer = input.value.trim() ? options.create?.(input.value) : undefined;
    if (offer) {
      list.append(Object.assign(el("div", "cb09-list__group", "New page"), { role: "presentation" }));
      const option = el("div", `cb09-option cb09-option--create${offer.error ? " is-error" : ""}`);
      const main = el("span", "cb09-option__main");
      const label = el("span", "cb09-option__title");
      label.append(el("span", "cb09-option__plus", "+"), document.createTextNode("Create page "), el("code", "cb09-option__new", offer.route));
      main.append(label, el("span", "cb09-option__sub", offer.error ?? `“${offer.title}”, from a sibling page's structure; the card is filled from it`));
      option.append(main);
      add(option, { offer });
    } else if (!groups.length) list.append(el("p", "cb09-list__empty", "No page matches."));
    // The first page that can be picked starts active; a create offer only when nothing else matches.
    const firstPage = entries.findIndex((entry) => entry.page && pickable(entry));
    setActive(firstPage >= 0 ? firstPage : entries.findIndex(pickable));
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const count = entries.length;
      if (count) setActive(active < 0 ? 0 : (active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const hit = entries[active];
      if (hit) pick(hit);
    }
  });
  render();
  return { input, list, render };
}
