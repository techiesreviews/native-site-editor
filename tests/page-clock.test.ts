import assert from "node:assert/strict";
import { test } from "node:test";
import { pauseAhead, type ClockPage } from "./support/clock";

const past = () => new Error("clock.pauseAt: Error: Cannot fast-forward to the past");

/** A page whose frames' clocks read `times` in turn (one list per frame; `gone` for a frame detached meanwhile) and
 * that answers each pauseAt from `answers`. */
function stubPage(times: number[], answers: (Error | undefined)[], ...frames: (number[] | "gone")[]) {
  const asked: number[] = [];
  const frame = (reads: number[] | "gone") => ({ evaluate: async () => { if (reads === "gone") throw new Error("Frame was detached"); return reads.shift()!; } });
  const page = {
    frames: () => [frame(times), ...frames.map(frame)],
    clock: { pauseAt: async (time: number) => { asked.push(time); const answer = answers.shift(); if (answer) throw answer; } },
  } satisfies ClockPage;
  return { page, asked };
}

test("pauseAhead reads the stopped clock again after a refusal for a time already past, and pauses there", async () => {
  const { page, asked } = stubPage([1000, 2000], [past(), undefined]);
  await pauseAhead(page, 100);
  assert.deepEqual(asked, [1100, 2100]);
});

test("pauseAhead throws any other error at once, and a third refusal in a row", async () => {
  const other = stubPage([1000], [new Error("Target page, context or browser has been closed")]);
  await assert.rejects(pauseAhead(other.page, 100), /has been closed/);
  assert.deepEqual(other.asked, [1100]);
  const stuck = stubPage([1, 2, 3], [past(), past(), past()]);
  await assert.rejects(pauseAhead(stuck.page, 100), /fast-forward to the past/);
  assert.deepEqual(stuck.asked, [101, 102, 103]);
});

test("pauseAhead refuses less than 1 ms ahead", async () => {
  const { page, asked } = stubPage([1000], [undefined]);
  await assert.rejects(pauseAhead(page, 0), /at least 1 ms/);
  assert.deepEqual(asked, []);
});

test("pauseAhead pauses ahead of the latest frame's clock: a preview frame running ahead of the page, a frame gone left out", async () => {
  const { page, asked } = stubPage([1000, 1001], [past(), undefined], [1020, 1021], "gone");
  await pauseAhead(page, 1);
  assert.deepEqual(asked, [1021, 1022]);
  const none = stubPage([], [], "gone");
  none.page.frames = () => [{ evaluate: async () => { throw new Error("Frame was detached"); } }];
  await assert.rejects(pauseAhead(none.page, 1), /any frame/);
});
