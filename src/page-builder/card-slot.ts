// Add card on an instance's card slot (wayfinder components-and-builder
// ticket 04 §8, ticket 09 §1): an items slot whose fallback is a card
// component (`<slot><card-project></card-project></slot>`, what Make component
// writes for a repeated group) gets a fresh instance of that card, with its
// own copy of its template's text and image fallbacks (`slotMarkup`, as the
// Add panel inserts a component), no variant, after the slot's last item.
// The kind comes from the fallback, not from the items on the page, so it
// works with none or one. Grids of plain items keep their copy
// (card-grid.ts `itemCopy`). Pure: src/page-builder/cards.ts writes the edit
// as one undo step.

import { descendants, isCardComponent, parseSource, startTagAttributes, templateSlots, type SourceElement, type TemplateOf } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";
import { itemsSlotRule } from "./block-insert";
import { slotMarkup } from "../native-insert";
import { nativeInstanceInsertEdit, nativeOutline, type GuardedSourceEdit } from "./native-operations";

/** An items slot of a component whose fallback is a card component: its name ("" the unnamed one) and that card's tag. */
export interface CardSlot {
  slot: string;
  card: string;
}

/** A component's card slots, in template order, by name as the browser reads it. */
export function cardSlotOf(tag: string, templateOf: TemplateOf): CardSlot[] {
  const template = templateOf(tag);
  if (template === undefined) return [];
  return templateSlots(template, templateOf).flatMap((entry) => {
    // Card components only, as the preview tells one: blank text between them, the unnamed slot too.
    const nodes = entry.element.children;
    const cards = nodes.flatMap((node) => (node.type === "element" ? [node.name] : []));
    const blank = nodes.every((node) => node.type === "element" || !/[^\t\n\f\r ]/.test(decodeHtmlEntities(template.slice(node.start, node.end))));
    return entry.items && blank && cards.length && cards.every((tag) => isCardComponent(tag, templateOf)) ? [{ slot: decodeHtmlEntities(entry.name, true), card: cards[0] }] : [];
  });
}

/** A fresh instance of the card component `tag`, one slot's copy a line; undefined when the site has no such component. */
export function freshCardMarkup(tag: string, templateOf: TemplateOf): string | undefined {
  const template = templateOf(tag);
  return template === undefined ? undefined : [`<${tag}>`, ...slotMarkup(template).map((line) => `  ${line}`), `</${tag}>`].join("\n");
}

/**
 * Add card on the instance at `parent` (a body path): a fresh card of its
 * card slot `slot` (else the slot its last child in a card slot fills, else
 * its first card slot), after that slot's last item, else after the
 * instance's last child. The edit, the new card's index in the instance, its
 * tag and slot; undefined when the element there has no such slot or the
 * page's HTML cannot be read exactly.
 */
export function cardSlotAddEdit(source: string, parent: readonly number[], templateOf: TemplateOf, slot?: string): { edit: GuardedSourceEdit; index: number; card: string; slot: string } | undefined {
  let node = nativeOutline(source);
  for (const step of parent) node = node?.children[step];
  if (!node || !node.name.includes("-")) return undefined;
  const slots = cardSlotOf(node.name, templateOf);
  const named = (name: string | undefined) => slots.find((entry) => entry.slot === name);
  const kids = node.children;
  const chosen = slot !== undefined ? named(slot) : named([...kids].reverse().find((child) => named(child.slot))?.slot) ?? slots[0];
  const markup = chosen && freshCardMarkup(chosen.card, templateOf);
  if (!chosen || !markup) return undefined;
  const last = kids.map((child) => child.slot).lastIndexOf(chosen.slot);
  const index = last < 0 ? kids.length : last + 1;
  const edit = nativeInstanceInsertEdit(source, parent, index, markup, itemsSlotRule(templateOf), chosen.slot);
  return edit ? { edit, index, card: chosen.card, slot: chosen.slot } : undefined;
}

/**
 * The pages the other cards in the slot of the card at `card` (a body path)
 * link to: each of their links that `route` names a page of the site, in
 * order. Only the card's own slot counts, so two lists of one instance stay
 * apart (ticket 09 §2, "In this grid").
 */
export function slotCardLinks(source: string, card: readonly number[], route: (href: string) => string | undefined): string[] {
  const kids = (element: SourceElement) => element.children.filter((node): node is SourceElement => node.type === "element");
  const attribute = (element: SourceElement, name: string) => {
    const value = startTagAttributes(source, element.tag).find((entry) => entry.name === name)?.value;
    return value === undefined ? undefined : decodeHtmlEntities(value, true);
  };
  let parent = [...descendants(parseSource(source))].find((element) => element.name === "body");
  for (const step of card.slice(0, -1)) parent = parent && kids(parent)[step];
  const siblings = parent ? kids(parent) : [];
  const own = siblings[card[card.length - 1]];
  if (!own) return [];
  const slot = attribute(own, "slot") ?? "";
  return siblings.flatMap((sibling) => sibling === own || (attribute(sibling, "slot") ?? "") !== slot ? [] :
    [sibling, ...descendants(sibling.children)].flatMap((element) => {
      const href = element.name === "a" ? attribute(element, "href") : undefined;
      const page = href === undefined ? undefined : route(href);
      return page ? [page] : [];
    }));
}
