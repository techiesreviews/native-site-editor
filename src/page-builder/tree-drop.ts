// A block's drag over Page Structure (ticket 12 §6–8). In the tree the
// gap between the rows under the pointer is the place and the pointer's x
// picks the depth, one level per indent step, as in file trees: of the
// depths that gap allows, the nearest whose container takes the block wins
// (a refusing one only when none takes it). A Section snaps between the page
// bands (section-snap.ts). Over the canvas the tree mirrors the canvas's
// target: the rows unfold down to its container and an indented line shows
// the same spot. Containers come from the structure itself: <main>,
// Sections, Divs and a component instance's items slots, and for a moved
// element any other element (HTML's content rules decide, slice 82). In Edit
// component mode the rows are the template's (`templateContainers`): a part
// a named slot holds stands beside its siblings, an items slot's placeholder
// rows are that slot's. The decisions are
// pure; `createStructureDrop` drives page-structure.ts's view with them.
// Folded containers spring open after a 400 ms hold, or at once when picked.
// Drag-opened rows below the pointer fold back when off the target's way.

import type { NativeStructureItem } from "../components/native-preview";
import type { DropContainer, DropRect } from "./drop-report";
import { dropEndIndex, dropRefusal, dropStays, isBand, type DraggedBlock, type DropTarget } from "./drop-target";
import { snapIndex } from "./section-snap";
import { nativeOutline, type NativeOutline } from "./native-operations";
import { VOID_ELEMENTS } from "../../shared/html-source";

/** An element's visible row in viewport coordinates; `folded` hides children, `end` includes its open subtree. */
export interface TreeRow { item: NativeStructureItem; level: number; folded: boolean; top: number; bottom: number; end: number }
/** A line between rows: viewport y and the level a row there would have. */
export interface TreeLine { y: number; level: number }
/** Where a drop in the tree goes, its line and the container's row (tinted). */
export interface TreePick { target: DropTarget | undefined; line?: TreeLine; row?: readonly number[] }
/** A component's items slots by name, in template order (none: not a component, or no items slot). */
export type ItemsSlots = (tag: string) => readonly string[];
/** A row's element as a drop container (`near`: the row the place is beside); none when it takes nothing. */
export type TreeContainerOf = (item: NativeStructureItem, near?: NativeStructureItem) => DropContainer | undefined;

const NO_RECT: DropRect = { left: 0, top: 0, width: 0, height: 0 };
const key = (node: readonly number[]) => node.join(".");
const last = (row: TreeRow) => row.item.node[row.item.node.length - 1];
const within = (node: readonly number[], path: readonly number[]) => node.length >= path.length && path.every((step, at) => node[at] === step);
const childOf = (row: TreeRow, parent: TreeRow) => row.item.node.length === parent.item.node.length + 1 && within(row.item.node, parent.item.node);
/** The row a row shows under: its nearest ancestor's (a template's slot has no row of its own). */
const parentFinder = (rows: readonly TreeRow[]) => {
  const byNode = new Map(rows.map((row) => [key(row.item.node), row]));
  return (row: TreeRow) => {
    for (let n = row.item.node.length - 1; n > 0; n--) { const up = byNode.get(key(row.item.node.slice(0, n))); if (up) return up; }
    return undefined;
  };
};

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
  // Any other element, for a moved one (new blocks refuse it). A text row's own text counts as content.
  if (!item.tag.includes("-")) return VOID_ELEMENTS.has(item.tag) ? undefined
    : { ...base, kind: "element", children: children(item.children), empty: !item.children.length && !item.text };
  const slots = itemsSlots(item.tag);
  // Slot names match exactly, as the browser assigns them.
  const slot = near ? near.slot : slots[0];
  if (slot === undefined || !slots.includes(slot)) return undefined;
  const assigned = item.children.filter((child) => child.slot === slot);
  return { ...base, kind: "items", slot, children: children(assigned), empty: !assigned.length };
}

