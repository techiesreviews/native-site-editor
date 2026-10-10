// Repeated items (cards, list items, links in a row) and the subpages a
// grid of them links to: the plain-text rules behind "Add card" and "New
// page + card". No DOM and no I/O, so every rule here is unit tested
// (tests/card-grid.test.ts); src/page-builder/card-source.ts applies them
// to a page's parsed source and src/page-builder/cards.ts to the editor.
//
// The shared item kinds and repeated-run rule live in rules/items.ts;
// card-source.ts applies them to source and the preview runtime to the DOM.
//
// The source is the collection: a grid whose items link to pages under one
// parent URL (`/work/fern-and-kettle/`, `/work/harbour-lane-pottery/`) is a
// collection of those pages, with no data file anywhere.

import { startTags, VOID_ELEMENTS, startTagAttribute, type StartTag } from "../../shared/html-source";
import { isFolderRoute } from "../../shared/native-routes";
import { INLINE_FORMATTING } from "./rules/text-level";

// Words that name an item, preferred in this order when a tag or class has several.
const NOUNS = ["card", "tile", "post", "article", "project", "member", "person", "testimonial", "quote", "feature", "plan", "product", "step", "slide", "logo", "column", "entry", "item", "link"];

/** What an item is called in the editor ("card" for `<card-project>` or `div.card`, "item" for `<li>`). */
export function itemNoun(kind: string): string {
  const [tag, ...classes] = kind.split(".");
  const words = [...tag.split("-"), ...classes.flatMap((name) => name.split(/[-_]+/))].map((word) => word.toLowerCase());
  for (const noun of NOUNS) if (words.includes(noun) || words.includes(`${noun}s`)) return noun;
  if (tag === "li" || tag === "dd") return "item";
  if (tag === "a") return "link";
  if (tag === "figure") return "figure";
  if (tag === "blockquote") return "quote";
  return "item";
}

/** A noun with its article: "a card", "an item". */
export function aOr(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/**
 * The parent URL a grid's items link under, when the grid is a collection
 * of subpages: every item with a link to a folder page (`routes[i]`, the
 * route its link goes to, or none) goes to a different page right under one
 * parent other than the top of the site, and at least two do. None
 * otherwise.
 */
export function collectionParent(routes: (string | undefined)[]): string | undefined {
  const linked = routes.filter((route): route is string => Boolean(route));
  // Two different pages at least; a duplicated card (two links to one page) does not undo that.
  if (new Set(linked).size < 2) return undefined;
  const parents = new Set(linked.map((route) => (isFolderRoute(route) ? parentOf(route) : undefined)));
  if (parents.size !== 1) return undefined;
  const [parent] = parents;
  return parent && parent !== "/" ? parent : undefined;
}

function parentOf(route: string): string | undefined {
  const trimmed = route.replace(/\/$/, "");
  const at = trimmed.lastIndexOf("/");
  return at < 0 ? undefined : trimmed.slice(0, at + 1);
}

// ---- A small element tree over a stretch of source ----

/** An element of a source stretch, with offsets into the whole source. */
export interface SourceElement {
  name: string;
  tag: StartTag;
  /** Outer range. */
  start: number;
  end: number;
  /** Content range (equal for a void element). */
  innerStart: number;
  innerEnd: number;
  children: SourceElement[];
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);

/**
 * The elements of `source` between `from` and `to` as a tree, from their
 * start and end tags. Undefined when an element is not closed by its own
 * end tag (an implied end, `<li>` with no `</li>`), since a guessed tree
 * would edit the wrong text.
 */
export function elementTree(source: string, from = 0, to = source.length): SourceElement[] | undefined {
  const byStart = new Map(startTags(source).filter((tag) => tag.start >= from && tag.start < to).map((tag) => [tag.start, tag]));
  const roots: SourceElement[] = [];
  const stack: SourceElement[] = [];
  let i = from;
  while (i < to) {
    const lt = source.indexOf("<", i);
    if (lt < 0 || lt >= to) break;
    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt + 4);
      i = close < 0 ? to : close + 3;
      continue;
    }
    const tag = byStart.get(lt);
    if (tag) {
      const element: SourceElement = { name: tag.name, tag, start: tag.start, end: tag.end, innerStart: tag.end, innerEnd: tag.end, children: [] };
      (stack.at(-1)?.children ?? roots).push(element);
      if (VOID_ELEMENTS.has(tag.name)) {
        i = tag.end;
        continue;
      }
      if (RAW_TEXT.has(tag.name)) {
        const close = source.toLowerCase().indexOf(`</${tag.name}`, tag.end);
        if (close < 0 || close >= to) return undefined;
        const gt = source.indexOf(">", close);
        element.innerEnd = close;
        element.end = gt + 1;
        i = gt + 1;
        continue;
      }
      stack.push(element);
      i = tag.end;
      continue;
    }
    const end = /^<\/([a-zA-Z][^\s/>]*)\s*>/.exec(source.slice(lt, Math.min(to, lt + 200)));
    if (end) {
      const name = end[1].toLowerCase();
      const open = stack.at(-1);
      if (!open || open.name !== name) return undefined;
      stack.pop();
      open.innerEnd = lt;
      open.end = lt + end[0].length;
      i = open.end;
      continue;
    }
    i = lt + 1;
  }
  return stack.length ? undefined : roots;
}

