// PROTOTYPE (wayfinder ticket 09, components-and-builder). Throwaway; not kept for the real build.
//
// The model behind all three variants: the grid as the source has it, the
// pages it could get a card for (siblings under its parent URL first), what
// each page offers (h1 else <title>, meta description, og:image, address),
// the card's shape (a component's slots from its template, or a plain item's
// elements), the mapping rule, and the card markup. Writes go through the
// cards module's own deps (one verified page edit = one undo step).

import type { CardsDeps } from "../page-builder/cards";
import type { ItemGridReport } from "../components/card-grid-controls";
import { gridAt, type GridContext, type SourceGrid } from "../page-builder/card-source";
import { insertAfterEdit, plainText } from "../page-builder/card-grid";
import { templateSlots } from "../page-builder/component-model";
import { locateNativeElementRange } from "../native-source-location";

export const state: { deps?: CardsDeps } = {};
export const deps = () => state.deps!;

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
export function toast(text: string, rows?: Row[]) {
  toastEl?.remove();
  toastEl = el("div", "cb09-toast");
  toastEl.setAttribute("role", "status");
  toastEl.append(el("strong", "", text));
  if (rows) toastEl.append(mappingList(rows, { compact: true }));
  toastEl.title = "Click to dismiss";
  toastEl.addEventListener("click", () => toastEl?.remove());
  document.body.append(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.remove(), 14000);
}

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
const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