/** The template's element at a path, from its outline. */
const outlineAt = (template: string) => {
  const root = nativeOutline(template);
  return (path: readonly number[]) => {
    let node: NativeOutline | undefined = root;
    for (const step of path) node = node?.children[step];
    return node;
  };
};
/** Blocks take these template elements as a Section or a Div on a page (block-insert.ts `templateTakes`). */
const TEMPLATE_BLOCKS = new Set(["div", "article", "aside", "header", "footer", "nav", "figure"]);
/**
 * Edit component mode's containers, from the template edited (`tag` its
 * component): a row's element, or the items slot a `near` row is in; a named
 * slot (`slot`) and a nested component refuse; text rows are elements.
 */
export function templateContainers(template: string, tag: string): TreeContainerOf {
  const at = outlineAt(template);
  return (item, near) => {
    let path = item.node, node = at(path);
    // Beside a row in an items slot of this element: that slot.
    const slot = near && near.node.length > path.length + 1 && within(near.node, path) ? node?.children[near.node[path.length]] : undefined;
    if (slot?.slotName === "") { path = [...path, near!.node[path.length]]; node = slot; }
    if (!node || node.name === "" || VOID_ELEMENTS.has(node.name)) return undefined;
    const kind: DropContainer["kind"] = node.opaque ? "component" : node.slotName !== undefined ? node.slotName ? "slot" : "items"
      : node.name === "section" ? "section" : TEMPLATE_BLOCKS.has(node.name) ? "div" : "element";
    const children = node.children.map((child, index) => ({ index, rect: NO_RECT, tag: child.name, cls: child.slotName ?? child.className }));
    return { path: [...path], kind, tag: kind === "items" || kind === "slot" ? tag : node.name, cls: node.className, rect: NO_RECT,
      ...(node.slotName !== undefined ? { slot: node.slotName } : {}), count: children.length, children, empty: !children.length,
      layout: { display: "block", cols: 1, dir: "column", wrap: "nowrap" }, axis: "column" };
  };
}

/** Only items slots inside a component instance hold editable page containers. */
function openRows(rows: readonly TreeRow[], itemsSlots: ItemsSlots) {
  const parentOf = parentFinder(rows);
  // Inside a component instance only its items slots hold page blocks: a Section or
  // Div in any other slot (or a template part) is the component's, not a container.
  return (row: TreeRow) => {
    for (let child = row, up = parentOf(row); up; child = up, up = parentOf(up)) {
      if (up.item.tag.includes("-") && !itemsSlots(up.item.tag).includes(child.item.slot)) return false;
    }
    return true;
  };
}

/** The folded row under y that takes this block, including the instance slot rule. */
export function springRow(rows: readonly TreeRow[], y: number, block: DraggedBlock, itemsSlots: ItemsSlots,
  containerOf: TreeContainerOf = (item, near) => structureContainer(item, itemsSlots, near)): readonly number[] | undefined {
  if (isBand(block)) return undefined;
  const row = rows.find((row) => y >= row.top && y < row.bottom);
  if (!row?.folded || !openRows(rows, itemsSlots)(row)) return undefined;
  const container = containerOf(row.item);
  return container && !dropRefusal(block, container) ? row.item.node : undefined;
}

/** Only drag-opened rows below the pointer and off the target's way fold without moving the row under it. */
export function foldRows(rows: readonly TreeRow[], y: number, target: readonly number[] | undefined, opened: ReadonlySet<string>): readonly number[][] {
  return rows.filter((row) => opened.has(key(row.item.node)) && row.top > y && !row.folded && !(target && within(target, row.item.node))).map((row) => row.item.node);
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
  // Folded <main>: above its row (the header) is the first gap, anything below the last.
  const index = bands.length ? snapIndex(bands.map((row) => ({ index: last(row), top: row.top, height: row.end - row.top })), y)
    : y < main.top ? 0 : container.count;
  const next = bands.find((row) => last(row) >= index);
  const lineY = next ? next.top - 1 : bands.length ? bands[bands.length - 1].end + 1 : index ? main.bottom + 1 : main.top - 1;
  return { target: target(block, container, index), line: { y: lineY, level: main.level + 1 }, row: main.item.node };
}

