import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodePanesController, type CodePanesPorts } from "../src/controllers/code-panes-controller.ts";

function harness(load: () => Promise<string>) {
  const frames: Array<() => void> = [], idles: Array<() => void> = [], delays: Array<() => void> = [];
  const failures: unknown[] = [];
  let loads = 0;
  const ports: CodePanesPorts<string> = {
    load: () => { loads++; return load(); },
    onChunkFailure: (error) => failures.push(error),
    mountCodeResize: (() => { throw new Error("unused"); }) as never,
    mountCodeWidthResize: (() => { throw new Error("unused"); }) as never,
    frame: (callback) => frames.push(callback),
    idle: (callback) => idles.push(callback),
    wait: () => Promise.resolve(),
    delay: (callback) => delays.push(callback),
  };
  return { controller: createCodePanesController(ports), frames, idles, delays, failures, loads: () => loads };
}
const settle = () => new Promise((done) => setTimeout(done, 0));

test("only the first native pane defers; later panes load at once", () => {
  const { controller } = harness(() => Promise.resolve("monaco"));
  assert.equal(controller.deferPane(true), true);
  assert.equal(controller.deferPane(true), false);
  const other = harness(() => Promise.resolve("monaco")).controller;
  assert.equal(other.deferPane(false), false);
  assert.equal(other.deferPane(true), false);
});

test("a deferred pane waits for the first paint, settled reads and idle time", async () => {
  const h = harness(() => Promise.resolve("monaco"));
  let release!: () => void;
  const read = h.controller.trackRead(() => new Promise<void>((done) => { release = done; }));
  const due = h.controller.whenDue(true);
  await settle();
  assert.equal(h.loads(), 0);
  h.controller.notePreviewPainted();
  h.controller.notePreviewPainted();
  assert.equal(h.frames.length, 1);
  h.frames.shift()!();
  h.frames.shift()!();
  release(); await read; await settle();
  assert.equal(h.idles.length, 1);
  h.idles.shift()!();
  assert.equal(await due, "monaco");
  assert.equal(h.loads(), 1);
});

test("a preview that never paints opens the gate after its fallback delay", async () => {
  const h = harness(() => Promise.resolve("monaco"));
  const due = h.controller.whenDue(true);
  assert.equal(h.delays.length, 1);
  h.delays.shift()!();
  assert.equal(await due, "monaco");
});

test("a failed chunk import reports once and can be retried", async () => {
  let fail = true;
  const h = harness(() => fail ? Promise.reject(new Error("chunk")) : Promise.resolve("monaco"));
  await assert.rejects(h.controller.want(), /chunk/);
  assert.equal(h.failures.length, 1);
  fail = false;
  assert.equal(await h.controller.want(), "monaco");
  assert.equal(await h.controller.want(), "monaco");
  assert.equal(h.loads(), 2);
});
