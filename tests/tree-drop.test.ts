import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { NativeStructureItem } from "../src/components/native-preview";
import type { DraggedBlock, DropTarget } from "../src/page-builder/drop-target";
import { createStructureDrop, foldRows, springRow, type SpringTimer, levelAt, structureContainer, templateContainers, treeDrop, treeLineFor, type StructureDropView, type TreeRow } from "../src/page-builder/tree-drop";

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
    const row: TreeRow = { item, level, folded: Boolean(item.children.length) && !(item as NativeStructureItem & { open?: boolean }).open, top, bottom: top + 20, end: top + 20 };
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
  // Next to a named slot's element the place at that depth is the items slot's end; one level up, the Section.
  const title = treeDrop(list, list[4].bottom + 1, 4, paragraph, slots);
  assert.deepEqual([title.target!.container.path, title.target!.container.slot, title.target!.index, title.line], [[0, 0, 0], "", 1, { y: list[3].end + 1, level: 4 }]);
  assert.deepEqual(treeDrop(list, list[4].bottom + 1, 3, paragraph, slots).target!.container.path, [0, 0]);
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
  // Slot names match exactly, as the browser assigns them: the Div in " body " is a part,
  // and beside it the place is the end of the card's own "body" items slot.
  const spaced = rowsOf(items([["main", [["section", [["card-x", [["div", [["p"]], { slot: " body ", open: true }]], { open: true }]], { open: true }]], { open: true }]]));
  const beside = treeDrop(spaced, spaced[4].bottom + 1, 5, paragraph, (tag) => (tag === "card-x" ? ["body"] : [])).target!;
  assert.deepEqual([beside.container.path, beside.container.slot], [[0, 0, 0], "body"]);
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
    open: () => {},
    foldBelow: () => {},
    spring: () => {},
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


test("springRow accepts only folded containers under y that take the block", () => {
  const folded = at("1.1");
  assert.deepEqual(springRow(rows, folded.top + 2, paragraph, noSlots), [1, 1]);
  assert.equal(springRow(rows, at("1.0").top + 2, paragraph, noSlots), undefined);
  assert.equal(springRow(rows, at("1.0.0").top + 2, paragraph, noSlots), undefined);
  assert.equal(springRow(rows, folded.bottom + 1, paragraph, noSlots), undefined);
  assert.equal(springRow(rows, folded.top + 2, section, noSlots), undefined);
  const moved: DraggedBlock = { kind: "move", path: [1, 1], band: false };
  assert.equal(springRow(rows, folded.top + 2, moved, noSlots), undefined);
  const main = rowsOf(items([["main", [["section"]]]]));
  assert.equal(springRow(main, 2, paragraph, noSlots), undefined);
});

test("springRow shares the tree's exact items slot rule, including deeper containers", () => {
  const body: Spec = ["div", [["div", [["p"]]]], { slot: "body", open: true }];
  const card: Spec = ["card-x", [body], { open: true }];
  const list = rowsOf(items([["main", [["section", [card], { open: true }]], { open: true }]]));
  const div = list[4];
  assert.equal(springRow(list, div.top + 2, paragraph, noSlots), undefined);
  const slots = (tag: string) => tag === "card-x" ? ["body"] : [];
  assert.deepEqual(springRow(list, div.top + 2, paragraph, slots), div.item.node);
  const instance = list.map((row) => row === list[2] ? { ...row, folded: true } : row);
  assert.deepEqual(springRow(instance, list[2].top + 2, paragraph, slots), list[2].item.node);
  assert.equal(springRow(instance, list[2].top + 2, paragraph, noSlots), undefined);
  assert.equal(springRow(list, div.top + 2, paragraph, () => [" body "]), undefined);
});

