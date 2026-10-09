import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { NativeStructureItem } from "../src/components/native-preview";
import type { DraggedBlock, DropTarget } from "../src/page-builder/drop-target";
import { createStructureDrop, levelAt, structureContainer, treeDrop, treeLineFor, type StructureDropView, type TreeRow } from "../src/page-builder/tree-drop";

// A page as Structure shows it; `open` rows show their children.
type Spec = [tag: string, children?: Spec[], extra?: { cls?: string; slot?: string; open?: boolean }];
function items(specs: Spec[], parent: number[] = []): NativeStructureItem[] {
  return specs.map(([tag, children = [], extra = {}], index) => {
    const node = [...parent, index];
    return { tag, className: extra.cls, node, text: "", heading: "", slot: extra.slot ?? "", children: items(children, node), open: extra.open } as NativeStructureItem;
  });
}
// Rows 20 px tall, 2 px apart, in tree order, as far as they are open.
function rowsOf(list: NativeStructureItem[], level = 1, out: TreeRow[] = []): TreeRow[] {
  for (const item of list) {
    const top = out.length * 22;
    const row: TreeRow = { item, level, top, bottom: top + 20, end: top + 20 };
    out.push(row);
    if ((item as NativeStructureItem & { open?: boolean }).open) {
      rowsOf(item.children, level + 1, out);
      row.end = out[out.length - 1].bottom;
    }
  }
  return out;
}
const page = items([
  ["header"],
  ["main", [
    ["section", [["h2"], ["div", [["p"], ["p"]], { cls: "flow", open: true }]], { open: true }],
    ["section", [["p"]]],
  ], { open: true }],
  ["footer"],
]);
const rows = rowsOf(page);
const at = (node: string) => rows.find((row) => row.item.node.join(".") === node)!;
const noSlots = () => [];
const paragraph: DraggedBlock = { kind: "new", block: "paragraph" };
const section: DraggedBlock = { kind: "new", block: "section" };
const pick = (y: number, level: number, block = paragraph, list = rows) => {
  const found = treeDrop(list, y, level, block, noSlots);
  return found.target && { path: found.target.container.path.join("."), index: found.target.index, ok: found.target.ok, level: found.line?.level, y: found.line?.y };
};

test("the pointer's x picks the depth of a gap; only depths that take the block count", () => {
  // Below the last paragraph of the Div, above the second (folded) Section.
  const y = at("1.0.1.1").bottom + 1;
  assert.deepEqual(pick(y, 4), { path: "1.0.1", index: 2, ok: true, level: 4, y: at("1.0.1.1").end + 1 });
  assert.deepEqual(pick(y, 3), { path: "1.0", index: 2, ok: true, level: 3, y: at("1.0.1.1").end + 1 });
  // <main> refuses a Paragraph: the nearest depth that takes it.
  assert.equal(pick(y, 2)!.path, "1.0");
  assert.equal(pick(y, 1)!.path, "1.0");
  assert.equal(pick(y, 9)!.path, "1.0.1");
});

test("between an open row and its first child only the first place inside counts", () => {
  const y = at("1.0.1.0").top + 2;
  for (const level of [1, 3, 6]) assert.deepEqual(pick(y, level), { path: "1.0.1", index: 0, ok: true, level: 4, y: at("1.0.1.0").top - 1 });
});

test("below a folded container the drop goes in at its end", () => {
  const y = at("1.1").bottom - 2;
  assert.deepEqual(pick(y, 3), { path: "1.1", index: 1, ok: true, level: 3, y: at("1.1").end + 1 });
  assert.equal(pick(y, 2)!.path, "1.1");
});

test("a moved row's own gaps are one: back where it was stays", () => {
  const moved: DraggedBlock = { kind: "move", path: [1, 0, 1, 0], band: false };
  const own = at("1.0.1.0");
  const found = treeDrop(rows, (own.top + own.bottom) / 2, 4, moved, noSlots);
  assert.deepEqual([found.target?.container.path, found.target?.index], [[1, 0, 1], 1]);
  // A Div moved never offers a place inside itself.
  const div: DraggedBlock = { kind: "move", path: [1, 0, 1], band: false };
  const inside = treeDrop(rows, at("1.0.1.1").top + 2, 4, div, noSlots);
  assert.notDeepEqual(inside.target?.container.path, [1, 0, 1]);
  assert.equal(inside.target?.ok, true);
});

test("no container above the first row: no place", () => {
  assert.equal(treeDrop(rows, -5, 1, paragraph, noSlots).target, undefined);
});

test("a component instance takes drops only through its items slot", () => {
  const grid = items([["main", [["section", [["card-grid", [["card-x", [], { slot: "" }], ["h3", [], { slot: "title" }]], { open: true }]], { open: true }]], { open: true }]]);
  const list = rowsOf(grid);
  const slots = (tag: string) => (tag === "card-grid" ? [""] : []);
  const after = treeDrop(list, list[3].bottom + 1, 4, paragraph, slots).target!;
  assert.deepEqual([after.container.kind, after.container.slot, after.index, after.ok], ["items", "", 1, true]);
  // Next to a named slot's element there is no items place; the Section takes it.
  const title = treeDrop(list, list[4].bottom + 1, 4, paragraph, slots).target!;
  assert.deepEqual(title.container.path, [0, 0]);
  assert.equal(structureContainer(list[3].item, slots), undefined);
  assert.equal(structureContainer(list[2].item, slots)?.slot, "");
});

