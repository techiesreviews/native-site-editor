import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DropContainer, DropRect } from "../src/page-builder/drop-report";
import { dropLabel, dropRefusal, dropTarget, type DraggedBlock } from "../src/page-builder/drop-target";

const rect = (left: number, top: number, width: number, height: number): DropRect => ({ left, top, width, height });
const layout = { display: "block", cols: 0, dir: "row", wrap: "nowrap" };
const child = (index: number, r: DropRect, tag = "p", cls = "") => ({ index, rect: r, tag, cls });
function box(path: number[], kind: DropContainer["kind"], r: DropRect, children: DropContainer["children"] = [], extra: Partial<DropContainer> = {}): DropContainer {
  const tag = kind === "items" || kind === "slot" ? "section-work" : kind;
  return { path, kind, tag, cls: "", rect: r, count: children.length, children, layout, empty: !children.length, axis: "column", ...extra };
}

// <main> [1] › <section> [1,0] › <div class="flow"> [1,0,1] holding h2, p, p.
const main = box([1], "main", rect(0, 0, 800, 1000), [child(0, rect(0, 0, 800, 600), "section")]);
const section = box([1, 0], "section", rect(0, 0, 800, 600), [child(0, rect(40, 40, 720, 40), "h2"), child(1, rect(40, 100, 720, 400), "div", "flow")]);
const stack = box([1, 0, 1], "div", rect(40, 100, 720, 400),
  [child(0, rect(60, 120, 680, 40), "h2"), child(1, rect(60, 180, 680, 100)), child(2, rect(60, 300, 680, 100))], { cls: "flow" });
const chain = [stack, section, main];
const paragraph: DraggedBlock = { kind: "new", block: "paragraph" };

test("the innermost container under the pointer wins, indexed by the item halves", () => {
  const top = dropTarget(chain, { x: 400, y: 200 }, paragraph)!;
  assert.deepEqual([top.container.path, top.index, top.level, top.ok], [[1, 0, 1], 1, 0, true]);
  assert.equal(dropTarget(chain, { x: 400, y: 260 }, paragraph)!.index, 2);
  assert.equal(dropTarget(chain, { x: 400, y: 450 }, paragraph)!.index, 3);
  assert.equal(dropTarget([], { x: 0, y: 0 }, paragraph), undefined);
});

test("within 8 px of a container's edge the target escapes to its parent, before or after the child", () => {
  const nearTop = dropTarget(chain, { x: 400, y: 104 }, paragraph)!;
  assert.deepEqual([nearTop.container.path, nearTop.index, nearTop.level], [[1, 0], 1, 1]);
  const nearBottom = dropTarget(chain, { x: 400, y: 495 }, paragraph)!;
  assert.deepEqual([nearBottom.container.path, nearBottom.index], [[1, 0], 2]);
  assert.equal(dropTarget(chain, { x: 400, y: 108.5 }, paragraph)!.level, 0);
  // Coinciding edges escape through both; the outermost container takes the pointer at its own edge.
  const flush = box([1, 0, 1, 0], "div", rect(40, 100, 720, 200));
  assert.deepEqual(dropTarget([flush, ...chain], { x: 44, y: 150 }, paragraph)!.container.path, [1, 0]);
  assert.deepEqual(dropTarget([main], { x: 2, y: 2 }, { kind: "new", block: "section" })!.container.path, [1]);
});

test("a level steps up from the innermost (Alt or Tab) and back down (Shift+Tab)", () => {
  const p = { x: 400, y: 200 };
  assert.deepEqual(dropTarget(chain, p, paragraph, 1)!.container.path, [1, 0]);
  assert.equal(dropTarget(chain, p, paragraph, 1)!.index, 1);
  assert.equal(dropTarget(chain, { x: 400, y: 350 }, paragraph, 1)!.index, 2);
  assert.deepEqual(dropTarget(chain, p, paragraph, 0)!.container.path, [1, 0, 1]);
  // Past the last place for a block: the page's bands refuse it, with the reason.
  const top = dropTarget(chain, p, paragraph, 2)!;
  assert.deepEqual([top.container.path, top.ok, top.level], [[1], false, 2]);
  assert.equal(dropTarget(chain, p, paragraph, 9)!.level, 2);
  assert.equal(dropTarget(chain, p, paragraph, -1)!.level, 0);
  // A level adds to an edge escape.
  assert.equal(dropTarget(chain, { x: 400, y: 104 }, paragraph, 1)!.level, 2);
});

