// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Variant B, "Page picker sheet, multi-select": Add card opens a side sheet
// listing pages grouped (Under /work/ · Other pages) with checkboxes, so
// several pages become cards at once, in list order, as one undo step.
// Pages already in the grid are ticked and disabled. Beside the list, a
// small "how it fills" preview of one card (the row under the pointer or
// focus, else the first ticked). A grid whose cards aren't links lists the
// same pages; their cards get title, text and image, and no link.

import type { Cb09AddRequest } from "./cb09";
import { addCards, btn, deps, el, mapping, mappingList, pageGroups, readGrid, shapeOf, toast, type PageChoice, type Row, type Shape } from "./cb09-core";

let current: { off: () => void } | undefined;

export function openSheet(request: Cb09AddRequest) {
  current?.off();
  const { about } = request;
  const now = () => readGrid(request.grid);
  const first = now();
  if (!first) return;
  const shape = shapeOf(first);
  const linkless = !first.links;
  const fill = { noLink: "leave" as const };

  const sheet = el("aside", "cb09-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Add cards from pages");
  const head = el("header", "cb09-sheet__head");
  const titles = el("div", "cb09-sheet__titles");
  titles.append(el("h2", "cb09-sheet__title", `Add ${about.noun}s from pages`), el("p", "cb09-sheet__where", `To “${about.label}” on ${deps().pageLabel(first.path)}${first.grid.collection ? ` · pages under ${first.grid.collection} first` : ""}`));
  const x = btn("×", () => close(), "cb09-sheet__close");
  x.setAttribute("aria-label", "Close");
  head.append(titles, x);
  const banner = linkless ? el("p", "cb09-banner", `These ${about.noun}s aren't links. Each page still fills the title, text and image; no link is added, so the ${about.noun} won't lead to the page.`) : undefined;

  const body = el("div", "cb09-sheet__body");
  const left = el("div", "cb09-sheet__list");
  const search = el("input", "cb09-search");
  search.type = "search";
  search.placeholder = "Search pages";
  const groupsBox = el("div", "cb09-checks");
  left.append(search, groupsBox);
  const right = el("div", "cb09-sheet__preview");
  body.append(left, right);

  const foot = el("footer", "cb09-sheet__foot");
  const order = el("p", "cb09-sheet__order");
  const blank = btn(`Blank ${about.noun}`, () => {
    const grid = now();
    close();
    if (grid) addCards(grid, [undefined], fill, `Blank ${about.noun} added to ${about.label}`);
  }, "card-add__only");
  blank.title = `A ${about.noun} with its placeholders and no page`;
  const add = btn("Add", () => submit(), "card-add__create");
  foot.append(order, blank, add);
  sheet.append(head, ...(banner ? [banner] : []), body, foot);
  document.body.append(sheet);

  const ticked = new Set<string>();
  let focus: PageChoice | undefined;
  let shown: PageChoice[] = [];

  function render() {
    const grid = now();
    if (!grid) return;
    groupsBox.replaceChildren();
    shown = [];
    for (const group of pageGroups(grid, search.value)) {
      const fieldset = el("fieldset", "cb09-checks__group");
      fieldset.append(el("legend", "cb09-list__group", group.label));
      for (const page of group.pages) {
        shown.push(page);
        const row = el("label", `cb09-check${page.present ? " is-present" : ""}`);
        const box = el("input");
        box.type = "checkbox";
        box.checked = page.present || ticked.has(page.route);
        box.disabled = page.present;
        box.addEventListener("change", () => { if (box.checked) ticked.add(page.route); else ticked.delete(page.route); focus = page; update(); });
        box.addEventListener("focus", () => { focus = page; preview(); });
        row.addEventListener("pointerenter", () => { focus = page; preview(); });
        const main = el("span", "cb09-option__main");
        main.append(el("span", "cb09-option__title", page.title), el("code", "cb09-option__route", page.route));
        row.append(box, main);
        if (page.draft) row.append(el("span", "cb09-option__draft", "draft"));
        if (page.present) row.append(el("span", "cb09-option__present", "In this grid"));
        fieldset.append(row);
      }
      groupsBox.append(fieldset);
    }
    update();
  }

  const chosen = () => shown.filter((page) => !page.present && ticked.has(page.route));

  function update() {
    const pages = chosen();
    add.textContent = pages.length ? `Add ${pages.length} ${about.noun}${pages.length === 1 ? "" : "s"}` : `Add ${about.noun}s`;
    add.disabled = !pages.length;
    order.textContent = pages.length > 1 ? `In this order: ${pages.map((page) => page.title).join(", ")} · one undo step` : pages.length ? "One undo step" : "Tick the pages to add";
    preview();
  }

  function preview() {
    const page = focus && !focus.present ? focus : chosen()[0] ?? shown.find((entry) => !entry.present);
    right.replaceChildren();
    right.append(el("p", "cb09-fills__head", "How it fills"));
    if (!page) { right.append(el("p", "cb09-fills__note", "Pick a page to see its card.")); return; }
    const rows = mapping(shape, page, fill);
    right.append(mock(shape, rows, about.noun), el("p", "cb09-fills__sub", `${page.title} · ${page.route}`), mappingList(rows, { compact: true }));
  }

  function submit() {
    const pages = chosen();
    const grid = now();
    if (!grid || !pages.length) return;
    close();
    if (addCards(grid, pages, fill, `${pages.length} ${about.noun}${pages.length === 1 ? "" : "s"} added to ${about.label} from pages`))
      toast(`${pages.length} ${about.noun}${pages.length === 1 ? "" : "s"} added to “${about.label}” in list order${linkless ? ", without links" : ""} (one undo step).`);
  }

  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  search.addEventListener("input", render);
  function close() {
    sheet.remove();
    document.removeEventListener("keydown", onKey, true);
    current = undefined;
  }
  current = { off: close };
  render();
  search.focus();
}

