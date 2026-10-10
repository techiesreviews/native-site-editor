// Where a Block may go, and the plan of its move (sturdy-base slice 30;
// design: block-move-design.md sections 4, 5). The page's rules and the
// rules of the template edited in Edit component mode are two adapters of
// one seam (`MoveRules`); both end in the editor's one move engine
// (native-operations.ts `nativeMoveEdit`). Pure: src/page-builder/block-move.ts
// picks the adapter, proves the bytes and writes the step.

import { dropBlockName } from "./drop-target";
import { blockLabel } from "./block-insert";
import { templateSlotRefusal } from "./native-elements";
import { nativeMoveRefusal, nativeOutline, nativeMoveDestinationValid, nativeMoveEdit, type GuardedSourceEdit, type ItemsSlotRule, type NativeOutline } from "./native-operations";
import { isInstance as isInstanceIn } from "./rules/movable";
import type { MarkupView } from "./rules/tree";

/** `slot`: the parent is an instance, and this its items slot ("" the unnamed one). */
export interface NativeElementMoveDestination { parent: number[]; index: number; slot?: string }
export type NativeElementMoveResult =
  | { status: "moved"; edit: GuardedSourceEdit; selection: number[] }
  | { status: "stayed"; reason: "already-position" | "edge" }
  | { status: "refused"; error: string };

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((step, index) => step === b[index]);
// The outline read as markup, so the instance test is rules/movable.ts's own.
const outlineView: MarkupView<NativeOutline> = {
  kind: () => "element", name: node => node.name, children: node => node.children, text: () => "", parent: node => node.parent, foreign: node => node.foreign,
};
const isInstance = (node: NativeOutline) => isInstanceIn(node, outlineView);

/** A fresh guarded edit and the moved element's path after removal/insertion; `items` opens instances' items slots. */
export function nativeElementMovePlan(source: string, from: readonly number[], destination: NativeElementMoveDestination, items?: ItemsSlotRule): NativeElementMoveResult {
  const refusal: NativeElementMoveResult = { status: "refused", error: "This destination cannot accept the selected element." };
  const edit = nativeMoveEdit(source, from, destination, items, destination.slot);
  // Beside itself in the slot it already fills: it stays (another items slot of its instance moves it).
  if (!edit) return from.length && same(destination.parent, from.slice(0, -1)) && [from.at(-1)!, from.at(-1)! + 1].includes(destination.index) &&
    nativeMoveDestinationValid(source, from, destination, items, destination.slot) ? { status: "stayed", reason: "already-position" } : refusal;
  const oldParent = from.slice(0, -1), oldIndex = from.at(-1)!;
  const parent = [...destination.parent];
  // Removing a preceding sibling shifts the destination container and every
  // descendant path of that container. Ancestor containers retain their path.
  if (parent.length > oldParent.length && oldParent.every((step, index) => parent[index] === step) && parent[oldParent.length] > oldIndex) parent[oldParent.length]--;
  const index = destination.index - (same(oldParent, destination.parent) && oldIndex < destination.index ? 1 : 0);
  return { status: "moved", edit, selection: [...parent, index] };
}

/**
 * A whole section to the gap `index` among its own siblings (`parent` its
 * parent's path; gaps counted as insert points are, the sibling count the
 * end): the page structure's move_section for agents, by the editor's one
 * move engine. Another parent is refused; in an instance's items slot it
 * stays in its own slot.
 */
export function nativeSectionMovePlan(source: string, from: readonly number[], parent: readonly number[], index: number, items?: ItemsSlotRule): NativeElementMoveResult {
  if (!from.length || !same(from.slice(0, -1), parent)) return { status: "refused", error: "A section moves among its own siblings only." };
  let node = nativeOutline(source);
  for (const step of from) node = node?.children[step];
  const slot = node?.parent && isInstance(node.parent) ? node.slot : undefined;
  return nativeElementMovePlan(source, from, { parent: [...parent], index, slot }, items);
}

