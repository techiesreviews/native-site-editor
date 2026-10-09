// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Variant A, "Popover tab": today's Add card popover (a grid of pages) gains
// a tab strip, New page | Existing page. Existing page is a searchable list,
// pages under the grid's parent URL first; a page already in the grid is
// greyed with "In this grid · show" and picking it selects its card (it
// adds nothing). Picking another page adds the card filled from it. The
// rule's result for the active row shows under the list.
//
// A grid whose cards aren't links opens a small popover instead of adding at
// once: Card (blank) with Existing page disabled and a one-line reason.

import type { Cb09AddRequest, Cb09PopoverRequest } from "./cb09";
import { addCards, btn, el, mapping, mappingList, readGrid, selectPresent, shapeOf, toast } from "./cb09-core";
import { pageList } from "./cb09-list";

export function decorate(request: Cb09PopoverRequest) {
  const { popover, grid, about } = request;
  if (popover.hidden || popover.querySelector(".cb09-tabs")) return;
  const now = () => readGrid(grid);
  const first = now();
  if (!first) return;
  const original = [...popover.children] as HTMLElement[];
  const tabs = el("div", "cb09-tabs");
  tabs.setAttribute("role", "tablist");
  const newTab = btn("New page", () => show("new"), "cb09-tab");
  const existingTab = btn("Existing page", () => show("existing"), "cb09-tab");
  for (const tab of [newTab, existingTab]) tab.setAttribute("role", "tab");
  tabs.append(newTab, existingTab);

  const panel = el("div", "cb09-existing");
  const heading = el("h2", "card-add__title", `${cap(about.noun)} for a page that exists`);
  const where = el("p", "card-add__where", `In “${about.label}”. Pages under ${about.collection} first.`);
  const shape = shapeOf(first);
  const fills = el("div", "cb09-fills");
  const list = pageList(now, {
    present: "jump",
    onActive: (page) => {
      fills.replaceChildren();
      if (!page) return;
      if (page.present) { fills.append(el("p", "cb09-fills__note", `${page.title} already has a card here. Picking it selects that card.`)); return; }
      fills.append(el("p", "cb09-fills__head", `Fills the new ${about.noun} like this`), mappingList(mapping(shape, page), { compact: true }));
    },
    onPick: (page) => {
      const grid = now();
      request.close();
      if (!grid) return;
      if (page.present) { selectPresent(grid, page.route); toast(`${page.title} is already in “${about.label}”: its ${about.noun} is selected.`); return; }
      const rows = mapping(shapeOf(grid), page);
      if (addCards(grid, [page], {}, `${cap(about.noun)} added to ${about.label} from ${page.route}`)) toast(`${cap(about.noun)} added from ${page.route}`, rows);
    },
  });
  const hint = el("p", "cb09-hint", "↑↓ to choose · ↵ adds the card · pages in this grid select their card");
  panel.append(heading, where, list.input, list.list, fills, hint);
  panel.hidden = true;
  popover.prepend(tabs);
  popover.append(panel);

  function show(which: "new" | "existing") {
    const existing = which === "existing";
    // Today's children keep their own hidden state (the message); display hides them all.
    for (const child of original) child.style.display = existing ? "none" : "";
    panel.hidden = !existing;
    newTab.setAttribute("aria-selected", String(!existing));
    existingTab.setAttribute("aria-selected", String(existing));
    popover.classList.toggle("cb09-wide", existing);
    if (existing) { list.render(); list.input.focus(); }
    else (original.find((child) => child.matches(".card-add__field"))?.querySelector("input") as HTMLInputElement | null)?.focus();
    request.place();
  }
  newTab.setAttribute("aria-selected", "true");
  existingTab.setAttribute("aria-selected", "false");
  request.place();
}

const cap = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

// ---- A grid whose cards aren't links: Card, and Existing page turned off with its reason. ----
let openPop: { pop: HTMLElement; off: () => void } | undefined;

export function nonLinkPopover(request: Cb09AddRequest) {
  openPop?.off();
  const { about, anchor } = request;
  const now = readGrid(request.grid);
  if (!now) return;
  const pop = el("div", "card-add cb09-pop");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", `Add ${about.noun}`);
  const tabs = el("div", "cb09-tabs");
  tabs.setAttribute("role", "tablist");
  const cardTab = btn(cap(about.noun), () => undefined, "cb09-tab");
  cardTab.setAttribute("role", "tab");
  cardTab.setAttribute("aria-selected", "true");
  const existingTab = btn("Existing page", () => undefined, "cb09-tab");
  existingTab.setAttribute("role", "tab");
  existingTab.disabled = true;
  existingTab.title = "These cards don't link to pages";
  tabs.append(cardTab, existingTab);
  const reason = el("p", "cb09-reason", `Existing page is off: the ${about.noun}s in “${about.label}” don't link anywhere, so a page has no place on them.`);
  const heading = el("h2", "card-add__title", `New ${about.noun}`);
  const where = el("p", "card-add__where", `A blank ${about.noun} with placeholder text after the last one in “${about.label}”.`);
  const add = btn(`Add ${about.noun}`, () => {
    const grid = readGrid(request.grid);
    close();
    if (grid) addCards(grid, [undefined], {}, `${cap(about.noun)} added to ${about.label}`);
  }, "card-add__create");
  const actions = el("div", "card-add__actions");
  actions.append(add);
  pop.append(tabs, reason, heading, where, actions);
  document.body.append(pop);
  const box = anchor.getBoundingClientRect();
  const width = 320;
  pop.style.width = `${width}px`;
  const right = box.right + 12;
  pop.style.left = `${right + width < innerWidth - 12 ? right : Math.max(12, box.left - width - 12)}px`;
  // As today's popover: it grows up over the grid it adds to, ending level with the button.
  const up = box.bottom - pop.offsetHeight;
  pop.style.top = `${up > 120 ? up : Math.max(12, Math.min(box.top, innerHeight - pop.offsetHeight - 12))}px`;
  add.focus();
  const onDown = (event: PointerEvent) => { if (!pop.contains(event.target as Node)) close(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
  setTimeout(() => document.addEventListener("pointerdown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  function close() {
    pop.remove();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    openPop = undefined;
  }
  openPop = { pop, off: close };
}
