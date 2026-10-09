import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DropContainer, DropRect, DropReport } from "../src/page-builder/drop-report";
import type { DropTarget } from "../src/page-builder/drop-target";
import { blockDropTarget, dropIndicator, levelAt, stepLevel, type DragLevel } from "../src/page-builder/drop-indicator";


const rect = (left: number, top: number, width: number, height: number): DropRect => ({ left, top, width, height });
const layout = { display: "block", cols: 0, dir: "row", wrap: "nowrap" };
const child = (index: number, r: DropRect, tag = "p", cls = "") => ({ index, rect: r, tag, cls });
function box(path: number[], kind: DropContainer["kind"], r: DropRect, children: DropContainer["children"] = [], extra: Partial<DropContainer> = {}): DropContainer {
  return { path, kind, tag: kind, cls: "", rect: r, count: children.length, children, layout, empty: !children.length, axis: "column", ...extra };
}
const at = (container: DropContainer, index: number, ok = true): DropTarget => ({ container, index, level: 0, ok, ...(ok ? {} : { reason: "No" }) });

// A stack: h2, p, p, one under another.
const stack = box([1, 0, 1], "div", rect(40, 100, 720, 400),
  [child(0, rect(60, 120, 680, 40), "h2"), child(1, rect(60, 180, 600, 100)), child(2, rect(60, 300, 680, 100))], { cls: "flow" });
// A grid of three cards on one row, then a fourth on the next.
const grid = box([1, 1, 1], "div", rect(0, 0, 900, 500), [
  child(0, rect(0, 0, 280, 200), "card-project"), child(1, rect(300, 0, 280, 200), "card-project"),
  child(2, rect(600, 0, 280, 200), "card-project"), child(3, rect(0, 220, 280, 200), "card-project")], { cls: "cards", axis: "row" });

test("in a stack the line lies between the items, across both", () => {
  assert.deepEqual(dropIndicator(at(stack, 1)), { kind: "line", vertical: false, rect: rect(60, 168.5, 680, 3) });
  assert.deepEqual(dropIndicator(at(stack, 0)), { kind: "line", vertical: false, rect: rect(60, 114.5, 680, 3) });
  assert.deepEqual(dropIndicator(at(stack, 3)), { kind: "line", vertical: false, rect: rect(60, 402.5, 680, 3) });
});

test("in a grid the line stands sideways between two cards on a row, else before the next or after the last", () => {
  assert.deepEqual(dropIndicator(at(grid, 1)), { kind: "line", vertical: true, rect: rect(288.5, 0, 3, 200) });
  // The fourth card starts a new row: the line goes just before it.
  assert.deepEqual(dropIndicator(at(grid, 3)), { kind: "line", vertical: true, rect: rect(-5.5, 220, 3, 200) });
  assert.deepEqual(dropIndicator(at(grid, 4)), { kind: "line", vertical: true, rect: rect(282.5, 220, 3, 200) });
});

test("hidden items are skipped; an empty container shows its area, named", () => {
  const hidden = box([1, 2], "div", rect(0, 0, 400, 300), [child(0, rect(0, 0, 0, 0)), child(1, rect(0, 50, 400, 50))]);
  assert.deepEqual(dropIndicator(at(hidden, 1))?.rect, rect(0, 44.5, 400, 3));
  assert.deepEqual(dropIndicator(at(box([1, 3], "div", rect(10, 10, 300, 72), [], { cls: "flow" }), 0)),
    { kind: "area", rect: rect(14, 14, 292, 64), text: "Drop into the empty Div (stack)" });
  assert.equal((dropIndicator(at(box([1], "main", rect(0, 0, 800, 480)), 0)) as { text: string }).text, "Drop into the empty page");
});

test("a refusing container is outlined; a block that stays draws nothing", () => {
  assert.deepEqual(dropIndicator(at(stack, 1, false)), { kind: "refused", rect: stack.rect });
  assert.equal(dropIndicator(at(stack, 1), true), undefined);
});

test("Alt adds a level while held; Tab steps up, Shift+Tab back; a new innermost container starts again", () => {
  let state: DragLevel = { alt: false, tabs: 0 };
  let found = levelAt(state, "div:1.0.1", 2);
  assert.equal(found.level, 0);
  state = stepLevel(found.state, 1);
  assert.equal(levelAt(state, "div:1.0.1", 2).level, 1);
  state = { ...stepLevel(state, 1), alt: true };
  // Two Tabs and Alt: three levels up, but only two exist above the innermost.
  found = levelAt(state, "div:1.0.1", 2);
  assert.deepEqual([found.level, found.state.tabs], [2, 1]);
  state = stepLevel(found.state, -1);
  assert.equal(levelAt(state, "div:1.0.1", 2).level, 1);
  assert.equal(stepLevel(stepLevel(state, -1), -1).tabs, 0);
  // Over another innermost container the Tabs are forgotten; Alt still counts.
  found = levelAt({ alt: true, tabs: 1, inner: "div:1.0.1" }, "section:1.1", 2);
  assert.deepEqual([found.level, found.state.tabs, found.state.inner], [1, 0, "section:1.1"]);
});

test("a probe gives the rail block its target: Sections snap between bands, items wait for slice 40", () => {
  const main = box([1], "main", rect(0, 0, 900, 1000), [child(0, rect(0, 0, 900, 300), "section"), child(1, rect(0, 300, 900, 500), "section")]);
  const section = box([1, 1], "section", rect(0, 300, 900, 500), [child(0, rect(0, 300, 900, 40), "h2"), child(1, rect(0, 360, 900, 420), "div", "cards")]);
  const cards = { ...grid, path: [1, 1, 1], rect: rect(0, 360, 900, 420), children: grid.children.map((c) => ({ ...c, rect: { ...c.rect, top: c.rect.top + 360 } })) };
  const report: DropReport = { id: 1, path: "index.html", x: 590, y: 460, containers: [cards, section, main] };
  const level: DragLevel = { alt: false, tabs: 0 };
  const paragraph = blockDropTarget(report, { x: 590, y: 460 }, "paragraph", level);
  assert.deepEqual([paragraph.target?.container.path, paragraph.target?.index, paragraph.level.inner], [[1, 1, 1], 2, "div:1.1.1:"]);
  const up = blockDropTarget(report, { x: 590, y: 460 }, "paragraph", { ...level, alt: true });
  assert.deepEqual([up.target?.container.path, up.target?.index], [[1, 1], 1]);
  const bands: DropReport = { ...report, containers: [main] };
  const sectionDrop = blockDropTarget(bands, { x: 590, y: 700 }, "section", level);
  assert.deepEqual([sectionDrop.target?.container.path, sectionDrop.target?.index, sectionDrop.target?.ok], [[1], 2, true]);
  assert.equal(blockDropTarget({ ...report, containers: [] }, { x: 0, y: 0 }, "paragraph", level).target, undefined);
  const items = box([1, 1, 1], "items", rect(0, 360, 900, 420), [], { tag: "section-work", slot: "" });
  const refused = blockDropTarget({ ...report, containers: [items, section, main] }, { x: 450, y: 500 }, "paragraph", level).target!;
  assert.deepEqual([refused.ok, refused.reason], [false, "Section work is a component: its parts are filled by editing them."]);
});
