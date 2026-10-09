// An instance's, Button's or page band's variants as edit bar fields (ticket 07 §5): a dropdown per
// choice, a checkbox per yes/no variant. Leaving the attribute off is the
// default look, so the default option removes it; a value no rule knows
// shows as "Custom" and stays until something else is picked. A variant (or
// a value) styled only inside a media or container query says where it
// shows ("wide screens only").

// Loaded when an instance, Button (`a.btn`) or potential page band is first selected
// (src/page-builder/components.ts),
// so the variant parser stays out of the boot bundle.

import { isSectionTemplate, startTags } from "../../shared/html-source";
import { globalVariants, scriptsSetAttributes, siteVariants, valueLabel, variantsForClass, variantsForComponent, type Variant } from "../../shared/variants";

/** A page band has no enclosing band or component instance, even when neither has a tone set. */
export function isToneBand(chain: readonly string[], page: boolean, template: (tag: string) => string | undefined): boolean {
  if (!page || !chain.length) return false;
  const band = (tag: string, ancestors: readonly string[]) => {
    const html = template(tag);
    if (html !== undefined) {
      const root = startTags(html)[0];
      return isSectionTemplate(html) || Boolean(root && ["header", "footer"].includes(root.name) && /^[\s]*$/.test(html.slice(0, root.start).replace(/<!--[\s\S]*?-->/g, "")));
    }
    return tag === "section" || (["header", "footer"].includes(tag) && !ancestors.some((name) => ["article", "aside", "main", "nav", "section"].includes(name)));
  };
  const ancestors = chain.slice(0, -1);
  return band(chain.at(-1)!, ancestors) && !ancestors.some((tag, index) => template(tag) !== undefined || band(tag, ancestors.slice(0, index)));
}

/** Light is the absent tone unless CSS explicitly declares another default alias. */
export function toneDefault(variant: Variant): Variant {
  return variant.attribute === "data-tone" && variant.defaultValue === undefined && variant.values.some(({ value }) => value === "light")
    ? { ...variant, defaultValue: "light" } : variant;
}

export interface VariantField {
  attribute: string;
  label: string;
  kind: "choice" | "yes-no";
  /** How checking a yes/no field writes the attribute. */
  form?: "bare" | "true";
  /** Choice options: `""` leaves the attribute off, `=value` writes it. None for yes/no. */
  options: { label: string; value: string }[];
  /** Current option; yes/no is `"on"` by presence for bare rules, or only by `="true"` for true rules. */
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
      return { attribute: variant.attribute, label: variant.label, kind: "yes-no", form: variant.form, options: [], value: (variant.form === "true" ? set?.value === "true" : Boolean(set)) ? "on" : "", ...(note ? { note } : {}) };
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

/** Instance fields from component/page CSS, excluding script-set names only from the component CSS. */
export function instanceVariantFields(tag: string, css: string, sheets: readonly { path: string; source: string }[], attributes: readonly { name: string; value: string }[], scripts: readonly { path: string; source: string }[] = [], band = false) {
  const variants = variantsForComponent(tag, { css, site: siteVariants(sheets), scriptAttributes: scriptsSetAttributes(scripts) }).variants;
  return variantFields(variants.filter((variant) => band || variant.attribute !== "data-tone").map(toneDefault), attributes);
}

/** Plain page bands offer only Tone, from global attribute rules. */
export function bandVariantFields(sheets: readonly { path: string; source: string }[], attributes: readonly { name: string; value: string }[]) {
  return variantFields(globalVariants(siteVariants(sheets)).filter((variant) => variant.attribute === "data-tone").map(toneDefault), attributes);
}

/**
 * What picking `choice` writes: a choice value, `true` for a bare yes/no
 * attribute or `"true"` for rules matching that value,
 * `undefined` to remove it.
 */
export function variantAttribute(field: VariantField, choice: string): string | true | undefined {
  if (field.kind === "yes-no") return choice ? field.form === "true" ? "true" : true : undefined;
  return choice.startsWith("=") ? choice.slice(1) : undefined;
}

/** Button axes use only the site's explicit .btn rules, never global component axes. */
export function buttonVariantFields(sheets: readonly { path: string; source: string }[], attributes: readonly { name: string; value: string }[]) {
  return variantFields(variantsForClass("btn", siteVariants(sheets)).filter((variant) => variant.attribute !== "data-tone"), attributes);
}
