import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mediaLibraryArrowStep, wireMediaLibraryInput, type LibraryInputHost } from "../src/page-builder/media-library-input";
import type { LibraryShell } from "../src/page-builder/media-library-shell";

/** Only input events are exercised, so the shell needs no rendered DOM. */
function searchFixture(context: TestContext) {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  context.after(() => controller.abort());
  const search = Object.assign(new EventTarget(), { value: "" }) as HTMLInputElement;
  const grid = new EventTarget() as HTMLDivElement, dialog = new EventTarget() as HTMLElement;
  const shell = {
    search, grid, uploadInput: new EventTarget() as HTMLInputElement, dialog,
  } satisfies Pick<LibraryShell, "search" | "grid" | "uploadInput" | "dialog">;
  const draws: string[] = [];
  const host = {
    draw: () => { draws.push(search.value); }, loaded: () => true, add: () => {}, tell: () => {},
  } satisfies LibraryInputHost;
  wireMediaLibraryInput(shell as LibraryShell, host, controller.signal);
  const type = (value: string) => { search.value = value; search.dispatchEvent(new Event("input")); };
  return { search, grid, dialog, controller, draws, type };
}

test("three quick search keystrokes redraw once, 150 ms after the last input", context => {
  const { type, draws } = searchFixture(context);
  type("c"); context.mock.timers.tick(50);
  type("ca"); context.mock.timers.tick(50);
  type("cat"); context.mock.timers.tick(149);
  assert.deepEqual(draws, []);
  context.mock.timers.tick(1);
  assert.deepEqual(draws, ["cat"]);
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, ["cat"]);
});

test("Enter redraws search immediately and cancels the delayed redraw", context => {
  const { type, search, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  const enter = Object.assign(new Event("keydown", { cancelable: true }), { key: "Enter" });
  search.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(draws, ["cat"]);
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, ["cat"]);
});

test("clearing search redraws immediately and cancels the delayed redraw", context => {
  const { type, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  type("");
  assert.deepEqual(draws, [""]);
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, [""]);
});

test("leaving search flushes a pending redraw only once", context => {
  const { type, search, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  search.dispatchEvent(new Event("blur"));
  assert.deepEqual(draws, ["cat"]);
  context.mock.timers.tick(1000);
  search.dispatchEvent(new Event("blur"));
  assert.deepEqual(draws, ["cat"]);
});

test("Tab redraws a pending search before focus moves, leaving the move to the browser", context => {
  const { type, search, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  const tab = Object.assign(new Event("keydown", { cancelable: true }), { key: "Tab" });
  search.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.deepEqual(draws, ["cat"]);
  search.dispatchEvent(new Event("blur")); context.mock.timers.tick(1000);
  assert.deepEqual(draws, ["cat"]);
});

test("a tile pressed during a pending search keeps the grid until its click has run", context => {
  const { type, search, grid, dialog, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  grid.dispatchEvent(new Event("pointerdown"));
  search.dispatchEvent(new Event("blur"));
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, []);
  dialog.dispatchEvent(new Event("pointerup"));
  grid.dispatchEvent(new Event("click"));
  // A label's second click lands in the same turn; the redraw follows both.
  grid.dispatchEvent(new Event("click"));
  assert.deepEqual(draws, []);
  context.mock.timers.tick(0);
  assert.deepEqual(draws, ["cat"]);
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, ["cat"]);
});

test("closing Media between a pressed tile's click and its redraw draws nothing", context => {
  const { type, grid, controller, draws } = searchFixture(context);
  type("cat");
  grid.dispatchEvent(new Event("pointerdown"));
  grid.dispatchEvent(new Event("click"));
  controller.abort();
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, []);
});

test("a press released without a click still redraws the pending search", context => {
  const { type, grid, dialog, draws } = searchFixture(context);
  type("cat");
  grid.dispatchEvent(new Event("pointerdown"));
  dialog.dispatchEvent(new Event("pointercancel")); context.mock.timers.tick(149);
  assert.deepEqual(draws, []);
  context.mock.timers.tick(1);
  assert.deepEqual(draws, ["cat"]);
  grid.dispatchEvent(new Event("click")); context.mock.timers.tick(1000);
  assert.deepEqual(draws, ["cat"]);
});

test("a press with no pending search leaves the grid alone", context => {
  const { grid, dialog, draws } = searchFixture(context);
  grid.dispatchEvent(new Event("pointerdown"));
  dialog.dispatchEvent(new Event("pointerup"));
  grid.dispatchEvent(new Event("click"));
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, []);
});

test("closing Media clears the pending search timer and removes input listeners", context => {
  const { type, controller, search, draws } = searchFixture(context);
  type("cat"); context.mock.timers.tick(50);
  const clear = context.mock.method(globalThis, "clearTimeout");
  controller.abort();
  assert.equal(clear.mock.callCount(), 1);
  context.mock.timers.tick(1000);
  type("dog");
  search.dispatchEvent(Object.assign(new Event("keydown"), { key: "Enter" }));
  search.dispatchEvent(new Event("blur"));
  context.mock.timers.tick(1000);
  assert.deepEqual(draws, []);
});

test("arrow keys step by one thumbnail or one row", () => {
  assert.equal(mediaLibraryArrowStep("ArrowRight", 4, 12, 3), 5);
  assert.equal(mediaLibraryArrowStep("ArrowLeft", 4, 12, 3), 3);
  assert.equal(mediaLibraryArrowStep("ArrowDown", 4, 12, 3), 7);
  assert.equal(mediaLibraryArrowStep("ArrowUp", 4, 12, 3), 1);
});

test("steps clamp at either end, including incomplete rows and a single thumbnail", () => {
  assert.equal(mediaLibraryArrowStep("ArrowLeft", 0, 10, 3), 0);
  assert.equal(mediaLibraryArrowStep("ArrowUp", 1, 10, 3), 0);
  assert.equal(mediaLibraryArrowStep("ArrowRight", 9, 10, 3), 9);
  assert.equal(mediaLibraryArrowStep("ArrowDown", 8, 10, 3), 9);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"])
    assert.equal(mediaLibraryArrowStep(key, 0, 1, 1), 0);
});

test("other keys leave keyboard handling to the browser", () => {
  assert.equal(mediaLibraryArrowStep("Enter", 4, 12, 3), undefined);
  assert.equal(mediaLibraryArrowStep("Tab", 4, 12, 3), undefined);
  assert.equal(mediaLibraryArrowStep("", 4, 12, 3), undefined);
});
