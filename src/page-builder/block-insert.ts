// Where a block clicked in the rail goes, read from the page source and the
// selection (wayfinder components-and-builder ticket 12 §2):
//   a Section or Div selected   inside it, at the end
//   anything else selected      right after it (or the ancestor that sits in a
//                               Section or Div), in that container
//   a component selected        into its first items slot, after that slot's
//                               last child; refused when it has none
//   an items slot's child       as a leaf: right after it, in that slot
//   a Section clicked           after the selection's page band, never nested
//   nothing selected            a Section after the last band; other blocks
//                               into the last Section, or a new one made for them
// Pure: the caller inserts (block-insert-controller.ts) and selects the result.

import { templateSlots, type TemplateOf } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";
import { nativeElementMarkup, templateSectionRefusal, templateSlotRefusal, type NativeElementKind } from "./native-elements";
import { nativeHeadingLevel, nativeMoveRefusal, nativeOutline, type ItemsSlotRule, type NativeOutline } from "./native-operations";

export const blockNames: Record<NativeElementKind, string> = { section: "Section", div: "Div", heading: "Heading", paragraph: "Paragraph", image: "Image", button: "Button" };

export type BlockTarget =
  | { ok: true; parent: number[]; index: number; wrap: boolean; where: string; select: number[]; slot?: string }
  | { ok: false; reason: string };

const short = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
const pretty = (tag: string) => tag.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
const isSection = (node: NativeOutline) => node.name === "section";
const takesBlocks = (node: NativeOutline) => node.name === "section" || node.name === "div";
const isInstance = (node: NativeOutline) => node.opaque && node.name.includes("-");

/** A component's items slots by name as the browser reads them (decoded), in template order. */
export const itemsSlots = (tag: string, templateOf: TemplateOf) => {
  const template = templateOf(tag);
  return template === undefined ? [] : templateSlots(template, templateOf).filter((entry) => entry.items).map((entry) => decodeHtmlEntities(entry.name, true));
};
/** The items slots of the site's components (component-model.ts `templateSlots`), from their templates. */
export function itemsSlotRule(templateOf: TemplateOf): ItemsSlotRule {
  const known = new Map<string, Set<string>>();
  return (tag, slot) => {
    if (!known.has(tag)) known.set(tag, new Set(itemsSlots(tag, templateOf)));
    return known.get(tag)!.has(slot);
  };
}
const itemsName = (tag: string, slot: string) => `${pretty(tag)} › ${slot ? `“${slot}” slot` : "items"}`;

/** What the editor calls an element in labels ("Heading", "Section “Recent work”"). */
export function blockLabel(node: NativeOutline): string {
  const name = node.name;
  if (name === "section") return node.heading ? `Section “${short(node.heading)}”` : "Section";
  if (name === "div") return "Div";
  if (/^h[1-6]$/.test(name)) return "Heading";
  if (name === "p") return "Paragraph";
  if (name === "a") return /(?:^|\s)btn(?:\s|$)/.test(node.className) ? "Button" : "Link";
  if (name === "img" || name === "picture") return "Image";
  if (name.includes("-")) return pretty(name);
  return `<${name}>`;
}

/** Words for where a block lands: "Into Div › after Heading", "Between page bands › after “Recent work”", "Into Section work › items › empty". */
function whereText(parent: NativeOutline, index: number, main: boolean, slot?: string) {
  // In an instance's items slot, its neighbours are that slot's children.
  const kids = (slot === undefined ? parent.children : parent.children.filter((child) => child.slot === slot));
  const after = parent.children.slice(0, index).reverse().find((child) => kids.includes(child));
  const before = parent.children.slice(index).find((child) => kids.includes(child));
  const band = (node: NativeOutline) => (node.heading ? `“${short(node.heading)}”` : blockLabel(node));
  if (main) return `Between page bands › ${after ? `after ${band(after)}` : before ? `before ${band(before)}` : "the first"}`;
  const place = !kids.length ? "empty" : after ? `after ${blockLabel(after)}` : `before ${blockLabel(before!)}`;
  return `Into ${slot === undefined ? blockLabel(parent) : itemsName(parent.name, slot)} › ${place}`;
}

/**
 * The deepest element on `path` the source resolves; a path into a
 * component's own children stops at the component (its parts are its own),
 * except into its items slots, whose children are page blocks.
 */
