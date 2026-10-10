// String-level HTML source parsing shared by the editor (selection mapping,
// edit bar edits) and the static exporter: start tags with their offsets,
// element ranges, attributes, and text-to-source offset mapping. No DOM here,
// so it compiles for the Worker and Node as well as the browser.

export interface StartTag {
  name: string;
  start: number;
  // Offset just past the tag name, where an attribute can be inserted.
  nameEnd: number;
  // Offset just past the closing `>`.
  end: number;
}

// Elements whose content the parser reads as text, so tags inside are not tags.
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
export const MARK = "data-native-src";

// HTML folds ASCII letters only; Unicode lowercasing can also change offset lengths.
export const asciiLower = (text: string) => text.replace(/[A-Z]/g, (char) => char.toLowerCase());

// Where the raw text of a `name` element whose content starts at `from` ends: its end tag, else
// the end (always the end for <plaintext>).
function rawTextEnd(html: string, name: string, from: number) {
  if (name === "plaintext") return html.length;
  const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "gi");
  close.lastIndex = from;
  return close.exec(html)?.index ?? html.length;
}

export function startTags(html: string): StartTag[] {
  const out: StartTag[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close < 0 ? html.length : close + 3;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "!" || next === "?" || next === "/") {
      const close = html.indexOf(">", lt + 2);
      i = close < 0 ? html.length : close + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i = lt + 1;
      continue;
    }
    let j = lt + 1;
    while (j < html.length && !/[\t\n\f\r />]/.test(html[j])) j++;
    const name = asciiLower(html.slice(lt + 1, j));
    const nameEnd = j;
    // Attributes: quoted values may contain `>`.
    while (j < html.length && html[j] !== ">") {
      const char = html[j];
      if (char === "\"" || char === "'") {
        const close = html.indexOf(char, j + 1);
        j = close < 0 ? html.length : close + 1;
      } else j++;
    }
    const end = Math.min(j + 1, html.length);
    out.push({ name, start: lt, nameEnd, end });
    i = end;
    if (RAW_TEXT.has(name)) {
      if (name === "plaintext") break;
      i = rawTextEnd(html, name, i);
    }
  }
  return out;
}

// Source with every start tag carrying its index into `tags`.
export function markStartTags(html: string, tags = startTags(html)) {
  let out = "";
  let from = 0;
  tags.forEach((tag, index) => {
    out += `${html.slice(from, tag.nameEnd)} ${MARK}="${index}"`;
    from = tag.nameEnd;
  });
  return out + html.slice(from);
}

// Elements with no end tag, whose source range is the start tag alone.
export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

export interface ElementRange {
  tag: StartTag;
  // Outer source range: from the start tag's `<` to just past the end tag's
  // `>` (or past the start tag for a void element).
  start: number;
  end: number;
  // The end tag, absent for void elements.
  close?: { start: number; end: number };
}