/**
 * The drop under the pointer in the tree: `rows` on show in order, `y` the
 * pointer's, `level` the depth its x asks for (levelAt). A moved block's own
 * row and subtree are left out, so the gaps around it are one.
 */
export function treeDrop(rows: readonly TreeRow[], y: number, level: number, block: DraggedBlock, itemsSlots: ItemsSlots,
  containerOf: TreeContainerOf = (item, near) => structureContainer(item, itemsSlots, near)): TreePick {
  if (isBand(block)) return bandPick(rows, y, block, itemsSlots);
  const parentOf = parentFinder(rows);
  const open = openRows(rows, itemsSlots);
  const shown = block.kind === "move" ? rows.filter((row) => !within(row.item.node, block.path)) : rows;
  let gap = shown.findIndex((row) => y < (row.top + row.bottom) / 2);
  if (gap < 0) gap = shown.length;
  const prev = shown[gap - 1], next = shown[gap];
  const options: { level: number; container: DropContainer; index: number; y: number }[] = [];
  // Before or `after` the child, at its place in the container (an ancestor of it there, as a template's slot).
  const among = (parent: TreeRow | undefined, child: TreeRow, at: number, after: boolean, lineY: number) => {
    if (!parent || !open(parent)) return;
    const container = containerOf(parent.item, child.item);
    if (container) { options.push({ level: at, container, index: child.item.node[container.path.length] + (after ? 1 : 0), y: lineY }); return; }
    // Among an open instance's named parts (sprung open, say) a block goes to the
    // end of its items slot, and the line shows there.
    const items = containerOf(parent.item);
    if (!items) return;
    const end = dropEndIndex(items);
    options.push({ level: at, container: items, index: end, y: treeLineFor(rows, { container: items, index: end })?.line.y ?? lineY });
  };
  if (prev && next && next.level > prev.level) {
    // An open row and its first child: only before that child.
    among(parentOf(next), next, next.level, false, next.top - 1);
  } else if (prev) {
    const inside = open(prev) ? containerOf(prev.item) : undefined;
    if (inside) options.push({ level: prev.level + 1, container: inside, index: dropEndIndex(inside), y: prev.end + 1 });
    // After the previous row, or after any of its ancestors down to the next row's level.
    const floor = next ? next.level : 1;
    for (let at: TreeRow | undefined = prev; at && at.level >= floor; at = parentOf(at)) among(parentOf(at), at, at.level, true, prev.end + 1);
  } else if (next) among(parentOf(next), next, next.level, false, next.top - 1);
  const ok = options.filter((option) => !dropRefusal(block, option.container));
  const from = ok.length ? ok : options;
  if (!from.length) return { target: undefined };
  const pick = from.reduce((best, option) => (Math.abs(option.level - level) < Math.abs(best.level - level) ? option : best));
  return { target: target(block, pick.container, pick.index), line: { y: pick.y, level: pick.level }, row: pick.container.path };
}

