import { strict as assert } from "node:assert";
import { test } from "node:test";
import { flowAxis, parseDropReport, type DropLayout } from "../src/page-builder/drop-report";

const layout: DropLayout = { display: "block", cols: 0, dir: "row", wrap: "nowrap" };
const rect = (left = 0, top = 0, width = 100, height = 40) => ({ left, top, width, height });

test("flowAxis measures stacks, grids, wrapped rows and flex rows", () => {
  assert.equal(flowAxis([rect(), rect(0, 50)], layout), "column");
  assert.equal(flowAxis([rect(), rect(110)], layout), "row");
  assert.equal(flowAxis([rect(), rect(0, 50), rect(110, 50)], layout), "row");
  assert.equal(flowAxis([rect(), rect(110, 1.9)], { ...layout, display: "flex" }), "row");
  assert.equal(flowAxis([rect(), rect(110, 2)], layout), "column");
  assert.equal(flowAxis([rect(110), rect()], { ...layout, display: "flex", dir: "row-reverse" }), "row");
  assert.equal(flowAxis([rect(), rect(0.5, 50)], layout), "column");
  assert.equal(flowAxis([rect(), rect(50, 100, 0, 0), rect(110)], layout), "row");
});

test("flowAxis uses layout only with fewer than two visible children", () => {
  assert.equal(flowAxis([rect()], { ...layout, display: "grid", cols: 3 }), "row");
  assert.equal(flowAxis([], { ...layout, display: "inline-flex", dir: "row-reverse" }), "row");
  assert.equal(flowAxis([], { ...layout, display: "flex", dir: "column" }), "column");
  assert.equal(flowAxis([], layout), "column");
  assert.equal(flowAxis([rect(0, 0, 0)], { ...layout, display: "grid", cols: 3 }), "row");
  assert.equal(flowAxis([rect(), rect(0, 50)], { ...layout, display: "grid", cols: 3 }), "column");
});

const child = (index: number, r = rect(), tag = "p", cls = "") => ({ index, rect: r, tag, cls });
const container = () => ({ path: [1, 0, 1], kind: "div", tag: "div", cls: "cards", rect: rect(), count: 3,
  children: [child(0), child(2, rect(110), "a", "btn")], layout, empty: false });
const report = (containers: unknown[] = [container()]) => ({ id: 7, path: "index.html", x: 20, y: 30, containers });

test("parseDropReport preserves source indices and derives axes", () => {
  const input = report([container(), { ...container(), kind: "items", tag: "section-work", slot: "", empty: true, children: [] }]);
  const parsed = parseDropReport(input, "index.html")!;
  assert.equal(parsed.id, 7);
  assert.equal(parsed.containers[0].axis, "row");
  assert.deepEqual(parsed.containers[0].children.map(child => child.index), [0, 2]);
  assert.deepEqual(parsed.containers[0].children[1], child(2, rect(110), "a", "btn"));
  assert.equal(parsed.containers[0].count, 3);
  assert.equal(parsed.containers[1].slot, "");
  assert.equal(parsed.containers[1].empty, true);
  input.containers[0].path[0] = 9;
  assert.equal(parsed.containers[0].path[0], 1);
  assert.deepEqual(parseDropReport(report([]), "index.html")?.containers, []);
  // An empty items slot's neighbours come through; anything else's are dropped, as are bad boxes.
  const around = { prev: rect(0, 0, 10, 10), next: { left: "x" } };
  const near = parseDropReport(report([{ ...container(), around }, { ...container(), kind: "items", tag: "card-project", slot: "", around }]), "index.html")!;
  assert.deepEqual([near.containers[0].around, near.containers[1].around], [undefined, { prev: rect(0, 0, 10, 10) }]);
});

test("parseDropReport rejects malformed envelopes", () => {
  for (const input of [null, [], {}, { ...report(), path: "other.html" }, { ...report(), id: -1 },
    { ...report(), id: "7" }, { ...report(), x: Infinity }, { ...report(), y: NaN }, { ...report(), containers: {} }]) {
    assert.equal(parseDropReport(input, "index.html"), undefined);
  }
});

test("parseDropReport drops bad containers and children", () => {
  const c = container();
  const bad = [null, { ...c, kind: "article" }, { ...c, path: [1, -1] }, { ...c, path: [0.1] },
    { ...c, path: Array(101).fill(0) }, { ...c, rect: rect(0, 0, -1) }, { ...c, rect: rect(NaN) },
    { ...c, layout: { ...layout, cols: Infinity } }, { ...c, empty: "false" }, { ...c, kind: "slot" },
    { ...c, path: Array(1) }, { ...c, tag: `x-${"y".repeat(100)}` }, { ...c, kind: "slot", slot: "s".repeat(101) },
    { ...c, count: -1 }, { ...c, count: undefined }];
  const parsed = parseDropReport(report([...bad, { ...c, count: 5, children: [null, { index: -1, rect: rect() },
    child(0, rect(Infinity)), { index: 1, rect: rect() }, child(2, rect(), "x".repeat(101)), { ...child(4), cls: null }, child(5), child(3)] }]), "index.html")!;
  assert.equal(parsed.containers.length, 1);
  assert.deepEqual(parsed.containers[0].children, [child(3)]);
});

test("parseDropReport caps lists and strings", () => {
  const c = { ...container(), cls: "x".repeat(2000), children: Array(600).fill(child(0, rect(), "p", "y".repeat(2000))) };
  const parsed = parseDropReport(report(Array(110).fill(c)), "index.html")!;
  assert.equal(parsed.containers.length, 100);
  assert.equal(parsed.containers[0].children.length, 500);
  assert.equal(parsed.containers[0].cls.length, 1000);
  assert.equal(parsed.containers[0].children[0].cls.length, 1000);
});
