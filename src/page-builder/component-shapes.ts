// Component-only shape discovery. Loaded with image-popups, never during boot.
import { resolveCascade, specificity, type CascadeRule } from "../../shared/cascade";
import { slottedTwin } from "../../shared/slotted-css";
import { componentLabel } from "../native-insert";
import { startTagAttributes } from "./component-model";
import { compoundsOf, flatRules, matches, type Match } from "./component-css";
import { parseSource, readSource, tagAttribute, type SourceElement, type SourceNode } from "./source-tree";
import { POPUP_SHAPES, type PopupShape } from "./image-popup-rules";
import { hasPlaceShape, readPlaceFrame } from "./place-frame";

export interface ComponentPictureShape { value: string; ratio: number; label: string }
export interface ComponentPicture { label: string; shape: ComponentPictureShape }
const elements = (nodes: SourceNode[]): SourceElement[] => nodes.filter((node): node is SourceElement => node.type === "element");
const attributes = (html: string, element: SourceElement) =>
  new Map(startTagAttributes(html, element.tag).map(attr => [attr.name, attr.value]));

/** Interpret the twin's slotted subject at the slot's position, reusing the source matcher. */
function slottedSelector(selector: string) {
  const compounds = compoundsOf(selector);
  if (!compounds) return undefined;
  const edits = compounds.flatMap(compound => compound.simples.flatMap(simple =>
    simple.type === "pseudo" && simple.element && simple.name === "slotted"
      ? [{ start: simple.start, end: simple.end, text: `:is(${simple.argument ?? ""})` }] : []));
  if (edits.length !== 1 || edits[0].end !== selector.length) return undefined;
  const edit = edits[0];
  return selector.slice(0, edit.start) + edit.text;
}

/** Winning plain ratio and cover on the page image standing where its slot stands. */
export function readComponentShape(css: string, template: string, slotName: string, imageTag: string, instanceTag: string): ComponentPictureShape | undefined {
  const tree = readSource(template), slot = tree.elements().find(node => node.type === "element" && node.name === "slot" && (tree.attribute(node, "name")?.value ?? "") === slotName);
  const image = elements(parseSource(imageTag))[0], host = elements(parseSource(instanceTag))[0];
  if (!slot || slot.type !== "element" || !image || !host) return undefined;
  // Use the same parsed template for the subject and its ancestors.
  const roots = tree.children().filter((node): node is SourceElement => node.type === "element");
  const parents = new Map(roots.map(root => [root, host]));
  const match: Match = { html: template, top: roots, host, boundary: host, parents,
    names: new Map([[slot, image.name]]), attributes: new Map([[slot, attributes(imageTag, image)], [host, attributes(instanceTag, host)]]) };
  const rules: CascadeRule[] = [];
  for (const rule of flatRules(css, "")) {
    if (rule.wrappers.length) continue;
    for (const selector of rule.selectors) {
      const twin = selector.includes("::slotted(") ? selector : slottedTwin(selector);
      const subject = twin && slottedSelector(twin);
      if (!subject || !matches(match, slot, subject)) continue;
      // The loader adds the twin to this same rule; use its actual specificity.
      const declarations = rule.declarations.flatMap(text => {
        const found = /^\s*(aspect-ratio|object-fit)\s*:\s*(.*?)\s*$/i.exec(text);
        if (!found) return [];
        return [{ property: found[1].toLowerCase(), value: found[2].replace(/!\s*important\s*$/i, "").trim(), important: /!\s*important\s*$/i.test(found[2]) }];
      });
      // Each declaration gets its own order, so duplicate properties resolve to the last one.
      for (const declaration of declarations) rules.push({ context: 0, specificity: specificity(twin!), order: rules.length, declarations: [declaration] });
    }
  }
  const winners = resolveCascade({ rules }).winners;
  const value = (property: string) => {
    const winner = winners[property];
    return winner && rules[winner.rule].declarations[winner.declaration].value;
  };
  const raw = value("aspect-ratio"), fit = value("object-fit");
  const ratio = raw?.match(/^(\d+(?:\.\d*)?|\.\d+)\s*(?:\/\s*(\d+(?:\.\d*)?|\.\d+))?$/);
  if (!ratio || fit?.toLowerCase() !== "cover") return undefined;
  const a = Number(ratio[1]), b = Number(ratio[2] ?? 1), n = a / b;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const label = POPUP_SHAPES.find(shape => shape.ratio !== undefined && Math.abs(shape.ratio - n) < 0.0001)?.label ?? `${a}:${b}`;
  return { value: `${a} / ${b}`, ratio: n, label };
}

// Last page and last shape inputs: edit-bar refreshes reuse source strings without retaining old projects.
let pageCache: { source: string; tree: ReturnType<typeof readSource> } | undefined;
let shapeCache: { inputs: string[]; shape: ComponentPictureShape | undefined } | undefined;
export function componentPicture(source: string, node: number[], read: (path: string) => string | undefined): ComponentPicture | undefined {
  if (pageCache?.source !== source) pageCache = { source, tree: readSource(source, { page: true }) };
  const { tree } = pageCache;
  const image = tree.at(node);
  if (!image || image.type !== "element" || image.name !== "img") return undefined;
  const parent = image.parent;
  if (!parent?.name.includes("-")) return undefined;
  const base = `components/${parent.name}/${parent.name}`, css = read(`${base}.css`), html = read(`${base}.html`);
  if (css === undefined || html === undefined) return undefined;
  const inputs = [css, html, tagAttribute(source, image.tag, "slot")?.value ?? "", source.slice(image.tag.start, image.tag.end), source.slice(parent.tag.start, parent.tag.end)];
  if (!shapeCache || inputs.some((input, index) => input !== shapeCache!.inputs[index])) {
    shapeCache = { inputs, shape: readComponentShape(inputs[0], inputs[1], inputs[2], inputs[3], inputs[4]) };
  }
  return shapeCache.shape && { label: componentLabel(parent.name), shape: shapeCache.shape };
}

/** Inline shape declarations mean this place chose its own shape, even if the ratio happens to match. */
export function componentPopupShape(tag: string, component?: ComponentPicture): PopupShape | undefined {
  if (!component || hasPlaceShape(tag)) return undefined;
  return { kind: "component", value: component.shape.value, label: `${component.label}'s shape (${component.shape.label})`, badge: `${component.label}'s shape` };
}
export function componentFrame(tag: string, records: Parameters<typeof readPlaceFrame>[1], page: string, component?: ComponentPicture) {
  const frame = readPlaceFrame(tag, records, page, !!component);
  return { ...frame, shape: componentPopupShape(tag, component) ?? frame.shape };
}
export function componentShapeEntry(component?: ComponentPicture) {
  return component && { id: componentPopupShape("<img>", component)!, label: `${component.label}'s shape (${component.shape.label})` };
}
export function componentShapeNotice(shape: PopupShape, component?: ComponentPicture) {
  return component && (typeof shape === "string" || shape.kind !== "component") ? `This ${component.label} will look different from the others.` : undefined;
}
