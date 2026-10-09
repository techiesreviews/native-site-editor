import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DropContainer, DropRect } from "../src/page-builder/drop-report";
import { dropLabel, dropRefusal, dropStays, dropTarget, type DraggedBlock } from "../src/page-builder/drop-target";

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

test("at a page band's edge a block stays in the band, at that end, rather than refused between bands (fix-lex-2)", () => {
  const band = [section, main];
  const top = dropTarget(band, { x: 400, y: 3 }, paragraph)!;
  assert.deepEqual([top.container.path, top.index, top.ok, top.level], [[1, 0], 0, true, 0]);
  const bottom = dropTarget(band, { x: 400, y: 596 }, paragraph)!;
  assert.deepEqual([bottom.container.path, bottom.index, bottom.ok], [[1, 0], 2, true]);
  // A Div flush with its band's edge: past both edges, the band takes it beside the Div.
  const flush = box([1, 0, 1], "div", rect(0, 100, 800, 500), [child(0, rect(0, 100, 800, 100))]);
  const beside = dropTarget([flush, section, main], { x: 3, y: 250 }, paragraph)!;
  assert.deepEqual([beside.container.path, beside.index, beside.ok], [[1, 0], 1, true]);
  // Stepping up on purpose still reaches the bands and says why they refuse.
  assert.equal(dropTarget(band, { x: 400, y: 3 }, paragraph, 1)!.ok, false);
  // A Section is not affected: it still takes <main>.
  assert.deepEqual(dropTarget(band, { x: 400, y: 3 }, { kind: "new", block: "section" })!.container.path, [1]);
});

