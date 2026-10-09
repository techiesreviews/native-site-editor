// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The model behind the variants: the grid as the source has it, the pages it
// could get a card for (those under the folder its cards link to first), what
// each page offers (h1 else <title>, meta description, og:image, address),
// a card's look (a card component, one of its data-* variants, or the grid's
// own plain item) and its shape (slots by role), the content a card holds
// (by role, so it carries across looks), the mapping rule, and the markup.
// Writes go through the cards module's own deps (one verified page edit =
// one undo step).

import type { CardsDeps } from "../page-builder/cards";
import type { Cb09CardsHost } from "./cb09";
import { gridAt, type GridContext, type SourceGrid } from "../page-builder/card-source";
import { insertAfterEdit, plainText } from "../page-builder/card-grid";
import { templateSlots } from "../page-builder/component-model";
import { locateNativeElementRange } from "../native-source-location";

export const state: { deps?: CardsDeps; host?: Cb09CardsHost } = {};
export const deps = () => state.deps!;
export const host = () => state.host!;

// ---- Small UI bits. ----
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
}
export function btn(text: string, run: () => void, cls = "cb09-btn") {
  const out = el("button", cls, text);
  out.type = "button";
  out.addEventListener("click", run);
  return out;
}
let toastEl: HTMLElement | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, extra?: HTMLElement) {
  toastEl?.remove();
  toastEl = el("div", "cb09-toast");
  toastEl.setAttribute("role", "status");
  toastEl.append(el("strong", "", text));
  if (extra) toastEl.append(extra);
  toastEl.title = "Click to dismiss";
  toastEl.addEventListener("click", () => toastEl?.remove());
  document.body.append(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.remove(), 14000);
}
export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
export const cap = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

// ---- Site and grid. ----
export const routes = () => deps().site()?.routes ?? {};
export const routeOf = (path: string) => Object.entries(routes()).find(([, file]) => file === path)?.[0];
export const context = (route: string): GridContext => ({ route, routes: routes(), isSection: (tag) => deps().isSection(tag) });

export interface GridNow { path: string; route: string; source: string; grid: SourceGrid; links: boolean }
export function readGrid(report: { path: string; parent: number[] }): GridNow | undefined {
  const source = deps().source(report.path);
  const route = routeOf(report.path);
  if (source === undefined || !route) return undefined;
  const grid = gridAt(source, report.parent, context(route));
  if (!grid) return undefined;
  return { path: report.path, route, source, grid, links: grid.items.some((item) => item.route) };
}

/** The folder the grid's cards link into (`/work/`): its collection, else the most common parent of its cards' pages. */
export function cardFolder(now: GridNow): string | undefined {
  if (now.grid.collection) return now.grid.collection;
  const parents = now.grid.items.map((item) => item.route).filter((route): route is string => Boolean(route?.endsWith("/")))
    .map((route) => route.replace(/[^/]+\/$/, "")).filter((parent) => parent !== "/");
  return parents.sort((a, b) => parents.filter((p) => p === b).length - parents.filter((p) => p === a).length)[0];
}

// ---- Pages. ----
export interface PageInfo {
  route: string;
  file: string;
  title: string;
  titleFrom: "h1" | "<title>" | "address";
  description?: string;
  image?: string;
  draft: boolean;
}

export function pageInfo(route: string, file: string, text?: string): PageInfo {
  const source = text ?? deps().source(file) ?? "";
  const doc = new DOMParser().parseFromString(source, "text/html");
  const h1 = squash(doc.querySelector("main h1, h1")?.textContent);
  // "<title>" without the site's name ("Fern & Kettle · Larkspur Studio").
  const titleTag = squash(doc.title).split(/\s+[·|–—-]\s+/)[0];
  const description = squash(doc.querySelector('meta[name="description"]')?.getAttribute("content")) || undefined;
  let image = squash(doc.querySelector('meta[property="og:image"]')?.getAttribute("content")) || undefined;
  const site = deps().siteUrl()?.replace(/\/$/, "");
  if (image && site && image.startsWith(site)) image = image.slice(site.length);
  const title = h1 || titleTag || route.split("/").filter(Boolean).at(-1) || route;
  return { route, file, title, titleFrom: h1 ? "h1" : titleTag ? "<title>" : "address", description, image, draft: isDraft(file) };
}
/** Pages made by the prototype (at load, or by "Create page"): shown with a "draft" mark. */
export const madePages = new Set<string>();
const isDraft = (file: string) => DRAFT_PAGES.some((page) => page.file === file) || madePages.has(file);

