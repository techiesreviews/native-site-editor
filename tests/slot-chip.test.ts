import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CLICK_WAIT_MS, clickTiming } from "../src/components/click-timing.ts";
import { slotChipState } from "../src/page-builder/component-model.ts";

// The slot chip (build slice 23): its click/double-click timing, and what it says of a template's part.

function counted() {
  const seen: string[] = [];
  return { seen, timing: clickTiming(() => seen.push("click"), () => seen.push("double")) };
}

test("a click acts once after the wait; a double-click acts alone, never as a click", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { seen, timing } = counted();
    timing.click(1);
    mock.timers.tick(CLICK_WAIT_MS - 1);
    assert.deepEqual(seen, []);
    mock.timers.tick(1);
    assert.deepEqual(seen, ["click"]);
    mock.timers.tick(CLICK_WAIT_MS * 4);
    assert.deepEqual(seen, ["click"]);

    // The browser's double-click: click (1), click (2), dblclick.
    seen.length = 0;
    timing.click(1);
    mock.timers.tick(80);
    timing.click(2);
    timing.doubleClick();
    mock.timers.tick(CLICK_WAIT_MS * 4);
    assert.deepEqual(seen, ["double"]);

    // A third click in the run starts nothing either.
    seen.length = 0;
    timing.click(3);
    mock.timers.tick(CLICK_WAIT_MS * 4);
    assert.deepEqual(seen, []);
  } finally {
    mock.timers.reset();
  }
});

test("two separate clicks act twice; a keyboard click acts at once; cancel drops a waiting click", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { seen, timing } = counted();
    timing.click(1);
    mock.timers.tick(CLICK_WAIT_MS);
    timing.click(1);
    mock.timers.tick(CLICK_WAIT_MS);
    assert.deepEqual(seen, ["click", "click"]);

    seen.length = 0;
    timing.click(0);
    assert.deepEqual(seen, ["click"]);

    seen.length = 0;
    timing.click(1);
    timing.cancel();
    mock.timers.tick(CLICK_WAIT_MS * 4);
    assert.deepEqual(seen, []);
  } finally {
    mock.timers.reset();
  }
});

// Recent work as a section component (slice 41's spec), with a fixed lede.
const work = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <p class="lede">Some things we made.</p>
  <div class="cards">
    <slot>
      <card-project></card-project>
    </slot>
  </div>
</section>`;

test("the chip of a slot, of what sits in one, and of an items slot with its count", () => {
  assert.deepEqual(slotChipState(work, [0, 0]), { state: "slot", name: "title", slot: [0, 0] });
  assert.deepEqual(slotChipState(work, [0, 0, 0]), { state: "slot", name: "title", slot: [0, 0] });
  assert.deepEqual(slotChipState(work, [0, 2, 0, 0]), { state: "items", name: "", slot: [0, 2, 0], count: 1 });
  assert.deepEqual(slotChipState(work, [0, 2, 0]), { state: "items", name: "", slot: [0, 2, 0], count: 1 });
  // Deep in a fallback: the nearest slot.
  assert.deepEqual(slotChipState(`<div><slot name="intro"><p>Hi <em>there</em></p></slot></div>`, [0, 0, 0, 0]), { state: "slot", name: "intro", slot: [0, 0] });
  // A named slot holding card components is an items slot; an empty one counts none.
  const templateOf = (tag: string) => (tag === "card-project" ? `<article><slot name="title"><h3>Untitled</h3></slot></article>` : undefined);
  const named = `<div><slot name="projects"><card-project></card-project><card-project></card-project></slot><slot name="more"></slot></div>`;
  assert.deepEqual(slotChipState(named, [0, 0, 1], templateOf), { state: "items", name: "projects", slot: [0, 0], count: 2 });
  assert.deepEqual(slotChipState(named, [0, 0, 1]), { state: "slot", name: "projects", slot: [0, 0] });
  assert.deepEqual(slotChipState(named, [0, 1]), { state: "slot", name: "more", slot: [0, 1] });
});

test("a fixed part's chip has the role name it would get, past the slot names taken", () => {
  assert.deepEqual(slotChipState(work, [0, 1]), { state: "fixed", name: "text", part: [0, 1] });
  const fixed = `<article>
    <slot name="title"><h2>One</h2></slot>
    <h3>Fixed heading</h3>
    <img src="a.png" alt="">
    <a href="/x">More</a>
    <ul><li>A</li></ul>
    <card-note></card-note>
    <div><span>Box</span></div>
  </article>`;
  const name = (path: number[]) => slotChipState(fixed, path)?.name;
  assert.equal(name([0, 1]), "title-2");
  assert.equal(name([0, 2]), "image");
  assert.equal(name([0, 3]), "link");
  assert.equal(name([0, 4]), "list");
  assert.equal(name([0, 5]), "note");
  assert.equal(name([0, 6]), "content");
  assert.equal(name([0, 6, 0]), "text");
  const taken = `<div><slot name="text"><p>a</p></slot><slot name="text-2"><p>b</p></slot><p>c</p></div>`;
  assert.deepEqual(slotChipState(taken, [0, 2]), { state: "fixed", name: "text-3", part: [0, 2] });
});

test("no chip for the root, a part holding slots, a nested instance's content, a cell, or a missing part", () => {
  assert.equal(slotChipState(work, [0]), undefined);
  assert.equal(slotChipState(work, [0, 2]), undefined);
  assert.equal(slotChipState(work, []), undefined);
  assert.equal(slotChipState(work, [0, 9]), undefined);
  assert.equal(slotChipState(`<div><card-note><p slot="note">Hi</p></card-note></div>`, [0, 0, 0]), undefined);
  assert.equal(slotChipState(`<div><table><tbody><tr><td>A</td></tr></tbody></table></div>`, [0, 0, 0, 0, 0]), undefined);
  assert.equal(slotChipState(`<div><details><summary>More</summary><p>Body</p></details></div>`, [0, 0, 0]), undefined);
});
