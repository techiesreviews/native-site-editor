// The CSS section of the design board's right panel (docs/wayfinder/atomic-catalogue/css-layers-plan.md): a part's
// own component CSS file, edited by hand and shown on its live cell only. Edits never leave the page: "Send to agent"
// copies them as a plain-text change request for an agent to make in the code.
import { diffHunks } from "../text-diff";

/** The text with its comments taken out, strings kept as written. */
function withoutComments(css: string): string {
  let out = "", quote = "";
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (quote) {
      out += char;
      if (char === "\\") out += css[++i] ?? "";
      else if (char === quote) quote = "";
    } else if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else {
      if (char === "\"" || char === "'") quote = char;
      out += char;
    }
  }
  return out;
}

/**
 * Why the edited text cannot be shown safely, or "" when it can: a brace that does not pair up would end the live
 * cell's scope and reach the whole board, and a closing tag has no place in a stylesheet. Braces are read as the
 * browser reads them: one escaped, quoted, in a comment or in an unquoted `url(…)` is text.
 */
export function cssProblem(css: string): string {
  if (/<\//.test(css)) return "A closing tag cannot be in a stylesheet";
  let depth = 0, quote = "";
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
      continue;
    }
    const url = /^url\(\s*(?!["'\s])/i.exec(css.slice(i, i + 64));
    if (char === "\\") i++;
    else if (url && !/[\w-]/.test(css[i - 1] ?? "")) {
      let end = i + url[0].length;
      while (end < css.length && css[end] !== ")") end += css[end] === "\\" ? 2 : 1;
      if (end >= css.length) return "A url( is never closed";
      i = end;
    } else if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) return "A comment is never closed";
      i = end + 1;
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "{") depth++;
    else if (char === "}" && --depth < 0) return "A } closes a rule that was never opened";
  }
  if (quote) return "A quote is never closed";
  return depth > 0 ? "A { is never closed" : "";
}

interface Block { prelude: string; items: Item[] }
type Item = { declaration: string } | Block;

/** The rules of a comment-free stylesheet as blocks and declarations; statements (`@layer a, b;`) are left out. */
function parse(css: string): Item[] {
  const root: Block = { prelude: "", items: [] };
  const stack: Block[] = [root];
  let start = 0, depth = 0, quote = "";
  const piece = (end: number) => css.slice(start, end).replace(/\s+/g, " ").trim();
  const settle = (end: number) => {
    const text = piece(end);
    if (text && !text.startsWith("@") && /^[\w-]+\s*:/.test(text)) stack.at(-1)!.items.push({ declaration: text.slice(0, text.indexOf(":")).trim() });
  };
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (quote) { if (char === "\\") i++; else if (char === quote) quote = ""; continue; }
    if (char === "\"" || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (depth > 0) continue;
    else if (char === "{") {
      const block: Block = { prelude: piece(i), items: [] };
      stack.at(-1)!.items.push(block);
      stack.push(block);
      start = i + 1;
    } else if (char === ";") { settle(i); start = i + 1; }
    else if (char === "}") { settle(i); if (stack.length > 1) stack.pop(); start = i + 1; }
  }
  return root.items;
}

const write = (items: Item[]): string[] => items.map((item) =>
  "declaration" in item ? `${item.declaration}: revert-layer;` : `${item.prelude} { ${write(item.items).join(" ")} }`);

/**
 * The file with every declaration set to `revert-layer`: on its own layer, it takes each value back to what the
 * layers before it give, as if the file's rules were not there. Selectors and at-rules stay as written.
 */
export function revertCopy(css: string): string {
  return write(parse(withoutComments(css))).join("\n");
}

/** Layer order statements: they cannot sit inside a rule, and the page's own order already holds. */
const withoutOrder = (css: string) => css.replace(/@layer\s+[\w.-]+(?:\s*,\s*[\w.-]+)*\s*;/g, "");

/**
 * The CSS that shows an edited file on the live cell only: nested in `scope`, the file's own rules are first taken
 * back (a declaration deleted in the edit is gone there too), then the edited file applies. Nesting keeps each rule
 * on its layer and adds nothing to its specificity, and later in the page it wins over the file's own rule.
 */
export function liveCss(original: string, edited: string, scope: string): string {
  return `:where(${scope}) { ${revertCopy(original)} }\n:where(${scope}) {\n${withoutOrder(edited)}\n}`;
}

/** The plain-text change request "Send to agent" copies; "" when the file is unchanged. */
export function cssChangeRequest(part: { id: string; name: string }, path: string, before: string, after: string): string {
  if (before === after) return "";
  const changed = diffHunks(before, after, 0).flatMap((hunk) => [
    `Line ${hunk.lines[0].line}:`,
    ...hunk.lines.map((line) => `${line.kind === "add" ? "+" : "-"}${line.text}`),
  ]);
  return [
    "Design board change request",
    `Part: ${part.name} (data-part="${part.id}")`,
    `File: ${path}`,
    "Changed lines:",
    ...changed,
    "The file as edited:",
    "```css",
    after.trimEnd(),
    "```",
    "Tried on the board's live cell only; nothing is in the code yet.",
  ].join("\n");
}
