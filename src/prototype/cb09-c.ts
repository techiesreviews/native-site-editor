// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// Card first, link after (C, Lex's pick), and the round 2 variants on it:
// Add card adds a blank card at once (a fresh instance of the card component
// with its template's fallbacks, or a plain item's copy with placeholders).
// The new card shows an inline "Link to a page…" combobox at its foot: every
// page of the site (under the cards' folder first), and for typed text that
// names no page, "Create page /work/hello/" (today's Create page and card:
// the page from a sibling's structure, the card filled, one undo step).
// Choosing a page fills the card, and an information strip on the card lists
// each slot with its source (Change page, close).
// D adds a "Card: card-project ▾" chip (a look menu); F adds a Look row of
// thumbnails to the strip; E chooses the look before the card is added.
// Swapping the look keeps the content by role (title, body, image, link;
// other slots by name); what the new look has no slot for is kept aside and
// listed, and comes back with a look that has a place for it.

import { cb09Variant, type Cb09AddRequest } from "./cb09";
import {
  addCard, btn, cap, cardFolder, cardMarkup, cardText, deps, dropped, el, frameRects, gridLook, host, madePages, mapping, mappingList,
  mergeContent, pageContent, pageInfo, readCard, readGrid, rewriteCard, routes, sameLook, toast, type Content, type Look, type PageInfo,
} from "./cb09-core";
import { pageList, type CreateOffer } from "./cb09-list";
import { closeLookPopup, lookMenu, lookRow } from "./cb09-look";
import { slugify } from "../native-pages";

interface Linked {
  path: string;
  parent: number[];
  node: number[];
  label: string;
  noun: string;
  /** The grid's usual look, and the card's. */
  base: Look;
  look: Look;
  page?: PageInfo;
  /** Content gathered so far, by role: what one look drops comes back in another. */
  kept: Content;
  /** What the current look has no slot for. */
  dropped: string[];
  /** The card's markup as last written: a different one means it was undone or edited away. */
  text?: string;
}

let current: { off: () => void } | undefined;

export function cardFirst(request: Cb09AddRequest, look?: Look) {
  current?.off();
  const now = readGrid(request.grid);
  if (!now) return;
  const base = gridLook(now);
  const chosen = look ?? base;
  const noun = request.about.noun;
  const node = addCard(now, chosen, look && !sameLook(look, base) ? `Blank ${noun} added to ${request.about.label} as ${chosen.label}` : `Blank ${noun} added to ${request.about.label}`);
  if (!node) return;
  const card: Linked = { path: now.path, parent: now.grid.parent, node, label: request.about.label, noun, base, look: chosen, kept: { extras: {} }, dropped: [] };
  card.text = cardText(card.path, card.node);
  overlay(card, "link");
}

function grid(card: Linked) {
  return readGrid({ path: card.path, parent: card.parent });
}

