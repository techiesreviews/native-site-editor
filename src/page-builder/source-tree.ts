// One reader for "what is at this path in the HTML, and what does it say".
//
// `SourceTree` is the one interface card code reads HTML source through: the
// element at a path counted as the preview counts it, its exact range, its
// attributes and text decoded as the browser reads them. Two adapters sit
// behind it: the page adapter (`readPage` in native-source-location.ts, the
// browser's parser) for every path from the preview, and the source adapter
// here (`readSource`, pure, offsets kept) for markup as written: templates,
// a card's markup, a sibling's <main>, and pages in Node tests. One contract
// suite runs on both (tests/source-tree*.test.ts). No DOM in this file, so it
// runs in the unit tests as it does in the editor.

import { asciiLower, elementEnd, startTagAttribute, startTags, VOID_ELEMENTS, type ElementRange, type StartTag, type TagAttribute } from "../../shared/html-source";
import { nativePageBody } from "../../shared/native-project";
import { decodeHtmlEntities } from "./html-entities";
import type { RuleView } from "./rules/tree";

export interface SourceTree<N> {
  readonly source: string;
  /** Source adapter: the markup is balanced as written: every element closed by its own end tag,
   *  none closed by an ancestor's, no stray end tag. It says nothing about the browser: balanced
   *  `<table><tr>` still gets a <tbody>. Page adapter: always true. */
  readonly exact: boolean;
  /** The shared rules' view (rules/tree.ts): elements and text, a <template>'s content not children. */
  readonly view: RuleView<N>;
  /** The element at element-child indexes `path` from the top, counted as the preview counts. */
  at(path: readonly number[]): N | undefined;
  path(element: N): number[];
  /** Element children (the top level when omitted), as the preview counts them. */
  children(element?: N): N[];
  /** Every element under `element` (the whole tree when omitted), in document order; not into <template> content. */
  elements(element?: N): N[];
  /** Outer range with its start and end tag; undefined when its end tag is implied or ambiguous (elementEnd's rule). */
  range(element: N): ElementRange | undefined;
  /** The attribute on its start tag: its source span (leading white space included, for edits) and
   *  its value decoded as the browser decodes attribute values (`tagAttribute`). */
  attribute(element: N, name: string): TagAttribute | undefined;
  /** textContent of `node` (the whole tree when omitted, so a text-only fragment reads too): character
   *  references decoded outside raw text (a <style>'s `&amp;` stays), CR LF and lone CR read as LF,
   *  other white space as written, comments and dropped nodes out. view.text reads the same way. */
  text(node?: N): string;
}

/** Text as one line: white space runs to one space, ends trimmed (`/\s+/`, NBSP included). */
export function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The browser reads CR LF and a lone CR as LF everywhere (input stream preprocessing). */
const newlines = (text: string) => text.replace(/\r\n?/g, "\n");

/** `name` on `tag` as startTagAttribute finds it, its value decoded as the browser decodes attribute values. */
export function tagAttribute(source: string, tag: StartTag, name: string): TagAttribute | undefined {
  const found = startTagAttribute(source, tag, name);
  return found && { ...found, value: decodeHtmlEntities(newlines(found.value), true) };
}

// ---- A small source tree: elements and text with their offsets. ----

export interface SourceElement {
  type: "element";
  name: string;
  tag: StartTag;
  // Outer range, from `<` to past the end tag (to past the start tag for a
  // void element, to the end of what was parsed for an unclosed one).
  start: number;
  end: number;
  close?: { start: number; end: number };
  children: SourceNode[];
  parent?: SourceElement;
}
export interface SourceText {
  type: "text";
  start: number;
  end: number;
  parent?: SourceElement;
}
export type SourceNode = SourceElement | SourceText;

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);
// Raw text whose character references the browser keeps as written (textarea and title decode them).
const UNDECODED = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes"]);
// The browser drops one newline right after these start tags.
const LEADING_NEWLINE = new Set(["pre", "listing", "textarea"]);

/**
 * The elements and text of `html` between `from` and `to`, as written: end
 * tags close the nearest open element of their name (those opened inside
 * it close with it), stray end tags are ignored, comments are skipped.
 * Implied end tags are not inferred: the editor writes and reads explicit
 * markup, and an edit that depends on a guess is not made.
 */
export function parseSource(html: string, from = 0, to = html.length): SourceNode[] {
  return parseTree(html, from, to).nodes;
}

/**
 * parseSource, recording whether the markup was balanced as written
 * (`SourceTree.exact`). `openRawText`: raw text left open holds the rest as
 * its text, as in the browser (parseSource leaves it empty).
 */