/** Up/down moves use pre-removal gap indexes, including the down-side skip. */
export function nativeElementSiblingMove(source: string, from: readonly number[], direction: "up" | "down", items?: ItemsSlotRule): NativeElementMoveResult {
  if (!from.length) return { status: "refused", error: "Select an element to move." };
  let node = nativeOutline(source);
  for (const step of from) node = node?.children[step];
  const parent = node?.parent;
  const slot = parent && isInstance(parent) ? node?.slot : undefined;
  const index = from.at(-1)!;
  const current = nativeElementMovePlan(source, from, { parent: from.slice(0, -1), index, slot }, items);
  if (current.status !== "stayed") return current.status === "refused" ? current : { status: "refused", error: "The selected element cannot be moved." };
  // Other slots of the same instance do not count as neighbours.
  const neighbours = parent!.children.map((child, index) => ({ child, index })).filter(value => slot === undefined || value.child.slot === slot);
  const at = neighbours.findIndex(value => value.index === index);
  const next = neighbours[at + (direction === "up" ? -1 : 1)];
  if (!next) return { status: "stayed", reason: "edge" };
  return nativeElementMovePlan(source, from, { parent: from.slice(0, -1), index: direction === "up" ? next.index : next.index + 1, slot }, items);
}

/** Alt+Left/Right moves whole blocks across Section/Div boundaries. */
export function nativeElementDepthMove(source: string, from: readonly number[], direction: "out" | "in", items?: ItemsSlotRule): NativeElementMoveResult {
  const refuse = (error: string): NativeElementMoveResult => ({ status: "refused", error });
  if (!from.length) return refuse("Select an element to move.");
  const body = nativeOutline(source);
  if (!body) return refuse("The page's HTML could not be read exactly. Fix it in the code first.");
  let node: NativeOutline = body;
  for (const step of from) {
    const child: NativeOutline | undefined = Number.isInteger(step) && step >= 0 ? node.children[step] : undefined;
    if (node.opaque && !(child && isInstance(node) && items?.(node.name, child.slot))) return refuse("This element is inside a component or another opaque container; its parts cannot be moved here.");
    if (!child) return refuse("The selected element could not be found. Select it again before moving it.");
    node = child;
  }
  const parent = node.parent;
  if (node.name === "section" || parent?.name === "main") return refuse("A Section goes only between page bands.");
  if (direction === "out") {
    const outer = parent?.parent;
    if (outer?.name === "main") return refuse("Blocks go inside a Section or a Div, not straight between page bands.");
    if (!outer || !["section", "div"].includes(outer.name)) return refuse("Its outer container is not a Section or a Div.");
    return nativeElementMovePlan(source, from, { parent: from.slice(0, -2), index: from.at(-2)! + 1 }, items);
  }
  let previousIndex = from.at(-1)! - 1;
  if (parent && isInstance(parent)) {
    while (previousIndex >= 0 && parent.children[previousIndex].slot !== node.slot) previousIndex--;
  }
  const previous = parent?.children[previousIndex];
  if (previous && isInstance(previous)) return refuse(`${blockLabel(previous)} is a component: its parts are filled by editing them.`);
  if (!previous || !["section", "div"].includes(previous.name)) return refuse("Alt+→ moves a block into the Section or Div just above it; there is none.");
  return nativeElementMovePlan(source, from, { parent: [...from.slice(0, -1), previousIndex], index: previous.children.length }, items);
}

export type NativeMoveDirection = "up" | "down" | "out" | "in";

/** The same keyboard move rule for canvas selections and Structure rows. */
export function nativeElementKeyMove(source: string, from: readonly number[], direction: NativeMoveDirection, items?: ItemsSlotRule): NativeElementMoveResult {
  return direction === "out" || direction === "in" ? nativeElementDepthMove(source, from, direction, items) : nativeElementSiblingMove(source, from, direction, items);
}

