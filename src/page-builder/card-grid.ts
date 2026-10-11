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

import { VOID_ELEMENTS, textRangeInSource } from "../../shared/html-source";
import { readSource, plain, type SourceTree, type SourceNode, type SourceElement } from "./source-tree";
import { decodeHtmlEntities, decodeHtmlEntity } from "./html-entities";
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

/** `text` safe as element content. */
export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Raw text and templates: never text a copy resets or a title swap touches.
const NOT_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "template"]);

/**
 * A text leaf: an element holding text and inline markup only (a heading,
 * a paragraph, a link, a `<card-note>` with text in it), the unit whose
 * text a copy resets. Leaves are found from the top down, so a link in a
 * paragraph is part of the paragraph's leaf.
 */
export function textLeaves<N>(tree: SourceTree<N>, elements = tree.children()): N[] {
  const out: N[] = [];
  const inlineOnly = (element: N): boolean => tree.children(element).every((child) => INLINE_FORMATTING.has(tree.view.name(child)) && inlineOnly(child));
  const visit = (element: N) => {
    // Scripts, styles and templates are not text to reset: they stay as written.
    const name = tree.view.name(element);
    if (VOID_ELEMENTS.has(name) || NOT_TEXT.has(name)) return;
    if (inlineOnly(element) && plain(tree.text(element))) {
      out.push(element);
      return;
    }
    tree.children(element).forEach(visit);
  };
  elements.forEach(visit);
  return out;
}

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
export function titleLeaf<N>(tree: SourceTree<N>, item: N, leaves = textLeaves(tree, [item])): N | undefined {
  return leaves.find((leaf) => tree.attribute(leaf, "slot")?.value === "title")
    ?? leaves.find((leaf) => /^h[1-6]$/.test(tree.view.name(leaf)))
    ?? (leaves[0] === item ? item : undefined);
}

