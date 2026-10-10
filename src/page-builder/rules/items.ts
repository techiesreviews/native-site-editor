// Repeated items (cards, list items, links in a row), pure and unit tested
// (tests/rules-items.test.ts). A grid (or list) is an element whose element
// children include at least two of the same kind: the same custom element,
// or the same tag and classes for an element that can be an item (article,
// li, div, figure, a, blockquote, dd). Sections are never items; they have
// their own insert points. card-source.ts applies the rule to a page's
// source, the preview runtime (native-preview-runtime.js, "Repeated items")
// to the rendered page, and component-model.ts's Make component a variant.

/** Tags that can be repeated items besides custom elements. */
export const ITEM_TAGS = new Set(["article", "li", "div", "figure", "a", "blockquote", "dd"]);

/** Plain elements that can be made cards: list items only work in their list. */
export const CARD_ITEM_TAGS = new Set([...ITEM_TAGS].filter((tag) => tag !== "li" && tag !== "dd"));

/** Containers whose children are never items: the page itself and its <main>. */
export const NOT_GRIDS = new Set(["html", "head", "body", "main"]);

/**
 * The kind of a would-be item: a custom element's tag, or `tag.class.class`
 * (classes sorted) for an item tag; none for anything else or a section.
 */
export function itemKind(tag: string, className: string | undefined, section = false): string | undefined {
  const name = tag.toLowerCase();
  if (section || name === "section") return undefined;
  if (name.includes("-")) return name;
  if (!ITEM_TAGS.has(name)) return undefined;
  const classes = (className ?? "").trim().split(/\s+/).filter(Boolean).sort();
  return classes.length ? `${name}.${classes.join(".")}` : name;
}

/**
 * The repeated items among a container's element children, by their kinds
 * (`itemKind`): the indexes of the kind with the most members, at least
 * two (the first such kind on a tie). None when no kind repeats.
 */
export function repeatedRun(kinds: (string | undefined)[]): { kind: string; indexes: number[] } | undefined {
  const groups = new Map<string, number[]>();
  kinds.forEach((kind, index) => {
    if (!kind) return;
    const group = groups.get(kind);
    if (group) group.push(index);
    else groups.set(kind, [index]);
  });
  let best: { kind: string; indexes: number[] } | undefined;
  for (const [kind, indexes] of groups)
    if (indexes.length >= 2 && (!best || indexes.length > best.indexes.length)) best = { kind, indexes };
  return best;
}