// A deterministic clock and a view that changes folded state when opened.
function springDrag(block = paragraph) {
  let now = 0;
  const timers = new Set<{ at: number; run: () => void }>();
  const opened: string[] = [];
  const cues: (string | undefined)[] = [];
  let shown = rows.map((row) => ({ ...row }));
  const view = {
    over: (x: number) => x < 200,
    rows: () => shown,
    indent: () => ({ left: 0, step: 14 }),
    open: (node: readonly number[]) => {
      opened.push(node.join("."));
      shown = shown.map((row) => row.item.node.join(".") === node.join(".") ? { ...row, folded: false } : row);
    },
    foldBelow: () => {},
    spring: (node: readonly number[] | undefined) => {
      const id = node?.join(".");
      if (id !== cues.at(-1)) cues.push(id);
    },
    unfold: () => {},
    mark: () => {},
    edgeScroll: () => {},
    painted: () => undefined,
  } satisfies StructureDropView;
  const after: SpringTimer = (ms, run) => {
    const timer = { at: now + ms, run };
    timers.add(timer);
    return () => { timers.delete(timer); };
  };
  return {
    drag: createStructureDrop(view, block, noSlots, after), opened, cues, timers,
    fold: (id: string) => { shown = shown.map((row) => row.item.node.join(".") === id ? { ...row, folded: true } : row); },
    advance: (ms: number) => {
      now += ms;
      for (const timer of [...timers]) if (timer.at <= now) { timers.delete(timer); timer.run(); }
    },
  };
}

test("spring hold opens at 400 ms without restarting on each aim", () => {
  const h = springDrag();
  // The upper half picks the preceding Section, so this row waits for its hold.
  const y = at("1.1").top + 2;
  h.drag.aim(28, y);
  assert.deepEqual(h.cues, ["1.1"]);
  h.advance(399);
  h.drag.aim(28, y);
  assert.deepEqual(h.opened, []);
  h.advance(1);
  assert.deepEqual(h.opened, ["1.1"]);
  assert.deepEqual(h.cues, ["1.1", undefined]);
});

test("another folded row restarts the spring hold", () => {
  const h = springDrag();
  h.fold("1.0.1");
  h.drag.aim(28, at("1.1").top + 2);
  h.advance(300);
  h.drag.aim(28, at("1.0.1").top + 2);
  h.advance(100);
  assert.deepEqual(h.opened, []);
  h.advance(300);
  assert.deepEqual(h.opened, ["1.0.1"]);
});

test("leaving the tree, mirroring the canvas or ending cancels the spring hold", () => {
  for (const leave of ["aim", "mirror", "end"]) {
    const h = springDrag();
    h.drag.aim(28, at("1.1").top + 2);
    h.advance(200);
    if (leave === "aim") h.drag.aim(300, 0);
    else if (leave === "mirror") h.drag.mirror(undefined);
    else h.drag.end();
    h.advance(400);
    assert.deepEqual(h.opened, [], leave);
    assert.equal(h.timers.size, 0);
    assert.equal(h.cues.at(-1), undefined);
  }
});

test("an ok pick opens its folded container at once; a Section drag never opens", () => {
  const h = springDrag();
  h.drag.aim(28, at("1.1").bottom - 2);
  assert.deepEqual(h.opened, ["1.1"]);
  assert.equal(h.timers.size, 0);
  const band = springDrag(section);
  band.fold("1");
  band.drag.aim(28, at("1.1").bottom - 2);
  assert.deepEqual(band.opened, []);
  assert.equal(band.timers.size, 0);
});

test("fold-back only closes drag-opened rows below y and off the target's way", () => {
  const opened = new Set(["1.0", "1.0.1"]);
  assert.deepEqual(foldRows(rows, at("1.0").top, [1, 0, 1], opened), []);
  assert.deepEqual(foldRows(rows, at("1.0").top, [1, 1], opened), [[1, 0, 1]]);
  assert.deepEqual(foldRows(rows, at("1.0.1").top, [1, 1], opened), []);
  assert.deepEqual(foldRows(rows, at("1.0").top, [1, 1], new Set()), []);
});

test("in an instance sprung open, the gaps among its named parts drop at its items slot's end", () => {
  // A card with an unnamed items slot, open on its title and body parts.
  const card = items([["main", [["section", [["card-x", [["h3", [], { slot: "title" }], ["p", [], { slot: "body" }]], { open: true }]], { open: true }]], { open: true }]]);
  const list = rowsOf(card);
  const slots = (tag: string) => (tag === "card-x" ? [""] : []);
  for (const y of [list[3].top + 2, list[3].bottom + 1]) {
    const found = treeDrop(list, y, 4, paragraph, slots);
    assert.deepEqual([found.target!.container.kind, found.target!.container.path, found.target!.index, found.target!.ok], ["items", [0, 0, 0], 2, true]);
    assert.deepEqual(found.line, { y: list[4].end + 1, level: 4 });
  }
});

