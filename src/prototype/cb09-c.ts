// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Variant C, "Card first, link after": Add card adds a blank card at once (a
// fresh instance of the card component with its template's fallbacks, or a
// plain item's copy with placeholders). On the canvas the new card shows an
// inline "Link to a page…" combobox where its link slot is; choosing a page
// fills the card (one more undo step), and a mapping strip on the card lists
// each slot with its source, each with "Keep placeholder" (and back).
// A grid whose cards aren't links gets the same combobox: choosing a page
// adds a link, the title becoming a stretched link.

import type { Cb09AddRequest } from "./cb09";
import { addCards, btn, cardMarkup, cardText, el, frameRects, mapping, mappingList, readGrid, rewriteCard, shapeOf, toast, type PageInfo, type Role, type Shape } from "./cb09-core";
import { pageList } from "./cb09-list";

interface Linked {
  path: string;
  parent: number[];
  node: number[];
  shape: Shape;
  links: boolean;
  label: string;
  noun: string;
  page?: PageInfo;
  kept: Set<Role>;
  /** The card's text as last written: a different text means it was undone or edited away. */
  text?: string;
}

let current: { off: () => void } | undefined;

export function cardFirst(request: Cb09AddRequest) {
  current?.off();
  const now = readGrid(request.grid);
  if (!now) return;
  const shape = shapeOf(now);
  const node = addCards(now, [undefined], {}, `Blank ${request.about.noun} added to ${request.about.label}`);
  if (!node) return;
  const card: Linked = { path: now.path, parent: now.grid.parent, node, shape, links: now.links, label: request.about.label, noun: request.about.noun, kept: new Set() };
  card.text = cardText(card.path, card.node);
  overlay(card, "link");
}

function overlay(card: Linked, mode: "link" | "strip") {
  current?.off();
  const box = el("div", mode === "link" ? "cb09-linker" : "cb09-strip");
  const fill = () => ({ noLink: "add" as const, kept: card.kept });
  let list: ReturnType<typeof pageList> | undefined;

  if (mode === "link") {
    const chip = el("span", "cb09-linker__chip", card.shape.link === "slot" ? `${card.shape.has.link} slot` : card.shape.link === "none" ? `no link on these ${card.noun}s yet` : "link");
    const why = el("span", "cb09-linker__why", card.shape.link === "none" ? "Choosing a page adds one: the title becomes a stretched link." : "Choosing a page fills this card from it.");
    const top = el("div", "cb09-linker__top");
    top.append(chip, why);
    list = pageList(() => readGrid({ path: card.path, parent: card.parent }), {
      present: "disabled",
      placeholder: "Link to a page…",
      onPick: (page) => choose(page),
    });
    list.list.hidden = true;
    const showList = () => { list!.list.hidden = false; list!.render(); place(); };
    list.input.addEventListener("focus", showList);
    list.input.addEventListener("input", showList);
    const hint = el("p", "cb09-hint", "Esc leaves the card blank");
    box.append(top, list.input, list.list, hint);
  } else {
    renderStrip();
  }

  function renderStrip() {
    const page = card.page!;
    const head = el("div", "cb09-strip__head");
    const title = el("p", "cb09-strip__title");
    title.append(el("span", "", "Filled from "), el("strong", "", page.title), el("code", "", page.route));
    const change = btn("Change page", () => { card.page = undefined; card.kept.clear(); overlay(card, "link"); }, "cb09-strip__change");
    const x = btn("×", () => off(), "cb09-strip__close");
    x.setAttribute("aria-label", "Close");
    head.append(title, change, x);
    const rows = mapping(card.shape, page, fill());
    box.replaceChildren(head, mappingList(rows, {
      onToggle: (row) => {
        if (card.kept.has(row.role)) card.kept.delete(row.role); else card.kept.add(row.role);
        write(card.kept.has(row.role) ? `${row.label} keeps its placeholder` : `${row.label} filled from ${page.route}`);
        renderStrip();
      },
    }));
  }

  function write(message: string) {
    const page = card.page;
    if (!page) return;
    rewriteCard(card.path, card.node, (indent) => cardMarkup(card.shape, indent, page, fill()), message);
    card.text = cardText(card.path, card.node);
  }

  function choose(page: PageInfo) {
    card.page = page;
    card.kept.clear();
    write(`${cap(card.noun)} filled from ${page.route}`);
    toast(`${cap(card.noun)} linked to ${page.route} and filled from it. Each row on the ${card.noun} can keep its placeholder.`);
    overlay(card, "strip");
  }

  document.body.append(box);
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  function place() {
    if (!rect) { box.style.visibility = "hidden"; return; }
    const frameBox = document.querySelector(".native-preview-frame")!.getBoundingClientRect();
    box.style.visibility = rect.y + rect.h < frameBox.top + 20 || rect.y > frameBox.bottom - 20 ? "hidden" : "visible";
    const width = Math.max(mode === "link" ? 320 : 420, rect.w);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(frameBox.left + 8, Math.min(rect.x + (rect.w - width) / 2, frameBox.right - width - 8))}px`;
    // Hung from the card's foot, where its link slot is; above the card when it can't fit below.
    const floor = Math.min(frameBox.bottom, innerHeight - 64);
    if (list) list.list.style.maxHeight = `${Math.max(140, Math.min(260, floor - (rect.y + rect.h) - 110))}px`;
    const height = box.offsetHeight;
    const below = rect.y + rect.h - 6;
    const above = rect.y - height + 6;
    box.style.top = `${below + height <= floor || above < frameBox.top + 8 ? Math.min(below, floor - height) : above}px`;
  }
  let first = true;
  const tick = async () => {
    // Undone or edited away: the overlay goes with it.
    if (cardText(card.path, card.node) !== card.text) { off(); return; }
    const [next] = await frameRects(card.path, [card.node], first ? card.node : undefined, "start");
    first = false;
    rect = next;
    place();
  };
  const timer = setInterval(() => void tick(), 200);
  setTimeout(() => void tick(), 350);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !box.contains(document.activeElement)) return;
    event.preventDefault();
    off();
    if (mode === "link") toast(`The ${card.noun} stays blank, with its placeholders.`);
  };
  document.addEventListener("keydown", onKey, true);
  if (list) setTimeout(() => list!.input.focus(), 400);
  function off() {
    clearInterval(timer);
    box.remove();
    document.removeEventListener("keydown", onKey, true);
    current = undefined;
  }
  current = { off };
}

const cap = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
