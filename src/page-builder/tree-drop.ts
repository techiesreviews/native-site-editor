// A block's drag over Page Structure (ticket 12 §6 and §8). In the tree the
// gap between the rows under the pointer is the place and the pointer's x
// picks the depth, one level per indent step, as in file trees: of the
// depths that gap allows, the nearest whose container takes the block wins
// (a refusing one only when none takes it). A Section snaps between the page
// bands (section-snap.ts). Over the canvas the tree mirrors the canvas's
// target: the rows unfold down to its container and an indented line shows
// the same spot. Containers come from the structure itself: <main>,
// Sections, Divs and a component instance's items slots. The decisions are
// pure; `createStructureDrop` drives page-structure.ts's view with them.

import type { NativeStructureItem } from "../components/native-preview";
import type { DropContainer, DropRect } from "./drop-report";
import { dropEndIndex, dropRefusal, dropStays, isBand, type DraggedBlock, type DropTarget } from "./drop-target";
import { snapIndex } from "./section-snap";

/** An element's row on show, measured in the editor's viewport; `end` is the bottom of its open subtree. */
export interface TreeRow { item: NativeStructureItem; level: number; top: number; bottom: number; end: number }
/** A line between rows: viewport y and the level a row there would have. */
export interface TreeLine { y: number; level: number }
/** Where a drop in the tree goes, its line and the container's row (tinted). */
export interface TreePick { target: DropTarget | undefined; line?: TreeLine; row?: readonly number[] }
/** A component's items slots by name, in template order (none: not a component, or no items slot). */
export type ItemsSlots = (tag: string) => readonly string[];

const NO_RECT: DropRect = { left: 0, top: 0, width: 0, height: 0 };
const key = (node: readonly number[]) => node.join(".");
const last = (row: TreeRow) => row.item.node[row.item.node.length - 1];
const within = (node: readonly number[], path: readonly number[]) => node.length >= path.length && path.every((step, at) => node[at] === step);
const childOf = (row: TreeRow, parent: TreeRow) => row.item.node.length === parent.item.node.length + 1 && within(row.item.node, parent.item.node);

/**
 * `item` as a drop container: <main>, a Section or a Div; a component
 * instance through an items slot (the one `near` is in, else the first).
 * Rects are empty: the tree places by rows, not by boxes.
 */
export function structureContainer(item: NativeStructureItem, itemsSlots: ItemsSlots, near?: NativeStructureItem): DropContainer | undefined {
  const children = (list: readonly NativeStructureItem[]) =>
    list.map((child) => ({ index: child.node[child.node.length - 1], rect: NO_RECT, tag: child.tag, cls: child.className ?? "" }));
  const base = { path: [...item.node], tag: item.tag, cls: item.className ?? "", rect: NO_RECT, count: item.children.length,
    layout: { display: "block", cols: 1, dir: "column", wrap: "nowrap" }, axis: "column" as const };
  if (item.tag === "main" || item.tag === "section" || item.tag === "div") {
    return { ...base, kind: item.tag, children: children(item.children), empty: !item.children.length };
  }
  const slots = item.tag.includes("-") ? itemsSlots(item.tag) : [];
  const slot = near ? near.slot.trim() : slots[0];
  if (slot === undefined || !slots.includes(slot)) return undefined;
  const assigned = item.children.filter((child) => child.slot.trim() === slot);
  return { ...base, kind: "items", slot, children: children(assigned), empty: !assigned.length };
}

/** The level the pointer's x asks for: level 1 at `left`, one more per `indent` px. */
export const levelAt = (x: number, left: number, indent: number) => Math.max(1, Math.round((x - left) / Math.max(indent, 1)) + 1);

const target = (block: DraggedBlock, container: DropContainer, index: number): DropTarget => {
  const reason = dropRefusal(block, container);
  return { container, index, level: 0, ok: !reason, ...(reason ? { reason } : {}) };
};

/** A Section in the tree: the nearest gap between <main>'s band rows (each with its open subtree). */
function bandPick(rows: readonly TreeRow[], y: number, block: DraggedBlock, itemsSlots: ItemsSlots): TreePick {
  const main = rows.find((row) => row.item.tag === "main");
  const container = main && structureContainer(main.item, itemsSlots);
  if (!main || !container) return { target: undefined };
  const bands = rows.filter((row) => childOf(row, main));
  // Folded <main>: its bands do not show, so the drop goes at the end.
  const index = bands.length ? snapIndex(bands.map((row) => ({ index: last(row), top: row.top, height: row.end - row.top })), y) : container.count;
  const next = bands.find((row) => last(row) >= index);
  const lineY = next ? next.top - 1 : bands.length ? bands[bands.length - 1].end + 1 : main.bottom + 1;
  return { target: target(block, container, index), line: { y: lineY, level: main.level + 1 }, row: main.item.node };
}

/**
 * The drop under the pointer in the tree: `rows` on show in order, `y` the
 * pointer's, `level` the depth its x asks for (levelAt). A moved block's own
 * row and subtree are left out, so the gaps around it are one.
 */
