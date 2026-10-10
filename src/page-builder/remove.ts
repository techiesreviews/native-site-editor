import { descendants, parseSource, slotChangePages, templateRoot, type SourceElement, type SourceNode } from "./component-model";
import { removeEdit } from "../native-structure";
import { startTagAttribute } from "../../shared/html-source";

/** Index paths after deletion: next sibling, previous sibling, then parent. */
export function selectionAfterRemove(node: readonly number[], hasNext: boolean): number[] {
  const parent = node.slice(0, -1), index = node.at(-1);
  return index === undefined ? parent : hasNext ? [...node] : index > 0 ? [...parent, index - 1] : parent;
}

/** Lowercase ancestors from body through the selected page element. */
export function pageRemovable(chain: readonly string[]): boolean {
  const tag = chain.at(-1), parents = chain.slice(0, -1);
  if (!tag || chain.some(name => !name) || chain[0] !== "body" || ["body", "main", "head"].includes(tag) || parents.some(name => name.includes("-"))) return false;
  if (tag.includes("-")) return parents.includes("main");
  if (tag === "header" || tag === "footer") return parents.some(name => ["article", "aside", "main", "nav", "section"].includes(name));
  return true;
}

const elements = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");

/** Removing a slot's fallback removes its slot wrapper; all removed slots lose their fills. */
export function templateRemoval(source: string, node: readonly number[], files: Record<string, string>, tag: string) {
  if (!node.length || node.join() === templateRoot(source)?.join()) return;
  let list = elements(parseSource(source));
  let target: SourceElement | undefined;
  let parent: { element: SourceElement; node: number[]; next: boolean } | undefined;
  let hasNext = false;
  for (let depth = 0; depth < node.length; depth++) {
    if (target) parent = { element: target, node: node.slice(0, depth), next: hasNext };
    target = list[node[depth]];
    if (!target || depth < node.length - 1 && target.name.includes("-")) return;
    hasNext = Boolean(list[node[depth] + 1]);
    list = elements(target.children);
  }
  if (!target) return;
  // A slot's element is its slot's only element: the <slot> goes with it. A part of a
  // longer fallback (or inside the slot's element) goes alone.
  const slot = parent?.element.name === "slot" && elements(parent.element.children).length === 1 ? parent : undefined;
  const removed = slot?.element ?? target;
  const slots = [...descendants([removed])].filter(element => element.name === "slot")
    .map(element => startTagAttribute(source, element.tag, "name")?.value ?? "");
  const edit = removeEdit(source, removed);
  const template = source.slice(0, edit.start) + source.slice(edit.end);
  const following = { ...files };
  const pages = new Map<string, string>();
  for (const name of new Set(slots)) {
    for (const [path, text] of slotChangePages(following, tag, template, { kind: "made-fixed", name })) {
      following[path] = text;
      pages.set(path, text);
    }
  }
  return { source: template, pages, slots: [...new Set(slots)], select: selectionAfterRemove(slot?.node ?? node, slot?.next ?? hasNext) };
}
