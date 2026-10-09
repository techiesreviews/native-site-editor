// `@import` in shared stylesheets, resolved from repository sources. Used by
// the editor host (the preview gets one sheet per imported file) and by the
// static exporter (imported files are inlined into the stylesheet that
// imports them, and `url()`s are rewritten for where the bundle is served).
//
// Constructed stylesheets drop `@import`, so the preview expands each import
// into its own sheet placed before the importing one. Its text is the
// imported file's source unchanged inside the wrappers the import asks for —
// `@media …`, `@supports (…)`, `@layer name` (or an anonymous `@layer`) — so
// its style rules count exactly like the file's own and map back to the
// file's byte ranges. Nested imports compose the wrappers of the whole chain,
// so layer names compose the way the browser composes them (`layer(a)` of a
// file holding `@layer b {}` is `a.b`). `@layer` statements ahead of an
// import get a sheet of their own before it, so layer order stays the
// order the file declares. A file imported twice is expanded twice, as the
// browser applies it twice; a file importing itself back is skipped and
// reported. External (`http:`, `https:`, `//`, `data:`) imports are left
// alone.
//
// The module is pure: it reads sources through a callback and returns text.

/** One `@import` statement at the head of a stylesheet. */
export interface CssImport {
  /** The URL as written. */
  url: string;
  /** Byte range of the whole statement, through its `;`. */
  start: number;
  end: number;
  /** Byte range of the URL token (`url(…)` or a string). */
  urlStart: number;
  urlEnd: number;
  /** `layer` → `""` (anonymous), `layer(name)` → `"name"`, absent → undefined. */
  layer?: string;
  /** The condition inside `supports(…)`, as written. */
  supports?: string;
  /** The media query list, as written. */
  media?: string;
}

/** What an import wraps its file in; one per import in a chain, outermost first. */
export interface ImportWrapper {
  layer?: string;
  supports?: string;
  media?: string;
}

/** One sheet of an expanded stylesheet list, in cascade order. */
export interface ExpandedSheet {
  /** Repository path whose source the sheet carries. */
  path: string;
  /** The sheet's text: the file's source (or its leading `@layer` statements) inside `wrappers`. */
  source: string;
  /** Wrappers from the import chain, outermost first; empty for a listed stylesheet. */
  wrappers: ImportWrapper[];
  /** The importing file, for an imported sheet. */
  importer?: string;
  /** `layers`: only the importing file's `@layer` statements that precede an import. */
  kind: "sheet" | "layers";
}

export interface ExpandedStyles {
  sheets: ExpandedSheet[];
  /** Missing files and circular imports, one message each. */
  errors: string[];
  /** Every repository path reached through an import (present or missing). */
  imported: string[];
}

const MAX_SHEETS = 500;

/** Comments blanked to spaces, so offsets stay intact. */
function blankComments(css: string) {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (comment) => " ".repeat(comment.length));
}

/** Index of the statement's `;` (outside strings and parentheses), or of a `{`/end when it has none. */
function statementEnd(css: string, from: number) {
  let depth = 0, quote = "";
  for (let index = from; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")" && depth) depth--;
    else if (depth === 0 && (char === ";" || char === "{" || char === "}")) return index;
  }
  return css.length;
}

