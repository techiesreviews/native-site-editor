// PROTOTYPE (wayfinder ticket 12, components-and-builder). Throwaway; not kept for the real build.
//
// The Structure panel as a drop target: its rows by node path, unfolding the
// rows above a target, a drop line at a depth, and two ways to pick a place
// from the pointer: row zones (variants A and B: top quarter before, middle
// inside, bottom quarter after) and file-tree depth (variant C: the gap under
// the pointer, the depth from the pointer's x).

import { containerKind, endIndex, itemsOf, slotForIndex, targetFor, variant, type Box, type Dragged, type Model, type PNode, type Target } from "./cb12-core";

export const treeEl = () => document.querySelector<HTMLElement>(".page-structure__tree");
export const rowFor = (key: string) => treeEl()?.querySelector<HTMLElement>(`[role='treeitem'][data-node='${key}']`) ?? undefined;
export const levelOf = (row: HTMLElement) => Number(row.getAttribute("aria-level") || "1");
const shown = (row: HTMLElement) => !row.closest("[role='group'][hidden]") && row.offsetParent !== null;
export function visibleRows() {
  const tree = treeEl();
  return tree ? [...tree.querySelectorAll<HTMLElement>("[role='treeitem'][data-node]")].filter(shown) : [];
}
export const indentStep = () => (variant === "C" ? 14 : 4);
export function overTree(x: number, y: number) {
  const tree = treeEl();
  if (!tree || tree.closest("[hidden]")) return false;
  const r = tree.getBoundingClientRect();
  const panel = document.querySelector<HTMLElement>(".pb-add-panel:not([hidden]):not(.cb12-tucked)");
  if (panel) { const p = panel.getBoundingClientRect(); if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return false; }
  return x >= r.left && x <= r.right && y >= r.top - 4 && y <= Math.max(r.bottom, r.top + 40) + 24;
}

/**
 * Unfolds the rows above (and at) a container so its children show, and
 * folds again the rows a drag unfolded that are not on the way any more
 * (spring-loaded, as in file managers). `undefined` folds them all back,
 * except `keep`.
 */
const unfolded = new Set<string>();
export function expandTo(key: string | undefined, keep?: string) {
  const onWay = (k: string) => Boolean(key && (key === k || key.startsWith(`${k}.`))) || Boolean(keep && (keep === k || keep.startsWith(`${k}.`)));
  for (const k of [...unfolded].sort((a, b) => b.length - a.length)) {
    if (onWay(k)) continue;
    const row = rowFor(k);
    if (row?.getAttribute("aria-expanded") === "true") row.querySelector<HTMLElement>(".page-structure__toggle")?.click();
    unfolded.delete(k);
  }
  if (!key) return;
  const parts = key.split(".");
  for (let i = 1; i <= parts.length; i++) {
    const k = parts.slice(0, i).join(".");
    const row = rowFor(k);
    if (row?.getAttribute("aria-expanded") === "false") { row.querySelector<HTMLElement>(".page-structure__toggle")?.click(); unfolded.add(k); }
  }
}

/** A box for a drop among a container node's children. */
export function boxAmong(node: PNode, index: number): Box | undefined {
  const kind = containerKind(node);
  if (!kind) return { node };
  if (kind !== "instance") return { node };
  const slot = slotForIndex(node, index);
  return slot ? { node, slot } : undefined;
}
export function boxInside(node: PNode): Box | undefined {
  const kind = containerKind(node);
  if (!kind) return undefined;
  if (kind !== "instance") return { node };
  const slot = (node.slots ?? []).find((s) => s.items && s.shown) ?? (node.slots ?? [])[0];
  return slot ? { node, slot } : undefined;
}

/** Bottom of a row's subtree on show (its open group counts). */
function subtreeBottom(row: HTMLElement) {
  const group = row.nextElementSibling;
  if (group instanceof HTMLElement && group.getAttribute("role") === "group" && !group.hidden) return group.getBoundingClientRect().bottom;
  return row.getBoundingClientRect().bottom;
}