function parseTree(html: string, from: number, to: number, openRawText = false): { nodes: SourceNode[]; exact: boolean } {
  // An element closed by an ancestor's end tag, one left open, a dropped stray end tag, or a tag cut off.
  let exact = true;
  const root: SourceNode[] = [];
  const stack: SourceElement[] = [];
  const add = (node: SourceNode) => {
    const parent = stack.at(-1);
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else root.push(node);
  };
  let text = from;
  const flush = (at: number) => {
    if (at > text) add({ type: "text", start: text, end: at });
  };
  let i = from;
  while (i < to) {
    const lt = html.indexOf("<", i);
    if (lt < 0 || lt >= to) break;
    if (html.startsWith("<!--", lt)) {
      flush(lt);
      const close = html.indexOf("-->", lt + 4);
      i = text = close < 0 || close + 3 > to ? to : close + 3;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "/") {
      const match = /^<\/([a-zA-Z][^\t\n\f\r />]*)[^>]*>/.exec(html.slice(lt, to));
      if (!match) {
        if (/[a-zA-Z]/.test(html[lt + 2] ?? "")) exact = false;
        i = lt + 1;
        continue;
      }
      flush(lt);
      const name = asciiLower(match[1]);
      const at = stack.map((el) => el.name).lastIndexOf(name);
      if (at < 0) exact = false;
      else {
        // The element closed here gets its end tag; those opened in it end with it.
        const [closed, ...inside] = stack.splice(at);
        if (inside.length) exact = false;
        for (const open of inside) open.end = lt;
        closed.close = { start: lt, end: lt + match[0].length };
        closed.end = lt + match[0].length;
      }
      i = text = lt + match[0].length;
      continue;
    }
    if (next === "!" || next === "?") {
      flush(lt);
      const close = html.indexOf(">", lt + 2);
      i = text = close < 0 || close + 1 > to ? to : close + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) { i = lt + 1; continue; }
    flush(lt);
    let j = lt + 1;
    while (j < to && !/[\t\n\f\r />]/.test(html[j])) j++;
    const name = asciiLower(html.slice(lt + 1, j));
    const nameEnd = j;
    while (j < to && html[j] !== ">") {
      const char = html[j];
      if (char === "\"" || char === "'") {
        const close = html.indexOf(char, j + 1);
        j = close < 0 ? to : close + 1;
      } else j++;
    }
    if (j >= to) exact = false;
    const end = Math.min(j + 1, to);
    const el: SourceElement = { type: "element", name, tag: { name, start: lt, nameEnd, end }, start: lt, end, children: [] };
    add(el);
    i = text = end;
    if (VOID_ELEMENTS.has(name)) continue;
    if (RAW_TEXT.has(name)) {
      const lower = asciiLower(html);
      let close = lower.indexOf(`</${name}`, end);
      while (close >= 0 && !/[\t\n\f\r />]/.test(html[close + name.length + 2] ?? "")) close = lower.indexOf(`</${name}`, close + 2);
      const gt = close < 0 ? -1 : html.indexOf(">", close);
      if (close < 0 || gt < 0 || gt >= to) {
        exact = false;
        // Its text runs to the end, or to an end tag cut off there (the browser drops that).
        const textEnd = close >= 0 && close < to ? close : to;
        if (openRawText && textEnd > end) el.children.push({ type: "text", start: end, end: textEnd, parent: el });
        el.end = to;
        i = text = to;
      } else {
        if (close > end) el.children.push({ type: "text", start: end, end: close, parent: el });
        el.close = { start: close, end: gt + 1 };
        el.end = gt + 1;
        i = text = gt + 1;
      }
      continue;
    }
    stack.push(el);
  }
  flush(to);
  for (const open of stack) open.end = to;
  if (stack.length) exact = false;
  return { nodes: root, exact };
}

/**
 * A text node's text as the browser reads it: CR LF and lone CR as LF,
 * character references decoded except in raw text (a <style>'s `&amp;`
 * stays), the newline right after `<pre>`/`<textarea>` dropped (`&#10;` too).
 */
function textOf(html: string, node: SourceText): string {
  const parent = node.parent;
  const raw = newlines(html.slice(node.start, node.end));
  const text = parent && UNDECODED.has(parent.name) ? raw : decodeHtmlEntities(raw);
  return parent && LEADING_NEWLINE.has(parent.name) && node.start === parent.tag.end && text.startsWith("\n") ? text.slice(1) : text;
}

