/** Offset-based CSS edits: site source stays readable, including nested layers. */
export interface CssDeclaration { property: string; value: string; start: number; end: number }
export interface CssBlock {
  selector: string; start: number; open: number; close: number; end: number;
  parent?: CssBlock; children: CssBlock[]; declarations: CssDeclaration[];
}

// Blank comments and strings without changing offsets. Punctuation in either
// must never be mistaken for a declaration or a rule boundary.
function syntax(source: string) {
  let out = "", quote = "", comment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment) {
      out += c === "\n" || c === "\r" ? c : " ";
      if (c === "*" && next === "/") { out += " "; i++; comment = false; }
    } else if (quote) {
      if (c === "\n" || c === "\r") throw new Error("The stylesheet has an unfinished string.");
      out += " ";
      if (c === "\\") { out += " "; i++; if (next === "\r" && source[i + 1] === "\n") { out += " "; i++; } }
      else if (c === quote) quote = "";
    } else if (c === "/" && next === "*") { out += "  "; i++; comment = true; }
    else if (c === "'" || c === '"') { quote = c; out += " "; }
    else if (c === "\\") { out += "  "; i++; }
    else out += c;
  }
  if (quote || comment || out.length !== source.length) throw new Error("The stylesheet has an unfinished string, comment or escape.");
  const stack: string[] = [];
  for (const c of out) {
    if (c === "(" || c === "[") stack.push(c);
    else if (c === ")" || c === "]") {
      if (stack.pop() !== (c === ")" ? "(" : "[")) throw new Error("The stylesheet has unbalanced CSS delimiters.");
    } else if (c === "{" && !stack.some((value) => value === "(" || value === "[")) stack.push(c);
    else if (c === "}" && !stack.some((value) => value === "(" || value === "[")) {
      if (stack.pop() !== "{") throw new Error("The stylesheet has unbalanced CSS delimiters.");
    }
  }
  if (stack.length) throw new Error("The stylesheet has unbalanced CSS delimiters.");
  return out;
}

function checkedCss(source: string): CssBlock[] | undefined {
  let clean: string;
  try { clean = syntax(source); } catch { return undefined; }
  const blocks: CssBlock[] = [];
  let invalid = false;
  function scan(from: number, parent?: CssBlock): number {
    let boundary = from, paren = 0, bracket = 0;
    const declaration = (to: number, semi: boolean) => {
      const text = clean.slice(boundary, to);
      const match = /^\s*(--[\w-]+|[-\w]+)\s*:/.exec(text);
      if (text.trim() && !match && !/^\s*@[-\w]+\b/.test(text)) invalid = true;
      if (!parent && text.trim() && !/^\s*@[-\w]+\b/.test(text)) invalid = true;
      if (parent && match) {
        const start = boundary + text.search(/\S/);
        const colon = boundary + match[0].lastIndexOf(":");
        if (!match[1].startsWith("--")) {
          let depth = 0;
          for (const c of clean.slice(colon + 1, to)) {
            if (c === "(" || c === "[") depth++;
            else if (c === ")" || c === "]") depth--;
            else if (c === ":" && !depth) invalid = true;
          }
        }
        // Use original text for strings, URLs and comments in values.
        parent.declarations.push({ property: match[1], value: source.slice(colon + 1, to).trim(), start, end: semi ? to + 1 : boundary + source.slice(boundary, to).trimEnd().length });
      }
    };
    for (let i = from; i < clean.length; i++) {
      const c = clean[i];
      if (c === "(") paren++;
      else if (c === ")") paren--;
      else if (c === "[") bracket++;
      else if (c === "]") bracket--;
      else if (!paren && !bracket && c === ";") { declaration(i, true); boundary = i + 1; }
      else if (!paren && !bracket && c === "{") {
        const prelude = clean.slice(boundary, i);
        if (!prelude.trim()) invalid = true;
        const start = boundary + prelude.search(/\S/);
        const block: CssBlock = { selector: normalized(source.slice(start, i)), start, open: i, close: i, end: i, parent, children: [], declarations: [] };
        blocks.push(block);
        parent?.children.push(block);
        i = scan(i + 1, block);
        block.close = i; block.end = i + 1;
        boundary = i + 1;
      } else if (!paren && !bracket && c === "}") { declaration(i, false); return i; }
    }
    if (clean.slice(boundary).trim()) invalid = true;
    return clean.length;
  }
  scan(0);
  return invalid ? undefined : blocks;
}
export function scanCss(source: string): CssBlock[] { return checkedCss(source) ?? []; }
// Only selector whitespace outside strings, comments and escapes is insignificant.
function normalized(value: string): string {
  let result = "", pendingSpace = false;
  for (let i = 0; i < value.length;) {
    const c = value[i];
    if (/[\t\n\f\r ]/.test(c)) { pendingSpace = !!result; i++; continue; }
    if (pendingSpace) { result += " "; pendingSpace = false; }
    const start = i;
    if (c === "/" && value[i + 1] === "*") {
      const end = value.indexOf("*/", i + 2); i = end < 0 ? value.length : end + 2;
    } else if (c === "'" || c === '"') {
      const quote = c; i++;
      while (i < value.length) {
        if (value[i] === "\\") { i += 2; continue; }
        if (value[i++] === quote) break;
      }
    } else if (c === "\\") {
      i++;
      if (/[0-9a-f]/i.test(value[i] ?? "")) {
        let count = 0;
        while (i < value.length && count < 6 && /[0-9a-f]/i.test(value[i])) { i++; count++; }
        if (/[\t\n\f\r ]/.test(value[i] ?? "")) {
          if (value[i] === "\r" && value[i + 1] === "\n") i++;
          i++;
        }
      } else if (i < value.length) {
        if (value[i] === "\r" && value[i + 1] === "\n") i++;
        i++;
      }
    } else i++;
    result += value.slice(start, i);
  }
  return result;
}
