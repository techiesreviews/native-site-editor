// How a shared rule reads a tree (sturdy-base frame protocol, design §4.1).
// A rule that walks markup takes a `RuleView` instead of a tree type, so the
// one rule runs on the preview's DOM (the runtime bundles these modules and
// reads its shadow roots through `domView`) and on the editor's source tree
// (component-model.ts `sourceView` over `parseSource`). Both read as the
// browser does: text decoded, comments and the runtime's own styles not
// there.

export type RuleNodeKind = "element" | "text" | "other";

export interface RuleView<N> {
  kind(node: N): RuleNodeKind;
  /** An element's tag name, lower case. */
  name(node: N): string;
  /** A node's children in order, as the browser has them (a `<template>`'s are its content, so none). */
  children(node: N): readonly N[];
  /** A text node's text as the browser reads it: character references decoded. */
  text(node: N): string;
  /** The element a node sits in; none at a root (a shadow root's child, a template's top level). */
  parent(node: N): N | undefined;
}

/** `nodes` without blank text: elements, and text holding a character other than ASCII white space (the browser's reading: U+00A0 is text). */
export function meaningful<N>(nodes: readonly N[], view: RuleView<N>): N[] {
  return nodes.filter((node) => {
    const kind = view.kind(node);
    return kind === "element" || (kind === "text" && /[^\t\n\f\r ]/.test(view.text(node)));
  });
}

/** The DOM nodes a `RuleView` reads in the preview, as plain shapes so tests can build them. */
export interface DomLikeNode {
  nodeType: number;
  localName?: string;
  data?: string;
  childNodes: ArrayLike<DomLikeNode>;
  parentElement: DomLikeNode | null;
}

/** A view of the preview's DOM; `hidden` drops elements the browser has but the source does not (the runtime's injected styles). */
export function domView<N extends DomLikeNode>(hidden: (element: N) => boolean): RuleView<N> {
  return {
    kind: (node) => (node.nodeType === 1 ? "element" : node.nodeType === 3 ? "text" : "other"),
    name: (node) => node.localName ?? "",
    children: (node) => Array.prototype.filter.call(node.childNodes, (child: N) => child.nodeType !== 1 || !hidden(child)) as N[],
    text: (node) => node.data ?? "",
    parent: (node) => (node.parentElement as N | null) ?? undefined,
  };
}
