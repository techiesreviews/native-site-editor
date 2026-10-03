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

function commentRanges(source: string) {
  const ranges: { start: number; end: number }[] = [];
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") { i++; continue; }
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2) + 2;
      ranges.push({ start: i, end }); i = end - 1;
    }
  }
  return ranges;
}
const trimCssWhitespace = (value: string) => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");

function withoutComments(source: string) {
  for (const range of commentRanges(source).reverse()) source = source.slice(0, range.start) + " " + source.slice(range.end);
  return source;
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
        const block: CssBlock = { selector: trimCssWhitespace(withoutComments(source.slice(start, i))), start, open: i, close: i, end: i, parent, children: [], declarations: [] };
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
const lastWhere = <T>(items: T[], predicate: (item: T) => boolean) => [...items].reverse().find(predicate);
const normalized = (value: string) => trimCssWhitespace(value.replace(/[\t\n\f\r ]+/g, " "));
const ancestors = (rule: CssBlock) => {
  const out: CssBlock[] = [];
  for (let parent = rule.parent; parent; parent = parent.parent) out.unshift(parent);
  return out;
};
const isRule = (block: CssBlock) => !block.selector.startsWith("@") && !ancestors(block).some((p) => /keyframes\b/.test(p.selector));
export const cssClassSelector = (name: string) => "." + Array.from(name).map((c, i) => {
  if ((i === 0 && /\d/.test(c)) || (i === 1 && name[0] === "-" && /\d/.test(c))) return `\\${c.codePointAt(0)!.toString(16)} `;
  return /[\w-]/.test(c) || c.codePointAt(0)! >= 128 ? c : `\\${c}`;
}).join("");

export interface CssTarget { path: string; selector: string; start?: number }
/** Prefer the most specific matched simple class rule, then its source order. */
export function locateClassRule(files: Readonly<Record<string, string>>, matches: readonly { path: string; selector: string; ruleIndex?: number; conditions?: string[]; state?: string[] }[], className: string, fallbackPath: string): CssTarget {
  const selector = cssClassSelector(className);
  const candidates = matches.filter((m) => /\.css$/i.test(m.path) && !m.state?.length && !m.conditions?.some((c) => /^@?media\b/i.test(c)) &&
    (normalized(m.selector) === selector || /^\.[\w-]+[\t\n\f\r ]+$/.test(normalized(m.selector).slice(0, -selector.length)) && normalized(m.selector).endsWith(selector)));
  candidates.sort((a, b) => b.selector.split(/[\t\n\f\r ]+/).length - a.selector.split(/[\t\n\f\r ]+/).length || matches.indexOf(b) - matches.indexOf(a));
  for (const match of candidates) {
    const rules = scanCss(files[match.path] ?? "").filter(isRule);
    const rule = match.ruleIndex === undefined ? lastWhere(rules, (r) => normalized(r.selector) === normalized(match.selector)) : rules[match.ruleIndex];
    if (rule && normalized(rule.selector) === normalized(match.selector) && !ancestors(rule).some((p) => /^@media\b/.test(p.selector)))
      return { path: match.path, selector: rule.selector, start: rule.start };
  }
  return { path: fallbackPath, selector };
}

export interface CssWriteOptions { expectedSource?: string; selector: string; baseStart?: number; breakpoint?: number; state?: "" | ":hover" | ":focus-visible" }
const mediaWidth = (block: CssBlock) => /^@media\s+(?:screen\s+and\s+)?\(\s*max-width\s*:\s*(\d+)px\s*\)\s*$/i.exec(block.selector)?.[1];
export function locateWriteRule(source: string, options: CssWriteOptions): CssBlock | undefined {
  const blocks = scanCss(source);
  const base = options.baseStart === undefined
    ? lastWhere(blocks, (b) => normalized(b.selector) === normalized(options.selector) && !ancestors(b).some((p) => /^@media\b/.test(p.selector)))
    : blocks.find((b) => b.start === options.baseStart && normalized(b.selector) === normalized(options.selector));
  if (options.baseStart !== undefined && !base) return undefined;
  if (!options.breakpoint && !options.state && base && normalized(base.selector) === normalized(options.selector)) return base;
  const context = base?.parent;
  const selector = normalized(options.selector + (options.state ?? ""));
  return lastWhere(blocks, (b) => isRule(b) && normalized(b.selector) === selector && (options.breakpoint
    ? !!b.parent && mediaWidth(b.parent) === String(options.breakpoint) && b.parent.parent === context
    : b.parent === context));
}
function format(source: string) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const indents = [...source.matchAll(/^(\t+| +)\S/gm)].map((m) => m[1]);
  const unit = indents.some((i) => i.includes("\t")) ? "\t" : " ".repeat((indents.length ? Math.min(...indents.map((i) => i.length)) : 2));
  return { newline, unit };
}
function indentAt(source: string, offset: number) { return /^[\t ]*/.exec(source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset))![0]; }
function replace(source: string, edits: { start: number; end: number; text: string }[]) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
export function validateCssSource(source: string) {
  syntax(source);
  if (!checkedCss(source)) throw new Error("The stylesheet cannot be safely parsed.");
}