// The outer range of the element whose start tag is `tags[tagIndex]`.
// `boundary` is where the first later start tag that is not a descendant
// begins (or the end of the source), or the parent's end tag when that comes
// first, so the end tag lies before it. Fails
// closed (undefined) when the end tag is implied or cannot be told apart from
// a same-named descendant's, since a guessed range would edit the wrong HTML.
export function elementEnd(html: string, tags: StartTag[], tagIndex: number, boundary: number): ElementRange | undefined {
  const tag = tags[tagIndex];
  if (!tag) return undefined;
  if (VOID_ELEMENTS.has(tag.name)) return { tag, start: tag.start, end: tag.end };
  let opens = 0;
  // The span again with comments, descendants' start tags and their raw text
  // blanked. An end tag written there (`<!-- </div> -->`, a script's
  // "</head>", an attribute value) is not one; rather than guess which are
  // real, any such text fails closed. A raw text element's own content is text.
  let markup = "";
  let from = tag.end;
  const text = (to: number) => {
    const part = html.slice(from, Math.max(from, to));
    markup += RAW_TEXT.has(tag.name) ? part : part.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => " ".repeat(comment.length));
    from = Math.max(from, to);
  };
  const blank = (to: number) => { markup += " ".repeat(Math.max(0, to - from)); from = Math.max(from, to); };
  for (let i = tagIndex + 1; i < tags.length && tags[i].start < boundary; i++) {
    if (tags[i].name === tag.name) opens++;
    text(tags[i].start);
    blank(Math.min(tags[i].end, boundary));
    if (RAW_TEXT.has(tags[i].name)) blank(Math.min(rawTextEnd(html, tags[i].name, from), boundary));
  }
  text(boundary);
  const needle = `</${tag.name}`;
  const closesIn = (span: string) => {
    const at: number[] = [];
    for (let i = span.indexOf(needle); i >= 0; i = span.indexOf(needle, i + 1)) {
      const after = span[i + needle.length];
      if (after === undefined || after === ">" || after === "/" || /[\t\n\f\r ]/.test(after)) at.push(i);
    }
    return at;
  };
  const closes = closesIn(asciiLower(html.slice(tag.end, boundary)));
  if (closesIn(asciiLower(markup)).length !== closes.length) return undefined;
  // Every same-named descendant closes before this element does, so exactly
  // one extra end tag belongs here, and it is the last one.
  if (closes.length !== opens + 1) return undefined;
  const closeStart = tag.end + closes[closes.length - 1];
  // Inside, no end tag without its start tag: one (an ancestor's `</section>`,
  // say) would end this element before the end tag counted here. A raw text
  // element's content is text.
  const content = RAW_TEXT.has(tag.name) ? "" : asciiLower(markup.slice(0, closeStart - tag.end));
  const unopened = new Map<string, number>();
  for (const match of content.matchAll(/<\/([a-z][^\t\n\f\r />]*)/g)) unopened.set(match[1], (unopened.get(match[1]) ?? 0) + 1);
  for (let i = tagIndex + 1; i < tags.length && tags[i].start < closeStart; i++)
    if (unopened.has(tags[i].name)) unopened.set(tags[i].name, unopened.get(tags[i].name)! - 1);
  if ([...unopened.values()].some((count) => count > 0)) return undefined;
  const gt = html.indexOf(">", closeStart);
  if (gt < 0 || gt >= boundary) return undefined;
  return { tag, start: tag.start, end: gt + 1, close: { start: closeStart, end: gt + 1 } };
}


const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0", copy: "\u00a9", reg: "\u00ae",
  hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c",
  rdquo: "\u201d", laquo: "\u00ab", raquo: "\u00bb", middot: "\u00b7", bull: "\u2022", trade: "\u2122",
  euro: "\u20ac", pound: "\u00a3", yen: "\u00a5", deg: "\u00b0", times: "\u00d7", shy: "\u00ad",
};

export function decodeEntity(source: string, at: number): { text: string; length: number } | undefined {
  const match = /^&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/.exec(source.slice(at, at + 12));
  if (!match) return undefined;
  if (match[3] !== undefined) {
    const named = NAMED_ENTITIES[match[3]];
    return named === undefined ? undefined : { text: named, length: match[0].length };
  }
  const code = Number.parseInt(match[1] ?? match[2], match[1] !== undefined ? 10 : 16);
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return undefined;
  return { text: String.fromCodePoint(code), length: match[0].length };
}

export interface SourceSpan {
  start: number;
  end: number;
}

// Maps a range of an element's DOM text content (`start`..`end`, UTF-16
// units, which is how a preview selection is reported) to offsets in its
// inner source, skipping tags and comments and decoding entities. Undefined
// when the mapped source does not decode to `text`, or when the span would
// cut through a tag, so a wrapper is only ever inserted around balanced HTML.
export function textRangeInSource(inner: string, start: number, end: number, text: string): SourceSpan | undefined {
  if (start < 0 || end <= start) return undefined;
  const starts: number[] = [];
  const ends: number[] = [];
  let decoded = "";
  let i = 0;
  const unit = (piece: string, from: number, to: number) => {
    for (let k = 0; k < piece.length; k++) { starts.push(from); ends.push(to); }
    decoded += piece;
  };
  while (i < inner.length && starts.length < end) {
    const char = inner[i];
    if (char === "<") {
      if (inner.startsWith("<!--", i)) {
        const close = inner.indexOf("-->", i + 4);
        i = close < 0 ? inner.length : close + 3;
        continue;
      }
      if (/[a-zA-Z/!?]/.test(inner[i + 1] ?? "")) {
        const tag = startTags(inner.slice(i))[0];
        if (tag && tag.start === 0) i += tag.end;
        else {
          const close = inner.indexOf(">", i + 1);
          i = close < 0 ? inner.length : close + 1;
        }
        continue;
      }
    }
    if (char === "&") {
      const entity = decodeEntity(inner, i);
      if (entity) {
        unit(entity.text, i, i + entity.length);
        i += entity.length;
        continue;
      }
    }
    if (char === "\r") {
      if (inner[i + 1] !== "\n") unit("\n", i, i + 1);
      i++;
      continue;
    }
    unit(char, i, i + 1);
    i++;
  }
  if (starts.length < end) return undefined;
  if (decoded.slice(start, end) !== text) return undefined;
  const span = { start: starts[start], end: ends[end - 1] };
  return balanced(inner.slice(span.start, span.end)) ? span : undefined;
}