/** The closing `)` matching the `(` at `open`. */
function closingParen(css: string, open: number) {
  let depth = 0, quote = "";
  for (let index = open; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

// A URL as written, quotes off and CSS escapes decoded (`bg\20 wide.png` is `bg wide.png`).
const unquote = (value: string) => {
  const trimmed = value.trim();
  const inner = /^(["']).*\1$/s.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
  return inner.replace(/\\(?:([0-9a-fA-F]{1,6})[\t\n\f\r ]?|([\s\S]))/g, (_, hex?: string, char?: string) =>
    (hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : char ?? ""));
};

// The URL, layer, supports() and media parts of one statement's prelude.
function parseImport(css: string, start: number, preludeStart: number, end: number): CssImport | undefined {
  let index = preludeStart;
  const skip = () => { while (index < end && /\s/.test(css[index])) index++; };
  skip();
  let url: string, urlStart = index, urlEnd: number;
  if (/^url\(/i.test(css.slice(index, index + 4))) {
    const close = closingParen(css, index + 3);
    if (close === -1 || close > end) return undefined;
    url = unquote(css.slice(index + 4, close));
    urlEnd = close + 1;
  } else if (css[index] === "\"" || css[index] === "'") {
    const quote = css[index];
    let close = index + 1;
    while (close < end && css[close] !== quote) close += css[close] === "\\" ? 2 : 1;
    if (close >= end) return undefined;
    url = unquote(css.slice(index, close + 1));
    urlEnd = close + 1;
  } else return undefined;
  index = urlEnd;
  const found: CssImport = { url, start, end: Math.min(end + 1, css.length), urlStart, urlEnd };
  skip();
  const layer = /^layer(?![\w-])(\()?/i.exec(css.slice(index, end));
  if (layer) {
    if (layer[1]) {
      const close = closingParen(css, index + 5);
      if (close === -1 || close > end) return undefined;
      found.layer = css.slice(index + 6, close).trim();
      index = close + 1;
    } else {
      found.layer = "";
      index += 5;
    }
    skip();
  }
  if (/^supports\(/i.test(css.slice(index, index + 9))) {
    const close = closingParen(css, index + 8);
    if (close === -1 || close > end) return undefined;
    found.supports = css.slice(index + 9, close).trim();
    index = close + 1;
    skip();
  }
  const media = css.slice(index, end).trim();
  if (media) found.media = media;
  return found;
}

/**
 * The statements at the head of a stylesheet, where `@import` is valid:
 * `@layer` statements, then `@import` rules (`@charset` is skipped).
 * Reading stops at the first other rule, or at a layer statement after an
 * import.
 */
export function parseCssImports(source: string): { imports: CssImport[]; layers: { start: number; end: number }[] } {
  const css = blankComments(source);
  const imports: CssImport[] = [];
  const layers: { start: number; end: number }[] = [];
  let index = 0;
  while (index < css.length) {
    while (index < css.length && /\s/.test(css[index])) index++;
    const head = /^@(import|layer|charset)(?![\w-])/i.exec(css.slice(index, index + 10));
    if (!head) break;
    const end = statementEnd(css, index + head[0].length);
    if (end >= css.length || css[end] !== ";") break;
    const name = head[1].toLowerCase();
    // A layer statement after an import ends the imports: later ones are invalid.
    if (name === "layer" && imports.length) break;
    if (name === "layer") layers.push({ start: index, end: end + 1 });
    else if (name === "import") {
      const found = parseImport(css, index, index + head[0].length, end);
      if (found) imports.push(found);
    }
    index = end + 1;
  }
  return { imports, layers };
}

/** Whether an import URL points outside the repository. */
export const isExternalImport = (url: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url.trim());

/**
 * The repository path an import URL names, relative to the importing file
 * (or to the repository root when it starts with `/`); undefined for an
 * external URL or one that leaves the repository.
 */
export function resolveImportPath(from: string, url: string): string | undefined {
  if (isExternalImport(url)) return undefined;
  const clean = url.trim().split(/[?#]/)[0];
  if (!clean) return undefined;
  const parts = clean.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join("/") : undefined;
}

/** `supports(display: grid)` holds a declaration; `@supports` wants it in parentheses. */
export function supportsCondition(value: string) {
  return /^[\w-]+\s*:/.test(value) ? `(${value})` : value;
}

/** `css` inside the chain's wrappers, outermost first; an import's conditions wrap its layer. */
export function wrapImported(css: string, wrappers: readonly ImportWrapper[]) {
  let open = "", close = "";
  for (const wrapper of wrappers) {
    if (wrapper.media) { open += `@media ${wrapper.media} {\n`; close = `\n}${close}`; }
    if (wrapper.supports) { open += `@supports ${supportsCondition(wrapper.supports)} {\n`; close = `\n}${close}`; }
    if (wrapper.layer !== undefined) { open += wrapper.layer ? `@layer ${wrapper.layer} {\n` : "@layer {\n"; close = `\n}${close}`; }
  }
  if (!open) return css;
  // An unterminated comment at the end would swallow the closing braces.
  const tail = /\/\*(?:(?!\*\/)[\s\S])*$/.test(css) ? "*/" : "";
  return open + css + tail + close;
}

/**
 * The sheets a list of stylesheets becomes once imports are expanded, in
 * cascade order. A list without imports comes back one sheet per entry,
 * unchanged.
 */
export function expandStyleImports(paths: readonly string[], read: (path: string) => string | undefined): ExpandedStyles {
  const sheets: ExpandedSheet[] = [];
  const errors: string[] = [];
  const imported = new Set<string>();
  function visit(path: string, source: string, wrappers: ImportWrapper[], chain: string[], importer?: string) {
    const { imports, layers } = parseCssImports(source);
    let layerIndex = 0;
    const flushLayers = (before: number) => {
      let text = "";
      while (layerIndex < layers.length && layers[layerIndex].start < before) {
        text += source.slice(layers[layerIndex].start, layers[layerIndex].end) + "\n";
        layerIndex++;
      }
      if (text) sheets.push({ path, source: wrapImported(text, wrappers), wrappers, importer, kind: "layers" });
    };
    for (const item of imports) {
      const target = resolveImportPath(path, item.url);
      if (target === undefined) {
        if (!isExternalImport(item.url)) errors.push(`${path} imports ${item.url}, which is outside the repository.`);
        continue;
      }
      imported.add(target);
      if (chain.includes(target)) {
        errors.push(`${path} imports ${target}, which imports it back; that import is skipped.`);
        continue;
      }
      const content = read(target);
      if (content === undefined) {
        errors.push(`${path} imports ${target}, which is missing from this branch.`);
        continue;
      }
      if (sheets.length >= MAX_SHEETS) {
        errors.push(`${path} imports too many stylesheets; ${target} and later ones are skipped.`);
        break;
      }
      flushLayers(item.start);
      const wrapper: ImportWrapper = {};
      if (item.layer !== undefined) wrapper.layer = item.layer;
      if (item.supports !== undefined) wrapper.supports = item.supports;
      if (item.media !== undefined) wrapper.media = item.media;
      const inner = Object.keys(wrapper).length ? [...wrappers, wrapper] : wrappers;
      visit(target, content, inner, [...chain, target], path);
    }
    sheets.push({ path, source: wrapImported(source, wrappers), wrappers, importer, kind: "sheet" });
  }
  for (const path of paths) visit(path, read(path) ?? "", [], [path]);
  return { sheets, errors, imported: [...imported] };
}

/**
 * `css` with each `url(…)` token (outside comments and strings) replaced by
 * `url("<replacement>")` where `replace` returns one; left as written where
 * it returns undefined.
 */
export function rewriteCssUrls(css: string, replace: (url: string) => string | undefined): string {
  let result = "", cursor = 0, quote = "";
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote || char === "\n") quote = "";
      continue;
    }
    if (char === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2);
      index = close === -1 ? css.length : close + 1;
    } else if (char === "\"" || char === "'") quote = char;
    else if ((char === "u" || char === "U") && /^url\(/i.test(css.slice(index, index + 4)) && !/[\w-]/.test(css[index - 1] ?? "")) {
      const close = closingParen(css, index + 3);
      if (close === -1) break;
      const next = replace(unquote(css.slice(index + 4, close)));
      if (next !== undefined) {
        result += css.slice(cursor, index) + `url("${next.replace(/["\\]/g, "\\$&")}")`;
        cursor = close + 1;
      }
      index = close;
    }
  }
  return result + css.slice(cursor);
}
