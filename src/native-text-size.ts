// The edit bar's Text size: the sizes a site defines for itself, and the
// start-tag edit that gives an element one of them.
//
// Detection reads the page's shared stylesheets (the ones its head links,
// with the files they `@import`), in this order:
// 1. Size classes: a rule whose whole selector is one class named
//    `text-*`, `font-size-*` or `fs-*` and that sets `font-size`
//    (`.text-large { font-size: 22px }`). The bar writes the class.
// 2. Size variables: custom properties named `--text-*`, `--font-size-*` or
//    `--fs-*` declared on `:root` or `html` whose value looks like a size
//    (`--text-l: 18px`, `clamp(…)`), as the starter's tokens.css has. The
//    bar writes `font-size: var(--text-l)` in the style attribute, since
//    there is no class to write.
// 3. Neither: the bar's own scale, XS–4XL, as an inline rem `font-size`.
// A size is labelled by its suffix (`text-2xl` → 2XL, `text-large` → Large).

import { startTagAttribute, type StartTag } from "./native-source-location";
import { setAttributesEdit, type RangeEdit } from "./native-structure";

export interface TextSize {
  // What the select holds: the class name, the variable name, or the scale step.
  value: string;
  label: string;
}

export type TextSizeScale =
  | { kind: "class"; sizes: TextSize[] }
  | { kind: "variable"; sizes: TextSize[] }
  | { kind: "inline"; sizes: (TextSize & { css: string })[] };

// The bar's own scale when the site has none.
export const INLINE_TEXT_SIZES = [
  { value: "xs", label: "XS", css: "0.75rem" },
  { value: "s", label: "S", css: "0.875rem" },
  { value: "m", label: "M", css: "1rem" },
  { value: "l", label: "L", css: "1.25rem" },
  { value: "xl", label: "XL", css: "1.5rem" },
  { value: "2xl", label: "2XL", css: "2rem" },
  { value: "3xl", label: "3XL", css: "2.5rem" },
  { value: "4xl", label: "4XL", css: "3rem" },
];

const SIZE_NAME = /^(?:text|font-size|fs)-([a-z0-9][\w-]*)$/i;
const SIZE_VALUE = /^(?:-?[\d.]+(?:px|rem|em|%|pt|vw|vh|vmin|vmax|ch|ex)|0|(?:clamp|calc|min|max|var)\(.*\))$/i;

/** `2xl` → "2XL", `s` → "S", `large` → "Large", `body-small` → "Body small". */
export function textSizeLabel(suffix: string) {
  if (/^(?:\d*x[sl]|[sml])$/i.test(suffix)) return suffix.toUpperCase();
  const words = suffix.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The innermost rules of a stylesheet (inside `@layer`, `@media` too), comments removed.
function rules(css: string) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
}

/** The text sizes the stylesheets define, in the order they are written; the bar's own scale when none. */
export function textSizeScale(stylesheets: string[]): TextSizeScale {
  const classes = new Map<string, TextSize>();
  const variables = new Map<string, TextSize>();
  for (const css of stylesheets) {
    for (const rule of rules(css)) {
      const single = /^\.(-?[_a-zA-Z][\w-]*)$/.exec(rule.selector);
      const named = single ? SIZE_NAME.exec(single[1]) : null;
      if (single && named && /(?:^|;)\s*font-size\s*:/i.test(rule.body) && !classes.has(single[1]))
        classes.set(single[1], { value: single[1], label: textSizeLabel(named[1]) });
      if (!rule.selector.split(",").some((part) => /^(?::root|html)$/i.test(part.trim()))) continue;
      for (const declaration of rule.body.split(";")) {
        const match = /^\s*--([\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(declaration);
        const name = match ? SIZE_NAME.exec(match[1]) : null;
        if (!match || !name || !SIZE_VALUE.test(match[2]) || variables.has(`--${match[1]}`)) continue;
        variables.set(`--${match[1]}`, { value: `--${match[1]}`, label: textSizeLabel(name[1]) });
      }
    }
  }
  if (classes.size) return { kind: "class", sizes: [...classes.values()] };
  if (variables.size) return { kind: "variable", sizes: [...variables.values()] };
  return { kind: "inline", sizes: INLINE_TEXT_SIZES };
}

// Split an inline style into declarations, keeping their order.
function declarations(style: string) {
  return style.split(";").map((part) => part.trim()).filter(Boolean);
}
const isFontSize = (declaration: string) => /^font-size\s*:/i.test(declaration);
const fontSizeValue = (declaration: string) => declaration.replace(/^font-size\s*:\s*/i, "").trim();

/** The element's size in `scale`: a size's value, "default" when it has none, "custom" for one outside the scale. */
export function currentTextSize(source: string, tag: StartTag, scale: TextSizeScale) {
  const inline = declarations(startTagAttribute(source, tag, "style")?.value ?? "").find(isFontSize);
  const css = inline ? fontSizeValue(inline) : undefined;
  if (scale.kind === "class") {
    const classes = (startTagAttribute(source, tag, "class")?.value ?? "").split(/\s+/);
    const size = scale.sizes.find((item) => classes.includes(item.value));
    return size ? size.value : css ? "custom" : "default";
  }
  if (!css) return "default";
  if (scale.kind === "variable") return scale.sizes.find((item) => css === `var(${item.value})`)?.value ?? "custom";
  return scale.sizes.find((item) => item.css === css)?.value ?? "custom";
}

/**
 * The start-tag edit that gives the element size `next` (a size's value, or
 * "default" for none): a class replaces any other size class and drops an
 * inline `font-size`; a variable or the bar's own scale rewrites the inline
 * `font-size`, other declarations kept. An emptied `class` or `style` goes.
 */
export function textSizeEdit(source: string, tag: StartTag, scale: TextSizeScale, next: string): RangeEdit | undefined {
  const size = scale.sizes.find((item) => item.value === next);
  if (!size && next !== "default") return undefined;
  const style = startTagAttribute(source, tag, "style");
  const kept = declarations(style?.value ?? "").filter((declaration) => !isFontSize(declaration));
  const changes: [string, string | undefined][] = [];
  if (scale.kind === "class") {
    const classAttribute = startTagAttribute(source, tag, "class");
    const classes = (classAttribute?.value ?? "").split(/\s+/).filter(Boolean);
    const others = classes.filter((name) => !scale.sizes.some((item) => item.value === name));
    const written = size ? [...others, size.value] : others;
    if (written.join(" ") !== classes.join(" ")) changes.push(["class", written.length ? written.join(" ") : undefined]);
  } else if (size) {
    kept.push(`font-size: ${scale.kind === "variable" ? `var(${size.value})` : (size as TextSize & { css: string }).css}`);
  }
  if (kept.join("; ") !== declarations(style?.value ?? "").join("; ")) changes.push(["style", kept.length ? kept.join("; ") : undefined]);
  const edit = setAttributesEdit(source, tag, changes);
  return edit.text === source.slice(edit.start, edit.end) ? undefined : edit;
}
