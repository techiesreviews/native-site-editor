// An instance's variants as edit bar fields (ticket 07 §5): a dropdown per
// choice, a checkbox per yes/no variant. Leaving the attribute off is the
// default look, so the default option removes it; a value no rule knows
// shows as "Custom" and stays until something else is picked. A variant (or
// a value) styled only inside a media or container query says where it
// shows ("wide screens only").

// Loaded when an instance is first selected (src/page-builder/components.ts),
// so the variant parser stays out of the boot bundle.

import { siteVariants, valueLabel, variantsForComponent, type Variant } from "../../shared/variants";

export interface VariantField {
  attribute: string;
  label: string;
  kind: "choice" | "yes-no";
  /** Choice options: `""` leaves the attribute off, `=value` writes it. None for yes/no. */
  options: { label: string; value: string }[];
  /** The option the instance has now; for yes/no, `"on"` (the attribute is there, whatever its value: a presence rule styles it) or `""`. */
  value: string;
  /** Where the whole variant shows, when only somewhere ("wide screens only"). */
  note?: string;
}

/**
 * One condition chain (`@media (width > 720px) and @container …`) said
 * plainly; anything it cannot tell for sure (a negation, a list of queries,
 * both bounds, screen and container together) reads "some screens only".
 */
function conditionNote(condition: string) {
  const text = condition.toLowerCase();
  const media = text.includes("@media"), container = text.includes("@container");
  if (/\bnot\b|,/.test(text) || media && container) return "some screens only";
  if (/prefers-color-scheme\s*:\s*dark/.test(text)) return "dark mode only";
  if (/prefers-color-scheme\s*:\s*light/.test(text)) return "light mode only";
  if (/^@media\s+print\b/.test(text)) return "print only";
  const wide = /min-(?:inline-)?(?:width|size)\s*:|(?:width|inline-size)\s*>/.test(text);
  const narrow = /max-(?:inline-)?(?:width|size)\s*:|(?:width|inline-size)\s*</.test(text);
  const where = container ? "containers" : "screens";
  return wide && !narrow ? `wide ${where} only` : narrow && !wide ? `narrow ${where} only` : `some ${where} only`;
}

/** Where a variant or value with these conditions shows, or nothing when it shows everywhere. */
export function conditionsNote(conditions: readonly string[]) {
  if (!conditions.length) return undefined;
  const notes = new Set(conditions.map(conditionNote));
  return notes.size === 1 ? [...notes][0] : "some screens only";
}

/** The fields for `variants` on an instance whose start tag has `attributes`. */
export function variantFields(variants: readonly Variant[], attributes: readonly { name: string; value: string }[]): VariantField[] {
  return variants.map((variant) => {
    const set = attributes.find((attribute) => attribute.name === variant.attribute);
    const note = conditionsNote(variant.conditions);
    if (variant.kind === "yes-no") {
      return { attribute: variant.attribute, label: variant.label, kind: "yes-no", options: [], value: set ? "on" : "", ...(note ? { note } : {}) };
    }
    const options = [{ label: variant.defaultValue === undefined ? "Default" : `${valueLabel(variant.defaultValue)} (default)`, value: "" }];
    for (const { value, label, conditions } of variant.values) {
      // The value the default look already is shows only when the page writes it.
      if (value === variant.defaultValue && set?.value !== value) continue;
      const only = note ? undefined : conditionsNote(conditions);
      options.push({ label: only ? `${label} (${only})` : label, value: `=${value}` });
    }
    const value = set ? `=${set.value}` : "";
    if (!options.some((option) => option.value === value)) options.push({ label: "Custom", value });
    return { attribute: variant.attribute, label: variant.label, kind: "choice", options, value, ...(note ? { note } : {}) };
  });
}

/** The fields of instance `tag` with `attributes`, read from its component's CSS and the page's sheets (imports expanded). */
export function instanceVariantFields(tag: string, css: string, sheets: readonly { path: string; source: string }[], attributes: readonly { name: string; value: string }[]) {
  return variantFields(variantsForComponent(tag, { css, site: siteVariants(sheets) }).variants, attributes);
}

/**
 * What picking `choice` writes: a value, `true` for a bare yes/no attribute,
 * `undefined` to remove it.
 */
export function variantAttribute(field: VariantField, choice: string): string | true | undefined {
  if (field.kind === "yes-no") return choice ? true : undefined;
  return choice.startsWith("=") ? choice.slice(1) : undefined;
}