test("over an item at the edge of a Div without padding the drop stays in the Div, beside the item (fix-lex-2)", () => {
  // A Div whose first and last items touch its edges.
  const tight = box([1, 0, 1], "div", rect(40, 100, 720, 200), [child(0, rect(40, 100, 720, 40)), child(1, rect(40, 260, 720, 40))], { cls: "flow" });
  const first = dropTarget([tight, section, main], { x: 400, y: 104 }, paragraph)!;
  assert.deepEqual([first.container.path, first.index], [[1, 0, 1], 0]);
  const last = dropTarget([tight, section, main], { x: 400, y: 297 }, paragraph)!;
  assert.deepEqual([last.container.path, last.index], [[1, 0, 1], 2]);
  // Its edge beside no item still leaves it.
  assert.deepEqual(dropTarget([tight, section, main], { x: 44, y: 200 }, paragraph)!.container.path, [1, 0]);
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

for (const kind of ["div", "items"] as const) {
  for (const axis of ["row", "column"] as const) {
    test(`a moved ${kind} item targets both halves of a sibling along ${axis}, above its insides`, () => {
      const parent = box([1, 0, 1], kind, rect(40, 100, 720, 400), [
        child(1, rect(60, 120, 200, 100), "card-work"),
        child(3, rect(300, 120, 200, 100), "card-work"),
      ], { axis, count: 4, layout: { ...layout, display: kind === "div" ? "inline-grid" : "block" } });
      const moving: DraggedBlock = { kind: "move", path: [1, 0, 1, 1], band: false };
      for (const innerKind of ["slot", "items", "div", "fixed"] as const) {
        const inner = box([1, 0, 1, 3], innerKind, rect(300, 120, 200, 100), [], { slot: "title" });
        // The nested Div has a deeper source path; slots share the card instance's path.
        const nested = box([1, 0, 1, 3, 0], "div", rect(310, 130, 180, 80));
        const containers = innerKind === "div" ? [nested, inner, parent, section, main] : [inner, parent, section, main];
        for (const [p, index] of [[{ x: 350, y: 145 }, 3], [{ x: 450, y: 195 }, 4]] as const) {
          const target = dropTarget(containers, p, moving)!;
          assert.equal(target.container, parent);
          assert.equal(target.index, index);
          assert.equal(target.ok, true);
          assert.equal(dropTarget(containers, p, moving, 1)!.container, section);
        }
      }
      // Directly over a grid gap, the ordinary point index still applies.
      const gap = { x: 280, y: 170 };
      assert.equal(dropTarget([parent, section, main], gap, moving)!.index,
        dropTarget([parent, section, main], gap, paragraph)!.index);
      // Over itself, a named slot still refuses; its items slot escapes to the parent.
      const ownSlot = box(moving.path.slice(), "slot", rect(60, 120, 200, 100), [], { slot: "body" });
      assert.equal(dropTarget([ownSlot, parent, section, main], { x: 100, y: 150 }, moving)!.container, ownSlot);
      const ownItems = { ...ownSlot, kind: "items" as const, slot: "" };
      assert.equal(dropLabel(dropTarget([ownItems, parent, section, main], { x: 100, y: 150 }, moving)!, moving), "Stays where it is");
    });
  }
}

test("new blocks and moves from another parent retain the innermost rule", () => {
  const grid = { ...stack, layout: { ...layout, display: "grid" } };
  const slot = box([1, 0, 1, 2], "slot", rect(60, 300, 680, 100), [], { slot: "body" });
  const items = { ...slot, kind: "items" as const, slot: "" };
  const elsewhere: DraggedBlock = { kind: "move", path: [1, 0, 0], band: false };
  const sameStack: DraggedBlock = { kind: "move", path: [1, 0, 1, 0], band: false };
  for (const block of [paragraph, elsewhere]) {
    assert.equal(dropTarget([slot, grid, section, main], { x: 400, y: 350 }, block)!.container, slot);
    assert.equal(dropTarget([items, grid, section, main], { x: 400, y: 350 }, block)!.container, items);
  }
  assert.equal(dropTarget([slot, stack, section, main], { x: 400, y: 350 }, sameStack)!.container, slot);
});

test("an items slot sharing its section instance path is not a hovered child", () => {
  const items = box([1, 0], "items", rect(40, 100, 720, 400), [child(1, rect(60, 120, 200, 100), "card-work"), child(3, rect(300, 120, 200, 100), "card-work")], { count: 4 });
  const fixed = box([1, 0], "fixed", rect(40, 100, 720, 400));
  const moving: DraggedBlock = { kind: "move", path: [1, 0, 1], band: false };
  assert.equal(dropTarget([fixed, items, main], { x: 400, y: 200 }, moving)!.container, fixed);
  const title = box([1, 0, 3], "slot", rect(300, 120, 200, 100), [], { slot: "title" });
  const target = dropTarget([title, items, fixed, main], { x: 400, y: 150 }, moving)!;
  assert.equal(target.container, items);
  assert.equal(target.ok, true);
});

test("a moved leaf item (no containers of its own) over a sibling's box takes that sibling's halves, even at the grid's edge", () => {
  // A grid row of a tall image and a short one; the pointer is low in the tall one, below the short one.
  const grid = box([1, 0, 1], "div", rect(40, 100, 720, 400), [
    child(0, rect(40, 100, 300, 300), "img"),
    child(1, rect(360, 100, 300, 100), "img"),
    child(2, rect(40, 420, 300, 80), "img"),
  ], { axis: "row", layout: { ...layout, display: "grid", cols: 2 } });
  const moving: DraggedBlock = { kind: "move", path: [1, 0, 1, 2], band: false };
  assert.equal(dropTarget([grid, section, main], { x: 300, y: 350 }, moving)!.index, 1);
  assert.equal(dropTarget([grid, section, main], { x: 100, y: 350 }, moving)!.index, 0);
  // Flush with the grid's left edge: still beside the sibling, not out to the Section.
  const edge = dropTarget([grid, section, main], { x: 42, y: 200 }, moving)!;
  assert.deepEqual([edge.container.path, edge.index], [[1, 0, 1], 0]);
  // A new block over an item at the grid's edge goes beside it too (fix-lex-2); the edge beside no item still escapes.
  assert.deepEqual(dropTarget([grid, section, main], { x: 42, y: 200 }, paragraph)!.container.path, [1, 0, 1]);
  assert.deepEqual(dropTarget([grid, section, main], { x: 42, y: 410 }, paragraph)!.container.path, [1, 0]);
  // Over itself nothing changes.
  assert.equal(dropLabel(dropTarget([grid, section, main], { x: 100, y: 460 }, moving)!, moving), "Stays where it is");
});

test("an item of one items slot is not a sibling of another items slot of the same instance", () => {
  // The moved card [1, 0, 1] sits in the unnamed items slot; the pointer is over a card in the "more" one.
  const b = box([1, 0], "items", rect(40, 300, 720, 150), [child(3, rect(60, 320, 200, 100), "card-work")], { slot: "more", count: 4 });
  const title = box([1, 0, 3], "slot", rect(60, 320, 200, 100), [], { slot: "title" });
  const moving: DraggedBlock = { kind: "move", path: [1, 0, 1], band: false };
  assert.equal(dropTarget([title, b, main], { x: 200, y: 370 }, moving)!.container, title);
});

test("beside itself an item stays only in the items slot it fills; another slot of its instance is a move", () => {
  const card: DraggedBlock = { kind: "move", path: [1, 0, 1], band: false };
  const own = box([1, 0], "items", rect(0, 0, 800, 400), [child(1, rect(0, 0, 380, 200), "card-project")], { slot: "items" });
  const more = box([1, 0], "items", rect(0, 400, 800, 400), [child(2, rect(0, 400, 380, 200), "card-project")], { slot: "more" });
  for (const index of [1, 2]) {
    assert.equal(dropStays(card, { ok: true, container: own, index }), true);
    assert.equal(dropStays(card, { ok: true, container: more, index }), false);
  }
});

test("in a template (Edit component mode): a Section is refused everywhere, a nested component refuses inside, items take blocks", () => {
  // section-work's template: <section> [0] › <div class="cards"> [0,1] › items <slot> [0,1,0] › <card-project> [0,1,0,0].
  const root = box([0], "section", rect(0, 0, 800, 600), [child(0, rect(40, 40, 720, 40), "slot"), child(1, rect(40, 100, 720, 400), "div", "cards")]);
  const cards = box([0, 1], "div", rect(40, 100, 720, 400), [child(0, rect(40, 100, 720, 400), "slot")], { cls: "cards" });
  const items = box([0, 1, 0], "items", rect(40, 100, 720, 400), [child(0, rect(40, 100, 720, 180), "card-project")], { slot: "" });
  const card = box([0, 1, 0, 0], "component", rect(40, 100, 720, 180), [], { tag: "card-project" });
  const section: DraggedBlock = { kind: "new", block: "section", template: true };
  const refused = dropTarget([items, cards, root], { x: 400, y: 400 }, section)!;
  assert.equal(refused.ok, false);
  assert.match(refused.reason!, /not inside a component's template/);
  assert.equal(dropRefusal(section, root), dropRefusal(section, items));
  // Inside a nested card: refused with the way in; at its edge the drop goes beside it, into the items.
  const inCard = dropTarget([card, items, cards, root], { x: 400, y: 150 }, { kind: "new", block: "paragraph", template: true })!;
  assert.equal(inCard.ok, false);
  assert.equal(inCard.reason, "Card project is its own component: open it to build inside its template.");
  const below = dropTarget([card, items, cards, root], { x: 400, y: 277 }, { kind: "new", block: "paragraph", template: true })!;
  assert.deepEqual([below.ok, below.container.path, below.index], [true, [0, 1, 0], 1]);
  assert.equal(dropLabel(below, paragraph), "Into Section work › items › after Card project");
  // A named slot is filled on each page.
  assert.match(dropRefusal({ kind: "new", block: "paragraph", template: true }, box([0, 0], "slot", rect(40, 40, 720, 40), [], { slot: "title" }))!, /“title” slot is filled on each page/);
});
