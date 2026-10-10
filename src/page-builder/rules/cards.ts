// What a card component, a card slot and an items slot are (sturdy-base
// slice 21; components-and-builder ticket 09 rule 9). One rule for the
// editor (component-model.ts over the template's source) and the preview
// runtime (over shadow roots), tested in tests/rules-cards.test.ts. Blank
// text and slot names are the browser's reading: text is blank when it is
// ASCII white space after decoding, and a slot's name is its `name`
// attribute decoded, not trimmed.

import { meaningful, type RuleView } from "./tree";

/** A tag that can name a card component: `card-…`. */
export const isCardTag = (tag: string) => tag.startsWith("card-");

const isHeading = <N>(node: N | undefined, view: RuleView<N>) =>
  node !== undefined && view.kind(node) === "element" && /^h[1-6]$/.test(view.name(node));

/**
 * Whether a template (its top-level nodes) has a heading slot, a card
 * component's mark: a slot whose only content is a heading, or a slot that
 * is a heading's only content. Every slot counts, those in another slot's
 * fallback or in a nested instance's content too, as the preview finds them.
 */
export function hasHeadingSlot<N>(roots: readonly N[], view: RuleView<N>): boolean {
  return roots.some((node) => {
    if (view.kind(node) !== "element") return false;
    if (view.name(node) === "slot") {
      const inside = meaningful(view.children(node), view);
      if (inside.length === 1 && isHeading(inside[0], view)) return true;
      const parent = view.parent(node);
      if (parent !== undefined && isHeading(parent, view) && meaningful(view.children(parent), view).length === 1) return true;
    }
    return hasHeadingSlot(view.children(node), view);
  });
}

/** Whether `nodes` are card components only, at least one, blank text between them. */
function cardsOnly<N>(nodes: readonly N[], view: RuleView<N>, isCard: (element: N) => boolean) {
  const parts = meaningful(nodes, view);
  return parts.length > 0 && parts.every((node) => view.kind(node) === "element" && isCard(node));
}

/** A card slot: a slot whose fallback is card components only (Add card adds the first one's kind), whatever it is named. */
export function isCardSlot<N>(slot: N, view: RuleView<N>, isCard: (element: N) => boolean) {
  return cardsOnly(view.children(slot), view, isCard);
}

/** An items slot, which takes cards and other blocks: the unnamed slot (`name` as the browser reads it), or a card slot. */
export function isItemsSlot<N>(name: string, fallback: readonly N[], view: RuleView<N>, isCard: (element: N) => boolean) {
  return !name || cardsOnly(fallback, view, isCard);
}