test("a Section or Div in a component's named slot is the component's, not a container", () => {
  const card = items([["main", [["section", [["card-x", [["div", [["p"]], { slot: "body", open: true }]], { open: true }]], { open: true }]], { open: true }]]);
  const list = rowsOf(card);
  const inBody = treeDrop(list, list[4].bottom + 1, 5, paragraph, noSlots).target!;
  assert.deepEqual(inBody.container.path, [0, 0]);
  // Through an items slot it is a page block, and takes drops.
  const open = treeDrop(list, list[4].bottom + 1, 5, paragraph, (tag) => (tag === "card-x" ? ["body"] : [])).target!;
  assert.deepEqual(open.container.path, [0, 0, 0, 0]);
  // Slot names match exactly, as the browser assigns them.
  const spaced = rowsOf(items([["main", [["section", [["card-x", [["div", [["p"]], { slot: " body ", open: true }]], { open: true }]], { open: true }]], { open: true }]]));
  assert.deepEqual(treeDrop(spaced, spaced[4].bottom + 1, 5, paragraph, (tag) => (tag === "card-x" ? ["body"] : [])).target!.container.path, [0, 0]);
});

test("over a folded <main> a Section goes first from above its row, last from below", () => {
  const folded = rowsOf(items([["header"], ["main", [["section"], ["section"]]], ["footer"]]));
  assert.deepEqual(pick(folded[0].top + 2, 2, section, folded), { path: "1", index: 0, ok: true, level: 2, y: folded[1].top - 1 });
  assert.deepEqual(pick(folded[2].top + 2, 2, section, folded), { path: "1", index: 2, ok: true, level: 2, y: folded[1].bottom + 1 });
});

test("a Section snaps between page bands, by each band's rows", () => {
  const upper = pick(at("1.0").top + 4, 5, section)!;
  assert.deepEqual(upper, { path: "1", index: 0, ok: true, level: 2, y: at("1.0").top - 1 });
  // In the lower half of the first band's rows (a nested row): after it.
  assert.deepEqual(pick(at("1.0.1.0").bottom, 1, section), { path: "1", index: 1, ok: true, level: 2, y: at("1.1").top - 1 });
  assert.equal(pick(at("0").top, 3, section)!.index, 0);
  assert.deepEqual(pick(at("2").top + 5, 3, section), { path: "1", index: 2, ok: true, level: 2, y: at("1.1").end + 1 });
});

test("a canvas target shows in the tree as a line at its container's depth", () => {
  const div = structureContainer(at("1.0.1").item, noSlots)!;
  const drop = (index: number, container = div): DropTarget => ({ container, index, level: 0, ok: true });
  assert.deepEqual(treeLineFor(rows, drop(1)), { line: { y: at("1.0.1.1").top - 1, level: 4 }, row: [1, 0, 1] });
  assert.deepEqual(treeLineFor(rows, drop(2))!.line, { y: at("1.0.1.1").end + 1, level: 4 });
  const folded = structureContainer(at("1.1").item, noSlots)!;
  assert.deepEqual(treeLineFor(rows, drop(0, folded))!.line, { y: at("1.1").bottom + 1, level: 3 });
  assert.equal(treeLineFor(rows, drop(0, { ...div, path: [7] })), undefined);
});

test("the level under x: one per indent step from the left edge", () => {
  assert.equal(levelAt(100, 100, 14), 1);
  assert.equal(levelAt(120, 100, 14), 2);
  assert.equal(levelAt(142, 100, 14), 4);
  assert.equal(levelAt(20, 100, 14), 1);
});

test("the tree's side of a drag unfolds to a canvas target once, draws it and folds back at the end", () => {
  const calls: string[] = [];
  const view: StructureDropView = {
    over: (x) => x < 200,
    rows: () => rows,
    indent: () => ({ left: 0, step: 14 }),
    unfold: (node, keep) => calls.push(`unfold ${node?.join(".") ?? "-"} keep ${keep?.join(".") ?? "-"}`),
    mark: (shown, reveal, moving) => calls.push(`mark ${shown ? `${shown.line.level}@${shown.line.y}:${shown.row?.join(".")}:${shown.ok}` : "-"} ${reveal} ${moving?.join(".") ?? "-"}`),
    edgeScroll: () => calls.push("scroll"),
    painted: () => "<p>",
  };
  const moved: DraggedBlock = { kind: "move", path: [1, 0, 0], band: false };
  const drag = createStructureDrop(view, moved, noSlots);
  const div = structureContainer(at("1.0.1").item, noSlots)!;
  const drop: DropTarget = { container: div, index: 1, level: 0, ok: true };
  drag.mirror(drop);
  drag.mirror(drop);
  // Unfolded and scrolled to once; the line measured again each time.
  const mark = `mark 4@${at("1.0.1.1").top - 1}:1.0.1:true`;
  assert.deepEqual(calls, ["unfold 1.0.1 keep -", `${mark} true 1.0.0`, `${mark} false 1.0.0`]);
  calls.length = 0;
  assert.equal(drag.aim(300, 10), undefined);
  // Where it already is: nothing drawn.
  const own = at("1.0.0");
  const back = drag.aim(60, (own.top + own.bottom) / 2)!;
  assert.deepEqual([back.target?.container.path, back.target?.index], [[1, 0], 1]);
  assert.deepEqual(calls, ["scroll", "mark - false 1.0.0"]);
  calls.length = 0;
  // Off the tree and the canvas: the tree's line goes.
  drag.aim(60, at("1.0.1.1").top + 2);
  drag.mirror(undefined);
  assert.deepEqual(calls.slice(-1), ["mark - true 1.0.0"]);
  calls.length = 0;
  drag.end(drop);
  assert.deepEqual(calls, ["mark - false -", "unfold - keep 1.0.1"]);
  assert.equal(drag.painted(), "<p>");
});
