// The CSS section of the design board's right panel (docs/wayfinder/atomic-catalogue/css-layers-plan.md): a part's
// own component CSS file, edited by hand and shown on its live cell only (in a shadow root of its own,
// component-css.ts). Edits never leave the page: "Send to agent" copies them as a plain-text change request for an
// agent to make in the code.
import { diffHunks } from "../text-diff";

const CLOSER: Record<string, string> = { "{": "}", "(": ")", "[": "]" };

/**
 * What is wrong with the edited text, or "" when nothing is: a brace that does not pair up, a bracket, quote, comment
 * or `url(` never closed, each of which drops the rules after it. The live cell keeps the last text with none. Read
 * as the browser reads it: an escaped, quoted or commented character, or one in an unquoted `url(…)`, is text, and an
 * open `(` or `[` takes in the braces after it.
 */
export function cssProblem(css: string): string {
  const open: string[] = [];
  let quote = "";
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
    else if (char in CLOSER) open.push(char);
    else if (char === "}" && !open.length) return "A } closes a rule that was never opened";
    // A closer pairs with its own opener; any other is text inside the bracket still open.
    else if ((char === "}" || char === ")" || char === "]") && CLOSER[open.at(-1) ?? ""] === char) open.pop();
  }
  if (quote) return "A quote is never closed";
  return open.length ? `A ${open[0]} is never closed` : "";
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
