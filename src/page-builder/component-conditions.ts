/** Template visibility conditions. Edits preserve every byte outside data-if. */
import { decodeEntity, startTags } from "../../shared/html-source";
import { parseSource, type SourceElement, type SourceNode } from "./component-model";

const SPACE = /[\t\n\f\r ]/;
const decode = (value: string) => value.replace(/&(?:#\d+|#[xX][\da-fA-F]+|[a-zA-Z][\da-zA-Z]*);/g, (entity) => decodeEntity(entity, 0)?.text ?? entity);
interface Attribute { name: string; start: number; end: number; value: string }
/** HTML attribute whitespace is ASCII, including when NBSP occurs in a name. */
function attributes(source: string, element: SourceElement): Attribute[] {
  const out: Attribute[] = [];
  let at = element.tag.nameEnd;
  while (at < element.tag.end - 1) {
    while (SPACE.test(source[at] ?? "")) at++;
    if (source[at] === ">") break;
    // A slash only closes a tag immediately before >. Otherwise HTML resumes attributes.
    if (source[at] === "/") { at++; continue; }
    const start = at;
    while (at < element.tag.end - 1 && !/[\t\n\f\r />=]/.test(source[at])) at++;
    if (at === start) throw new Error("Malformed template attribute.");
    const nameEnd = at;
    const name = source.slice(start, at).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    while (SPACE.test(source[at] ?? "")) at++;
    let value = "";
    let end = nameEnd;
    if (source[at] === "=") {
      at++;
      while (SPACE.test(source[at] ?? "")) at++;
      const quote = source[at];
      if (quote === "'" || quote === '"') {
        const begin = ++at;
        while (at < element.tag.end - 1 && source[at] !== quote) at++;
        if (source[at] !== quote) throw new Error("Unclosed template attribute.");
        value = source.slice(begin, at++);
      } else {
        const begin = at;
        while (at < element.tag.end - 1 && !SPACE.test(source[at]) && source[at] !== ">") at++;
        value = source.slice(begin, at);
      }
      end = at;
    }
    out.push({ name, start, end, value: decode(value) });
  }
  return out;
}
export interface SlotConditionTarget {
  node: number[];
  element: SourceElement;
  label: string;
  present: boolean;
  names: string[];
  problem?: string;
}
export interface SlotConditions { targets: SlotConditionTarget[]; slotNames: string[]; authoringProblem?: string }
export function readSlotConditions(template: string): SlotConditions {
  const recognized = new Set(startTags(template).map((tag) => tag.start));
  const all: { element: SourceElement; node: number[]; attrs: Attribute[] }[] = [];
  const visit = (nodes: SourceNode[], path: number[]) => {
    let index = 0;
    for (const element of nodes) if (element.type === "element") {
      const node = [...path, index++];
      if (!recognized.has(element.start)) continue;
      // parseSource supplies structure; reject its broader whitespace tag guesses.
      const actual = /^<([a-zA-Z][^\t\n\f\r />]*)/.exec(template.slice(element.start))?.[1].replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      if (actual !== element.name || template[element.tag.end - 1] !== ">") throw new Error("Ambiguous template start tag.");
      all.push({ element, node, attrs: attributes(template, element) });
      visit(element.children, node);
    }
  };
  visit(parseSource(template), []);
  const slotNames = [...new Set(all.filter(({ element }) => element.name === "slot")
    .map(({ attrs }) => (attrs.find((attr) => attr.name === "name")?.value ?? "")))];
  const unsupported = slotNames.find((name) => /\s/.test(name));
  const authoringProblem = unsupported !== undefined
    ? `Unsupported slot name: ${JSON.stringify(unsupported)}. The loaders match the exact name; whitespace cannot be expressed as a condition requirement. Resolve in code first.` : undefined;
  const targets = all.filter(({ element, attrs }) => element.name === "slot" || attrs.some((attr) => attr.name === "data-if"))
    .map(({ element, node, attrs }): SlotConditionTarget => {
      const conditions = attrs.filter((attr) => attr.name === "data-if");
      const own = (attrs.find((attr) => attr.name === "name")?.value ?? "");
      const value = conditions[0]?.value ?? "";
      const names = conditions.length ? value.trim().split(/\s+/).filter(Boolean) : [];
      if (conditions.length && !names.length && element.name === "slot") names.push(own);
      const duplicate = names.find((name, index) => names.indexOf(name) !== index);
      const unknown = names.find((name) => !slotNames.includes(name));
      return { node, element, label: element.name === "slot" ? `Slot: ${own || "Content"}` : `Condition wrapper: <${element.name}> at ${element.start}`,
        present: conditions.length > 0, names,
        problem: conditions.length && !names.length && element.name !== "slot" ? "Unsupported empty wrapper condition: the published loader and preview require unnamed assigned content or hide this wrapper. Visibility cannot be represented here. Resolve in code or remove the condition." : conditions.length > 1 ? "Duplicate data-if attributes; resolve in code first." : duplicate !== undefined ? `Duplicate slot requirement: ${duplicate || "Content"}.` : unknown !== undefined ? `Unknown slot: ${unknown || "Content"}.` : undefined };
    });
  return { targets, slotNames, authoringProblem };
}
/** Fallback never counts as assigned content; every requirement must be filled. */
export function slotConditionVisible(target: SlotConditionTarget, assigned: ReadonlySet<string>): boolean | undefined {
  if (target.problem) return undefined;
  return target.names.every((name) => assigned.has(name));
}
export interface SlotConditionPlan { start: number; end: number; text: string; expected: string; expectedSource: string }
export function planSlotCondition(template: string, targetNode: number[], names: string[] | undefined): SlotConditionPlan {
  const model = readSlotConditions(template);
  const target = model.targets.find((target) => JSON.stringify(target.node) === JSON.stringify(targetNode));
  if (!target) throw new Error("Condition target no longer exists.");
  const attrs = attributes(template, target.element).filter((attr) => attr.name === "data-if");
  if (attrs.length > 1) throw new Error("Duplicate data-if attributes; resolve in code first.");
  if (names !== undefined) {
    if (target.problem) throw new Error(target.problem);
    if (model.authoringProblem) throw new Error(model.authoringProblem);
    if (new Set(names).size !== names.length) throw new Error("Duplicate slot requirements.");
    for (const name of names) if (!model.slotNames.includes(name)) throw new Error(`Unknown slot: ${name || "Content"}.`);
    if (names.includes("") && (names.length !== 1 || target.element.name !== "slot" || (attributes(template, target.element).find((attr) => attr.name === "name")?.value ?? "").trim() !== ""))
      throw new Error("The unnamed slot can only require itself using bare data-if.");
    if (names.some((name) => /\s/.test(name))) throw new Error("Slot names containing whitespace cannot be condition requirements.");
    if (!names.length && target.element.name !== "slot") throw new Error("Empty wrapper conditions cannot be represented. Explicitly remove the condition.");
    if (!names.length && target.element.name === "slot") throw new Error("An empty slot condition requires its own slot. Choose a slot or explicitly remove the condition.");
  }
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const attr = attrs[0];
  const start = target.element.tag.start, end = target.element.tag.end;
  const expected = template.slice(start, end);
  const replacement = names === undefined ? "" : names[0] === "" ? "data-if" : `data-if="${escape(names.join(" "))}"`;
  const text = attr ? template.slice(start, attr.start) + replacement + template.slice(attr.end, end)
    : template.slice(start, target.element.tag.nameEnd) + (replacement ? ` ${replacement}` : "") + template.slice(target.element.tag.nameEnd, end);
  return { start, end, text, expected, expectedSource: template };
}