/** Container names come from the source before a successful keyboard move. */
export function nativeElementMoveMessage(source: string, from: readonly number[], direction: NativeMoveDirection): string {
  let node = nativeOutline(source);
  for (const step of from) node = node?.children[step];
  const parent = node?.parent;
  const label = (container: NativeOutline | undefined) => container ? dropBlockName(container.name, container.className) : "container";
  if (direction === "out") return `Moved out of ${label(parent)} into ${label(parent?.parent)}`;
  if (direction === "in") {
    let index = from.at(-1)! - 1;
    if (parent && isInstance(parent)) {
      while (index >= 0 && parent.children[index].slot !== node?.slot) index--;
    }
    return `Moved into ${label(parent?.children[index])}`;
  }
  return `Moved ${direction} in ${label(parent)}`;
}

const isNamedSlot = (node: NativeOutline) => Boolean(node.slotName);

/**
 * What a drag of the template's part at `path` (Edit component mode) moves:
 * the part, or the named slot it fills alone (a slot moves with its
 * element); nothing for the template's root, a nested component's insides
 * or a path the template doesn't have.
 */
export function templateMovePath(template: string, path: readonly number[]): number[] | undefined {
  const root = nativeOutline(template);
  let node = root;
  for (const step of path) {
    if (node?.opaque) return undefined;
    node = node?.children[step];
  }
  if (!node || path.length < 2) return undefined;
  const at = [...path];
  while (node.parent?.slotName && node.parent.children.length === 1 && at.length > 2) { node = node.parent; at.pop(); }
  return at;
}

/**
 * Why the template's part at `from` can't move into its element at
 * `parent` (Edit component mode), or nothing when it can: inside the
 * template's element, never into a named slot (each page fills it) or a
 * nested component, and as HTML allows (nativeMoveRefusal).
 */
export function templateMoveRefusal(template: string, from: readonly number[], parent: readonly number[]): string | undefined {
  let node = nativeOutline(template);
  if (!node) return "The template's HTML could not be read exactly. Fix it in the code first.";
  if (!parent.length) return "Parts go inside the template's element, not beside it.";
  let moving: NativeOutline | undefined = node;
  for (const step of from) moving = moving?.children[step];
  const slots = (at: NativeOutline): boolean => at.slotName !== undefined || at.children.some(slots);
  for (const step of parent) {
    node = node.children[step];
    if (!node) return "The template changed meanwhile. Try again.";
    if (node.opaque) return `${blockLabel(node)} is its own component: open it to build inside its template.`;
    if (isNamedSlot(node)) return templateSlotRefusal(node.slotName!);
    if (node.slotName === "" && moving && slots(moving)) return "A slot can't go into the component's items: each page fills them.";
  }
  return nativeMoveRefusal(template, from, parent);
}

/**
 * Alt+arrows on a part of the template edited in Edit component mode (slice
 * 82), by the rules of its drags: a named slot moves with the element it
 * holds alone; ↑/↓ step among its siblings; ← goes after the element around
 * it, → to the end of the element just above it, wherever the template's
 * rule (templateMoveRefusal) and HTML allow. The selection stays on the
 * part pressed (inside its slot).
 */
export function templateKeyMove(template: string, at: readonly number[], direction: NativeMoveDirection): NativeElementMoveResult {
  const refuse = (error: string): NativeElementMoveResult => ({ status: "refused", error });
  const from = templateMovePath(template, at);
  if (!from) return refuse("The template's root stays where it is; a nested component's parts move in its own template.");
  const inside = at.slice(from.length);
  let result: NativeElementMoveResult;
  // Among a named slot's own fallback elements, nothing moves: the page fills the slot.
  const held = direction === "up" || direction === "down" ? templateMoveRefusal(template, from, from.slice(0, -1)) : undefined;
  if (held) return refuse(held);
  if (direction === "up" || direction === "down") result = nativeElementSiblingMove(template, from, direction);
  else {
    let node = nativeOutline(template);
    for (const step of from) node = node?.children[step];
    const index = from.at(-1)!;
    const destination = direction === "out" ? { parent: from.slice(0, -2), index: from.at(-2)! + 1 }
      : { parent: [...from.slice(0, -1), index - 1], index: node?.parent?.children[index - 1]?.children.length ?? 0 };
    if (direction === "in" && index === 0) return refuse("Alt+→ moves a part into the element just above it; there is none.");
    const refused = templateMoveRefusal(template, from, destination.parent);
    result = refused ? refuse(refused) : nativeElementMovePlan(template, from, destination);
  }
  return result.status === "moved" ? { ...result, selection: [...result.selection, ...inside] } : result;
}

