// A component's stylesheet with a `::slotted()` twin for each selector, so a
// rule written for the template's own elements also styles what a page
// slots in: `h1` also reads `::slotted(h1)`, `.actions a` also
// `.actions ::slotted(a)`. Section components wrap whole elements in slots
// (`<slot name="title"><h1>…</h1></slot>`), and a page fills the slot with
// its own `<h1 slot="title">`, which the template's `h1` rule cannot reach
// across the shadow boundary. Used by the preview (a component's constructed
// sheet) and the static export (the component's stylesheet), so both show
// the same.
//
// Only selector lists change: no rule is added or removed, so rule indexes
// still map to the source file. A twin is left out where `::slotted()`
// cannot take the selector (a pseudo-element, `:host`, `&`, `:has()` in the
// last compound; a selector already crossing a slot or part) and where the
// list already has it, so a stylesheet that writes `h1, ::slotted(h1)` stays
// as it is. `@keyframes`, `@font-face` and other non-grouping at-rules are
// left alone.

import { splitSelectorList } from "./cascade";

// At-rules whose block holds rules (or, nested in a style rule, declarations and rules).
const GROUPING = new Set(["media", "supports", "layer", "container", "scope", "starting-style", "document", "-moz-document"]);

export function withSlottedRules(css: string): string {
  const inserts: { at: number; text: string }[] = [];
  // What each open block holds: rules, or a style rule's declarations and nested rules.
  const stack: ("rules" | "style")[] = [];
  let mode: "rules" | "style" = "rules";
  let pos = 0;
  while (pos < css.length) {
    pos = skipSpace(css, pos);
    if (pos >= css.length) break;
    if (css[pos] === "}") {
      mode = stack.pop() ?? "rules";
      pos++;
      continue;
    }
    const stop = preludeEnd(css, pos);
    if (css[stop] !== "{") {
      // A declaration or a statement at-rule; a `}` closes the block next time round.
      pos = css[stop] === ";" ? stop + 1 : stop;
      continue;
    }
    const prelude = css.slice(pos, stop);
    const text = withoutComments(prelude).trim();
    if (text.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(text)?.[1].toLowerCase() ?? "";
      if (GROUPING.has(name)) {
        stack.push(mode);
        pos = stop + 1;
      } else pos = blockEnd(css, stop);
      continue;
    }
    if (mode === "style" && /^--[\w-]*\s*:/.test(text)) {
      // A custom property whose value holds a block.
      pos = blockEnd(css, stop);
      continue;
    }
    const twins = slottedTwins(text);
    if (twins) inserts.push({ at: pos + prelude.trimEnd().length, text: twins });
    stack.push(mode);
    mode = "style";
    pos = stop + 1;
  }
  let out = "", cursor = 0;
  for (const { at, text } of inserts) {
    out += css.slice(cursor, at) + text;
    cursor = at;
  }
  return out + css.slice(cursor);
}

/** `, <twin>…` for a selector list's parts that have a `::slotted()` twin it lacks, or "". */
export function slottedTwins(list: string) {
  const parts = splitSelectorList(list);
  const have = new Set(parts.map(normalized));
  const twins: string[] = [];
  for (const part of parts) {
    const twin = slottedTwin(part);
    if (twin && !have.has(normalized(twin))) {
      have.add(normalized(twin));
      twins.push(twin);
    }
  }
  return twins.length ? `, ${twins.join(", ")}` : "";
}

/** `prefix ::slotted(last compound)` for one complex selector, or undefined. */
export function slottedTwin(selector: string): string | undefined {
  if (/::?(?:slotted|part)\(/i.test(selector)) return undefined;
  const start = lastCompoundStart(selector);
  const compound = selector.slice(start);
  if (!compound || /[&]|:host\b|:has\(|::|:(?:before|after|first-line|first-letter)\b/i.test(compound)) return undefined;
  if (complexArgument(compound)) return undefined;
  return `${selector.slice(0, start)}::slotted(${compound})`;
}

// Whether a pseudo-class argument in the compound holds a combinator
// (`:not(.x .y)`), which Chromium refuses inside `::slotted()`. An `An+B`
// is not a selector; the selector after its `of` is checked.
function complexArgument(compound: string) {
  const text = compound
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, "\"\"")
    .replace(/(:nth-[\w-]+\()([^()]*?)(?:\bof\b([^()]*))?\)/gi, (_, open: string, _nth: string, of = "") => `${open}${of})`);
  const opens: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(") opens.push(index);
    else if (text[index] === ")" && opens.length) {
      const inner = text.slice(opens.pop()! + 1, index);
      if (splitSelectorList(inner).some((part) => lastCompoundStart(part.trim()) > 0)) return true;
    }
  }
  return false;
}

// Where the last compound selector starts: after the last combinator
// (whitespace, `>`, `+`, `~`) outside parentheses, brackets and strings.
function lastCompoundStart(selector: string) {
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\\") index++;
    else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (depth === 0 && /[\s>+~]/.test(char)) start = index + 1;
  }
  return start;
}

const normalized = (selector: string) => selector.replace(/\s+/g, " ").replace(/\s*([>+~(),])\s*/g, "$1").trim();

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");

function skipSpace(css: string, pos: number) {
  while (pos < css.length) {
    if (/\s/.test(css[pos])) pos++;
    else if (css.startsWith("/*", pos)) {
      const close = css.indexOf("*/", pos + 2);
      pos = close === -1 ? css.length : close + 2;
    } else break;
  }
  return pos;
}

// The index of the `{`, `;` or `}` that ends the statement starting at `pos`
// (outside comments, strings, parentheses and brackets), or the end.
function preludeEnd(css: string, pos: number) {
  let depth = 0, quote = "";
  for (let index = pos; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote || char === "\n") quote = "";
    } else if (char === "\\") index++;
    else if (char === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2);
      if (close === -1) return css.length;
      index = close + 1;
    } else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (depth === 0 && (char === "{" || char === ";" || char === "}")) return index;
  }
  return css.length;
}

// Just past the `}` matching the `{` at `open`.
function blockEnd(css: string, open: number) {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    const stop = preludeEnd(css, index);
    if (stop >= css.length) return css.length;
    if (css[stop] === "{") depth++;
    else if (css[stop] === "}" && --depth === 0) return stop + 1;
    index = stop;
  }
  return css.length;
}