function resolve(body: NativeOutline, path: readonly number[], items: ItemsSlotRule) {
  let node = body;
  const at: number[] = [];
  for (const step of path) {
    const child = node.children[step];
    if (node.opaque && !(child && isInstance(node) && items(node.name, child.slot))) break;
    if (!child) return undefined;
    node = child;
    at.push(step);
  }
  return { node, path: at };
}
const pathOf = (node: NativeOutline) => {
  const out: number[] = [];
  for (let at = node; at.parent; at = at.parent) out.unshift(at.parent.children.indexOf(at));
  return out;
};

/**
 * Where `kind` goes when its rail button is clicked, with `selection` (a body
 * path) selected or nothing; `templateOf` gives the site's component templates
 * (for their items slots).
 */
export function clickTarget(source: string, kind: NativeElementKind, selection?: readonly number[], templateOf: TemplateOf = () => undefined): BlockTarget {
  const body = nativeOutline(source);
  const main = body?.children.find(node => node.name === "main");
  if (!body || !main) return { ok: false, reason: body ? "This page has no <main> to add blocks to." : "The page's HTML could not be read exactly. Fix it in the code first." };
  const items = itemsSlotRule(templateOf);
  const found = selection?.length ? resolve(body, selection, items) : undefined;
  const selected = found && found.node !== main && found.node !== body ? found.node : undefined;
  const into = (parent: NativeOutline, index: number, wrap = false, slot?: string): BlockTarget => {
    const parentPath = pathOf(parent);
    return {
      ok: true, parent: parentPath, index, wrap,
      where: wrap ? `Into a new Section › ${blockNames[kind]}` : whereText(parent, index, parent === main, slot),
      select: wrap ? [...parentPath, index, 0] : [...parentPath, index],
      ...(slot === undefined ? {} : { slot }),
    };
  };
  // Takes blocks: a Section or Div, or an instance's items slot (for `child`, the slot it is in).
  const takes = (parent: NativeOutline, child: NativeOutline) => takesBlocks(parent) || (isInstance(parent) && items(parent.name, child.slot));
  if (kind === "section") {
    if (!selected) return into(main, main.children.length);
    // The selection's page band: its ancestor (or itself) directly in <main>;
    // outside <main> (the header, the footer), the first or last gap.
    let band = selected;
    while (band.parent && band.parent !== main && band.parent !== body) band = band.parent;
    if (band.parent === main) return into(main, main.children.indexOf(band) + 1);
    return into(main, body.children.indexOf(band) < body.children.indexOf(main) ? 0 : main.children.length);
  }
  if (!selected) {
    const last = [...main.children].reverse().find(isSection);
    return last ? into(last, last.children.length) : into(main, main.children.length, true);
  }
  if (isInstance(selected)) {
    // Its first items slot, after that slot's last child (at the end when it has none).
    const slot = itemsSlots(selected.name, templateOf)[0];
    if (slot === undefined) return { ok: false, reason: `${blockLabel(selected)} is a component without an items slot: its parts are filled by editing them. Select a Section or a Div.` };
    const last = selected.children.map((child) => child.slot).lastIndexOf(slot);
    return into(selected, last < 0 ? selected.children.length : last + 1, false, slot);
  }
  if (takesBlocks(selected)) return into(selected, selected.children.length);
  // A leaf, or anything else: after the element that sits in a Section, a Div or an items slot.
  let item = selected;
  while (item.parent && !takes(item.parent, item) && item.parent !== main && item.parent !== body) item = item.parent;
  if (item.parent && takes(item.parent, item)) return into(item.parent, item.parent.children.indexOf(item) + 1, false, isInstance(item.parent) ? item.slot : undefined);
  return { ok: false, reason: "Blocks go inside a Section or a Div, not straight between page bands. Select a Section or a Div." };
}

// ---- In a component's template (Edit component mode, build slice 43). ----

/** The template's own elements that take blocks, as a Section or a Div does on a page. */
const templateBlocks = new Set(["section", "div", "article", "aside", "header", "footer", "nav", "figure"]);
const isNamedSlot = (node: NativeOutline) => Boolean(node.slotName);
const inNamedSlot = (node: NativeOutline) => {
  for (let at = node.parent; at; at = at.parent) if (isNamedSlot(at)) return true;
  return false;
};
/**
 * Whether a template's element takes blocks: a block part, or the unnamed
 * (items) slot where the element around it is one or the template's top,
 * outside any named slot's placeholder (each page fills that slot).
 * A named slot never does, a cards slot included: a block would make it an
 * ordinary slot.
 */
