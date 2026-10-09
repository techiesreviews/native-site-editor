// Where a dragged block lands, decided from one drop probe (drop-report.ts):
// the innermost container under the pointer that may take the block, unless
// the pointer is within DROP_EDGE px of its edge (then its parent, and so on)
// or the user has stepped up levels (Alt or Tab; Shift+Tab steps back). The
// exception is a moved grid/items-slot child over a sibling: its parent wins,
// before or after that sibling, and levels step up from that parent.
// The index runs along the container's axis, sideways in rows and grids. Where
// blocks may go: ticket 10 §5 with the ticket 04 amendment. A dragged Section
// snaps between page bands on the canvas (slice 34); here it can only take
// <main>. Pure.

import type { DropChild, DropContainer } from "./drop-report";
import { templateSectionRefusal, type NativeElementKind } from "./native-elements";
import { componentLabel } from "../native-insert";
import { nativeKindLabel } from "../native-structure";

/**
 * A new block from the rail (`template`: into the template edited in Edit
 * component mode), or a page element being moved (`band`: a section or section component).
 */
export type DraggedBlock =
  | { kind: "new"; block: NativeElementKind; template?: boolean }
  | { kind: "move"; path: readonly number[]; band: boolean };

export interface DropTarget {
  container: DropContainer;
  /** The source child index to insert at (an items slot's index among the instance's children). */
  index: number;
  /** Containers above the innermost one under the pointer. */
  level: number;
  ok: boolean;
  reason?: string;
}

export const DROP_EDGE = 8;

/** A page band, which snaps between page bands; in a template, a Section is refused like any misplaced block. */
export const isBand = (block: DraggedBlock) => (block.kind === "new" ? block.block === "section" && !block.template : block.band);

/** Why a container can't take the block, or undefined when it can. */
export function dropRefusal(block: DraggedBlock, container: DropContainer): string | undefined {
  if (block.kind === "move" && block.path.every((step, at) => container.path[at] === step)) return "A block cannot go inside itself.";
  if (block.kind === "new" && block.template && block.block === "section") return templateSectionRefusal;
  if (container.kind === "fixed") return "This part is fixed in the component's template: Edit component to change it.";
  if (container.kind === "component") return `${componentLabel(container.tag)} is its own component: open it to build inside its template.`;
  if (isBand(block)) {
    if (container.kind === "main") return undefined;
    const inside = container.kind === "section" ? "a Section" : container.kind === "div" ? "a Div" : "a component";
    return `A Section goes only between page bands, not inside ${inside}.`;
  }
  if (container.kind === "main") return "Blocks go inside a Section or a Div, not straight between page bands.";
  if (container.kind === "slot") return `The “${container.slot}” slot is filled by editing its text, not by drops. Drop into the component's items instead.`;
  return undefined;
}

const shown = (child: DropChild) => child.rect.width > 0 && child.rect.height > 0;
// A slot's end is after its last assigned child; anything else ends after all its children (the report may list fewer).
export const dropEndIndex = (container: DropContainer) => {
  const last = container.children[container.children.length - 1];
  return (container.kind === "items" || container.kind === "slot") && last ? last.index + 1 : container.count;
};

/** The insertion index under the point among a container's items, along its axis. */
function pointIndex(container: DropContainer, p: { x: number; y: number }) {
  const row = container.axis === "row";
  for (const child of container.children.filter(shown)) {
    const { left, top, width, height } = child.rect;
    if (row ? p.y < top || (p.y <= top + height && p.x < left + width / 2) : p.y < top + height / 2) return child.index;
  }
  return dropEndIndex(container);
}

/** Before or after the child the pointer is in, by which half of it the point is in. */
function sideIndex(container: DropContainer, childIndex: number | undefined, p: { x: number; y: number }) {
  const child = container.children.find((item) => item.index === childIndex);
  if (!child || !shown(child)) return pointIndex(container, p);
  const { left, top, width, height } = child.rect;
  return (container.axis === "row" ? p.x < left + width / 2 : p.y < top + height / 2) ? child.index : child.index + 1;
}

const nearEdge = (p: { x: number; y: number }, { left, top, width, height }: DropContainer["rect"]) =>
  p.x - left < DROP_EDGE || left + width - p.x < DROP_EDGE || p.y - top < DROP_EDGE || top + height - p.y < DROP_EDGE;

/**
 * The target for `block` at the pointer, from the containers under it
 * (innermost first). `level` steps up from a moved item's sibling container,
 * or where the edges leave the pointer; past the top it stays outermost.
 */
