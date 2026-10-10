// Which block a press or a drag may move (sturdy-base slice 23): one rule
// for the editor (native-operations.ts over its strict source tree) and the
// preview runtime (over the page's DOM), tested in tests/rules-movable.test.ts.
// A sealed element is taken whole: a component instance (opened only through
// its items slots), template and raw-text islands, and SVG or MathML content.

import type { MarkupView } from "./tree";

/** HTML tags whose content the page's blocks never reach: inert or raw text, and the roots of foreign content. */
export const SEALED_TAGS = new Set(["template", "noscript", "xmp", "noembed", "noframes", "svg", "math"]);

/** Names the spec reserves for SVG and MathML; `customElements.define` throws on them. */
const RESERVED_NAMES = new Set(["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"]);

/** Whether `name` (lower case, as the HTML parser makes it) is a valid custom element name the spec does not reserve. */
export const isCustomElementName = (name: string) => /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(name) && !RESERVED_NAMES.has(name);

/** A component instance: an HTML element with a custom element name. */
export const isInstance = <N>(node: N, view: MarkupView<N>) =>
  view.kind(node) === "element" && !view.foreign(node) && isCustomElementName(view.name(node));

/** Whether an element is sealed: a custom element, a sealed tag, or foreign content. */
export function sealed<N>(node: N, view: MarkupView<N>): boolean {
  if (view.kind(node) !== "element") return false;
  const name = view.name(node);
  return view.foreign(node) || SEALED_TAGS.has(name) || isCustomElementName(name);
}

/**
 * Whether `node` is a block a press or a drag may move: inside `<main>`
 * (never `<main>` itself, a header or footer around it), every sealed
 * element around it crossed through an instance's items slot
 * (`opensInto(instance, child)`, rules/cards.ts `isItemsSlot`), and not a
 * sealed element itself unless it is an instance (which moves whole).
 */
export function movableBlock<N>(node: N, view: MarkupView<N>, opensInto: (instance: N, child: N) => boolean): boolean {
  if (view.kind(node) !== "element" || (sealed(node, view) && !isInstance(node, view))) return false;
  let inMain = false;
  for (let child = node, at = view.parent(node); at !== undefined; child = at, at = view.parent(at)) {
    if (sealed(at, view) && !(isInstance(at, view) && opensInto(at, child))) return false;
    if (view.name(at) === "main") inMain = true;
  }
  return inMain;
}