/** The text of a stretch of markup: tags and comments dropped, entities decoded, spaces collapsed. */
export function plainText(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (whole, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named[name.toLowerCase()] ?? whole;
  });
}

/** `text` safe as element content. */
export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A text leaf: an element holding text and inline markup only (a heading,
 * a paragraph, a link, a `<card-note>` with text in it), the unit whose
 * text a copy resets. Leaves are found from the top down, so a link in a
 * paragraph is part of the paragraph's leaf.
 */
export function textLeaves(source: string, elements: SourceElement[]): SourceElement[] {
  const out: SourceElement[] = [];
  const inlineOnly = (element: SourceElement): boolean => element.children.every((child) => INLINE_FORMATTING.has(child.name) && inlineOnly(child));
  const visit = (element: SourceElement) => {
    // Scripts, styles and templates are not text to reset: they stay as written.
    if (VOID_ELEMENTS.has(element.name) || RAW_TEXT.has(element.name) || element.name === "template") return;
    if (inlineOnly(element) && plainText(source.slice(element.innerStart, element.innerEnd))) {
      out.push(element);
      return;
    }
    element.children.forEach(visit);
  };
  elements.forEach(visit);
  return out;
}

/** Every element in `elements` and under them, in source order. */
export function allElements(elements: SourceElement[]): SourceElement[] {
  const out: SourceElement[] = [];
  const visit = (element: SourceElement) => {
    out.push(element);
    element.children.forEach(visit);
  };
  elements.forEach(visit);
  return out;
}

const attribute = (source: string, element: SourceElement, name: string) => startTagAttribute(source, element.tag, name)?.value;

// ---- A card's copy ----

/** What the copy of an item says. */
export interface ItemCopyOptions {
  /** Filling a placed card keeps its non-link text until a page fact replaces it. */
  keepText?: boolean;
  /** What items are called ("card"). */
  noun: string;
  /** The title the copy gets; else its title's slot fallback, else "New card". */
  title?: string;
  /** The page the item's link goes to (`linked`), and where the copy's goes instead: a route, or "" for no address yet. */
  linked?: string;
  href?: string;
  /** Whether an `href` is the item's own link (resolves to `linked`). */
  isLinked?: (href: string) => boolean;
  /** The text a component shows for each slot when the page fills none (its template's fallback). */
  fallbacks?: Record<string, string>;
}

/** Text edits on a source, as ranges of it. */
interface Edit { start: number; end: number; text: string }