/** A small mock of the card: each slot with its words and where they came from. */
function mock(shape: Shape, rows: Row[], noun: string) {
  const card = el("div", "cb09-mock");
  const row = (role: string) => rows.find((entry) => entry.role === role);
  const tag = (text: string, kind = "") => el("span", `cb09-mock__src ${kind}`, text);
  const fallback = (role: string) => shape.component?.slots.find((slot) => slot.role === role)?.fallback?.textContent?.trim()
    ?? (role === "body" ? `A sentence or two about this ${noun}.` : "");
  const image = row("image");
  if (shape.has.image) {
    const box = el("div", "cb09-mock__image");
    box.append(el("span", "", image?.status === "filled" ? image.value ?? "" : "placeholder image"), tag(image?.status === "filled" ? "← og:image" : "kept", image?.status === "filled" ? "" : "is-kept"));
    card.append(box);
  }
  for (const other of rows.filter((entry) => entry.role === "other")) {
    const line = el("p", "cb09-mock__note");
    line.append(el("span", "", other.value ?? ""), tag(`${other.label}: kept`, "is-kept"));
    card.append(line);
  }
  const title = row("title")!;
  const h = el("p", "cb09-mock__title");
  h.append(el("span", "", title.value ?? ""), tag(`← ${title.from}`));
  card.append(h);
  const text = row("body");
  if (shape.has.body) {
    const p = el("p", "cb09-mock__body");
    p.append(el("span", "", text?.status === "filled" ? text.value ?? "" : fallback("body")), tag(text?.status === "filled" ? "← meta description" : "kept", text?.status === "filled" ? "" : "is-kept"));
    card.append(p);
  }
  const link = row("link");
  const a = el("p", "cb09-mock__link");
  if (link?.status === "filled") a.append(el("span", "", `Read about ${title.value} →`), tag(`← ${link.value?.split(" ")[0]}`));
  else a.append(el("span", "cb09-mock__none", "no link"), tag("cards here aren't links", "is-kept"));
  card.append(a);
  if (!shape.has.image) card.append(el("p", "cb09-mock__foot", `og:image not used: ${shape.component ? `<${shape.component.tag}>` : `this ${noun}`} has no image slot`));
  return card;
}
