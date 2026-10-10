// One reader for "what is at this path in the HTML, and what does it say"
// (sturdy-base card tree, design card-tree-design.md §4). The source tree:
// elements and text with their offsets, as written. No DOM here, so it runs
// in the unit tests as it does in the editor.

import { asciiLower, VOID_ELEMENTS, type StartTag } from "../../shared/html-source";
import { decodeHtmlEntities } from "./html-entities";
import type { RuleView } from "./rules/tree";

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

/**
 * The elements and text of `html` between `from` and `to`, as written: end
 * tags close the nearest open element of their name (those opened inside
 * it close with it), stray end tags are ignored, comments are skipped.
 * Implied end tags are not inferred: the editor writes and reads explicit
 * markup, and an edit that depends on a guess is not made.
 */
export function parseSource(html: string, from = 0, to = html.length): SourceNode[] {
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
      if (!match) { i = lt + 1; continue; }
      flush(lt);
      const name = asciiLower(match[1]);
      const at = stack.map((el) => el.name).lastIndexOf(name);
      if (at >= 0) {
        // The element closed here gets its end tag; those opened in it end with it.
        const [closed, ...inside] = stack.splice(at);
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
  return root;
}

/**
 * `html`'s source tree as the shared rules read it (src/page-builder/rules/):
 * text decoded, a `<template>`'s content not its children, as in the DOM.
 */
export function sourceView(html: string): RuleView<SourceNode> {
  return {
    kind: (node) => node.type,
    name: (node) => (node.type === "element" ? node.name : ""),
    children: (node) => (node.type === "element" && node.name !== "template" ? node.children : []),
    text: (node) => (node.type === "text" ? decodeHtmlEntities(html.slice(node.start, node.end)) : ""),
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