function templateTakes(node: NativeOutline) {
  if (node.opaque || inNamedSlot(node)) return false;
  if (node.slotName === "") {
    let around = node.parent;
    while (around?.slotName === "") around = around.parent;
    return !around?.parent || templateBlocks.has(around.name);
  }
  return node.slotName === undefined && templateBlocks.has(node.name);
}

/**
 * Why a block can't go into the template's element at `parent` (a template
 * path), or nothing when it can: the same rule as a click's, for a place
 * the preview measured (Edit component mode's drops).
 */
export function templateDropRefusal(template: string, parent: readonly number[]): string | undefined {
  let node = nativeOutline(template);
  if (!node) return "The template's HTML could not be read exactly. Fix it in the code first.";
  for (const step of parent) {
    node = node.children[step];
    if (!node) return "The template changed meanwhile. Try again.";
    if (node.opaque) return node.name.includes("-") ? `${blockLabel(node)} is its own component: open it to build inside its template.` : "Blocks go inside a Section, a Div or the component's items.";
  }
  if (templateTakes(node)) return undefined;
  if (isNamedSlot(node)) return templateSlotRefusal(node.slotName!);
  for (let at = node.parent; at; at = at.parent) if (isNamedSlot(at)) return templateSlotRefusal(at.slotName!);
  return "Blocks go inside a Section, a Div or the component's items.";
}

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
 * Where `kind` goes in the template of the component `tag` (Edit component
 * mode) when its rail button is clicked, with `selection` (a template path)
 * selected or nothing:
 *   a block part selected       inside it, at the end (Section, Div, article,
 *                               aside, header, footer, nav, figure)
 *   anything else selected      right after it (or the ancestor that sits in
 *                               a block part or the items slot), there
 *   a part of a named slot      after that slot: each page fills the slot
 *   a nested component          after it (open it to build inside it)
 *   the items (unnamed) slot    its placeholder content takes blocks: what
 *                               new instances start with
 *   nothing selected            the template's root element, at the end
 *   a Section                   refused: components sit in page bands
 */
export function templateClickTarget(template: string, tag: string, kind: NativeElementKind, selection?: readonly number[]): BlockTarget {
  if (kind === "section") return { ok: false, reason: templateSectionRefusal };
  const root = nativeOutline(template);
  if (!root) return { ok: false, reason: "The template's HTML could not be read exactly. Fix it in the code first." };
  const label = (node: NativeOutline) => node.slotName === undefined ? blockLabel(node) : node.slotName ? `“${node.slotName}” slot` : "items";
  const into = (parent: NativeOutline, index: number): BlockTarget => {
    const parentPath = pathOf(parent);
    const after = parent.children[index - 1], before = parent.children[index];
    const place = after ? `after ${label(after)}` : before ? `before ${label(before)}` : "empty";
    return { ok: true, parent: parentPath, index, wrap: false, select: [...parentPath, index],
      where: `Into ${parent.slotName === "" ? itemsName(tag, "") : blockLabel(parent)} › ${place}` };
  };
  // The selection, down to a nested component (its parts are its own template's).
  let selected: NativeOutline | undefined;
  for (const step of selection ?? []) {
    const child = (selected ?? root).children[step];
    if (!child) { selected = undefined; break; }
    selected = child;
    if (child.opaque) break;
  }
  if (!selected) {
    const top = root.children.find((node) => node.slotName === undefined) ?? root.children[0];
    if (top && templateTakes(top)) return into(top, top.children.length);
    return { ok: false, reason: "This template's root element doesn't take blocks. Select a Div in it, or add one in the code." };
  }
  if (templateTakes(selected)) return into(selected, selected.children.length);
  // After the element (or the named slot it is in) that sits in a block part or the items slot.
  let item = selected;
  for (let parent = item.parent; parent && parent !== root; item = parent, parent = item.parent) {
    if (templateTakes(parent)) return into(parent, parent.children.indexOf(item) + 1);
  }
  return { ok: false, reason: "Blocks go inside the template's element, not beside it. Select a part inside it." };
}

/**
 * The HTML a block inserts at `parent` (a body path; `items` opens instances'
 * items slots on the way): Heading levels follow the place; `wrap` puts it in a new Section.
 */
export function blockMarkup(source: string, kind: NativeElementKind, parent: readonly number[], wrap = false, items?: ItemsSlotRule): string {
  const level = kind === "heading" ? (wrap ? 2 : nativeHeadingLevel(source, parent, items) ?? 2) : undefined;
  const markup = nativeElementMarkup(kind, level ? { level } : {});
  return wrap ? `<section class="flow">\n  ${markup}\n</section>` : markup;
}