test("rows and grids index sideways, wrapped rows by line", () => {
  // Two columns, two lines: cards 0 1 / 2 3.
  const cards = [child(0, rect(0, 0, 100, 80), "card-work"), child(1, rect(120, 0, 100, 80), "card-work"),
    child(2, rect(0, 100, 100, 80), "card-work"), child(3, rect(120, 100, 100, 80), "card-work")];
  const grid = box([1, 0, 2], "div", rect(0, 0, 220, 180), cards, { cls: "cards", axis: "row" });
  const at = (x: number, y: number) => dropTarget([grid], { x, y }, paragraph)!.index;
  assert.equal(at(30, 40), 0);
  assert.equal(at(80, 40), 1);
  assert.equal(at(190, 40), 2);
  assert.equal(at(30, 140), 2);
  assert.equal(at(190, 140), 4);
  assert.equal(at(110, 90), 2);
  // An escaped target places the line beside the child sideways too.
  const inner = box([1, 0, 2, 1], "div", rect(120, 0, 100, 80), [], { cls: "flow" });
  assert.equal(dropTarget([inner, grid], { x: 125, y: 40 }, paragraph)!.index, 1);
  assert.equal(dropTarget([inner, grid], { x: 215, y: 40 }, paragraph)!.index, 2);
});

test("the end of a container counts children the report left out", () => {
  const long = box([1, 0, 1], "div", rect(0, 0, 100, 100), [child(0, rect(0, 0, 100, 10))], { count: 600 });
  assert.equal(dropTarget([long], { x: 50, y: 90 }, paragraph)!.index, 600);
});

test("empty containers and empty items slots take the drop at their end", () => {
  const empty = box([1, 0, 1], "div", rect(40, 100, 720, 400));
  assert.equal(dropTarget([empty, section, main], { x: 400, y: 300 }, paragraph)!.index, 0);
  // The slot's own children are the instance's named parts; a new item goes after them.
  const items = box([1, 0, 3], "items", rect(0, 0, 400, 200), [], { slot: "", count: 2 });
  const t = dropTarget([items, section, main], { x: 200, y: 100 }, paragraph)!;
  assert.deepEqual([t.container.kind, t.index, t.ok], ["items", 2, true]);
  const filled = box([1, 0, 3], "items", rect(0, 0, 400, 200), [child(2, rect(0, 0, 400, 80), "card-work")], { slot: "", count: 3 });
  assert.equal(dropTarget([filled, section, main], { x: 200, y: 150 }, paragraph)!.index, 3);
});

test("where blocks may go: inside a Section, Div or items slot; a Section only between bands", () => {
  const items = box([1, 0, 3], "items", rect(0, 0, 1, 1), [], { slot: "" });
  const slot = box([1, 0, 3], "slot", rect(0, 0, 1, 1), [], { slot: "title" });
  const sectionBlock: DraggedBlock = { kind: "new", block: "section" };
  for (const c of [section, stack, items]) assert.equal(dropRefusal(paragraph, c), undefined);
  assert.equal(dropRefusal(paragraph, main), "Blocks go inside a Section or a Div, not straight between page bands.");
  assert.equal(dropRefusal(paragraph, slot), "The “title” slot is filled by editing its text, not by drops. Drop into the component's items instead.");
  assert.equal(dropRefusal(sectionBlock, main), undefined);
  assert.equal(dropRefusal(sectionBlock, section), "A Section goes only between page bands, not inside a Section.");
  assert.equal(dropRefusal(sectionBlock, stack), "A Section goes only between page bands, not inside a Div.");
  assert.equal(dropRefusal(sectionBlock, items), "A Section goes only between page bands, not inside a component.");
  assert.equal(dropRefusal({ kind: "move", path: [1, 0, 2], band: true }, main), undefined);
  assert.equal(dropRefusal({ kind: "move", path: [1, 0], band: false }, stack), "A block cannot go inside itself.");
  assert.equal(dropRefusal({ kind: "move", path: [1, 0, 3], band: false }, items), "A block cannot go inside itself.");
  assert.equal(dropRefusal({ kind: "move", path: [1, 0, 1, 2], band: false }, stack), undefined);
});