export interface PageChoice extends PageInfo { present: boolean }
export interface PageGroup { label: string; pages: PageChoice[] }

/**
 * Every page of the site a card could take (not the grid's own page, not
 * 404): those under the folder its cards link to first, then all the others.
 */
export function pageGroups(now: GridNow, query = ""): PageGroup[] {
  const present = new Set(now.grid.items.map((item) => item.route).filter(Boolean));
  const folder = cardFolder(now);
  const q = query.trim().toLowerCase();
  const all = Object.entries(routes())
    .filter(([route, file]) => file !== now.path && !/(^|\/)404\.html$/.test(file) && route !== "/404.html")
    .map(([route, file]) => ({ ...pageInfo(route, file), present: present.has(route) }))
    .filter((page) => !q || page.title.toLowerCase().includes(q) || page.route.toLowerCase().includes(q))
    .sort((a, b) => a.route.localeCompare(b.route));
  if (!folder) return all.length ? [{ label: "All pages", pages: all }] : [];
  const under = all.filter((page) => page.route.startsWith(folder));
  const other = all.filter((page) => !page.route.startsWith(folder));
  return [
    ...(under.length ? [{ label: `Under ${folder}`, pages: under }] : []),
    ...(other.length ? [{ label: "Other pages", pages: other }] : []),
  ];
}

// ---- Looks: a card component, one of its variants, or the grid's own plain item. ----
export interface Look {
  /** A card component's tag. */
  tag?: string;
  /** One of its data-* variants (ticket 07). */
  variant?: { name: string; value: string };
  /** The grid's own plain item (its markup), when its items aren't components. */
  html?: string;
  label: string;
}
export const sameLook = (a: Look, b: Look) => a.tag === b.tag && a.variant?.name === b.variant?.name && a.variant?.value === b.variant?.value && Boolean(a.html) === Boolean(b.html);
export const lookLabel = (look: Look) => look.label;

const componentFile = (tag: string) => deps().site()?.components[tag];
export const componentSource = (tag: string) => { const file = componentFile(tag); return file ? deps().source(file) : undefined; };
export const componentCss = (tag: string) => { const file = componentFile(tag); return file ? deps().source(file.replace(/\.html$/, ".css")) ?? "" : ""; };

