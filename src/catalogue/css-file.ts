// The CSS section of the design board's right panel (docs/wayfinder/atomic-catalogue/css-layers-plan.md): a part's
// own component CSS file, edited by hand and shown on its live cell only (in a shadow root of its own,
// component-css.ts). Edits never leave the page: "Send to agent" copies them as a plain-text change request for an
// agent to make in the code.
import { diffHunks } from "../text-diff";

/**
 * What is wrong with the edited text, or "" when nothing is: a brace that does not pair up, a quote, comment or
 * `url(` never closed, each of which drops the rules after it. The live cell keeps the last text with none. Braces
 * are read as the browser reads them: one escaped, quoted, in a comment or in an unquoted `url(…)` is text.
 */
export function cssProblem(css: string): string {
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