export function dropTarget(containers: readonly DropContainer[], p: { x: number; y: number }, block: DraggedBlock, level = 0): DropTarget | undefined {
  if (!containers.length) return undefined;
  const sibling = siblingUnder(containers, p, block);
  const at = (j: number): DropTarget => {
    const container = containers[j];
    // In an outer container the pointer is inside the child that holds the inner one.
    const child = sibling?.j === j ? sibling.hovered : j > 0 ? containers[j - 1].path[container.path.length] : undefined;
    const index = child === undefined ? pointIndex(container, p) : sideIndex(container, child, p);
    const reason = dropRefusal(block, container);
    return { container, index, level: j, ok: !reason, ...(reason ? { reason } : {}) };
  };
  // Otherwise a named slot refuses where it is; a fixed part does too, except
  // at its edges (below), where the drop goes beside it.
  const first = containers[0];
  if (!sibling && level <= 0 && !isBand(block) && (first.kind === "slot" || (first.kind === "fixed" || first.kind === "component") && !nearEdge(p, first.rect))) return at(0);
  let i = sibling?.j ?? 0;
  if (!sibling) while (i < containers.length - 1 && nearEdge(p, containers[i].rect)) i++;
  i = Math.min(i + Math.max(0, level), containers.length - 1);
  for (let j = i; j < containers.length; j++) if (!dropRefusal(block, containers[j])) return at(j);
  return at(i);
}

const inside = (p: { x: number; y: number }, { left, top, width, height }: DropContainer["rect"]) =>
  p.x >= left && p.x <= left + width && p.y >= top && p.y <= top + height;

/**
 * A moved item of a grid or an items slot over another item of the same
 * container: where that container is in `containers`, and the hovered item's
 * index. The item is the child holding the next inner container, or, for a
 * leaf with no containers of its own (an image), the child box under the pointer.
 */
function siblingUnder(containers: readonly DropContainer[], p: { x: number; y: number }, block: DraggedBlock) {
  if (block.kind !== "move") return undefined;
  const parent = block.path.slice(0, -1), own = block.path[block.path.length - 1];
  for (let j = 0; j < containers.length; j++) {
    const container = containers[j];
    if (!(container.kind === "items" || container.layout.display.includes("grid")) ||
      container.path.length !== parent.length || !container.path.every((step, at) => parent[at] === step)) continue;
    // An items slot shares its instance's path, so the next inner container may be the instance's own part.
    const hovered = j > 0 ? containers[j - 1].path[container.path.length]
      : container.children.find((child) => shown(child) && inside(p, child.rect))?.index;
    if (hovered === undefined) continue;
    // An instance's items slots share its path: both items must be in this one.
    if (container.kind === "items" && ![own, hovered].every((index) => container.children.some((item) => item.index === index))) continue;
    return hovered === own ? undefined : { j, hovered };
  }
  return undefined;
}

/** "Paragraph", "Div (stack)", "Button", a component's name, or a template's slot (its name in `cls`). */
export function dropBlockName(tag: string, cls: string) {
  if (tag === "slot") return cls ? `“${cls}” slot` : "items";
  const classes = cls.split(/\s+/);
  if (tag === "div") return classes.includes("cards") ? "Div (grid)" : classes.includes("flow") ? "Div (stack)" : "Div";
  if (tag === "a" && classes.includes("btn")) return "Button";
  return tag.includes("-") ? componentLabel(tag) : nativeKindLabel(tag);
}

/** "Div (stack)", "Section", "Card project › items": what labels call a container. */
export function dropContainerName(container: DropContainer) {
  if (container.kind !== "items" && container.kind !== "slot") return dropBlockName(container.tag, container.cls);
  return `${componentLabel(container.tag)} › ${container.slot ? `“${container.slot}” slot` : "items"}`;
}

/** Whether a move target is the place the block already is (for an items slot, one the block already fills). */
export function dropStays(block: DraggedBlock, target: DropTarget) {
  if (block.kind !== "move") return false;
  const parent = block.path.slice(0, -1), i = block.path[block.path.length - 1];
  const container = target.container;
  return container.path.length === parent.length && parent.every((step, at) => container.path[at] === step) &&
    (target.index === i || target.index === i + 1) && (container.kind !== "items" || container.children.some((child) => child.index === i));
}

/** The label by the pointer: "Into Div (stack) › after Paragraph", or the refusal's reason. */
export function dropLabel(target: DropTarget, block: DraggedBlock) {
  if (!target.ok) return target.reason ?? "Not here";
  if (dropStays(block, target)) return "Stays where it is";
  const items = target.container.children;
  const after = [...items].reverse().find((child) => child.index < target.index);
  const before = items.find((child) => child.index >= target.index);
  const place = after ? `after ${dropBlockName(after.tag, after.cls)}` : before ? `before ${dropBlockName(before.tag, before.cls)}` : "";
  if (target.container.kind === "main") return `Between page bands › ${place || "the first"}`;
  return `Into ${dropContainerName(target.container)} › ${place || "empty"}`;
}
