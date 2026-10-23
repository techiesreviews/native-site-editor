import { test } from "node:test";
import assert from "node:assert/strict";
import { pickerClose } from "../src/page-builder/media-picker-close";
import { deferred } from "./fakes/memory-workspace";

// Ticket 27: a picker closed because another workspace was opened cancels no Use under way (it lands
// in the picker's own workspace) and `onClose` waits for it; Cancel, Escape or the workspace closing
// (sign-out) cancel it and answer at once.
function harness() {
  const answers: string[] = [];
  const state = pickerClose(() => { answers.push("closed with nothing"); });
  return { state, answers };
}

test("a Use under way when the picker closes for a switch is not cancelled, and onClose waits for it", async () => {
  const { state, answers } = harness(), use = deferred<void>();
  let cancelled: boolean | undefined;
  const running = state.pick(async () => { await use.promise; cancelled = state.cancelled(); answers.push("placed"); });
  state.leave(true); state.closed();
  assert.deepEqual(answers, [], "a choosePath is not answered with nothing while the Use runs");
  use.resolve(); await running;
  assert.equal(cancelled, false);
  assert.deepEqual(answers, ["placed"], "it landed: onClose has nothing to say");
});

test("a Use that fails after a switch closed the picker is answered with nothing then", async () => {
  const { state, answers } = harness();
  let refuse!: (error: Error) => void;
  const running = state.pick(() => new Promise<void>((_resolve, reject) => { refuse = reject; }));
  state.leave(true); state.closed();
  refuse(new Error("refused"));
  await assert.rejects(running, /refused/);
  assert.deepEqual(answers, ["closed with nothing"]);
});

test("a Use under way when the picker closes by Escape, Cancel or the workspace closing is cancelled, answered at once", async () => {
  for (const close of ["escape", "workspace closed"] as const) {
    const { state, answers } = harness(), use = deferred<void>();
    let cancelled: boolean | undefined;
    const running = state.pick(async () => { await use.promise; cancelled = state.cancelled(); });
    if (close === "workspace closed") state.leave(false);
    state.closed();
    assert.deepEqual(answers, ["closed with nothing"], close);
    use.resolve(); await running;
    assert.equal(cancelled, true, close);
  }
});

test("a picker closed after its Use landed, or with no Use, answers as before", async () => {
  const used = harness();
  await used.state.pick(async () => {});
  used.state.closed();
  assert.deepEqual(used.answers, []);
  const none = harness();
  none.state.closed();
  assert.deepEqual(none.answers, ["closed with nothing"]);
});