/** The item's title as text: the text of its title leaf. */
export function itemTitle<N>(tree: SourceTree<N>, item: N): string | undefined {
  const leaf = titleLeaf(tree, item);
  return leaf ? plain(tree.text(leaf)) || undefined : undefined;
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

/** Text as the browser reads it: CR LF and lone CR as LF, character references decoded. */
const decoded = (raw: string) => decodeHtmlEntities(raw.replace(/\r\n?/g, "\n"));

/** Replace decoded title matches in individual text nodes, preserving all other source spelling. */
function withTitle(tree: SourceTree<SourceNode>, leaf: SourceElement, from: string | undefined, to: string): Edit[] {
  if (!from) return [];
  const edits: Edit[] = [];
  const visit = (node: SourceNode) => {
    if (node.type === "element") {
      // Raw text is never title copy, even when nested in a kept leaf.
      if (NOT_TEXT.has(tree.view.name(node))) return;
      tree.view.children(node).forEach(visit);
      return;
    }
    const text = tree.text(node);
    const source = tree.source.slice(node.start, node.end);
    // The tree drops a pre/listing's first newline; the mapper reads the whole source run.
    const omitted = decoded(source).length - text.length;
    for (let at = text.indexOf(from); at >= 0; at = text.indexOf(from, at + from.length)) {
      const span = textRangeInSource(source, at + omitted, at + omitted + from.length, from, decodeHtmlEntity);
      if (!span) continue;
      // A reference that decodes to more than the match (`&NotEqualTilde;`) keeps the rest of what it says.
      const written = decoded(source.slice(span.start, span.end));
      const head = at + omitted - decoded(source.slice(0, span.start)).length;
      edits.push({ start: node.start + span.start, end: node.start + span.end,
        text: escapeText(written.slice(0, head)) + escapeText(to) + escapeText(written.slice(head + from.length)) });
    }
  };
  visit(leaf);
  return edits;
}

/** A title's single wrapping link, with no words outside it. */
function wholeTitleLink(tree: SourceTree<SourceNode>, leaf: SourceElement): SourceElement | undefined {
  const children = tree.children(leaf);
  const only = children.length === 1 ? children[0] : undefined;
  return only?.type === "element" && tree.view.name(only) === "a"
    && !plain(tree.view.children(leaf).filter(node => node !== only).map(node => tree.text(node)).join("")) ? only : undefined;
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
export function itemCopy(tree: SourceTree<SourceNode>, item: SourceNode, options: ItemCopyOptions): string | undefined {
  if (!tree.exact || item.type !== "element") return undefined;
  const source = tree.source;
  const leaves = textLeaves(tree, [item]).filter((node): node is SourceElement => node.type === "element");
  const titleAt = titleLeaf(tree, item, leaves);
  const oldTitle = titleAt ? plain(tree.text(titleAt)) : undefined;
  const slotOf = (leaf: SourceNode) => tree.attribute(leaf, "slot")?.value;
  const titleText = options.title?.trim()
    || (titleAt && slotOf(titleAt) && options.fallbacks?.[slotOf(titleAt)!])
    || `New ${options.noun}`;
  const edits: Edit[] = [];
  for (const leaf of leaves) {
    const slot = slotOf(leaf);
    let text: string;
    if (leaf === titleAt) {
      // The title keeps a wrapping link (`<h3><a href>Title</a></h3>`), with only its words changed.
      const target = wholeTitleLink(tree, leaf) ?? leaf;
      edits.push({ start: target.tag.end, end: target.close!.start, text: escapeText(titleText) });
      continue;
    } else if (tree.view.name(leaf) === "a" || tree.elements(leaf).some((child) => tree.view.name(child) === "a")) {
      // Only its words change, run by run between tags, so a link's address is left to the link pass below.
      edits.push(...withTitle(tree, leaf, oldTitle, titleText));
      continue;
    } else if (options.keepText) {
      continue;
    } else if (slot && options.fallbacks?.[slot]) {
      text = escapeText(options.fallbacks[slot]);
    } else {
      text = escapeText(placeholderFor(tree.view.name(leaf), options.noun));
    }
    edits.push({ start: leaf.tag.end, end: leaf.close!.start, text });
  }
  // Links to the item's own page go to the new one (or nowhere yet).
  // Not inside a leaf whose whole content was replaced.
  const inRemoved = (at: number) => edits.some((edit) => at >= edit.start && at < edit.end);
  if (options.href !== undefined)
    for (const element of [item, ...tree.elements(item)]) {
      if (tree.view.name(element) !== "a" || inRemoved(element.start)) continue;
      const href = tree.attribute(element, "href");
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
  const original = readSource(card);
  const root = original.children()[0];
  const markup = root && itemCopy(original, root, { noun, title, href, keepText: true, isLinked: value => !value.trim() });
  const tree = markup === undefined ? undefined : readSource(markup);
  const item = tree?.children()[0];
  if (markup === undefined || !tree?.exact || !item || item.type !== "element") return undefined;
  const links = [item, ...tree.elements(item)].filter((element): element is SourceElement => element.type === "element" && tree.view.name(element) === "a");
  if (links.some(link => tree.attribute(link, "href")?.value === href)) return { markup, added: false };
  const heading = titleLeaf(tree, item);
  // Collections also accept text-only items; keep their existing copy fill.
  if (!heading || heading.type !== "element" || !/^h[1-6]$/.test(tree.view.name(heading))) return { markup, added: false };
  const around = links.find(link => link.start <= heading.start && heading.end <= link.end);
  const only = wholeTitleLink(tree, heading);
  const link = around ?? only;
  const pointed = (anchor: SourceElement): Edit => {
    const old = tree.attribute(anchor, "href");
    return old ? hrefEdit(old, href) : { start: anchor.tag.end - 1, end: anchor.tag.end - 1, text: ` href="${escapeAttribute(href)}"` };
  };
  // itemCopy already gave the heading (or its whole link) the page's title.
  const edits = link ? [pointed(link)] : [{ start: heading.tag.end, end: heading.close!.start, text: `<a href="${escapeAttribute(href)}">${escapeText(title)}</a>` }];
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
 * The body part of a new subpage made from a sibling's tree (its `<main>`
 * content or body content, with offsets into the whole source): what every
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
export function pageBodyCopy(tree: SourceTree<SourceNode>, otherLeaves: { name: string; text: string }[] | undefined, options: PageCopyOptions): string | undefined {
  const source = tree.source;
  if (!tree.exact) return undefined;
  const leaves = textLeaves(tree).filter((node): node is SourceElement => node.type === "element");
  const compare = otherLeaves && otherLeaves.length === leaves.length && otherLeaves.every((leaf, index) => leaf.name === tree.view.name(leaves[index]))
    ? otherLeaves : undefined;
  let titled = false;
  const edits: Edit[] = [];
  // Leaves whose whole content is replaced: their links go with it.
  const replaced: Edit[] = [];
  leaves.forEach((leaf, index) => {
    const text = plain(tree.text(leaf));
    const holdsLink = tree.view.name(leaf) === "a" || tree.elements(leaf).some((child) => tree.view.name(child) === "a");
    const keep = compare ? compare[index].text === text : (/^h[2-6]$/.test(tree.view.name(leaf)) || holdsLink);
    if (tree.view.name(leaf) === "h1" && !titled) {
      titled = true;
      replaced.push({ start: leaf.tag.end, end: leaf.close!.start, text: escapeText(options.title) });
      return;
    }
    if (keep) {
      edits.push(...withTitle(tree, leaf, options.oldTitle, options.title));
      return;
    }
    // Text a page puts in a component's slot resets to the component's own fallback.
    const slot = tree.attribute(leaf, "slot")?.value;
    const host = tree.view.parent(leaf);
    const fallback = slot && host && tree.view.name(host).includes("-") ? options.fallback?.(tree.view.name(host), slot) : undefined;
    replaced.push({ start: leaf.tag.end, end: leaf.close!.start, text: escapeText(fallback ?? placeholderFor(tree.view.name(leaf), "page", options.title)) });
  });
  for (const element of tree.elements()) {
    if (tree.view.name(element) !== "a" || replaced.some((edit) => element.start >= edit.start && element.start < edit.end)) continue;
    const href = tree.attribute(element, "href");
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
export function leafSummary<N>(tree: SourceTree<N>): { name: string; text: string }[] | undefined {
  return tree.exact ? textLeaves(tree).map((leaf) => ({ name: tree.view.name(leaf), text: plain(tree.text(leaf)) })) : undefined;
}

/**
 * The text a component template shows for each of its named slots when
 * the page fills none: its fallback as the browser shows it (a nested
 * slot's fallback included), the first non-empty one per name.
 */
export function slotFallbacks(template: string): { fallbacks: Record<string, string> } {
  const fallbacks: Record<string, string> = {};
  const tree = readSource(template);
  for (const slot of tree.elements()) {
    if (tree.view.name(slot) !== "slot") continue;
    const name = tree.attribute(slot, "name")?.value;
    if (!name || name in fallbacks) continue;
    const text = plain(tree.text(slot));
    if (text) fallbacks[name] = text;
  }
  return { fallbacks };
}