test("refusals: a named slot refuses in place; otherwise the first container up that takes the block wins", () => {
  const slot = box([1, 0, 1], "slot", rect(300, 120, 100, 40), [], { slot: "title" });
  const host = box([1, 0], "section", rect(0, 0, 800, 600), [child(0, rect(40, 40, 720, 40), "h2"), child(1, rect(300, 100, 100, 100), "section-work")]);
  const refused = dropTarget([slot, host, main], { x: 302, y: 122 }, paragraph)!;
  assert.deepEqual([refused.container.kind, refused.ok, refused.reason], ["slot", false, dropRefusal(paragraph, slot)]);
  // Stepping up leaves the slot for the Section around the component.
  const up = dropTarget([slot, host, main], { x: 350, y: 140 }, paragraph, 1)!;
  assert.deepEqual([up.container.path, up.ok, up.index], [[1, 0], true, 1]);
  // A Section passes the Div and Section to the page's bands.
  const band = dropTarget(chain, { x: 400, y: 200 }, { kind: "new", block: "section" })!;
  assert.deepEqual([band.container.kind, band.ok, band.index, band.level], ["main", true, 0, 2]);
  // Nothing up the chain takes it: the refusal of the container in reach.
  const onlyMain = dropTarget([main], { x: 400, y: 800 }, paragraph)!;
  assert.deepEqual([onlyMain.ok, onlyMain.reason], [false, dropRefusal(paragraph, main)]);
});

test("the label names the container and the neighbour", () => {
  const label = (x: number, y: number, level = 0) => dropLabel(dropTarget(chain, { x, y }, paragraph, level)!, paragraph);
  assert.equal(label(400, 260), "Into Div (stack) › after Paragraph");
  assert.equal(label(400, 125), "Into Div (stack) › before Heading");
  assert.equal(label(400, 450), "Into Div (stack) › after Paragraph");
  assert.equal(label(400, 200, 1), "Into Section › after Heading");
  assert.equal(label(400, 350, 1), "Into Section › after Div (stack)");
  assert.equal(label(400, 200, 2), "Blocks go inside a Section or a Div, not straight between page bands.");
  const grid = box([1, 0, 2], "div", rect(0, 0, 220, 80), [child(0, rect(0, 0, 100, 80), "a", "btn"), child(1, rect(120, 0, 100, 80), "card-work")], { cls: "cards", axis: "row" });
  assert.equal(dropLabel(dropTarget([grid], { x: 190, y: 40 }, paragraph)!, paragraph), "Into Div (grid) › after Card work");
  assert.equal(dropLabel(dropTarget([grid], { x: 10, y: 40 }, paragraph)!, paragraph), "Into Div (grid) › before Button");
  const tabbed = box([1, 0, 2], "div", rect(0, 0, 220, 80), [child(0, rect(0, 0, 100, 80), "a", "x\tbtn")], { cls: "wide\nflow" });
  assert.equal(dropLabel(dropTarget([tabbed], { x: 10, y: 70 }, paragraph)!, paragraph), "Into Div (stack) › after Button");
  const empty = box([1, 0, 1], "div", rect(40, 100, 720, 400));
  assert.equal(dropLabel(dropTarget([empty], { x: 400, y: 300 }, paragraph)!, paragraph), "Into Div › empty");
  const items = box([1, 0, 3], "items", rect(0, 0, 400, 200), [child(2, rect(0, 0, 400, 80), "img")], { slot: "", count: 3 });
  assert.equal(dropLabel(dropTarget([items], { x: 200, y: 150 }, paragraph)!, paragraph), "Into Section work › items › after Image");
  const named = box([1, 0, 3], "items", rect(0, 0, 400, 200), [], { slot: "cards", count: 1 });
  assert.equal(dropLabel(dropTarget([named], { x: 200, y: 150 }, paragraph)!, paragraph), "Into Section work › “cards” slot › empty");
  const sectionBlock: DraggedBlock = { kind: "new", block: "section" };
  assert.equal(dropLabel(dropTarget([main], { x: 400, y: 800 }, sectionBlock)!, sectionBlock), "Between page bands › after Section");
});

test("a moved block dropped beside itself stays where it is", () => {
  const moving: DraggedBlock = { kind: "move", path: [1, 0, 1, 1], band: false };
  assert.equal(dropLabel(dropTarget(chain, { x: 400, y: 200 }, moving)!, moving), "Stays where it is");
  assert.equal(dropLabel(dropTarget(chain, { x: 400, y: 260 }, moving)!, moving), "Stays where it is");
  assert.equal(dropLabel(dropTarget(chain, { x: 400, y: 370 }, moving)!, moving), "Into Div (stack) › after Paragraph");
});

test("a fixed template part refuses drops inside it; at its edge the drop goes beside it", () => {
  const fixed = box([1, 0, 1], "fixed", rect(40, 100, 720, 200));
  const inside = dropTarget([fixed, section, main], { x: 400, y: 200 }, paragraph)!;
  assert.equal(inside.container.kind, "fixed");
  assert.equal(inside.ok, false);
  assert.match(inside.reason!, /fixed in the component's template/);
  const edge = dropTarget([fixed, section, main], { x: 400, y: 102 }, paragraph)!;
  assert.equal(edge.container.kind, "section");
  assert.equal(edge.ok, true);
});