function applyEdits(source: string, edits: Edit[]) {
  let text = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/** The title leaf of an item: its `slot="title"` element, else its first heading, else the item itself when it is a leaf. */
export function titleLeaf(source: string, item: SourceElement, leaves = textLeaves(source, [item])): SourceElement | undefined {
  return leaves.find((leaf) => attribute(source, leaf, "slot") === "title")
    ?? leaves.find((leaf) => /^h[1-6]$/.test(leaf.name))
    ?? (leaves[0] === item ? item : undefined);
}

/** The item's title as text: the text of its title leaf. */
export function itemTitle(source: string, item: SourceElement): string | undefined {
  const leaf = titleLeaf(source, item);
  return leaf ? plainText(source.slice(leaf.innerStart, leaf.innerEnd)) || undefined : undefined;
}

/** A placeholder for a leaf whose text is reset, by what the leaf is. */
export function placeholderFor(tag: string, noun: string, about = `this ${noun}`): string {
  if (/^h[1-6]$/.test(tag)) return "Heading";
  if (tag === "p" || tag === "blockquote" || tag === "dd") return `A sentence or two about ${about}.`;
  if (tag === "li") return `New ${noun}`;
  if (tag === "figcaption") return "Caption";
  if (tag === "a") return "Link text";
  return "Text";
}

/** Edits to the text runs (between tags and comments) of `source` from `start` to `end`, each run passed through `change`. */
function textRunEdits(source: string, start: number, end: number, change: (run: string) => string): Edit[] {
  const edits: Edit[] = [];
  const pattern = /<!--[\s\S]*?-->|<[^>]*>/g;
  const inner = source.slice(start, end);
  let from = 0;
  const run = (to: number) => {
    const text = inner.slice(from, to);
    const next = change(text);
    if (next !== text) edits.push({ start: start + from, end: start + to, text: next });
  };
  for (const match of inner.matchAll(pattern)) {
    run(match.index);
    from = match.index + match[0].length;
  }
  run(inner.length);
  return edits;
}

/** Replaces each occurrence of `title` (as written or escaped) in a leaf's inner markup. */
function withTitle(inner: string, from: string | undefined, to: string) {
  if (!from) return inner;
  const escaped = escapeText(from);
  let text = inner.split(escaped).join(escapeText(to));
  if (escaped !== from) text = text.split(from).join(escapeText(to));
  return text;
}

/**
 * The copy of an item for "Add card": the item's own markup (tags,
 * attributes, indentation and line breaks as written) with its text reset.
 * Its title leaf says `title` (or the slot's fallback, else "New card");
 * a leaf that is or holds a link keeps its words with the item's old title
 * swapped for the new one ("Read about Fern & Kettle" → "Read about
 * Oak & Ash"); every other leaf says its slot's fallback, else a
 * placeholder for its kind (`placeholderFor`). Links to the item's page go to
 * `href` instead. Undefined when the item's markup is not a clean tree.
 */
export function itemCopy(source: string, item: SourceElement, options: ItemCopyOptions): string | undefined {
  const leaves = textLeaves(source, [item]);
  const titleAt = titleLeaf(source, item, leaves);
  const oldTitle = titleAt ? plainText(source.slice(titleAt.innerStart, titleAt.innerEnd)) : undefined;
  const slotOf = (leaf: SourceElement) => attribute(source, leaf, "slot");
  const titleText = options.title?.trim()
    || (titleAt && slotOf(titleAt) && options.fallbacks?.[slotOf(titleAt)!])
    || `New ${options.noun}`;
  const edits: Edit[] = [];
  for (const leaf of leaves) {
    const slot = slotOf(leaf);
    let text: string;
    if (leaf === titleAt) {
      // The title keeps a wrapping link (`<h3><a href>Title</a></h3>`), with only its words changed.
      const only = leaf.children.length === 1 && leaf.children[0].name === "a" && !plainText(source.slice(leaf.innerStart, leaf.children[0].start) + source.slice(leaf.children[0].end, leaf.innerEnd))
        ? leaf.children[0] : undefined;
      edits.push({ start: (only ?? leaf).innerStart, end: (only ?? leaf).innerEnd, text: escapeText(titleText) });
      continue;
    } else if (leaf.name === "a" || allElements(leaf.children).some((child) => child.name === "a")) {
      // Only its words change, run by run between tags, so a link's address is left to the link pass below.
      edits.push(...textRunEdits(source, leaf.innerStart, leaf.innerEnd, (run) => withTitle(run, oldTitle, titleText)));
      continue;
    } else if (options.keepText) {
      continue;
    } else if (slot && options.fallbacks?.[slot]) {
      text = escapeText(options.fallbacks[slot]);
    } else {
      text = escapeText(placeholderFor(leaf.name, options.noun));
    }
    edits.push({ start: leaf.innerStart, end: leaf.innerEnd, text });
  }
  // Links to the item's own page go to the new one (or nowhere yet).
  // Not inside a leaf whose whole content was replaced.
  const inRemoved = (at: number) => edits.some((edit) => at >= edit.start && at < edit.end);
  if (options.href !== undefined)
    for (const element of allElements([item])) {
      if (element.name !== "a" || inRemoved(element.start)) continue;
      const href = startTagAttribute(source, element.tag, "href");
      if (!href || !source.slice(href.start, href.end).includes("=") || (options.isLinked && !options.isLinked(href.value))) continue;
      edits.push(hrefEdit(href, options.href));
    }
  // Applied to the item's own markup.
  const own = edits
    .map((edit) => ({ start: Math.max(edit.start, item.start) - item.start, end: Math.min(edit.end, item.end) - item.start, text: edit.text }));
  return applyEdits(source.slice(item.start, item.end), own);
}

/**
 * A placed plain card filled from a page (`title`, `href`): its own page
 * link, emptied by Add card, takes the address (itemCopy). Without one, the
 * link is added (spec decision 3, no class; the site's card rule stretches
 * it): a link around the heading, or one that is the heading's whole content,
 * is pointed at the page; else the heading's text becomes a link.
 */
export function itemFill(card: string, noun: string, title: string, href: string): { markup: string; added: boolean } | undefined {
  const root = elementTree(card)?.[0];
  const markup = root && itemCopy(card, root, { noun, title, href, keepText: true, isLinked: value => !value.trim() });
  const item = markup === undefined ? undefined : elementTree(markup)?.[0];
  if (markup === undefined || !item) return undefined;
  const links = allElements([item]).filter(element => element.name === "a");
  if (links.some(link => attribute(markup, link, "href") === href)) return { markup, added: false };
  const heading = titleLeaf(markup, item);
  // Collections also accept text-only items; keep their existing copy fill.
  if (!heading || !/^h[1-6]$/.test(heading.name)) return { markup, added: false };
  const around = links.find(link => link.start <= heading.start && heading.end <= link.end);
  const only = heading.children.length === 1 && heading.children[0].name === "a" && !plainText(markup.slice(heading.innerStart, heading.children[0].start) + markup.slice(heading.children[0].end, heading.innerEnd))
    ? heading.children[0] : undefined;
  const link = around ?? only;
  const pointed = (anchor: SourceElement): Edit => {
    const old = startTagAttribute(markup, anchor.tag, "href");
    return old ? hrefEdit(old, href) : { start: anchor.tag.end - 1, end: anchor.tag.end - 1, text: ` href="${escapeAttribute(href)}"` };
  };
  // itemCopy already gave the heading (or its whole link) the page's title.
  const edits = link ? [pointed(link)] : [{ start: heading.innerStart, end: heading.innerEnd, text: `<a href="${escapeAttribute(href)}">${escapeText(title)}</a>` }];
  return { markup: applyEdits(markup, edits), added: true };
}

/** The whole `href` attribute rewritten, quoted, so an unquoted or empty value cannot run into the next attribute. */
function hrefEdit(href: { start: number; end: number }, value: string): Edit {
  return { start: href.start, end: href.end, text: ` href="${escapeAttribute(value)}"` };
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** An element's own lines (from its line's start through its newline), else just its range. */
export function ownLines(source: string, range: { start: number; end: number }) {
  const lineStart = source.lastIndexOf("\n", range.start - 1) + 1;
  const start = /^[ \t]*$/.test(source.slice(lineStart, range.start)) ? lineStart : range.start;
  const trailing = /^[ \t]*\r?\n/.exec(source.slice(range.end));
  const end = trailing && start === lineStart ? range.end + trailing[0].length : range.end;
  return { start, end };
}

/**
 * The edit that puts `copy` (an item's markup, its inner lines indented as
 * the item's are) on its own lines right after the item at `range`, with
 * the item's indentation.
 */
export function insertAfterEdit(source: string, range: { start: number; end: number }, copy: string): Edit {
  const lines = ownLines(source, range);
  const indent = source.slice(lines.start, range.start);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const ownLine = lines.end > range.end || lines.start < range.start;
  const text = ownLine ? `${indent}${copy}${newline}` : `${newline}${indent}${copy}`;
  return { start: lines.end, end: lines.end, text };
}

// ---- A subpage's copy ----

export interface PageCopyOptions {
  /** The new page's title (its h1, and the first part of its `<title>`). */
  title: string;
  /** The sibling's route and the new page's: links to the one go to the other. */
  from: string;
  to: string;
  /** The sibling's own title words, swapped for `title` where its text is kept. */
  oldTitle?: string;
  /** The fallback a component (`tag`) shows for its slot `slot` when the page fills none. */
  fallback?: (tag: string, slot: string) => string | undefined;
}

/**
 * The body part of a new subpage made from a sibling's (`source`, a whole
 * document; `main` its `<main>` element or body content range): what every
 * sibling shares stays, what each says for itself is reset. With `other`
 * (a second sibling) whose `<main>` has the same leaves (`textLeaves`, by
 * tag) a leaf whose text is the same in both stays as it is (the headings
 * "The brief", "What we built", a "Back to all work" link, a contact
 * section) and one whose text differs is reset; with no such second
 * sibling headings below h1 and leaves that hold links stay, and the rest
 * is reset. Reset means: the first `<h1>` says `title`; a paragraph "A
 * sentence or two about <title>."; anything else a placeholder for its
 * kind, or for text in a component's slot that slot's fallback. Kept text
 * has the sibling's title swapped for the new one. Links
 * to the sibling's own URL go to the new one. Images stay as they are.
 */
export function pageBodyCopy(source: string, main: { start: number; end: number }, otherLeaves: { name: string; text: string }[] | undefined, options: PageCopyOptions): string | undefined {
  const tree = elementTree(source, main.start, main.end);
  if (!tree) return undefined;
  const leaves = textLeaves(source, tree);
  const parents = new Map<SourceElement, SourceElement>();
  for (const element of allElements(tree)) for (const child of element.children) parents.set(child, element);
  const compare = otherLeaves && otherLeaves.length === leaves.length && otherLeaves.every((leaf, index) => leaf.name === leaves[index].name)
    ? otherLeaves : undefined;
  let titled = false;
  const edits: Edit[] = [];
  // Leaves whose whole content is replaced: their links go with it.
  const replaced: Edit[] = [];
  leaves.forEach((leaf, index) => {
    const inner = source.slice(leaf.innerStart, leaf.innerEnd);
    const text = plainText(inner);
    const holdsLink = leaf.name === "a" || allElements(leaf.children).some((child) => child.name === "a");
    const keep = compare ? compare[index].text === text : (/^h[2-6]$/.test(leaf.name) || holdsLink);
    if (leaf.name === "h1" && !titled) {
      titled = true;
      replaced.push({ start: leaf.innerStart, end: leaf.innerEnd, text: escapeText(options.title) });
      return;
    }
    if (keep) {
      edits.push(...textRunEdits(source, leaf.innerStart, leaf.innerEnd, (run) => withTitle(run, options.oldTitle, options.title)));
      return;
    }
    // Text a page puts in a component's slot resets to the component's own fallback.
    const slot = attribute(source, leaf, "slot");
    const host = parents.get(leaf);
    const fallback = slot && host?.name.includes("-") ? options.fallback?.(host.name, slot) : undefined;
    replaced.push({ start: leaf.innerStart, end: leaf.innerEnd, text: escapeText(fallback ?? placeholderFor(leaf.name, "page", options.title)) });
  });
  for (const element of allElements(tree)) {
    if (element.name !== "a" || replaced.some((edit) => element.start >= edit.start && element.start < edit.end)) continue;
    const href = startTagAttribute(source, element.tag, "href");
    const target = href ? linkPath(href.value) : undefined;
    if (!href || target === undefined || !source.slice(href.start, href.end).includes("=")) continue;
    const rest = href.value.trim().slice(target.length);
    if (target === options.from || target === options.from.replace(/\/$/, "") || target === `${options.from}index.html`)
      edits.push(hrefEdit(href, `${options.to}${rest}`));
  }
  return applyEdits(source, [...edits, ...replaced]);
}

/** The path of a root link (`/work/a/#x` is `/work/a/`), else none. */
function linkPath(href: string) {
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value.split(/[?#]/)[0];
}

/** The leaves of a stretch of a page, as their tag and text: what `pageBodyCopy` compares. */
export function leafSummary(source: string, range: { start: number; end: number }): { name: string; text: string }[] | undefined {
  const tree = elementTree(source, range.start, range.end);
  return tree ? textLeaves(source, tree).map((leaf) => ({ name: leaf.name, text: plainText(source.slice(leaf.innerStart, leaf.innerEnd)) })) : undefined;
}

/**
 * The text a component template shows for each of its named slots when
 * the page fills none (its fallback, as plain text).
 */
export function slotFallbacks(template: string): { fallbacks: Record<string, string> } {
  const fallbacks: Record<string, string> = {};
  for (const tag of startTags(template)) {
    if (tag.name !== "slot") continue;
    const name = startTagAttribute(template, tag, "name")?.value;
    if (!name) continue;
    const close = template.toLowerCase().indexOf("</slot", tag.end);
    const text = close < 0 ? "" : plainText(template.slice(tag.end, close));
    if (text && !(name in fallbacks)) fallbacks[name] = text;
  }
  return { fallbacks };
}
