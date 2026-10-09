import { blockLabel } from "./block-insert";
import { nativeOutline, nativeMoveDestinationValid, nativeMoveEdit, type GuardedSourceEdit, type ItemsSlotRule, type NativeOutline } from "./native-operations";

/** `slot`: the parent is an instance, and this its items slot ("" the unnamed one). */
export interface NativeElementMoveDestination { parent: number[]; index: number; slot?: string }
export type NativeElementMoveResult =
  | { status: "moved"; edit: GuardedSourceEdit; selection: number[] }
  | { status: "stayed"; reason: "already-position" | "edge" }
  | { status: "refused"; error: string };

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((step, index) => step === b[index]);

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

/** Up/down moves use pre-removal gap indexes, including the down-side skip. */
export function nativeElementSiblingMove(source: string, from: readonly number[], direction: "up" | "down", items?: ItemsSlotRule): NativeElementMoveResult {
  if (!from.length) return { status: "refused", error: "Select an element to move." };
  let node = nativeOutline(source);
  for (const step of from) node = node?.children[step];
  const parent = node?.parent;
  const slot = parent?.opaque && parent.name.includes("-") ? node?.slot : undefined;
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
    if (node.opaque && !(child && node.name.includes("-") && items?.(node.name, child.slot))) return refuse("This element is inside a component or another opaque container; its parts cannot be moved here.");
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
  if (parent?.opaque && parent.name.includes("-")) {
    while (previousIndex >= 0 && parent.children[previousIndex].slot !== node.slot) previousIndex--;
  }
  const previous = parent?.children[previousIndex];
  if (previous?.opaque && previous.name.includes("-")) return refuse(`${blockLabel(previous)} is a component: its parts are filled by editing them.`);
  if (!previous || !["section", "div"].includes(previous.name)) return refuse("Alt+→ moves a block into the Section or Div just above it; there is none.");
  return nativeElementMovePlan(source, from, { parent: [...from.slice(0, -1), previousIndex], index: previous.children.length }, items);
}