/** Where a target (from the canvas) shows in the tree: none while its container's row does not show. */
export function treeLineFor(rows: readonly TreeRow[], drop: Pick<DropTarget, "container" | "index">):{ line: TreeLine; row: readonly number[] } | undefined {
  const path = drop.container.path, parentOf = parentFinder(rows);
  // A template's slot has no row: the row it shows under, its rows that slot's.
  const own = rows.find((row) => key(row.item.node) === key(path)) ??
    [...rows].filter((row) => within(path, row.item.node)).sort((a, b) => b.item.node.length - a.item.node.length)[0];
  if (!own) return undefined;
  const kids = rows.filter((row) => row.item.node.length > path.length && within(row.item.node, path) && parentOf(row) === own);
  const at = (row: TreeRow) => row.item.node[path.length];
  const next = kids.find((row) => at(row) >= drop.index);
  const prev = [...kids].reverse().find((row) => at(row) < drop.index);
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
  /** Opens one folded row and records it as drag-opened; user-opened rows stay untracked. */
  open(node: readonly number[]): void;
  /** Folds only drag-opened rows below y and off the target's way. */
  foldBelow(y: number, target: readonly number[] | undefined): void;
  /** Marks the folded row waiting to spring open (none: clears the cue). */
  spring(node: readonly number[] | undefined): void;
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

/** Schedules a spring hold and returns its cancellation, so tests can drive time. */
export type SpringTimer = (ms: number, opened: () => void) => () => void;
const springTimer: SpringTimer = (ms, opened) => {
  const timer = setTimeout(opened, ms);
  return () => clearTimeout(timer);
};

export function createStructureDrop(view: StructureDropView, block: DraggedBlock, itemsSlots: ItemsSlots, after: SpringTimer = springTimer,
  containerOf: TreeContainerOf = (item, near) => structureContainer(item, itemsSlots, near)): StructureDrop {
  const moving = block.kind === "move" ? block.path : undefined;
  let mirrored = "";
  let pending: { node: readonly number[]; cancel: () => void } | undefined;
  let pointerY = 0;
  const cancelSpring = () => {
    if (!pending) return;
    pending.cancel();
    pending = undefined;
    view.spring(undefined);
  };
  const spring = (node: readonly number[] | undefined) => {
    if (node && pending && key(node) === key(pending.node)) { view.spring(node); return; }
    cancelSpring();
    if (!node) return;
    view.spring(node);
    pending = { node, cancel: after(400, () => {
      const current = springRow(view.rows(), pointerY, block, itemsSlots, containerOf);
      pending = undefined;
      view.spring(undefined);
      if (current && key(current) === key(node)) view.open(node);
    }) };
  };
  const show = (drop: DropTarget | undefined, at: { line: TreeLine; row?: readonly number[] } | undefined, reveal: boolean) =>
    view.mark(drop && at && !dropStays(block, drop) ? { ...at, ok: drop.ok } : undefined, reveal, moving);
  return {
    aim(x, y) {
      if (!view.over(x, y)) { cancelSpring(); return undefined; }
      pointerY = y;
      // Back over the canvas (or off both) the tree's line is drawn anew.
      mirrored = "tree";
      view.edgeScroll(y);
      const { left, step } = view.indent();
      const level = levelAt(x, left, step);
      let pick = treeDrop(view.rows(), y, level, block, itemsSlots, containerOf);
      const path = pick.target?.ok ? pick.target.container.path : undefined;
      if (!isBand(block)) {
        view.foldBelow(y, path);
        // A folded container picked opens at once, and the place is picked again
        // among its children on show (Lex, 2026-10-09).
        const own = path && view.rows().find((row) => key(row.item.node) === key(path));
        if (own && own.folded) {
          view.open(own.item.node);
          pick = treeDrop(view.rows(), y, level, block, itemsSlots, containerOf);
        }
      }
      spring(springRow(view.rows(), y, block, itemsSlots, containerOf));
      show(pick.target, pick.line && { line: pick.line, row: pick.row }, false);
      return { target: pick.target };
    },
    mirror(drop) {
      cancelSpring();
      // Asked again and again: unfold and scroll only when the target changes;
      // the line is measured each time (a redrawn tree moves it).
      const id = drop ? `${key(drop.container.path)}/${drop.index}/${drop.ok}` : "";
      const changed = id !== mirrored;
      mirrored = id;
      if (drop && changed) view.unfold(drop.container.path);
      show(drop, drop && treeLineFor(view.rows(), drop), changed);
    },
    end(kept) {
      cancelSpring();
      view.mark(undefined, false);
      view.unfold(undefined, kept?.container.path);
    },
    painted: () => view.painted(),
  };
}

/**
 * Edit component mode's side of a drag in Structure: the rows of the
 * template of `tag` edited, read with the bytes they were painted from
 * (the framed instance's row named by the template's root element).
 */
export function createTemplateStructureDrop(view: StructureDropView, block: DraggedBlock, tag: string, after: SpringTimer = springTimer): StructureDrop {
  const source = view.painted() ?? "", at = outlineAt(source);
  const rows = () => view.rows().map((row) => {
    const name = at(row.item.node)?.name;
    return name && name !== row.item.tag ? { ...row, item: { ...row.item, tag: name } } : row;
  });
  return createStructureDrop({ ...view, rows }, block, () => [], after, templateContainers(source, tag));
}
