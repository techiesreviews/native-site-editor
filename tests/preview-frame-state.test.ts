import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewFrameState } from "../src/components/preview-frame-state.ts";

function setup() {
  const calls: string[] = [];
  let armed = false;
  const state = createPreviewFrameState({
    attach: () => calls.push("attach"),
    park: () => calls.push("park"),
    unpark: () => calls.push("unpark"),
    reload: () => calls.push("reload"),
    armWatchdog: () => { armed = true; calls.push("arm"); },
    disarmWatchdog: () => { armed = false; calls.push("disarm"); },
    resync: () => calls.push("resync"),
  });
  return { state, calls, armed: () => armed };
}

test("preload attaches once, parked, and arms the watchdog", () => {
  const { state, calls, armed } = setup();
  state.preload();
  state.preload();
  assert.deepEqual(calls, ["attach", "park", "arm"]);
  assert.equal(state.attached, true);
  assert.equal(state.active, false);
  assert.equal(armed(), true);
});

test("ready while parked is recorded; activate then resyncs", () => {
  const { state, calls, armed } = setup();
  state.preload();
  assert.equal(state.markReady(), false);
  assert.equal(armed(), false);
  assert.equal(state.canPost, false);
  calls.length = 0;
  assert.equal(state.activate(), true);
  assert.deepEqual(calls, ["unpark", "resync"]);
  assert.equal(state.canPost, true);
});

test("activate without preload attaches, then unparks; ready later reports active", () => {
  const { state, calls } = setup();
  assert.equal(state.activate(), true);
  assert.deepEqual(calls, ["attach", "park", "arm", "unpark"]);
  assert.equal(state.canPost, false);
  assert.equal(state.markReady(), true);
  assert.equal(state.canPost, true);
  assert.equal(state.activate(), false);
});

test("deactivate parks, reloads, resets ready and re-arms", () => {
  const { state, calls, armed } = setup();
  state.activate();
  state.markReady();
  calls.length = 0;
  assert.equal(state.deactivate(), true);
  assert.deepEqual(calls, ["park", "reload", "arm"]);
  assert.equal(state.ready, false);
  assert.equal(state.active, false);
  assert.equal(state.canPost, false);
  assert.equal(armed(), true);
});

test("deactivate while parked does not reload", () => {
  const { state, calls } = setup();
  state.preload();
  calls.length = 0;
  assert.equal(state.deactivate(), false);
  state.activate();
  state.deactivate();
  calls.length = 0;
  assert.equal(state.deactivate(), false);
  assert.deepEqual(calls, []);
});

test("posts only when active and ready, in any order", () => {
  const { state } = setup();
  state.markReady();
  assert.equal(state.canPost, false);
  state.activate();
  assert.equal(state.canPost, true);
  state.deactivate();
  state.activate();
  assert.equal(state.canPost, false);
  state.markReady();
  assert.equal(state.canPost, true);
});

test("destroy disarms the watchdog", () => {
  const { state, armed } = setup();
  state.preload();
  state.destroy();
  assert.equal(armed(), false);
  assert.equal(state.attached, false);
});