/**
 * `html`'s source tree as the shared rules read it (src/page-builder/rules/):
 * text as the browser reads it (`textOf`), a `<template>`'s content not its
 * children, as in the DOM.
 */
export function sourceView(html: string): RuleView<SourceNode> {
  return {
    kind: (node) => node.type,
    name: (node) => (node.type === "element" ? node.name : ""),
    children: (node) => (node.type === "element" && node.name !== "template" ? node.children : []),
    text: (node) => (node.type === "text" ? textOf(html, node) : ""),
    parent: (node) => node.parent,
  };
}

export function* descendants(nodes: SourceNode[]): Generator<SourceElement> {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    yield node;
    yield* descendants(node.children);
  }
}

// ---- The source adapter ----

/** What the preview's sanitizer drops before render (native-source-location.ts `parseMarked`). */
function dropped(source: string, node: SourceNode) {
  if (node.type !== "element") return false;
  if (node.name === "script") return true;
  return node.name === "meta" && asciiLower(tagAttribute(source, node.tag, "http-equiv")?.value ?? "") === "refresh";
}

/**
 * Markup as written (pure), as a `SourceTree`. `page`: the page part (a
 * document's <body> content, else what follows `</head>`, else the whole
 * text, as `nativePageBody` reads it) with the preview's drops (`<script>`,
 * refresh `<meta>`), for Node tests and reads by name. `from`/`to`: a
 * stretch (an item's range, a <main>). Nodes keep their offsets into
 * `source`. Where the browser repairs markup (`<p><div>`, `<li>` with no
 * `</li>`, a table with no `<tbody>`) only the page adapter reads it as the
 * preview does; `exact` is false for markup not balanced as written.
 */
export function readSource(source: string, options: { page?: true; from?: number; to?: number } = {}): SourceTree<SourceNode> {
  const part = options.page ? nativePageBody(source) : { start: 0, end: source.length };
  const end = options.to ?? part.end;
  const { nodes, exact } = parseTree(source, options.from ?? part.start, end, true);
  const drop = (list: SourceNode[]): SourceNode[] => list.filter((node) => {
    if (dropped(source, node)) return false;
    if (node.type === "element" && node.name !== "template") node.children = drop(node.children);
    return true;
  });
  const top = options.page ? drop(nodes) : nodes;
  const view = sourceView(source);
  const nodesIn = (node?: SourceNode) => (node === undefined ? top : view.children(node));
  const children = (node?: SourceNode): SourceNode[] => nodesIn(node).filter((child) => child.type === "element");
  const elements = (node?: SourceNode): SourceNode[] => children(node).flatMap((child) => [child, ...elements(child)]);
  const text = (node: SourceNode): string => (node.type === "text" ? textOf(source, node) : view.children(node).map(text).join(""));
  let order: { tags: StartTag[]; all: SourceNode[]; ranges: Map<SourceNode, ElementRange | undefined> } | undefined;
  return {
    source,
    exact,
    view,
    at(path) {
      let element: SourceNode | undefined;
      for (const index of path) {
        element = children(element)[index];
        if (!element) return undefined;
      }
      return element;
    },
    // A node not in this tree (another tree's, a template's content) has no path.
    path(element) {
      const out: number[] = [];
      for (let node: SourceNode | undefined = element; node; node = node.parent) out.unshift(children(node.parent).indexOf(node));
      return out.includes(-1) ? [] : out;
    },
    children,
    elements,
    // elementEnd's rule, as the page adapter's (markedRange): the end tag lies before the next start
    // tag outside the element, the end of what was read, and its parent's end tag when that has one.
    range(element) {
      if (element.type !== "element") return undefined;
      order ??= { tags: startTags(source), all: elements(), ranges: new Map() };
      const { tags, all, ranges } = order;
      const rangeOf = (element: SourceElement): ElementRange | undefined => {
        if (ranges.has(element)) return ranges.get(element);
        const inside = (node: SourceNode) => { for (let up = node.parent; up; up = up.parent) if (up === element) return true; return false; };
        const following = all.slice(all.indexOf(element) + 1).find((other) => !inside(other));
        const parentEnd = element.parent && rangeOf(element.parent)?.close?.start;
        const range = elementEnd(source, tags, tags.findIndex((tag) => tag.start === element.start), Math.min(following?.start ?? end, parentEnd ?? end));
        ranges.set(element, range);
        return range;
      };
      return order.all.includes(element) ? rangeOf(element) : undefined;
    },
    attribute: (element, name) => (element.type === "element" ? tagAttribute(source, element.tag, name) : undefined),
    text: (node) => (node ? text(node) : top.map(text).join("")),
  };
}