/** Variants a component's CSS styles on its host: `:host([data-x="v"])`, by attribute. */
export function componentVariants(tag: string): { name: string; values: string[] }[] {
  const out = new Map<string, Set<string>>();
  for (const match of componentCss(tag).matchAll(/:host\(\s*\[\s*(data-[\w-]+)\s*=\s*["']?([\w-]+)["']?\s*\]\s*\)/g)) {
    if (!out.has(match[1])) out.set(match[1], new Set());
    out.get(match[1])!.add(match[2]);
  }
  return [...out].map(([name, values]) => ({ name, values: [...values] }));
}

/** Card components: tags whose template has a heading slot (so `card-note`, a label, is not one). */
export function cardComponents(): string[] {
  return Object.keys(deps().site()?.components ?? {}).filter((tag) => {
    if (!tag.startsWith("card-")) return false;
    const template = componentSource(tag);
    return Boolean(template && shapeFromTemplate(tag, template).has.title);
  }).sort();
}

/** A grid's usual look: its items' component (with the last item's variant), else its plain item. */
export function gridLook(now: GridNow): Look {
  const tag = now.grid.kind.split(".")[0];
  const last = now.grid.items[now.grid.items.length - 1];
  if (tag.includes("-") && componentSource(tag) !== undefined) return { tag, label: tag };
  const html = now.source.slice(last.range.start, last.range.end);
  return { html, label: `${now.grid.kind} (this grid's own item)` };
}

/** Looks to offer: the grid's own plain item (if any), then each card component with its variants. */
export function allLooks(base: Look): { component: Look; variants: Look[] }[] {
  const out: { component: Look; variants: Look[] }[] = [];
  if (base.html) out.push({ component: base, variants: [] });
  for (const tag of cardComponents()) {
    const variants = componentVariants(tag).flatMap((variant) => variant.values.map((value) => ({ tag, variant: { name: variant.name, value }, label: `${tag} · ${value}` })));
    out.push({ component: { tag, label: tag }, variants });
  }
  return out;
}

// ---- A look's shape: its slots by role. ----
export type Role = "title" | "body" | "image" | "link" | "other";
interface ShapeSlot { name: string; role: Role; fallback?: Element; kind: string }
export interface Shape {
  look: Look;
  noun: string;
  component?: { tag: string; slots: ShapeSlot[] };
  html?: string;
  /** Where the address goes: a link slot, a link inside the card, the card itself (link-wrapped), or nowhere. */
  link: "slot" | "inner" | "wrapped" | "none";
  has: Record<Exclude<Role, "other">, string | undefined>;
  others: { name: string; text: string }[];
}

const HEADING = /^h[1-6]$/;
function firstElement(html: string): Element | undefined {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild ?? undefined;
}

function shapeFromTemplate(tag: string, template: string, look: Look = { tag, label: tag }): Shape {
  const slots = templateSlots(template).filter((slot) => slot.name).map((slot): ShapeSlot => {
    const fallback = firstElement(slot.fallback);
    const name = fallback?.localName;
    const role: Role = name && HEADING.test(name) ? "title"
      : name === "img" || name === "picture" || (!name && slot.kind === "image") ? "image"
      : name === "a" || (!name && slot.kind === "link") ? "link" : "other";
    return { name: slot.name, role, fallback, kind: slot.kind as string };
  });
  if (!slots.some((slot) => slot.role === "title")) { const named = slots.find((slot) => slot.name === "title"); if (named) named.role = "title"; }
  // The body is the first text slot after the title, else the first text slot before it.
  const titleAt = slots.findIndex((slot) => slot.role === "title");
  const isText = (slot: ShapeSlot) => slot.role === "other" && slot.kind === "text" && Boolean(slot.fallback) && !HEADING.test(slot.fallback!.localName);
  const body = slots.find((slot, index) => index > titleAt && isText(slot)) ?? [...slots].reverse().find((slot, index) => slots.length - 1 - index < titleAt && isText(slot));
  if (body) body.role = "body";
  const seen = new Set<Role>();
  for (const slot of slots) { if (slot.role !== "other" && seen.has(slot.role)) slot.role = "other"; seen.add(slot.role); }
  const named = (role: Role) => slots.find((slot) => slot.role === role)?.name;
  return {
    look,
    noun: "card",
    component: { tag, slots },
    link: named("link") ? "slot" : "none",
    has: { title: named("title"), body: named("body"), image: named("image"), link: named("link") },
    others: slots.filter((slot) => slot.role === "other").map((slot) => ({ name: slot.name, text: squash(slot.fallback?.textContent) })),
  };
}

function htmlParts(root: Element) {
  const title = root.querySelector("h1,h2,h3,h4,h5,h6") ?? undefined;
  const after = (node: Element) => !title || Boolean(title.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const body = [...root.querySelectorAll("p")].find((p) => after(p) && !p.querySelector("a")) ?? undefined;
  const image = root.querySelector("img") ?? undefined;
  const link = root.querySelector("a[href]") ?? undefined;
  return { title, body, image, link };
}

export function shapeOf(look: Look): Shape {
  if (look.tag) return shapeFromTemplate(look.tag, componentSource(look.tag) ?? "", look);
  const root = firstElement(look.html!)!;
  const parts = htmlParts(root);
  const inTitle = parts.link && parts.title?.contains(parts.link) && parts.link.classList.contains("stretched");
  return {
    look,
    noun: "card",
    html: look.html,
    link: root.localName === "a" ? "wrapped" : parts.link && !inTitle ? "inner" : "none",
    has: { title: parts.title?.localName, body: parts.body ? "p" : undefined, image: parts.image ? "img" : undefined, link: root.localName === "a" ? "a (the card)" : parts.link && !inTitle ? "a" : undefined },
    others: [],
  };
}

// ---- Content by role: what a card holds, carried across looks. ----
export interface Content {
  /** Inner HTML (escaped text, inline markup kept). */
  title?: string;
  body?: string;
  image?: string;
  link?: string;
  linkText?: string;
  /** Other named slots, by name: the page's element (outer HTML). */
  extras: Record<string, string>;
}

export function pageContent(page: PageInfo): Content {
  return { title: escapeHtml(page.title), body: page.description ? escapeHtml(page.description) : undefined, image: page.image, link: page.route, linkText: escapeHtml(`Read about ${page.title}`), extras: {} };
}

/** What the card at `node` holds now, by its look's roles (fallbacks count as nothing). */
export function readCard(path: string, node: number[], look: Look): Content {
  const source = deps().source(path);
  const range = source !== undefined ? locateNativeElementRange(source, node) : undefined;
  const out: Content = { extras: {} };
  if (!source || !range) return out;
  const root = firstElement(source.slice(range.start, range.end));
  if (!root) return out;
  const shape = shapeOf(look);
  if (shape.component) {
    for (const child of [...root.children]) {
      const name = child.getAttribute("slot");
      const slot = shape.component.slots.find((entry) => entry.name === name);
      if (!slot) continue;
      const fallback = slot.fallback?.innerHTML.trim();
      if (slot.role === "title" && child.innerHTML.trim() !== fallback) out.title = child.innerHTML.trim();
      else if (slot.role === "body" && child.innerHTML.trim() !== fallback) out.body = child.innerHTML.trim();
      else if (slot.role === "image") out.image = child.getAttribute("src") ?? child.querySelector("img")?.getAttribute("src") ?? undefined;
      else if (slot.role === "link") { out.link = child.getAttribute("href") ?? undefined; out.linkText = child.innerHTML.trim(); }
      else if (slot.role === "other" && squash(child.textContent) !== squash(slot.fallback?.textContent)) out.extras[slot.name] = child.outerHTML;
    }
    return out;
  }
  const parts = htmlParts(root);
  const stretched = parts.title?.querySelector("a.stretched");
  const titleText = (stretched ?? parts.title)?.innerHTML.trim();
  if (titleText && !/^New card$/.test(titleText)) out.title = titleText;
  if (stretched) out.link = stretched.getAttribute("href") ?? undefined;
  if (parts.body && !/^A sentence or two about this/.test(squash(parts.body.textContent))) out.body = parts.body.innerHTML.trim();
  if (parts.image) out.image = parts.image.getAttribute("src") ?? undefined;
  if (root.localName === "a") out.link = root.getAttribute("href") || undefined;
  else if (parts.link && !stretched) { out.link = parts.link.getAttribute("href") || undefined; out.linkText = parts.link.innerHTML.trim(); }
  return out;
}

/** Content kept from earlier looks, with what the card holds now on top. */
export function mergeContent(kept: Content, now: Content): Content {
  const out: Content = { ...kept, extras: { ...kept.extras, ...now.extras } };
  for (const key of ["title", "body", "image", "link", "linkText"] as const) if (now[key]) out[key] = now[key];
  return out;
}

/** What `content` loses in `look`: roles and named slots it has no place for. */
export function dropped(content: Content, look: Look): string[] {
  const shape = shapeOf(look);
  const out: string[] = [];
  if (content.body && !shape.has.body) out.push("body (no text slot)");
  if (content.image && !shape.has.image) out.push("image (no image slot)");
  if (content.link && shape.link === "none" && !shape.html) out.push("link (no link slot)");
  for (const name of Object.keys(content.extras)) if (!shape.component?.slots.some((slot) => slot.name === name)) out.push(`${name} (no ${name} slot)`);
  return out;
}

// ---- Markup. ----

/**
 * One card in `look`, its slots filled from `content` by role (title, body,
 * image, link; other slots by name), the rest at their fallback or placeholder.
 * A plain item with no link of its own gets one on its title (`addLink`).
 */
export function cardMarkup(look: Look, indent: string, content: Content = { extras: {} }, addLink = true): string {
  const shape = shapeOf(look);
  if (shape.component) {
    const { tag, slots } = shape.component;
    const variant = look.variant ? ` ${look.variant.name}="${look.variant.value}"` : "";
    const lines = [`<${tag}${variant}>`];
    for (const slot of slots) {
      let out: Element | undefined;
      if (slot.role === "title" && content.title) { out = slot.fallback?.cloneNode(true) as Element ?? document.createElement("h3"); out.innerHTML = content.title; }
      else if (slot.role === "body" && content.body && slot.fallback) { out = slot.fallback.cloneNode(true) as Element; out.innerHTML = content.body; }
      else if (slot.role === "image" && content.image) {
        out = slot.fallback?.localName === "img" ? slot.fallback.cloneNode(true) as Element : document.createElement("img");
        out.setAttribute("src", content.image);
        out.setAttribute("alt", "");
      } else if (slot.role === "link" && content.link) { out = document.createElement("a"); out.setAttribute("href", content.link); out.innerHTML = content.linkText ?? "Read more"; }
      else if (slot.role === "other" && content.extras[slot.name]) out = firstElement(content.extras[slot.name]);
      if (!out && slot.fallback) out = slot.fallback.cloneNode(true) as Element;
      if (!out) continue;
      out.setAttribute("slot", slot.name);
      // `slot` first, as the starter writes it.
      const attrs = [...out.attributes].map((a) => [a.name, a.value] as const).sort(([a], [b]) => (a === "slot" ? -1 : b === "slot" ? 1 : 0));
      for (const [name] of attrs) out.removeAttribute(name);
      for (const [name, value] of attrs) out.setAttribute(name, value);
      lines.push(`  ${out.outerHTML}`);
    }
    lines.push(`</${tag}>`);
    return lines.join(`\n${indent}`);
  }
  const root = firstElement(shape.html!)!;
  const parts = htmlParts(root);
  const title = content.title ?? "New card";
  if (parts.title) {
    const inner = parts.title.querySelector("a");
    if (shape.link === "none" && content.link && addLink) parts.title.innerHTML = `<a href="${content.link}" class="stretched">${title}</a>`;
    else if (inner && !inner.classList.contains("stretched")) inner.innerHTML = title;
    else parts.title.innerHTML = title;
  }
  if (parts.body) parts.body.innerHTML = content.body ?? "A sentence or two about this card.";
  if (parts.image) {
    if (content.image) parts.image.setAttribute("src", content.image);
    parts.image.setAttribute("alt", "");
  }
  if (root.localName === "a") root.setAttribute("href", content.link ?? "");
  else if (parts.link && shape.link === "inner") { parts.link.setAttribute("href", content.link ?? ""); parts.link.innerHTML = content.linkText ?? "Read more"; }
  return root.outerHTML;
}

export const indentOf = (source: string, at: number) => {
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const lead = source.slice(lineStart, at);
  return /^[ \t]*$/.test(lead) ? lead : "";
};

/** Adds one card in `look` after the grid's last item as one undo step, selected; its node. */
export function addCard(now: GridNow, look: Look, message: string): number[] | undefined {
  const last = now.grid.items[now.grid.items.length - 1];
  const indent = indentOf(now.source, last.range.start);
  const edit = insertAfterEdit(now.source, last.range, cardMarkup(look, indent));
  const node = [...now.grid.parent, last.index + 1];
  return deps().change(now.path, now.source, [edit], node, message) ? node : undefined;
}

/** Writes the card at `node` again (fill, swap the look), as one undo step; a companion undoes more with it (a new page's draft). */
export function rewriteCard(path: string, node: number[], markup: (indent: string) => string, message: string, companion?: { undo(): void; redo(): void }): boolean {
  const source = deps().source(path);
  const range = source !== undefined ? locateNativeElementRange(source, node) : undefined;
  if (source === undefined || !range) return false;
  const text = markup(indentOf(source, range.start));
  if (!companion) return deps().change(path, source, [{ start: range.start, end: range.end, text }], node, message);
  const editor = deps().editor();
  if (!editor) return false;
  deps().preview()?.selectAfterUpdate({ path, node });
  editor.replaceActiveRange({ path, start: range.start, end: range.end, text, expected: source.slice(range.start, range.end) }, false, companion);
  deps().announce(message);
  return true;
}

/** The card's text now: a different text means it was undone or edited away. */
export function cardText(path: string, node: number[]): string | undefined {
  const source = deps().source(path);
  const range = source !== undefined ? locateNativeElementRange(source, node) : undefined;
  return range && source ? source.slice(range.start, range.end) : undefined;
}
export const cardPlain = (path: string, node: number[]) => { const text = cardText(path, node); return text === undefined ? undefined : plainText(text); };

// ---- The mapping rule, shown in the strip. ----
export interface Row {
  role: Role;
  label: string;
  slot?: string;
  from?: string;
  value?: string;
  status: "filled" | "kept" | "not-used" | "added" | "no-link";
  why?: string;
}

export function mapping(look: Look, page: PageInfo): Row[] {
  const shape = shapeOf(look);
  const named = shape.component ? `<${shape.component.tag}>` : "this card";
  const rows: Row[] = [];
  rows.push({ role: "title", label: "Title", slot: shape.has.title, from: page.titleFrom === "h1" ? "h1" : page.titleFrom === "<title>" ? "<title> (no h1)" : "address", value: page.title, status: shape.has.title ? "filled" : "not-used", why: shape.has.title ? undefined : "no heading" });
  rows.push(!shape.has.body
    ? { role: "body", label: "Body", status: "not-used", why: `${named} has no text slot` }
    : page.description
      ? { role: "body", label: "Body", slot: shape.has.body, from: "meta description", value: page.description, status: "filled" }
      : { role: "body", label: "Body", slot: shape.has.body, status: "kept", why: "page has no meta description" });
  rows.push(!shape.has.image
    ? { role: "image", label: "Image", value: page.image, status: "not-used", why: `${named} has no image slot` }
    : page.image
      ? { role: "image", label: "Image", slot: shape.has.image, from: "og:image", value: page.image, status: "filled" }
      : { role: "image", label: "Image", slot: shape.has.image, status: "kept", why: "page has no og:image" });
  if (shape.link === "none")
    rows.push({ role: "link", label: "Link", slot: "title → <a>", from: "address", value: page.route, status: "added", why: "the title becomes a stretched link" });
  else
    rows.push({ role: "link", label: "Link", slot: shape.has.link, from: "address", value: `${page.route}${shape.link !== "wrapped" ? `  “Read about ${page.title}”` : ""}`, status: "filled" });
  for (const other of shape.others) rows.push({ role: "other", label: other.name, slot: other.name, value: other.text || "(empty)", status: "kept", why: "the page can't fill it" });
  return rows;
}

const STATUS: Record<Row["status"], string> = { filled: "", kept: "kept", "not-used": "not used", added: "added", "no-link": "no link" };
export function mappingList(rows: Row[], options: { compact?: boolean } = {}) {
  const list = el("ul", `cb09-map${options.compact ? " cb09-map--compact" : ""}`);
  for (const row of rows) {
    const item = el("li", `cb09-map__row is-${row.status}`);
    const what = el("span", "cb09-map__what");
    if (row.status === "filled" || row.status === "added") {
      what.append(el("code", "cb09-map__from", row.from ?? ""), el("span", "cb09-map__value", row.value ?? ""));
      if (row.status === "added") what.append(el("span", "cb09-map__badge", "added"), el("span", "cb09-map__why", row.why ?? ""));
    } else {
      what.append(el("span", "cb09-map__badge", STATUS[row.status]));
      if (row.value && row.status === "kept") what.append(el("span", "cb09-map__value", `“${row.value}”`));
      if (row.why) what.append(el("span", "cb09-map__why", row.why));
    }
    item.append(el("span", "cb09-map__slot", row.label), el("span", "cb09-map__arrow", row.status === "filled" || row.status === "added" ? "←" : "·"), what);
    list.append(item);
  }
  return list;
}

// ---- The preview frame: rects by node path, one stylesheet (a prototype message in native-preview-runtime.js). ----
export interface Rect { x: number; y: number; w: number; h: number }
export const frame = () => document.querySelector<HTMLIFrameElement>(".native-preview-frame");
let ids = 0;
const waiting = new Map<number, (rects: (Rect | null)[]) => void>();
window.addEventListener("message", (event) => {
  const data = event.data as { source?: string; id?: number; rects?: (Rect | null)[] } | undefined;
  if (data?.source !== "cb09-proto" || data.id === undefined) return;
  waiting.get(data.id)?.(data.rects ?? []);
  waiting.delete(data.id);
});
// The scratch grid's look (its markup is plain: the starter has no .card rule).
export const FRAME_CSS = `
#cb09-scratch .card { display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: var(--surface, #fff); border: 1px dashed #d97706; }
#cb09-scratch .card img { display: block; width: 100%; height: 120px; object-fit: cover; border-radius: 10px; background: var(--line, #ddd); }
#cb09-scratch .card h3 { margin: 0; font-size: 1.25rem; }
#cb09-scratch .card p { margin: 0; color: var(--muted, #555); }
#cb09-scratch .cb09-tag { display: inline-block; justify-self: start; width: fit-content; padding: 2px 8px; border-radius: 6px; background: #facc15; color: #111; font: 700 11px/1.4 ui-monospace, monospace; vertical-align: middle; }
`;
export function frameRects(path: string, nodes: number[][], reveal?: number[], block?: "start" | "center"): Promise<(Rect | null)[]> {
  const f = frame();
  if (!f?.contentWindow) return Promise.resolve(nodes.map(() => null));
  const id = ++ids;
  const box = f.getBoundingClientRect();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(nodes.map(() => null)); }, 1000);
    waiting.set(id, (rects) => {
      clearTimeout(timer);
      resolve(rects.map((r) => (r ? { x: r.x + box.left, y: r.y + box.top, w: r.w, h: r.h } : null)));
    });
    f.contentWindow!.postMessage({ source: "astro-native-preview-host", type: "cb09", id, path, nodes, reveal, block, css: FRAME_CSS }, "*");
  });
}

// ---- Test material made at load: draft pages, card components, a scratch grid. ----
export const DRAFT_PAGES = [
  { file: "work/orchard-bakery/index.html", route: "/work/orchard-bakery/", title: "Orchard Bakery", description: "An order form and a weekly bread list for a village bakery, updated from a phone before the first bake.", image: "/images/studio-desk.svg", h1: true },
  { file: "work/quiet-lane-books/index.html", route: "/work/quiet-lane-books/", title: "Quiet Lane Books", description: "", image: "", h1: false },
];

export function draftPageDocument(page: (typeof DRAFT_PAGES)[number]): string {
  const site = (deps().siteUrl() ?? "").replace(/\/$/, "");
  return [
    "<!doctype html>", '<html lang="en-GB">', "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(page.title)} · Larkspur Studio</title>`,
    ...(page.description ? [`  <meta name="description" content="${page.description}">`] : []),
    '  <meta name="robots" content="noindex">',
    `  <link rel="canonical" href="${site}${page.route}">`,
    ...(page.image ? [`  <meta property="og:image" content="${site}${page.image}">`] : []),
    '  <link rel="stylesheet" href="/styles/site.css">',
    '  <script type="module" src="/components/components.js"></script>',
    "</head>", "<body>", "  <site-header></site-header>", '  <main class="page" id="main">', '    <section class="hero flow">',
    '      <card-note><p slot="text">PROTOTYPE cb09 draft page</p></card-note>',
    page.h1 ? `      <h1>${escapeHtml(page.title)}</h1>` : '      <p class="lead">This draft page has no h1, no meta description and no og:image: its card takes the title from &lt;title&gt; and keeps the rest.</p>',
    ...(page.h1 ? ['      <p class="lead">Made by the cb09 prototype at load, so there is a page under /work/ that is not in the grid yet.</p>'] : []),
    "    </section>", "  </main>", "  <site-footer></site-footer>", "</body>", "</html>", "",
  ].join("\n");
}

/** Two more card components (round 2), as draft files, in the starter's style and tokens. */
export const DRAFT_COMPONENTS: { path: string; content: string }[] = [
  {
    path: "components/card-feature/card-feature.html",
    content: `<!-- PROTOTYPE cb09 draft component: a card with its image on top. -->
<article>
  <slot name="image"><img src="/images/social-card.png" alt=""></slot>
  <div class="text">
    <slot name="title"><h3>Untitled feature</h3></slot>
    <slot name="body"><p class="body">A sentence or two about this feature.</p></slot>
    <p class="actions"><slot name="link"></slot></p>
  </div>
</article>
`,
  },
  {
    path: "components/card-feature/card-feature.css",
    content: `/* PROTOTYPE cb09 draft component: image on top, then title, text and link. */
:host {
  display: block;
}

article {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-l);
  background: var(--surface);
  border: 1px solid var(--line);
}

img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--line);
}

.text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-l);
}

h3 {
  margin: 0;
  font-size: var(--text-xl);
  line-height: 1.3;
}

p {
  margin: 0;
}

.body {
  color: var(--muted);
  line-height: 1.55;
}

.actions {
  margin-top: auto;
  padding-top: var(--space-3xs);
  font-weight: 600;
}

.actions a {
  color: var(--accent);
}
`,
  },
  {
    path: "components/card-quote/card-quote.html",
    content: `<!-- PROTOTYPE cb09 draft component: a quote-style card, no image. -->
<figure>
  <slot name="body"><p class="quote">A line or two worth quoting.</p></slot>
  <figcaption>
    <slot name="title"><h3>Who said it</h3></slot>
    <slot name="link"></slot>
  </figcaption>
</figure>
`,
  },
  {
    path: "components/card-quote/card-quote.css",
    content: `/* PROTOTYPE cb09 draft component: the text as a quote, the title under it. */
:host {
  display: block;
}

figure {
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-l);
  border-radius: var(--radius-l);
  background: color-mix(in oklch, var(--accent) 7%, var(--surface));
  border-left: 4px solid var(--accent);
}

.quote {
  margin: 0;
  font-size: var(--text-l);
  line-height: 1.5;
  font-style: italic;
}

figcaption {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
}

h3 {
  margin: 0;
  font-size: var(--text-m);
}

a {
  color: var(--accent);
  font-weight: 600;
}
`,
  },
];

/** card-project's two layout variants (ticket 07), added to its CSS as a draft edit. */
export const CARD_PROJECT_VARIANTS = `
/* PROTOTYPE cb09: two layout variants for the look picker (ticket 07). */
:host([data-layout="compact"]) article {
  padding: var(--space-s);
  gap: var(--space-3xs);
}

:host([data-layout="compact"]) h3 {
  font-size: var(--text-l);
}

:host([data-layout="compact"]) .body {
  font-size: var(--text-s);
}

:host([data-layout="wide"]) {
  grid-column: span 2;
}

:host([data-layout="wide"]) article {
  background: color-mix(in oklch, var(--accent) 6%, var(--surface));
}

:host([data-layout="wide"]) h3 {
  font-size: var(--text-2xl);
}
`;

export const SCRATCH = `<section class="flow" id="cb09-scratch">
  <h2>Shop</h2>
  <p class="cb09-tag">PROTOTYPE cb09 scratch grid: these cards are not links</p>
  <div class="cards">
    <article class="card">
      <img src="/images/social-card.png" alt="">
      <h3>Seed packets</h3>
      <p>Heritage tomato and bean seeds, packed by hand.</p>
    </article>
    <article class="card">
      <img src="/images/social-card.png" alt="">
      <h3>Plot map print</h3>
      <p>The allotment plan as an A3 print for the shed wall.</p>
    </article>
  </div>
</section>`;
