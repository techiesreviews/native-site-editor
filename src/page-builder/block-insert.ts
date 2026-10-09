// Where a block clicked in the rail goes, read from the page source and the
// selection (wayfinder components-and-builder ticket 12 §2):
//   a Section or Div selected   inside it, at the end
//   anything else selected      right after it (or the ancestor that sits in a
//                               Section or Div), in that container
//   a component selected        refused until items slots take blocks
//   a Section clicked           after the selection's page band, never nested
//   nothing selected            a Section after the last band; other blocks
//                               into the last Section, or a new one made for them
// Pure: the caller inserts (block-insert-controller.ts) and selects the result.

import { nativeElementMarkup, type NativeElementKind } from "./native-elements";
import { nativeHeadingLevel, nativeOutline, type NativeOutline } from "./native-operations";

export const blockNames: Record<NativeElementKind, string> = { section: "Section", div: "Div", heading: "Heading", paragraph: "Paragraph", image: "Image", button: "Button" };

export type BlockTarget =
  | { ok: true; parent: number[]; index: number; wrap: boolean; where: string; select: number[] }
  | { ok: false; reason: string };

const short = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
const pretty = (tag: string) => tag.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
const isSection = (node: NativeOutline) => node.name === "section";
const takesBlocks = (node: NativeOutline) => node.name === "section" || node.name === "div";
const isInstance = (node: NativeOutline) => node.opaque && node.name.includes("-");

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

/** Words for where a block lands: "Into Div › after Heading", "Between page bands › after “Recent work”". */
function whereText(parent: NativeOutline, index: number, main: boolean) {
  const after = parent.children[index - 1], before = parent.children[index];
  const band = (node: NativeOutline) => (node.heading ? `“${short(node.heading)}”` : blockLabel(node));
  if (main) return `Between page bands › ${after ? `after ${band(after)}` : before ? `before ${band(before)}` : "the first"}`;
  const place = !parent.children.length ? "empty" : after ? `after ${blockLabel(after)}` : `before ${blockLabel(before!)}`;
  return `Into ${blockLabel(parent)} › ${place}`;
}

/**
 * The deepest element on `path` the source resolves; a path into a
 * component's own children stops at the component (its parts are its own).
 */
function resolve(body: NativeOutline, path: readonly number[]) {
  let node = body;
  const at: number[] = [];
  for (const step of path) {
    if (node.opaque) break;
    const child = node.children[step];
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

/** Where `kind` goes when its rail button is clicked, with `selection` (a body path) selected or nothing. */
export function clickTarget(source: string, kind: NativeElementKind, selection?: readonly number[]): BlockTarget {
  const body = nativeOutline(source);
  const main = body?.children.find(node => node.name === "main");
  if (!body || !main) return { ok: false, reason: body ? "This page has no <main> to add blocks to." : "The page's HTML could not be read exactly. Fix it in the code first." };
  const found = selection?.length ? resolve(body, selection) : undefined;
  const selected = found && found.node !== main && found.node !== body ? found.node : undefined;
  const into = (parent: NativeOutline, index: number, wrap = false): BlockTarget => {
    const parentPath = pathOf(parent);
    return {
      ok: true, parent: parentPath, index, wrap,
      where: wrap ? `Into a new Section › ${blockNames[kind]}` : whereText(parent, index, parent === main),
      select: wrap ? [...parentPath, index, 0] : [...parentPath, index],
    };
  };
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
  if (isInstance(selected)) return { ok: false, reason: `${blockLabel(selected)} is a component: its parts are filled by editing them. Select a Section or a Div.` };
  if (takesBlocks(selected)) return into(selected, selected.children.length);
  // A leaf, or anything else: after the element that sits in a Section or Div.
  let item = selected;
  while (item.parent && !takesBlocks(item.parent) && item.parent !== main && item.parent !== body) item = item.parent;
  if (item.parent && takesBlocks(item.parent)) return into(item.parent, item.parent.children.indexOf(item) + 1);
  return { ok: false, reason: "Blocks go inside a Section or a Div, not straight between page bands. Select a Section or a Div." };
}

/** The HTML a block inserts at `parent` (a body path): Heading levels follow the place; `wrap` puts it in a new Section. */
export function blockMarkup(source: string, kind: NativeElementKind, parent: readonly number[], wrap = false): string {
  const level = kind === "heading" ? (wrap ? 2 : nativeHeadingLevel(source, parent) ?? 2) : undefined;
  const markup = nativeElementMarkup(kind, level ? { level } : {});
  return wrap ? `<section class="flow">\n  ${markup}\n</section>` : markup;
}