export function treeDrop(rows: readonly TreeRow[], y: number, level: number, block: DraggedBlock, itemsSlots: ItemsSlots): TreePick {
  if (isBand(block)) return bandPick(rows, y, block, itemsSlots);
  const byNode = new Map(rows.map((row) => [key(row.item.node), row]));
  const parentOf = (row: TreeRow) => byNode.get(key(row.item.node.slice(0, -1)));
  const shown = block.kind === "move" ? rows.filter((row) => !within(row.item.node, block.path)) : rows;
  let gap = shown.findIndex((row) => y < (row.top + row.bottom) / 2);
  if (gap < 0) gap = shown.length;
  const prev = shown[gap - 1], next = shown[gap];
  const options: { level: number; container: DropContainer; index: number; y: number }[] = [];
  const among = (parent: TreeRow | undefined, child: TreeRow, at: number, index: number, lineY: number) => {
    const container = parent && structureContainer(parent.item, itemsSlots, child.item);
    if (container) options.push({ level: at, container, index, y: lineY });
  };
  if (prev && next && next.level > prev.level) {
    // An open row and its first child: only before that child.
    among(parentOf(next), next, next.level, last(next), next.top - 1);
  } else if (prev) {
    const inside = structureContainer(prev.item, itemsSlots);
    if (inside) options.push({ level: prev.level + 1, container: inside, index: dropEndIndex(inside), y: prev.end + 1 });
    // After the previous row, or after any of its ancestors down to the next row's level.
    const floor = next ? next.level : 1;
    for (let at: TreeRow | undefined = prev; at && at.level >= floor; at = parentOf(at)) among(parentOf(at), at, at.level, last(at) + 1, prev.end + 1);
  } else if (next) among(parentOf(next), next, next.level, last(next), next.top - 1);
  const ok = options.filter((option) => !dropRefusal(block, option.container));
  const from = ok.length ? ok : options;
  if (!from.length) return { target: undefined };
  const pick = from.reduce((best, option) => (Math.abs(option.level - level) < Math.abs(best.level - level) ? option : best));
  return { target: target(block, pick.container, pick.index), line: { y: pick.y, level: pick.level }, row: pick.container.path };
}

/** Where a target (from the canvas) shows in the tree: none while its container's row does not show. */
export function treeLineFor(rows: readonly TreeRow[], drop: DropTarget): { line: TreeLine; row: readonly number[] } | undefined {
  const own = rows.find((row) => key(row.item.node) === key(drop.container.path));
  if (!own) return undefined;
  const kids = rows.filter((row) => childOf(row, own));
  const next = kids.find((row) => last(row) >= drop.index);
  const prev = [...kids].reverse().find((row) => last(row) < drop.index);
  const y = next ? next.top - 1 : prev ? prev.end + 1 : own.bottom + 1;
  return { line: { y, level: own.level + 1 }, row: own.item.node };
}

/** What page-structure.ts shows and measures for a drag. */
export interface StructureDropView {
  /** Whether the point (editor viewport) is over the tree. */
  over(x: number, y: number): boolean;
  /** The element rows on show, in order, measured now. */
  rows(): TreeRow[];
  /** Where level 1's line starts (viewport x) and the indent per level. */
  indent(): { left: number; step: number };
  /** Unfolds the rows down to `node` and `node` itself; rows unfolded so before and off that way fold back (none: all, but `keep`'s way). */
  unfold(node: readonly number[] | undefined, keep?: readonly number[]): void;
  /** The line and the tinted container row (none: clears); `reveal` scrolls the line into view; `moving` fades the dragged row. */
  mark(shown: { line: TreeLine; row?: readonly number[]; ok: boolean } | undefined, reveal: boolean, moving?: readonly number[]): void;
  /** Scrolls the tree when y is near its top or bottom edge. */
  edgeScroll(y: number): void;
  /** The page bytes the rows were painted from. */
  painted(): string | undefined;
}

/** The tree's side of one drag of `block` (block-drag-session.ts calls it). */
export interface StructureDrop {
  /** The target under the point when it is over the tree (drawn there); undefined off the tree. */
  aim(x: number, y: number): { target: DropTarget | undefined } | undefined;
  /** Shows a canvas target in the tree (none: clears the line). */
  mirror(drop: DropTarget | undefined): void;
  /** The drag ended (`kept`: dropped there, its rows stay open). */
  end(kept?: DropTarget): void;
  painted(): string | undefined;
}

export function createStructureDrop(view: StructureDropView, block: DraggedBlock, itemsSlots: ItemsSlots): StructureDrop {
  const moving = block.kind === "move" ? block.path : undefined;
  let mirrored = "";
  const show = (drop: DropTarget | undefined, at: { line: TreeLine; row?: readonly number[] } | undefined, reveal: boolean) =>
    view.mark(drop && at && !dropStays(block, drop) ? { ...at, ok: drop.ok } : undefined, reveal, moving);
  return {
    aim(x, y) {
      if (!view.over(x, y)) return undefined;
      mirrored = "";
      view.edgeScroll(y);
      const { left, step } = view.indent();
      const pick = treeDrop(view.rows(), y, levelAt(x, left, step), block, itemsSlots);
      show(pick.target, pick.line && { line: pick.line, row: pick.row }, false);
      return { target: pick.target };
    },
    mirror(drop) {
      // Each frame asks again: unfold and scroll only when the target changes.
      const id = drop ? `${key(drop.container.path)}/${drop.index}/${drop.ok}` : "";
      if (id === mirrored) return;
      mirrored = id;
      if (drop) view.unfold(drop.container.path);
      show(drop, drop && treeLineFor(view.rows(), drop), true);
    },
    end(kept) {
      view.mark(undefined, false);
      view.unfold(undefined, kept?.container.path);
    },
    painted: () => view.painted(),
  };
}
