// Hover, pressed and focus shown on the board without a pointer or keyboard (Storybook's pseudo-states method):
// every stylesheet rule that names :hover, :active, :focus, :focus-visible or :focus-within gets a copy where the
// state is an attribute, `data-force="hover"` on the element the pointer or keyboard would be on. As in the browser,
// hover and pressed also reach its ancestors, and focus-within the ancestors of the focused one. The editor's CSS
// stays as it is; the board's own rules (`.cat-…`) are never copied. Rules a stylesheet keeps for mice only
// (`@media (hover: hover)`) are copied out of that condition, so the forced states show on a phone as well.

export type Forced = "hover" | "pressed" | "focus";
const PATTERN = /:(focus-visible|focus-within|hover|active|focus)(?![\w-])/g;
const POINTER_ONLY = /^\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?\s*$/;
const self = (state: Forced) => `[data-force~="${state}"]`;
const selfOrAncestor = (state: Forced) => `:is(${self(state)}, :has(${self(state)}))`;
const REPLACE: Record<string, string> = {
  hover: selfOrAncestor("hover"), active: selfOrAncestor("pressed"),
  focus: self("focus"), "focus-visible": self("focus"), "focus-within": selfOrAncestor("focus"),
};
/** What a cell forces: the first control in it, else the part itself. */
export const FORCE_TARGET = "button, a[href], input, textarea, select, [tabindex], [role='button']";

/** The selector with each state pseudo-class matched by the attribute too, or null when it names none. */
export function forcedSelector(selector: string): string | null {
  if (/\.cat-/.test(selector) || !selector.match(PATTERN)) return null;
  return selector.replace(PATTERN, (_, pseudo: string) => REPLACE[pseudo]);
}

/** Marks the element a cell's state applies to. */
export function force(root: Element, state: Forced) {
  const target = root.matches(FORCE_TARGET) ? root : root.querySelector(FORCE_TARGET) ?? root;
  target.setAttribute("data-force", state);
}

/** The at-rule around a grouping rule (`@media …`, `@supports …`), or "" when it only limits rules to a mouse. */
export function groupPrelude(cssText: string, condition: string | undefined): string {
  if (condition !== undefined && POINTER_ONLY.test(condition)) return "";
  return cssText.slice(0, cssText.indexOf("{")).trim();
}

function copies(rules: CSSRuleList, wrap: (inner: string) => string, out: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selector = forcedSelector(rule.selectorText);
      if (selector) out.push(wrap(`${selector} { ${rule.style.cssText} }`));
      if (rule.cssRules?.length) copies(rule.cssRules, (inner) => wrap(`${rule.selectorText} { ${inner} }`), out);
    } else if (rule instanceof CSSGroupingRule) {
      const condition = rule instanceof CSSMediaRule ? rule.media.mediaText : undefined;
      const prelude = groupPrelude(rule.cssText, condition);
      copies(rule.cssRules, prelude ? (inner) => wrap(`${prelude} { ${inner} }`) : wrap, out);
    }
  }
}

/** Adds the forced copies of every stylesheet in `doc`, and of each one that loads later (a lazy part's CSS). */
export function forceStates(doc: Document = document) {
  const done = new WeakSet<CSSStyleSheet>();
  const sheet = new CSSStyleSheet();
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  const scan = () => {
    const out: string[] = [];
    for (const each of Array.from(doc.styleSheets)) {
      if (done.has(each)) continue;
      let rules: CSSRuleList;
      try { rules = each.cssRules; } catch { continue; }
      done.add(each);
      copies(rules, (inner) => inner, out);
    }
    for (const text of out) {
      try { sheet.insertRule(text, sheet.cssRules.length); } catch { /* A selector this browser does not parse: left out. */ }
    }
  };
  scan();
  new MutationObserver(scan).observe(doc.head, { childList: true });
  doc.addEventListener("load", (event) => { if (event.target instanceof HTMLLinkElement) scan(); }, true);
}