/** The slot `from` fills when its parent is an instance (its items slot, "" the unnamed one); else undefined. */
export function ownSlot(source: string, from: readonly number[]): string | undefined {
  let node = nativeOutline(source);
  for (const step of from) node = node?.children[step];
  return node?.parent && isInstance(node.parent) ? node.slot : undefined;
}

// ---- The seam: the page's rules and the template's (design section 5). ----

/** What a planned move comes to: the edit and the moved element's path, where it stays, or why not. */
export type MovePlan = NativeElementMoveResult;
export type MoveStep = NativeMoveDirection;

/** One document's move rules: what a press moves, where it may go, a key's step, a drop's place. */
export interface MoveRules {
  /** What a press on `at` moves: the element, or (a template) the named slot it fills alone; undefined: nothing. */
  subject(source: string, at: readonly number[]): number[] | undefined;
  /** Why the element at `from` can't go into `parent` (an instance's items slot `slot`), by its first gap; undefined: it can. */
  refusal(source: string, from: readonly number[], parent: readonly number[], slot?: string): string | undefined;
  /** A key's step: up and down among its siblings (its own slot's), out of and into a container. */
  step(source: string, from: readonly number[], direction: MoveStep): MovePlan;
  /** To a place: a drag's drop, an agent's gap. */
  to(source: string, from: readonly number[], place: NativeElementMoveDestination): MovePlan;
}

/**
 * A page's rules: any element the engine reaches (instances' items slots
 * opened by `items`), keys with their wider reach (body-level header and
 * footer); the drag-only rule (rules/movable.ts) is the caller's.
 */
export function pageRules(items: ItemsSlotRule): MoveRules {
  return {
    // As the engine reaches it: islands crossed only through items slots; an instance moves whole, no other island.
    subject: (source, at) => {
      let node = nativeOutline(source);
      for (const step of at) {
        const child: NativeOutline | undefined = node?.children[step];
        if (!node || !child || node.opaque && !(isInstance(node) && items(node.name, child.slot))) return undefined;
        node = child;
      }
      return at.length && node && !(node.opaque && !isInstance(node)) ? [...at] : undefined;
    },
    refusal: (source, from, parent, slot) => nativeMoveRefusal(source, from, parent, items, slot),
    step: (source, from, direction) => nativeElementKeyMove(source, from, direction, items),
    to: (source, from, place) => nativeElementMovePlan(source, from, place, items),
  };
}

/**
 * The rules of the template edited in Edit component mode (slice 82): a
 * named slot moves with the element it holds alone, nothing goes into a
 * named slot or a nested component, nor beside the template's element.
 * `step` keeps the selection on `from`; the caller adds the part pressed.
 */
export function templateRules(): MoveRules {
  return {
    // An island (SVG, a <template>) moves nowhere; a nested instance moves whole.
    subject: (source, at) => {
      const from = templateMovePath(source, at);
      let node = from && nativeOutline(source);
      for (const step of from ?? []) node = node?.children[step];
      return node && !(node.opaque && !isInstance(node)) ? from : undefined;
    },
    refusal: (source, from, parent) => templateMoveRefusal(source, from, parent),
    step: templateKeyMove,
    to: (source, from, place) => {
      const refused = templateMoveRefusal(source, from, place.parent);
      return refused ? { status: "refused", error: refused } : nativeElementMovePlan(source, from, place);
    },
  };
}