// Slice 82: a moved element takes any row HTML allows; Edit component mode's rows are the template's.
test("a moved element goes into any row's element its content rules allow; others pass to the nearest that takes it", () => {
  const text = items([["main", [["section", [["p"], ["ul", [["li"]], { open: true }]], { open: true }]], { open: true }]]);
  const list = rowsOf(text);
  const row = (node: string) => list.find((r) => r.item.node.join(".") === node)!;
  const fits = (tag: string) => (c: { tag: string }) => c.tag === "ul" && tag !== "li" ? `A <${tag}> can't go inside a <ul>.` : c.tag === "p" && tag !== "a" ? `A <${tag}> can't go inside a <p>.` : undefined;
  const move = (tag: string): DraggedBlock => ({ kind: "move", path: [9], band: false, fits: fits(tag) });
  // Just below the paragraph, x one level in: inside it for a link, beside it for a Div.
  const y = row("0.0.0").bottom + 1, level = row("0.0.0").level + 1;
  const link = treeDrop(list, y, level, move("a"), noSlots).target!;
  assert.deepEqual([link.container.path, link.container.kind, link.ok], [[0, 0, 0], "element", true]);
  const div = treeDrop(list, y, level, move("div"), noSlots).target!;
  assert.deepEqual([div.container.path, div.index, div.ok], [[0, 0], 1, true]);
  // An <li> goes into the list; a new block never into anything but a Section or Div.
  const li = treeDrop(list, row("0.0.1.0").bottom + 1, row("0.0.1.0").level, move("li"), noSlots).target!;
  assert.deepEqual([li.container.path, li.index], [[0, 0, 1], 1]);
  assert.deepEqual(structureContainer(row("0.0.0").item, noSlots)?.kind, "element");
  assert.equal(treeDrop(list, y, level, paragraph, noSlots).target!.container.path.join("."), "0.0");
});

test("in a template's rows a part beside a slot-held part goes beside its slot; the items slot's rows are that slot's", () => {
  const template = '<article><slot name="title"><h3>T</h3></slot><p class="body">B</p><slot><p>Item</p></slot></article>';
  const containerOf = templateContainers(template, "card-x");
  // Rows as Structure shows them: the slots have none; the framed instance's row stands for <article>.
  const list: TreeRow[] = [
    { item: { tag: "article", node: [0], text: "", heading: "", slot: "", children: [] }, level: 1, folded: false, top: 0, bottom: 20, end: 86 },
    { item: { tag: "h3", node: [0, 0, 0], text: "T", heading: "", slot: "", children: [] }, level: 2, folded: false, top: 22, bottom: 42, end: 42 },
    { item: { tag: "p", node: [0, 1], text: "B", heading: "", slot: "", children: [] }, level: 2, folded: false, top: 44, bottom: 64, end: 64 },
    { item: { tag: "p", node: [0, 2, 0], text: "Item", heading: "", slot: "", children: [] }, level: 2, folded: false, top: 66, bottom: 86, end: 86 },
  ];
  const part: DraggedBlock = { kind: "move", path: [0, 1], band: false, template: true, fits: () => undefined };
  // Above the heading: before the title slot, in the article.
  const first = treeDrop(list, 23, 2, part, noSlots, containerOf).target!;
  assert.deepEqual([first.container.path, first.index, first.ok], [[0], 0, true]);
  // Below the placeholder item: after it, in the items slot.
  const item = treeDrop(list, 85, 2, part, noSlots, containerOf).target!;
  assert.deepEqual([item.container.path, item.container.kind, item.index], [[0, 2], "items", 1]);
  // Inside the heading (x one deeper) takes no new block: beside its slot instead.
  const named = treeDrop(list, 41, 3, { kind: "new", block: "paragraph", template: true }, noSlots, containerOf).target!;
  assert.deepEqual([named.container.path, named.index, named.ok], [[0], 1, true]);
  assert.equal(containerOf({ ...list[1].item, node: [0, 0] })?.kind, "slot");
  assert.equal(containerOf(list[0].item, list[1].item)?.kind, "div");
  assert.deepEqual(treeLineFor(list, { container: containerOf(list[0].item, list[3].item)!, index: 1 })?.line, { y: 87, level: 2 });
});