// Whether every element opened in `html` closes in it and vice versa.
function balanced(html: string) {
  const stack: string[] = [];
  const pattern = /<!--[\s\S]*?-->|<\/([a-zA-Z][^\t\n\f\r />]*)[^>]*>|<([a-zA-Z][^\t\n\f\r />]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
  for (const match of html.matchAll(pattern)) {
    if (match[2] !== undefined) {
      const name = asciiLower(match[2]);
      if (!VOID_ELEMENTS.has(name) && !match[0].endsWith("/>")) stack.push(name);
    } else if (match[1] !== undefined) {
      if (stack.pop() !== asciiLower(match[1])) return false;
    }
  }
  return stack.length === 0;
}

export interface TagAttribute {
  // The attribute with its leading whitespace, for removal.
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
  value: string;
}

// The named attribute inside a start tag, when present.
export function startTagAttribute(html: string, tag: StartTag, name: string): TagAttribute | undefined {
  const whitespace = (char: string) => /[\t\n\f\r ]/.test(char);
  let cursor = tag.nameEnd;
  while (cursor < tag.end) {
    const start = cursor;
    while (cursor < tag.end && whitespace(html[cursor])) cursor++;
    if (html[cursor] === ">" || html[cursor] === "/" && html[cursor + 1] === ">") break;
    const nameStart = cursor;
    while (cursor < tag.end && !/[\t\n\f\r =/>]/.test(html[cursor])) cursor++;
    if (cursor === nameStart) { cursor++; continue; }
    const attributeName = asciiLower(html.slice(nameStart, cursor));
    const nameEnd = cursor;
    while (cursor < tag.end && whitespace(html[cursor])) cursor++;
    let valueStart = nameEnd;
    let valueEnd = nameEnd;
    let end = nameEnd;
    if (html[cursor] === "=") {
      cursor++;
      while (cursor < tag.end && whitespace(html[cursor])) cursor++;
      const quote = html[cursor];
      if (quote === '"' || quote === "'") {
        valueStart = ++cursor;
        while (cursor < tag.end && html[cursor] !== quote) cursor++;
        valueEnd = cursor;
        if (cursor < tag.end) cursor++;
      } else {
        valueStart = cursor;
        while (cursor < tag.end && !/[\t\n\f\r >]/.test(html[cursor])) cursor++;
        valueEnd = cursor;
      }
      end = cursor;
    } else cursor = nameEnd;
    if (attributeName === asciiLower(name)) {
      return { start, end, valueStart, valueEnd, value: html.slice(valueStart, valueEnd) };
    }
  }
  return undefined;
}

const blankSource = (text: string) => /^[\t\n\f\r ]*$/.test(text.replace(/<!--[\s\S]*?-->/g, ""));

/** Whether a component template is exactly one `<section>` element. */
export function isSectionTemplate(html: string) {
  const tags = startTags(html);
  const first = tags[0];
  if (first?.name !== "section" || !blankSource(html.slice(0, first.start))) return false;
  // Opening and closing section tags in source order; the first section
  // ends where the depth first returns to zero.
  const events = [
    ...tags.filter((tag) => tag.name === "section").map((tag) => ({ at: tag.start, depth: 1, end: -1 })),
    ...[...html.matchAll(/<\/section[\t\n\f\r ]*>/gi)].map((match) => ({ at: match.index, depth: -1, end: match.index + match[0].length })),
  ].sort((a, b) => a.at - b.at);
  let depth = 0;
  for (const event of events) {
    depth += event.depth;
    if (depth === 0) return blankSource(html.slice(event.end));
  }
  return false;
}