/** Empty/null values remove a property. All properties become a single source edit. */
export function writeCssProperties(source: string, options: CssWriteOptions, properties: Readonly<Record<string, string | null>>): string {
  if (options.expectedSource !== undefined && source !== options.expectedSource) throw new Error("The stylesheet changed. Try the style edit again.");
  validateCssSource(source);
  if (options.baseStart !== undefined && !scanCss(source).some((block) => block.start === options.baseStart && normalized(block.selector) === normalized(options.selector)))
    throw new Error("The CSS rule changed. Select the element again.");
  if (!options.selector.trim() || /[{};]/.test(syntax(options.selector))) throw new Error("Invalid CSS selector.");
  if (options.breakpoint !== undefined && (!Number.isFinite(options.breakpoint) || options.breakpoint <= 0)) throw new Error("Invalid CSS breakpoint.");
  for (const [property, value] of Object.entries(properties)) {
    if (!/^(--[\w-]+|[a-z][a-z-]*)$/.test(property)) throw new Error("Invalid CSS property.");
    if (value && /[{};]/.test(syntax(value))) throw new Error("Enter one CSS value.");
  }
  const { newline, unit } = format(source);
  const rule = locateWriteRule(source, options);
  if (rule) {
    const edits: { start: number; end: number; text: string }[] = [];
    const additions: string[] = [];
    for (const [property, raw] of Object.entries(properties)) {
      const value = raw?.trim();
      const declarations = rule.declarations.filter((d) => d.property === property);
      const last = lastWhere(declarations, (declaration) => /!important\s*$/i.test(withoutComments(declaration.value))) ?? declarations.at(-1);
      for (const d of declarations) {
        let start = d.start, end = d.end;
        const original = source.slice(d.start, d.end);
        const comments = commentRanges(original).map((range) => original.slice(range.start, range.end)).join(" ");
        const text = value && d === last ? `${property}: ${value}${/!important\s*$/i.test(withoutComments(d.value)) && !/!important\s*$/i.test(withoutComments(value)) ? " !important" : ""}${comments ? " " + comments : ""};` : comments;
        if (!text) {
          const lineStart = source.lastIndexOf("\n", start - 1) + 1;
          const lineEnd = source.indexOf("\n", end);
          if (!source.slice(lineStart, start).trim() && lineEnd !== -1 && !source.slice(end, lineEnd).trim()) { start = lineStart; end = lineEnd + 1; }
        }
        edits.push({ start, end, text });
      }
      if (value && !last) additions.push(`${property}: ${value};`);
    }
    if (additions.length) {
      const multiline = source.slice(rule.open, rule.close).includes("\n");
      const baseIndent = indentAt(source, rule.start);
      const childIndent = rule.declarations[0] && multiline ? indentAt(source, rule.declarations[0].start) : baseIndent + unit;
      const tail = rule.declarations.at(-1);
      const missingSemicolon = tail && source[tail.end - 1] !== ";" && !edits.some((e) => e.start <= tail.start && e.end >= tail.end);
      const closingLine = multiline && !source.slice(source.lastIndexOf("\n", rule.close - 1) + 1, rule.close).trim();
      const at = closingLine ? source.lastIndexOf("\n", rule.close - 1) + 1 : multiline ? rule.close : rule.close - (source.slice(rule.open + 1, rule.close).match(/\s*$/)?.[0].length ?? 0);
      const samePoint = missingSemicolon && tail.end === at;
      if (missingSemicolon && !samePoint) edits.push({ start: tail.end, end: tail.end, text: ";" });
      const text = (samePoint ? ";" : "") + (multiline ? (closingLine ? "" : newline) + additions.map((d) => childIndent + d).join(newline) + newline + (closingLine ? "" : baseIndent) : " " + additions.join(" ") + " ");
      edits.push({ start: at, end: multiline ? at : rule.close, text });
    }
    return replace(source, edits);
  }
  const entries = Object.entries(properties).filter(([, v]) => v?.trim());
  if (!entries.length) return source;
  const blocks = scanCss(source);
  const base = options.baseStart === undefined
    ? lastWhere(blocks, (b) => normalized(b.selector) === normalized(options.selector) && !ancestors(b).some((p) => /^@media\b/.test(p.selector)))
    : blocks.find((b) => b.start === options.baseStart && normalized(b.selector) === normalized(options.selector));
  const parent = base?.parent;
  const media = options.breakpoint ? lastWhere(blocks, (b) => b.parent === parent && mediaWidth(b) === String(options.breakpoint)) : undefined;
  const container = media ?? parent;
  const containerIndent = container ? indentAt(source, container.start) : "";
  const ruleIndent = container ? containerIndent + unit : "";
  const renderRule = (indent: string) => `${indent}${options.selector}${options.state ?? ""} {${newline}${entries.map(([p, v]) => `${indent}${unit}${p}: ${v!.trim()};`).join(newline)}${newline}${indent}}${newline}`;
  const newMedia = options.breakpoint && !media;
  const text = newMedia ? `${ruleIndent}@media (max-width: ${options.breakpoint}px) {${newline}${renderRule(ruleIndent + unit)}${ruleIndent}}${newline}` : renderRule(ruleIndent);
  if (!container) return source + (source && !source.endsWith("\n") ? newline : "") + (source ? newline : "") + text;
  const lineStart = source.lastIndexOf("\n", container.close - 1) + 1;
  const at = !source.slice(lineStart, container.close).trim() ? lineStart : container.close;
  return source.slice(0, at) + newline + text + (at === container.close ? containerIndent : "") + source.slice(at);
}

export interface SiteVariable { path: string; name: string; value: string; ruleStart: number; selector: string }
export function siteVariables(files: Readonly<Record<string, string>>): SiteVariable[] {
  return Object.entries(files).filter(([path]) => /\.css$/i.test(path)).flatMap(([path, source]) => scanCss(source)
    .filter((rule) => rule.selector.split(",").some((s) => s.trim() === ":root") && !ancestors(rule).some((p) => /^@media\b/.test(p.selector)))
    .flatMap((rule) => rule.declarations.filter((d) => d.property.startsWith("--")).map((d) => ({ path, name: d.property, value: d.value, ruleStart: rule.start, selector: rule.selector }))));
}

/** Resolve site variables for swatches; never borrow the editor's own tokens. */
export function resolveVariableValue(value: string, variables: readonly SiteVariable[]): string {
  const values = new Map(variables.map((v) => [v.name, v.value]));
  for (let depth = 0; depth < 12; depth++) {
    const next = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (original, name: string, fallback: string | undefined) => values.get(name) ?? fallback?.trim() ?? original);
    if (next === value) break;
    value = next;
  }
  return value;
}