function overlay(card: Linked, mode: "link" | "strip") {
  current?.off();
  const variant = cb09Variant();
  const box = el("div", mode === "link" ? "cb09-linker" : "cb09-strip");
  let list: ReturnType<typeof pageList> | undefined;

  const lookChip = () => {
    const chip = btn(`Card: ${card.look.html ? "grid item" : card.look.variant ? `${card.look.tag} · ${card.look.variant.value}` : card.look.tag} ▾`, () => {
      lookMenu(chip, card.base, card.look, mergeContent(card.kept, readCard(card.path, card.node, card.look)), (look) => swap(card, look, mode));
    }, "cb09-lookchip");
    chip.setAttribute("aria-haspopup", "dialog");
    return chip;
  };

  if (mode === "link") {
    const top = el("div", "cb09-linker__top");
    const shape = card.look;
    const linkSlot = !shape.html;
    top.append(el("span", "cb09-linker__chip", linkSlot ? "link slot" : card.base.html && !grid(card)?.links ? "no link on these cards yet" : "link"));
    if (variant === "D") top.append(lookChip());
    const why = el("p", "cb09-linker__why", linkSlot || grid(card)?.links ? "Pick a page to fill this card from it, or type a new address." : "Choosing a page adds a link: the title becomes a stretched link.");
    list = pageList(() => grid(card), {
      placeholder: "Link to a page…",
      onPick: (page) => choose(page),
      create: (query) => createOffer(card, query),
      onCreate: (offer) => create(offer),
    });
    list.list.hidden = true;
    const showList = () => { list!.list.hidden = false; list!.render(); place(); };
    list.input.addEventListener("focus", showList);
    list.input.addEventListener("input", showList);
    box.append(top, why, list.input, list.list, el("p", "cb09-hint", "Esc leaves the card blank"));
  } else {
    const page = card.page!;
    const head = el("div", "cb09-strip__head");
    const title = el("p", "cb09-strip__title");
    title.append(el("span", "", "Filled from "), el("strong", "", page.title), el("code", "", page.route));
    if (madePages.has(page.file)) title.append(el("span", "cb09-option__draft", "new page"));
    const change = btn("Change page", () => { card.page = undefined; overlay(card, "link"); }, "cb09-strip__change");
    const x = btn("×", () => off(), "cb09-strip__close");
    x.setAttribute("aria-label", "Close");
    head.append(title, x);
    const actions = el("div", "cb09-strip__actions");
    if (variant === "D") actions.append(lookChip());
    actions.append(change);
    box.append(head, actions, mappingList(mapping(card.look, page)));
    if (card.dropped.length && variant !== "C") box.append(droppedNote(card));
    if (variant === "F") {
      const row = el("div", "cb09-strip__look");
      row.append(el("span", "cb09-map__slot", "Look"), lookRow(card.base, card.look, mergeContent(card.kept, readCard(card.path, card.node, card.look)), (look) => swap(card, look, "strip")));
      box.append(row);
    }
  }

  function choose(page: PageInfo) {
    fill(card, page);
    toast(`${cap(card.noun)} linked to ${page.route} and filled from it.`);
    overlay(card, "strip");
  }

  function create(offer: CreateOffer) {
    const now = grid(card);
    if (!now) return;
    const planned = host().planPage({ title: offer.title, parent: offer.parent });
    if (!planned.ok) { toast(planned.error); return; }
    const { route, file } = planned.value;
    const content = host().subpageDocument(now.source, now.grid, offer.title, route);
    const failed = deps().saveNewDraft(file, content);
    if (failed) { toast(failed); return; }
    madePages.add(file);
    const page = pageInfo(route, file, content);
    // As today's "Create page and card": the card's edit and the new page's draft are one undo step.
    fill(card, page, { undo: () => deps().dropNewDraft(file), redo: () => { deps().saveNewDraft(file, content); } });
    toast(`Created the page ${offer.title} at ${route} (from a sibling page's structure) and filled the ${card.noun} from it. One undo takes both back.`);
    overlay(card, "strip");
  }

  document.body.append(box);
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  function place() {
    if (!rect) { box.style.visibility = "hidden"; return; }
    const frameBox = document.querySelector(".native-preview-frame")!.getBoundingClientRect();
    box.style.visibility = rect.y + rect.h < frameBox.top + 20 || rect.y > frameBox.bottom - 20 ? "hidden" : "visible";
    const width = Math.min(Math.max(mode === "link" ? 340 : variant === "F" ? 560 : 440, rect.w), frameBox.width - 16);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(frameBox.left + 8, Math.min(rect.x + (rect.w - width) / 2, frameBox.right - width - 8))}px`;
    // Hung from the card's foot, where its link slot is; above the card when it can't fit below.
    const floor = Math.min(frameBox.bottom, innerHeight - 64);
    if (list) list.list.style.maxHeight = `${Math.max(150, Math.min(300, floor - (rect.y + rect.h) - 130))}px`;
    const height = box.offsetHeight;
    const below = rect.y + rect.h - 6;
    const above = rect.y - height + 6;
    box.style.top = `${below + height <= floor || above < frameBox.top + 8 ? Math.min(below, floor - height) : above}px`;
  }
  let first = true;
  const tick = async () => {
    if (cardText(card.path, card.node) !== card.text) { off(); return; }
    const [next] = await frameRects(card.path, [card.node], first && mode === "link" ? card.node : undefined, "start");
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
    closeLookPopup();
    box.remove();
    document.removeEventListener("keydown", onKey, true);
    current = undefined;
  }
  current = { off };
}

/** Fills the card from `page` in its current look; other named slots it holds (a note) stay. */
function fill(card: Linked, page: PageInfo, companion?: { undo(): void; redo(): void }) {
  const extras = mergeContent(card.kept, readCard(card.path, card.node, card.look)).extras;
  card.page = page;
  card.kept = { ...pageContent(page), extras };
  card.dropped = dropped(card.kept, card.look);
  rewriteCard(card.path, card.node, (indent) => cardMarkup(card.look, indent, card.kept), `${cap(card.noun)} filled from ${page.route}`, companion);
  card.text = cardText(card.path, card.node);
}

/** Swaps the card's look in place, its content carried by role. */
function swap(card: Linked, look: Look, mode: "link" | "strip") {
  card.kept = mergeContent(card.kept, readCard(card.path, card.node, card.look));
  card.look = look;
  card.dropped = dropped(card.kept, look);
  rewriteCard(card.path, card.node, (indent) => cardMarkup(look, indent, card.kept), `${cap(card.noun)} is now ${look.label}`);
  card.text = cardText(card.path, card.node);
  const note = card.dropped.length ? droppedNote(card) : undefined;
  toast(`${cap(card.noun)} is now ${look.label}${card.dropped.length ? "" : ": everything carried over"}.`, note);
  overlay(card, card.page ? "strip" : mode);
}

function droppedNote(card: Linked) {
  const note = el("p", "cb09-dropped");
  note.append(el("strong", "", `Not shown by ${card.look.label}: `), document.createTextNode(`${card.dropped.join(", ")}. Kept aside: it comes back if the card changes to a look with a place for it.`));
  return note;
}

/** What typed text would create: an address as typed, or a title under the cards' folder. None when it names a page. */
function createOffer(card: Linked, query: string): CreateOffer | undefined {
  const now = grid(card);
  const typed = query.trim();
  if (!now || !typed) return undefined;
  let parent: string;
  let title: string;
  if (typed.startsWith("/")) {
    const path = typed.toLowerCase().replace(/\/+$/, "");
    const at = path.lastIndexOf("/");
    parent = path.slice(0, at + 1) || "/";
    const name = path.slice(at + 1);
    if (!name) return undefined;
    title = cap(name.replace(/[-_]+/g, " "));
  } else {
    parent = cardFolder(now) ?? "/";
    title = typed;
  }
  const known = routes();
  if (Object.keys(known).some((route) => route === `${typed.replace(/\/?$/, "/")}`) || Object.entries(known).some(([route, file]) => pageInfo(route, file).title.toLowerCase() === typed.toLowerCase())) return undefined;
  const planned = host().planPage({ title, parent });
  if (planned.ok) return { route: planned.value.route, title, parent };
  if (/is taken by/.test(planned.error)) return undefined;
  return { route: `${parent}${slugify(title) || "…"}/`, title, parent, error: planned.error };
}