/** Where the line goes in the tree for a target: y (viewport) and the child level. */
export function treeLine(t: Target): { y: number; level: number; row?: HTMLElement } | undefined {
  const key = t.box.node.key;
  const own = rowFor(key);
  const items = itemsOf(t.box);
  const next = items.find((n) => n.p.at(-1)! >= t.index);
  const prev = [...items].reverse().find((n) => n.p.at(-1)! < t.index);
  const nextRow = next && rowFor(next.key);
  const prevRow = prev && rowFor(prev.key);
  const level = own ? levelOf(own) + 1 : nextRow ? levelOf(nextRow) : prevRow ? levelOf(prevRow) : 2;
  if (nextRow && shown(nextRow)) return { y: nextRow.getBoundingClientRect().top, level, row: own };
  if (prevRow && shown(prevRow)) return { y: subtreeBottom(prevRow), level, row: own };
  if (own && shown(own)) return { y: own.getBoundingClientRect().bottom, level, row: own };
  return undefined;
}

export interface TreePick { target?: Target; line?: { y: number; level: number } ; row?: HTMLElement }

/** Variants A and B: the row under the pointer and which part of it. */
export function pickZones(model: Model, d: Dragged, x: number, y: number): TreePick {
  void x;
  const rows = visibleRows();
  const row = rows.find((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y < b.bottom; })
    ?? (rows.length && y >= rows[rows.length - 1].getBoundingClientRect().bottom ? rows[rows.length - 1] : undefined);
  if (!row) return {};
  const node = model.byKey.get(row.dataset.node!);
  if (!node) return {};
  const b = row.getBoundingClientRect();
  const f = (y - b.top) / b.height;
  const inside = boxInside(node);
  const parent = node.parent;
  const i = node.p.at(-1)!;
  const among = (index: number) => {
    const box = parent && boxAmong(parent, index);
    return box ? targetFor(d, box, index) : undefined;
  };
  if (inside && f > 0.25 && f < 0.75) {
    const t = targetFor(d, inside, endIndex(inside));
    if (t.ok || !parent) return { target: t, row };
  }
  const t = f < 0.5 ? among(i) : among(i + 1);
  return { target: t, row };
}

/** Variant C: the gap under the pointer, at the depth the pointer's x says (as in file trees). */
export function pickDepth(model: Model, d: Dragged, x: number, y: number): TreePick {
  const tree = treeEl();
  const rows = visibleRows();
  if (!tree || !rows.length) return {};
  let g = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
  if (g < 0) g = rows.length;
  const prev = rows[g - 1], next = rows[g];
  const nodeOf = (row?: HTMLElement) => (row ? model.byKey.get(row.dataset.node!) : undefined);
  const prevNode = nodeOf(prev), nextNode = nodeOf(next);
  const candidates: { level: number; parent: PNode; index: number; inside?: boolean }[] = [];
  if (prevNode && prev) {
    const prevLevel = levelOf(prev);
    const nextLevel = next ? levelOf(next) : 1;
    if (nextNode && next && nextLevel > prevLevel) {
      // prev is open and next is its first child: only "before next".
      if (nextNode.parent) candidates.push({ level: nextLevel, parent: nextNode.parent, index: nextNode.p.at(-1)! });
    } else {
      if (containerKind(prevNode)) candidates.push({ level: prevLevel + 1, parent: prevNode, index: -1, inside: true });
      let at: PNode | undefined = prevNode;
      for (let level = prevLevel; at && level >= nextLevel; level--, at = at.parent) {
        if (at.parent) candidates.push({ level, parent: at.parent, index: at.p.at(-1)! + 1 });
      }
    }
  } else if (nextNode?.parent && next) candidates.push({ level: levelOf(next), parent: nextNode.parent, index: nextNode.p.at(-1)! });
  if (!candidates.length) return {};
  const left = tree.getBoundingClientRect().left;
  const wanted = Math.round((x - left - 10) / indentStep()) + 1;
  const pick = candidates.reduce((best, c) => (Math.abs(c.level - wanted) < Math.abs(best.level - wanted) ? c : best));
  const box = pick.inside ? boxInside(pick.parent) : boxAmong(pick.parent, pick.index);
  if (!box) return {};
  const index = pick.inside ? endIndex(box) : pick.index;
  const lineY = prev ? (pick.inside || !next ? prev.getBoundingClientRect().bottom : next.getBoundingClientRect().top) : next!.getBoundingClientRect().top;
  return { target: targetFor(d, box, index), line: { y: lineY, level: pick.level }, row: rowFor(pick.parent.key) };
}
