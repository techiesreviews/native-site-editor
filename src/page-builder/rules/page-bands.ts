// When a header or footer is the page's own band (HTML-AAM banner and
// contentinfo): one rule for Make component (component-model.ts), Remove
// (remove.ts) and tone bands (variant-fields.ts). tests/frame-guard.test.ts
// fails on a copy of the ancestor list outside src/page-builder/rules/.

/** Ancestors that keep a header/footer from being the page's banner/contentinfo. */
export const PAGE_BAND_ANCESTORS = new Set(["article", "aside", "main", "nav", "section"]);

/** Whether a header/footer belongs to the page itself rather than an enclosing container. */
export function isPageHeaderFooter(tag: string, ancestors: readonly string[]): boolean {
  return (tag === "header" || tag === "footer") && !ancestors.some((name) => PAGE_BAND_ANCESTORS.has(name));
}
