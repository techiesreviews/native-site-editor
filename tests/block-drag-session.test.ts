import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DropContainer, DropRect, DropReport } from "../src/page-builder/drop-report";
import type { DraggedBlock, DropTarget } from "../src/page-builder/drop-target";
import type { DragAim } from "../src/page-builder/insert-drag";
import { createBlockDragSession } from "../src/page-builder/block-drag-session";

const rect = (left: number, top: number, width: number, height: number): DropRect => ({ left, top, width, height });
const layout = { display: "block", cols: 0, dir: "row", wrap: "nowrap" };
const child = (index: number, r: DropRect, tag = "p", cls = "") => ({ index, rect: r, tag, cls });
const box = (path: number[], kind: DropContainer["kind"], r: DropRect, children: DropContainer["children"], extra: Partial<DropContainer> = {}): DropContainer =>
  ({ path, kind, tag: kind, cls: "", rect: r, count: children.length, children, layout, empty: !children.length, axis: "column", ...extra });
// <main> › <section> › <div class="flow"> with two paragraphs; a card's title slot beside it.
const main = box([1], "main", rect(0, 0, 800, 1000), [child(0, rect(0, 0, 800, 600), "section")]);
const section = box([1, 0], "section", rect(0, 0, 800, 600), [child(0, rect(20, 20, 760, 40), "h2"), child(1, rect(20, 100, 760, 400), "div", "flow")]);
const stack = box([1, 0, 1], "div", rect(20, 100, 760, 400), [child(0, rect(40, 120, 720, 100)), child(1, rect(40, 240, 720, 100))], { cls: "flow" });
const slot = box([1, 0, 2], "slot", rect(40, 520, 720, 40), [], { tag: "card-project", slot: "title" });
const report = (at: { x: number; y: number }): DropReport =>
  ({ id: 1, path: "index.html", ...at, containers: at.y > 510 ? [slot, section, main] : [stack, section, main] });

