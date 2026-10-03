import { startTags, startTagAttribute, VOID_ELEMENTS, type StartTag } from "../../shared/html-source";
import { nativePageBody } from "../../shared/native-project";
import { decodeHtmlEntities } from "./html-entities";
import { nativeDestinations, nativeMoveDestinationValid, nativeMoveEdit, type GuardedSourceEdit } from "./native-operations";

export interface NativeElementMoveDestination { parent: number[]; index: number }
export interface NativeElementMoveChoice { label: string; destination: NativeElementMoveDestination }
export type NativeElementMoveResult =
  | { status: "moved"; edit: GuardedSourceEdit; selection: number[] }
  | { status: "stayed"; reason: "already-position" | "edge" }
  | { status: "refused"; error: string };

interface IndexedElement { tag: StartTag; path: number[]; children: IndexedElement[] }
const raw = new Set(["script", "style", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext", "noscript"]);

// Index explicit source tags only. nativeMoveEdit remains the authority for
// balanced HTML, browser content rules, opaque boundaries and valid destinations.
function indexedElements(source: string): IndexedElement[] {
  const bounds = nativePageBody(source);
  const tags = new Map(startTags(source).map(tag => [tag.start, tag]));
  const root: IndexedElement = { tag: { name: "", start: bounds.start, end: bounds.start, nameEnd: bounds.start }, path: [], children: [] };
  const stack = [root];
  let at = bounds.start;
  while (at < bounds.end) {
    const lt = source.indexOf("<", at);
    if (lt < 0 || lt >= bounds.end) break;
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4); if (end < 0) return [];
      at = end + 3; continue;
    }
    const closing = /^<\/([a-z][\w:-]*)[\t\n\f\r ]*>/i.exec(source.slice(lt));
    if (closing) {
      if (stack.length === 1 || stack.at(-1)!.tag.name !== closing[1].toLowerCase()) return [];
      stack.pop(); at = lt + closing[0].length; continue;
    }
    const tag = tags.get(lt);
    if (!tag) { const end = source.indexOf(">", lt + 1); if (end < 0) return []; at = end + 1; continue; }
    const parent = stack.at(-1)!;
    const refresh = tag.name === "meta" && decodeHtmlEntities(startTagAttribute(source, tag, "http-equiv")?.value ?? "", true).toLowerCase() === "refresh";
    const element: IndexedElement = { tag, path: [...parent.path, parent.children.length], children: [] };
    if (tag.name !== "script" && !refresh) parent.children.push(element);
    at = tag.end;
    if (raw.has(tag.name)) {
      const close = new RegExp(`</${tag.name}[\\t\\n\\f\\r ]*>`, "ig"); close.lastIndex = at;
      const match = close.exec(source); if (!match) return [];
      at = match.index + match[0].length; continue;
    }
    const opening = source.slice(tag.start, tag.end);
    // A slash at the end of an unquoted value is data, not self-closing syntax.
    const selfClosing = /\/\s*>$/.test(opening) && !/=\s*[^\t\n\f\r "'=<>`]+\/\s*>$/.test(opening);
    if (!VOID_ELEMENTS.has(tag.name) && !selfClosing) stack.push(element);
  }
  if (stack.length !== 1) return [];
  const all: IndexedElement[] = [];
  function visit(element: IndexedElement) {
    all.push(element);
    if (element.tag.name === "template" || element.tag.name.includes("-") || ["svg", "math"].includes(element.tag.name)) return;
    element.children.forEach(visit);
  }
  root.children.forEach(visit);
  return all;
}
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((step, index) => step === b[index]);

/** A fresh guarded edit and the moved element's path after removal/insertion. */
export function nativeElementMovePlan(source: string, from: readonly number[], destination: NativeElementMoveDestination): NativeElementMoveResult {
  const refusal: NativeElementMoveResult = { status: "refused", error: "This destination cannot accept the selected element." };
  if (from.length && same(destination.parent, from.slice(0, -1)) && [from.at(-1)!, from.at(-1)! + 1].includes(destination.index)) {
    return nativeMoveDestinationValid(source, from, destination)
      ? { status: "stayed", reason: "already-position" } : refusal;
  }
  const edit = nativeMoveEdit(source, from, destination);
  if (!edit) return refusal;
  const oldParent = from.slice(0, -1), oldIndex = from.at(-1)!;
  const parent = [...destination.parent];
  // Removing a preceding sibling shifts the destination container and every
  // descendant path of that container. Ancestor containers retain their path.
  if (parent.length > oldParent.length && oldParent.every((step, index) => parent[index] === step) && parent[oldParent.length] > oldIndex) parent[oldParent.length]--;
  const index = destination.index - (same(oldParent, destination.parent) && oldIndex < destination.index ? 1 : 0);
  return { status: "moved", edit, selection: [...parent, index] };
}

/** Up/down moves use pre-removal gap indexes, including the down-side skip. */
export function nativeElementSiblingMove(source: string, from: readonly number[], direction: "up" | "down"): NativeElementMoveResult {
  if (!from.length) return { status: "refused", error: "Select an element to move." };
  const index = from.at(-1)!;
  const current = nativeElementMovePlan(source, from, { parent: from.slice(0, -1), index });
  if (current.status !== "stayed") return current.status === "refused" ? current : { status: "refused", error: "The selected element cannot be moved." };
  const before = nativeDestinations(source, "", from).find(value => value.placement === "before")!;
  const elements = indexedElements(source);
  const parent = elements.find(value => same(value.path, before.point.parent));
  // A full document's body is the path root, not an indexed child element.
  const children = before.point.parent.length ? parent?.children.length : elements.filter(value => value.path.length === 1).length;
  if (direction === "up" && index === 0 || direction === "down" && children !== undefined && index === children - 1) return { status: "stayed", reason: "edge" };
  return nativeElementMovePlan(source, from, { parent: from.slice(0, -1), index: direction === "up" ? index - 1 : index + 2 });
}

/** Compatible other containers, each independently proved by nativeMoveEdit. */
export function nativeElementMoveChoices(source: string, from: readonly number[]): NativeElementMoveChoice[] {
  const currentParent = from.slice(0, -1);
  const choices: NativeElementMoveChoice[] = [];
  for (const element of indexedElements(source)) {
    if (same(element.path, currentParent)) continue;
    const inside = nativeDestinations(source, "", element.path).find(value => value.placement === "inside");
    if (!inside) continue;
    const destination = { parent: [...inside.point.parent], index: inside.point.index };
    if (nativeElementMovePlan(source, from, destination).status !== "moved") continue;
    const id = decodeHtmlEntities(startTagAttribute(source, element.tag, "id")?.value ?? "", true);
    const aria = decodeHtmlEntities(startTagAttribute(source, element.tag, "aria-label")?.value ?? "", true);
    const identity = `${element.tag.name}${id ? `#${id}` : ""}${aria ? ` “${aria}”` : ""}`;
    choices.push({ label: `Inside ${identity}, at the end (${element.path.map(index => index + 1).join(".")})`, destination });
  }
  return choices;
}
