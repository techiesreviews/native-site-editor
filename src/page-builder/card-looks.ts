// The looks Add card ▾ and a card's look chip offer for a card slot
// (wayfinder components-and-builder ticket 09 §7–9): every card component on
// the site (a `card-…` tag whose template has a heading slot), then the
// Variants of the slot's own card component, each a value of one of its
// `data-*` attributes (from the site's Variant lookup,
// shared/variant-lookup.ts, as the edit bar has them). Mixed looks in one
// grid are fine: an items slot takes any block. Pure; loaded with the gallery
// (src/components/card-look-gallery.ts).

import { isCardComponent, type TemplateOf } from "./component-model";
import type { Variant } from "../../shared/variants";

/** A card's look: a card component, with one variant attribute set or none. */
export interface CardLook {
  tag: string;
  /** The variant: the attribute and its value (`true` for a bare yes/no). */
  attribute?: { name: string; value: string | true };
  /** "card-project", "card-project · centered". */
  label: string;
}

export interface CardLookSources {
  /** Every component tag of the site. */
  tags: Iterable<string>;
  templateOf: TemplateOf;
  /** The slot's own card component, whose variants follow the components. */
  current?: string;
  /** Its Variants. */
  variants?: readonly Variant[];
}

/** The looks: card components by name, then each variant value of the current one; tone is a band's, not a card's. */
export function cardLooks(sources: CardLookSources): CardLook[] {
  const { templateOf, current } = sources;
  const tags = [...new Set(sources.tags)].filter((tag) => isCardComponent(tag, templateOf)).sort();
  const looks: CardLook[] = tags.map((tag) => ({ tag, label: tag }));
  if (!current || !tags.includes(current)) return looks;
  for (const variant of sources.variants ?? []) {
    if (variant.attribute === "data-tone") continue;
    const name = variant.attribute;
    if (variant.kind === "yes-no") {
      looks.push({ tag: current, attribute: { name, value: variant.form === "true" ? "true" : true }, label: `${current} · ${name.replace(/^data-/, "")}` });
      continue;
    }
    for (const { value } of variant.values) {
      // The default value is the plain component's look, already offered.
      if (value !== variant.defaultValue) looks.push({ tag: current, attribute: { name, value }, label: `${current} · ${value}` });
    }
  }
  return looks;
}
