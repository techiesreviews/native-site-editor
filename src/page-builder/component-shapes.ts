// Component-only shape discovery. Loaded with image-popups, never during boot.
import { resolveCascade, specificity, type CascadeRule } from "../../shared/cascade";
import { slottedTwin } from "../../shared/slotted-css";
import { componentLabel } from "../native-insert";
import { startTagAttributes } from "./component-model";
import { compoundsOf, flatRulesWithLayers, hasStatePseudo, matches, type Match } from "./component-css";
import { parseSource, readSource, tagAttribute, type SourceElement, type SourceNode } from "./source-tree";
import { POPUP_SHAPES, type PopupShape } from "./image-popup-rules";
import { hasPlaceShape, readPlaceFrame } from "./place-frame";

export interface ComponentPictureShape { value: string; ratio: number; label: string }
export interface ComponentPicture { label: string; shape: ComponentPictureShape }
const elements = (nodes: SourceNode[]): SourceElement[] => nodes.filter((node): node is SourceElement => node.type === "element");
const attributes = (html: string, element: SourceElement) =>
  new Map(startTagAttributes(html, element.tag).map(attr => [attr.name, attr.value]));

/**
 * A `::slotted()` selector split into the part the `<slot>` itself must match (`*` when nothing
 * names it, as in `.media ::slotted(img)`) and the compound the assigned image must match.
 */
function slottedParts(selector: string) {
  const compounds = compoundsOf(selector);
  if (!compounds) return undefined;
  const found = compounds.flatMap(compound => compound.simples).filter(simple => simple.type === "pseudo" && simple.element && simple.name === "slotted");
  if (found.length !== 1 || found[0].end !== selector.length || found[0].type !== "pseudo") return undefined;
  const before = selector.slice(0, found[0].start);
  return { slot: !before.trim() || /[\s>+~]$/.test(before) ? `${before}*` : before, image: found[0].argument ?? "" };
}

/**
 * Winning plain ratio and cover on the page image assigned to `slotName`, as the browser resolves
 * the component's own rules: each selector's `::slotted()` twin (shared/slotted-css.ts) or its own
 * `::slotted()`, the slot's side matched in the template, the argument on the image. Resting
 * styles only: conditional rules (`@media` …) and state rules (`:hover` …) are left out.
 * `instance` is the component element's whole source; the image is its `image`-th child element,
 * so structural pseudo-classes (`::slotted(img:first-child)`) see the page's real siblings.
 */
export function readComponentShape(css: string, template: string, slotName: string, instance: string, imageIndex: number): ComponentPictureShape | undefined {
  const tree = readSource(template), slot = tree.elements().find(node => node.type === "element" && node.name === "slot" && (tree.attribute(node, "name")?.value ?? "") === slotName);
  const host = elements(parseSource(instance))[0], image = host && elements(host.children)[imageIndex];
  if (!slot || slot.type !== "element" || !image || image.name !== "img") return undefined;
  const roots = tree.children().filter((node): node is SourceElement => node.type === "element");
  const inTemplate: Match = { html: template, top: roots, host, boundary: host, parents: new Map(roots.map(root => [root, host])), attributes: new Map([[host, attributes(instance, host)]]) };
  const onImage: Match = { html: instance, top: [host], boundary: host };
  const { rules: flat, layers: layerOf, order } = flatRulesWithLayers(css, "");
  const rules: CascadeRule[] = [];
  flat.forEach((rule, index) => {
    if (rule.wrappers.length) return;
    for (const selector of rule.selectors) {
      const twin = selector.includes("::slotted(") ? selector : slottedTwin(selector);
      const parts = twin ? slottedParts(twin) : undefined;
      if (!parts || !matches(inTemplate, slot, parts.slot) || !matches(onImage, image, `:is(${parts.image})`)) continue;
      const declarations = rule.declarations.flatMap(text => {
        const found = /^\s*(aspect-ratio|object-fit)\s*:\s*(.*?)\s*$/i.exec(text);
        if (!found) return [];
        return [{ property: found[1].toLowerCase(), value: found[2].replace(/!\s*important\s*$/i, "").trim(), important: /!\s*important\s*$/i.test(found[2]) }];
      });
      // Each declaration gets its own order, so duplicate properties resolve to the last one.
      for (const declaration of declarations) rules.push({ context: 0, layer: layerOf[index], state: hasStatePseudo(twin!), specificity: specificity(twin!), order: rules.length, declarations: [declaration] });
    }
  });
  const winners = resolveCascade({ rules, layers: { 0: order } }).winners;
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
  // A folder component wins over a flat one of the same tag, as nativeConventionComponents decides.
  const folder = `components/${parent.name}/${parent.name}`, flat = `components/${parent.name}`;
  const base = read(`${folder}.html`) !== undefined ? folder : flat, css = read(`${base}.css`), html = read(`${base}.html`);
  if (css === undefined || html === undefined) return undefined;
  const index = elements(parent.children).indexOf(image);
  const inputs = [css, html, tagAttribute(source, image.tag, "slot")?.value ?? "", source.slice(parent.start, parent.end), String(index)];
  if (!shapeCache || inputs.some((input, at) => input !== shapeCache!.inputs[at])) {
    shapeCache = { inputs, shape: readComponentShape(inputs[0], inputs[1], inputs[2], inputs[3], index) };
  }
  return shapeCache.shape && { label: componentLabel(parent.name), shape: shapeCache.shape };
}

/**
 * The component's shape shows unless the place has its own: an inline `aspect-ratio`, even one
 * that happens to match, or an `object-fit` other than the component's `cover`.
 */
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