export function pageInfo(route: string, file: string): PageInfo {
  const source = deps().source(file) ?? "";
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
const isDraft = (file: string) => DRAFT_PAGES.some((page) => page.file === file);

export interface PageChoice extends PageInfo { present: boolean }
export interface PageGroup { label: string; pages: PageChoice[] }

/** The pages a grid could get a card for: under its parent URL first, then all others (not the grid's own page, not 404). */
export function pageGroups(now: GridNow, query = ""): PageGroup[] {
  const present = new Set(now.grid.items.map((item) => item.route).filter(Boolean));
  const parent = now.grid.collection;
  const q = query.trim().toLowerCase();
  const all = Object.entries(routes())
    .filter(([route, file]) => file !== now.path && !/(^|\/)404\.html$/.test(file) && route !== "/404.html")
    .map(([route, file]) => ({ ...pageInfo(route, file), present: present.has(route) }))
    .filter((page) => !q || page.title.toLowerCase().includes(q) || page.route.toLowerCase().includes(q))
    .sort((a, b) => a.route.localeCompare(b.route));
  if (!parent) return all.length ? [{ label: "All pages", pages: all }] : [];
  const under = all.filter((page) => page.route.startsWith(parent));
  const other = all.filter((page) => !page.route.startsWith(parent));
  return [
    ...(under.length ? [{ label: `Under ${parent}`, pages: under }] : []),
    ...(other.length ? [{ label: "Other pages", pages: other }] : []),
  ];
}

// ---- The card's shape. ----
export type Role = "title" | "body" | "image" | "link" | "other";
interface ShapeSlot { name: string; role: Role; fallback?: Element; kind: string }
export interface Shape {
  noun: string;
  /** A component's card: its tag and slots in template order. */
  component?: { tag: string; slots: ShapeSlot[] };
  /** A plain item's card: the last item's markup. */
  html?: string;
  /** Where the address goes: a link slot, a link inside the card, the card itself (link-wrapped), or nowhere. */
  link: "slot" | "inner" | "wrapped" | "none";
  has: Record<Exclude<Role, "other">, string | undefined>;
  others: { name: string; text: string }[];
}

const HEADING = /^h[1-6]$/;
function fallbackElement(html: string): Element | undefined {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild ?? undefined;
}

export function shapeOf(now: GridNow): Shape {
  const tag = now.grid.kind.split(".")[0];
  const file = tag.includes("-") ? deps().site()?.components[tag] : undefined;
  const template = file ? deps().source(file) : undefined;
  if (template !== undefined) {
    const slots = templateSlots(template).filter((slot) => slot.name).map((slot): ShapeSlot => {
      const fallback = fallbackElement(slot.fallback);
      const name = fallback?.localName;
      const role: Role = name && HEADING.test(name) ? "title"
        : name === "img" || name === "picture" || (!name && slot.kind === "image") ? "image"
        : name === "a" || (!name && slot.kind === "link") ? "link" : "other";
      return { name: slot.name, role, fallback, kind: slot.kind as string };
    });
    if (!slots.some((slot) => slot.role === "title")) { const named = slots.find((slot) => slot.name === "title"); if (named) named.role = "title"; }
    // The body is the first text slot after the title.
    const titleAt = slots.findIndex((slot) => slot.role === "title");
    const body = slots.find((slot, index) => index > titleAt && slot.role === "other" && slot.kind === "text" && slot.fallback && !HEADING.test(slot.fallback.localName));
    if (body) body.role = "body";
    // Only the first of each role is filled.
    const seen = new Set<Role>();
    for (const slot of slots) { if (slot.role !== "other" && seen.has(slot.role)) slot.role = "other"; seen.add(slot.role); }
    const named = (role: Role) => slots.find((slot) => slot.role === role)?.name;
    return {
      noun: now.grid.noun,
      component: { tag, slots },
      link: named("link") ? "slot" : "none",
      has: { title: named("title"), body: named("body"), image: named("image"), link: named("link") },
      others: slots.filter((slot) => slot.role === "other").map((slot) => ({ name: slot.name, text: squash(slot.fallback?.textContent) })),
    };
  }
  const last = now.grid.items[now.grid.items.length - 1];
  const html = now.source.slice(last.range.start, last.range.end);
  const root = fallbackElement(html)!;
  const parts = htmlParts(root);
  return {
    noun: now.grid.noun,
    html,
    link: root.localName === "a" ? "wrapped" : parts.link ? "inner" : "none",
    has: { title: parts.title?.localName, body: parts.body ? "p" : undefined, image: parts.image ? "img" : undefined, link: root.localName === "a" ? "a (the card)" : parts.link ? "a" : undefined },
    others: [],
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

// ---- The mapping rule. ----
export interface Row {
  role: Role;
  /** "Title", "Body", "Image", "Link", or a kept slot's name. */
  label: string;
  /** The slot or element it goes into. */
  slot?: string;
  from?: string;
  value?: string;
  status: "filled" | "kept" | "not-used" | "added" | "no-link" | "kept-by-user";
  why?: string;
}

export interface FillOptions {
  /** What a grid with no links does with the address: add a link (C), leave it out (B). */
  noLink?: "add" | "leave";
  /** Roles the user put back to their placeholder (C). */
  kept?: Set<Role>;
}

export function mapping(shape: Shape, page: PageInfo, options: FillOptions = {}): Row[] {
  const kept = options.kept ?? new Set<Role>();
  const rows: Row[] = [];
  const userKept = (role: Role, row: Row): Row => (kept.has(role) && (row.status === "filled" || row.status === "added") ? { ...row, status: "kept-by-user", why: undefined } : row);
  rows.push(userKept("title", { role: "title", label: "Title", slot: shape.has.title, from: page.titleFrom === "h1" ? "h1" : page.titleFrom === "<title>" ? "<title> (no h1)" : "address (no h1, no <title>)", value: page.title, status: shape.has.title ? "filled" : "not-used", why: shape.has.title ? undefined : "card has no heading" }));
  rows.push(userKept("body", !shape.has.body
    ? { role: "body", label: "Body", status: "not-used", why: "card has no text slot after its title" }
    : page.description
      ? { role: "body", label: "Body", slot: shape.has.body, from: "meta description", value: page.description, status: "filled" }
      : { role: "body", label: "Body", slot: shape.has.body, status: "kept", why: "page has no meta description" }));
  rows.push(userKept("image", !shape.has.image
    ? { role: "image", label: "Image", from: page.image ? "og:image" : undefined, value: page.image, status: "not-used", why: `${shape.component ? `<${shape.component.tag}>` : "card"} has no image slot` }
    : page.image
      ? { role: "image", label: "Image", slot: shape.has.image, from: "og:image", value: page.image, status: "filled" }
      : { role: "image", label: "Image", slot: shape.has.image, status: "kept", why: "page has no og:image" }));
  if (shape.link === "none" && options.noLink !== "add")
    rows.push({ role: "link", label: "Link", value: page.route, status: "no-link", why: "cards here aren't links: no link is added" });
  else if (shape.link === "none")
    rows.push(userKept("link", { role: "link", label: "Link", slot: "title → <a>", from: "address", value: page.route, status: "added", why: "added: the title becomes a stretched link" }));
  else
    rows.push(userKept("link", { role: "link", label: "Link", slot: shape.link === "wrapped" ? "the card's href (stretched)" : shape.has.link, from: "address", value: `${page.route}${shape.link === "slot" || shape.link === "inner" ? `  “Read about ${page.title}”` : ""}`, status: "filled" }));
  for (const other of shape.others) rows.push({ role: "other", label: other.name, slot: other.name, value: other.text || "(empty)", status: "kept", why: "the page can't fill it" });
  return rows;
}

// ---- Markup. ----
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One card: blank (fallbacks, placeholders) without a page, else filled from it by the rule. */
export function cardMarkup(shape: Shape, indent: string, page?: PageInfo, options: FillOptions = {}): string {
  const fill = (role: Role) => Boolean(page) && !(options.kept?.has(role));
  if (shape.component) {
    const { tag, slots } = shape.component;
    const lines = [`<${tag}>`];
    for (const slot of slots) {
      let out: Element | undefined;
      if (page && fill(slot.role)) {
        if (slot.role === "title") { out = slot.fallback?.cloneNode(true) as Element ?? document.createElement("h3"); out.textContent = page.title; }
        else if (slot.role === "body" && page.description) { out = slot.fallback!.cloneNode(true) as Element; out.textContent = page.description; }
        else if (slot.role === "image" && page.image) { out = document.createElement("img"); out.setAttribute("src", page.image); out.setAttribute("alt", ""); }
        else if (slot.role === "link") { out = document.createElement("a"); out.setAttribute("href", page.route); out.textContent = `Read about ${page.title}`; }
      }
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
  const root = fallbackElement(shape.html!)!;
  const parts = htmlParts(root);
  const title = page && fill("title") ? page.title : `New ${shape.noun}`;
  if (parts.title) {
    const inner = parts.title.querySelector("a");
    (inner ?? parts.title).textContent = title;
    if (page && shape.link === "none" && options.noLink === "add" && fill("link"))
      parts.title.innerHTML = `<a href="${page.route}" class="stretched">${escapeHtml(title)}</a>`;
  }
  if (parts.body) parts.body.textContent = page?.description && fill("body") ? page.description : `A sentence or two about this ${shape.noun}.`;
  if (parts.image) {
    if (page?.image && fill("image")) parts.image.setAttribute("src", page.image);
    parts.image.setAttribute("alt", "");
  }
  const href = page && fill("link") ? page.route : "";
  if (root.localName === "a") root.setAttribute("href", href);
  else if (parts.link && !parts.title?.contains(parts.link)) { parts.link.setAttribute("href", href); parts.link.textContent = page && fill("link") ? `Read about ${page.title}` : "Read more"; }
  else if (parts.link) parts.link.setAttribute("href", href);
  return root.outerHTML;
}

const indentOf = (source: string, at: number) => {
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const lead = source.slice(lineStart, at);
  return /^[ \t]*$/.test(lead) ? lead : "";
};

/** Adds cards (blank or from pages, in order) after the grid's last item as one undo step; selects the first. */
export function addCards(now: GridNow, pages: (PageInfo | undefined)[], options: FillOptions, message: string): number[] | undefined {
  const shape = shapeOf(now);
  const last = now.grid.items[now.grid.items.length - 1];
  const indent = indentOf(now.source, last.range.start);
  const text = pages.map((page) => cardMarkup(shape, indent, page, options)).join(`\n${indent}`);
  const edit = insertAfterEdit(now.source, last.range, text);
  const node = [...now.grid.parent, last.index + 1];
  return deps().change(now.path, now.source, [edit], node, message) ? node : undefined;
}

/** Writes the card at `node` again (C: fill, keep placeholder), as one undo step. */
export function rewriteCard(path: string, node: number[], markup: (indent: string) => string, message: string): boolean {
  const source = deps().source(path);
  const range = source !== undefined ? locateNativeElementRange(source, node) : undefined;
  if (source === undefined || !range) return false;
  const text = markup(indentOf(source, range.start));
  return deps().change(path, source, [{ start: range.start, end: range.end, text }], node, message);
}

/** The card at `node` is still the one written (its title text), so an overlay can follow it. */
export function cardText(path: string, node: number[]): string | undefined {
  const source = deps().source(path);
  const range = source !== undefined ? locateNativeElementRange(source, node) : undefined;
  return range && source ? plainText(source.slice(range.start, range.end)) : undefined;
}

/** Selects the item of `now` that links to `route`. */
export function selectPresent(now: GridNow, route: string) {
  const item = now.grid.items.find((entry) => entry.route === route);
  if (item) deps().preview()?.selectNode({ path: now.path, node: [...now.grid.parent, item.index] });
}

// ---- Mapping list (all variants). ----
const STATUS: Record<Row["status"], string> = { filled: "", kept: "kept", "not-used": "not used", added: "added", "no-link": "no link", "kept-by-user": "placeholder kept" };
export function mappingList(rows: Row[], options: { compact?: boolean; onToggle?: (row: Row) => void } = {}) {
  const list = el("ul", `cb09-map${options.compact ? " cb09-map--compact" : ""}`);
  for (const row of rows) {
    const item = el("li", `cb09-map__row is-${row.status}`);
    const left = el("span", "cb09-map__slot", row.label);
    const arrow = el("span", "cb09-map__arrow", row.status === "filled" || row.status === "added" ? "←" : "·");
    const what = el("span", "cb09-map__what");
    if (row.status === "filled" || row.status === "added") {
      what.append(el("code", "cb09-map__from", row.from ?? ""), el("span", "cb09-map__value", row.value ?? ""));
      if (row.status === "added") what.append(el("span", "cb09-map__badge", "added"));
    } else {
      what.append(el("span", "cb09-map__badge", STATUS[row.status]));
      if (row.value && row.status === "kept") what.append(el("span", "cb09-map__value", `“${row.value}”`));
      if (row.why) what.append(el("span", "cb09-map__why", row.why));
    }
    item.append(left, arrow, what);
    if (options.onToggle && (row.status === "filled" || row.status === "added" || row.status === "kept-by-user") && row.role !== "other") {
      const toggle = btn(row.status === "kept-by-user" ? "Use page" : "Keep placeholder", () => options.onToggle!(row), "cb09-map__toggle");
      item.append(toggle);
    }
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

// ---- Draft pages and the scratch grid made at load. ----
export const DRAFT_PAGES = [
  { file: "work/orchard-bakery/index.html", route: "/work/orchard-bakery/", title: "Orchard Bakery", description: "An order form and a weekly bread list for a village bakery, updated from a phone before the first bake.", image: "/images/studio-desk.svg", h1: true },
  { file: "work/quiet-lane-books/index.html", route: "/work/quiet-lane-books/", title: "Quiet Lane Books", description: "", image: "", h1: false },
];

export function draftPageDocument(page: (typeof DRAFT_PAGES)[number]): string {
  const site = (deps().siteUrl() ?? "").replace(/\/$/, "");
  const head = [
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
  ];
  return head.join("\n");
}

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
