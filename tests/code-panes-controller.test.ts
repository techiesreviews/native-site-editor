import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodePanesController, type CodePanesPorts } from "../src/controllers/code-panes-controller.ts";

// A stand-in height handle: `pane.open()` is the person opening the code pane.
function fakePane(collapsed: boolean) {
  let onOpen: (() => void) | undefined;
  const listeners = new Map<string, (event: Event) => void>();
  const pane = {
    collapsed,
    open() { pane.collapsed = false; onOpen?.(); },
    mountCodeResize: ((_main: unknown, _split: unknown, open?: () => void) => {
      onOpen = open;
      return { toggle() {}, apply() {}, collapsed: () => pane.collapsed };
    }) as never,
    mountCodeWidthResize: (() => ({ apply() {} })) as never,
    // eslint-disable-next-line no-restricted-syntax -- node has no DOM: the controller only adds listeners to the split and finds its first pane.
    split: {
      addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
      querySelector: () => ({}),
    } as unknown as HTMLElement,
    /** A pointerdown or focusin in the code panes (the handle's or the code's). */
    dispatch(type: string) {
      // eslint-disable-next-line no-restricted-syntax -- node has no DOM events: the listener reads nothing from the event.
      listeners.get(type)?.({} as unknown as Event);
    },
  };
  return pane;
}

function harness(load: () => Promise<string>, pane?: ReturnType<typeof fakePane>) {
  const frames: Array<() => void> = [], idles: Array<() => void> = [], delays: Array<() => void> = [];
  const failures: unknown[] = [];
  let loads = 0;
  const ports: CodePanesPorts<string> = {
    load: () => { loads++; return load(); },
    onChunkFailure: (error) => failures.push(error),
    mountCodeResize: pane?.mountCodeResize ?? (() => { throw new Error("unused"); }) as never,
    mountCodeWidthResize: pane?.mountCodeWidthResize ?? (() => { throw new Error("unused"); }) as never,
    frame: (callback) => frames.push(callback),
    idle: (callback) => idles.push(callback),
    wait: () => Promise.resolve(),
    delay: (callback) => delays.push(callback),
  };
  const controller = createCodePanesController(ports);
  if (pane) controller.mountResize({} as HTMLElement, pane.split, {} as HTMLElement);
  return { controller, frames, idles, delays, failures, loads: () => loads };
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

// Runs a first paint through to its idle callback.
async function paint(h: ReturnType<typeof harness>) {
  h.controller.notePreviewPainted();
  h.frames.shift()?.();
  h.frames.shift()?.();
  await settle();
  h.idles.shift()?.();
  await settle();
}

test("a pane closed at boot never loads Monaco on its own: not after paint, idle or the fallback", async () => {
  const pane = fakePane(true);
  const h = harness(() => Promise.resolve("monaco"), pane);
  let resolved = false;
  void h.controller.whenDue(h.controller.deferPane(true)).then(() => { resolved = true; });
  await paint(h);
  for (const fallback of h.delays.splice(0)) fallback();
  await settle();
  assert.equal(h.loads(), 0);
  assert.equal(resolved, false);
  // Pressing or focusing the closed pane's handle does not count as reaching for the code.
  pane.dispatch("pointerdown");
  pane.dispatch("focusin");
  await settle();
  assert.equal(h.loads(), 0);
});

test("a later closed pane of a native site also waits until it is opened", async () => {
  const pane = fakePane(true);
  const h = harness(() => Promise.resolve("monaco"), pane);
  assert.equal(h.controller.deferPane(true), false);
  let resolved = false;
  void h.controller.whenDue(h.controller.deferPane(true)).then(() => { resolved = true; });
  await settle();
  assert.equal(h.loads(), 0);
  assert.equal(h.delays.length, 0);
  pane.open();
  await settle();
  assert.equal(resolved, true);
  assert.equal(h.loads(), 1);
});

test("opening a closed pane loads Monaco once, and its waiting panes get it", async () => {
  const pane = fakePane(true);
  const h = harness(() => Promise.resolve("monaco"), pane);
  const due = h.controller.whenDue(h.controller.deferPane(true));
  await paint(h);
  pane.open();
  assert.equal(await due, "monaco");
  // Reaching into the code afterwards and a later paint load nothing more.
  pane.dispatch("pointerdown");
  await paint(h);
  assert.equal(await h.controller.whenDue(false), "monaco");
  assert.equal(h.loads(), 1);
});

test("a pane left open loads Monaco after the first paint as before", async () => {
  const pane = fakePane(false);
  const h = harness(() => Promise.resolve("monaco"), pane);
  const due = h.controller.whenDue(h.controller.deferPane(true));
  await settle();
  assert.equal(h.loads(), 0);
  await paint(h);
  assert.equal(await due, "monaco");
  assert.equal(h.loads(), 1);
});

test("a pane closed after boot but before the paint does not load Monaco", async () => {
  const pane = fakePane(false);
  const h = harness(() => Promise.resolve("monaco"), pane);
  void h.controller.whenDue(h.controller.deferPane(true));
  pane.collapsed = true;
  await paint(h);
  for (const fallback of h.delays.splice(0)) fallback();
  await settle();
  assert.equal(h.loads(), 0);
});

test("a site without a preview (plain files) loads the code at once, though the pane was left closed", async () => {
  const pane = fakePane(true);
  const h = harness(() => Promise.resolve("monaco"), pane);
  assert.equal(await h.controller.whenDue(h.controller.deferPane(false)), "monaco");
  assert.equal(h.loads(), 1);
});