function setup(answer: (at: { x: number; y: number }) => DropReport | undefined = report, block: DraggedBlock = { kind: "new", block: "paragraph" }) {
  const log = { moving: [] as unknown[], probes: [] as { x: number; y: number }[], drops: [] as [DropTarget, string][], announced: [] as string[], shown: [] as DragAim<DropTarget>[], drawn: [] as unknown[] };
  const pending: (() => void)[] = [];
  const session = createBlockDragSession(block, {
    frame: {} as HTMLElement,
    draw: (indicator) => { log.drawn.push(indicator?.kind); },
    probe: (at, moving) => {
      log.probes.push(at);
      log.moving.push(moving);
      return new Promise((resolve) => pending.push(() => resolve(answer(at))));
    },
    scroll: () => {},
    drop: (target, where) => { log.drops.push([target, where]); },
    announce: (text) => { log.announced.push(text); },
  });
  const show = (aim: DragAim<DropTarget>) => { log.shown.push(aim); };
  // Answers the oldest probe and lets its follow-up run.
  const answerNext = async () => { pending.shift()?.(); await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { session, log, show, answerNext, pending };
}

test("one probe at a time: the latest pointer is probed once the answer is in", async () => {
  const { session, log, show, answerNext } = setup();
  session.aim({ x: 400, y: 150 }, false, show);
  session.aim({ x: 400, y: 160 }, false, show);
  session.aim({ x: 400, y: 280 }, false, show);
  assert.equal(log.probes.length, 1);
  await answerNext();
  assert.deepEqual(log.probes.map((p) => p.y), [150, 280]);
  assert.equal(log.shown.at(-1)?.where, "Into Div (stack) › before Paragraph");
  await answerNext();
  assert.equal(log.shown.at(-1)?.where, "Into Div (stack) › after Paragraph");
  // The same point again asks nothing; Tab redraws from the last answer.
  session.aim({ x: 400, y: 280 }, false, show);
  assert.equal(log.probes.length, 2);
  session.step!(1);
  session.aim({ x: 400, y: 280 }, false, show);
  assert.equal(log.shown.at(-1)?.where, "Into Section › after Heading");
  session.aim({ x: 400, y: 280 }, true, show);
  assert.deepEqual([log.shown.at(-1)?.refused, log.shown.at(-1)?.where], [true, "Blocks go inside a Section or a Div, not straight between page bands."]);
});

test("a page still rendering is asked again on the next aim, not at once", async () => {
  let ready = false;
  const { session, log, show, answerNext } = setup((at) => (ready ? report(at) : undefined));
  session.aim({ x: 400, y: 150 }, false, show);
  await answerNext();
  assert.equal(log.probes.length, 1);
  ready = true;
  session.aim({ x: 400, y: 150 }, false, show);
  assert.equal(log.probes.length, 2);
  await answerNext();
  assert.equal(log.shown.at(-1)?.where, "Into Div (stack) › before Paragraph");
});

test("a release the last probe did not see is probed again, and that answer decides", async () => {
  const { session, log, show, answerNext } = setup();
  session.aim({ x: 400, y: 150 }, false, show);
  await answerNext();
  const shown = log.shown.at(-1)!.target!;
  // Onto the title slot, released before its probe answers.
  session.aim({ x: 400, y: 540 }, false, show);
  session.clear();
  assert.equal(session.drop(shown, false), true);
  await answerNext();
  await answerNext();
  assert.deepEqual(log.drops, []);
  assert.match(log.announced[0], /^Nothing was added: The “title” slot is filled by editing its text/);
  assert.equal(log.drawn.at(-1), undefined);
  // A release where the last answer was: dropped there at once.
  const again = setup();
  again.session.aim({ x: 400, y: 280 }, false, again.show);
  await again.answerNext();
  again.session.clear();
  assert.equal(again.session.drop(again.log.shown.at(-1)!.target!, false), true);
  assert.deepEqual(again.log.drops.map(([target, where]) => [target.container.path, target.index, where]), [[[1, 0, 1], 1, "Into Div (stack) › after Paragraph"]]);
});

test("answers after the drag ended draw nothing", async () => {
  const { session, log, show, answerNext } = setup();
  session.aim({ x: 400, y: 150 }, false, show);
  session.clear();
  await answerNext();
  assert.deepEqual(log.shown, []);
  assert.deepEqual(log.drawn, [undefined]);
});

test("a release decides by its own point: after a refusal onto a valid place, after a scroll, back on the canvas", async () => {
  // Shown refused over the title slot, released over the stack before its answer: the stack takes it.
  const refused = setup();
  refused.session.aim({ x: 400, y: 540 }, false, refused.show);
  await refused.answerNext();
  assert.equal(refused.log.shown.at(-1)?.refused, true);
  refused.session.aim({ x: 400, y: 150 }, false, refused.show);
  refused.session.clear();
  assert.equal(refused.session.drop(refused.log.shown.at(-1)?.target, true), true);
  await refused.answerNext();
  await refused.answerNext();
  assert.deepEqual(refused.log.drops.map(([target]) => [target.container.path, target.index]), [[[1, 0, 1], 0]]);
  // A fresh refusal is not added.
  const still = setup();
  still.session.aim({ x: 400, y: 540 }, false, still.show);
  await still.answerNext();
  assert.equal(still.session.drop(still.log.shown.at(-1)?.target, true), false);
  assert.equal(still.session.drop(undefined, false), false);
  // A scroll whose probe went unanswered leaves the old answer stale: asked again, and the release probes.
  let ready = true;
  const scrolled = setup((at) => (ready ? report(at) : undefined));
  scrolled.session.aim({ x: 400, y: 150 }, false, scrolled.show);
  await scrolled.answerNext();
  scrolled.session.scroll(14);
  ready = false;
  scrolled.session.aim({ x: 400, y: 150 }, false, scrolled.show);
  await scrolled.answerNext();
  scrolled.session.aim({ x: 400, y: 150 }, false, scrolled.show);
  assert.equal(scrolled.log.probes.length, 3);
  ready = true;
  await scrolled.answerNext();
  // Off the canvas and back to the same point: asked again, shown again.
  scrolled.session.aim(undefined, false, scrolled.show);
  assert.equal(scrolled.log.shown.at(-1)?.where, "Release to cancel");
  assert.equal(scrolled.session.drop(undefined, false), false);
  scrolled.session.aim({ x: 400, y: 150 }, false, scrolled.show);
  assert.equal(scrolled.log.probes.length, 4);
  await scrolled.answerNext();
  assert.equal(scrolled.log.shown.at(-1)?.where, "Into Div (stack) › before Paragraph");
});

test("a moved block probes without itself, draws nothing where it already is, and says so", async () => {
  // The second paragraph of the stack, moved: its own gaps are "Stays where it is".
  const { session, log, show, answerNext } = setup(report, { kind: "move", path: [1, 0, 1, 1], band: false });
  session.aim({ x: 400, y: 280 }, false, show);
  await answerNext();
  assert.deepEqual(log.moving, [[1, 0, 1, 1]]);
  assert.equal(log.shown.at(-1)?.where, "Stays where it is");
  assert.deepEqual(log.drawn, [undefined]);
  // Above the first paragraph: a line and a place.
  session.aim({ x: 400, y: 130 }, false, show);
  await answerNext();
  assert.equal(log.shown.at(-1)?.where, "Into Div (stack) › before Paragraph");
  assert.deepEqual(log.drawn, [undefined, "line"]);
  // A refused release says nothing was moved.
  session.aim({ x: 400, y: 540 }, false, show);
  session.clear();
  session.drop(undefined, false);
  await answerNext();
  await answerNext();
  assert.match(log.announced[0], /^Nothing was moved: /);
});
