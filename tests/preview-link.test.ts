import { strict as assert } from "node:assert";
import { mock, test } from "node:test";
import { createPreviewLink, type AskType, type Painted } from "../src/components/preview-link";
import type { FrameMessage } from "../src/components/preview-protocol";
import type { UpdatePayload } from "../src/components/native-preview";
import { createFakeFrame } from "./fakes/fake-frame";

const sources = { "index.html": "<main><h1>Hi</h1></main>" };
const node = { tag: "h1", node: [0, 0], text: "Hi", heading: "", slot: "", children: [] };

/** A link on a fake frame, with one render posted and everything it hears recorded. */
function setup() {
  const frame = createFakeFrame();
  const link = createPreviewLink(frame.port);
  const heard: { type: FrameMessage["type"]; message: FrameMessage; painted?: Painted }[] = [];
  const hear = (type: Parameters<typeof link.on>[0]) => link.on(type, (message, painted) => { heard.push({ type: message.type, message, painted }); });
  const render = (painted: Painted = sources, shows = "/") => {
    link.stale("/");
    link.render({ context: link.context() } as UpdatePayload, painted, shows);
  };
  render();
  return { frame, link, heard, hear, render };
}

test("a render's descriptions count only for the current render, with the sources it was painted from", () => {
  const { frame, link, heard, hear, render } = setup();
  for (const type of ["select", "structure", "insert-points"] as const) hear(type);
  const old = frame.context();
  link.stale("/");
  frame.emit("select", { path: "index.html", node: [0, 0], reason: "refresh" }, { context: old });
  frame.emit("structure", { path: "index.html", items: [node] }, { context: old });
  frame.emit("insert-points", { path: "index.html", points: [] }, { context: old });
  assert.deepEqual(heard, [], "a render requested since: dropped");

  // The render is posted (with other bytes) and the frame reports it.
  const next = { "index.html": "<main><h1>Hello</h1></main>" };
  render(next);
  frame.emit("structure", { path: "index.html", items: [node] });
  frame.emit("insert-points", { path: "index.html", points: [] });
  frame.emit("select", { path: "index.html", node: [0, 0], reason: "refresh" });
  assert.deepEqual(heard.map(({ type }) => type), ["structure", "insert-points", "select"]);
  for (const { painted } of heard) assert.deepEqual(painted, next);
  assert.deepEqual(link.painted(), next);
});

test("a render asked for and not yet posted paints nothing", () => {
  const { frame, link, heard, hear } = setup();
  hear("select");
  link.stale("/");
  assert.equal(link.painted(), undefined);
  // A report stamped with the new token before its render was posted (a forged one) has no painted sources.
  frame.emit("select", { path: "index.html", reason: "refresh" }, { context: link.context() });
  assert.equal(heard.length, 1);
  assert.equal(heard[0].painted, undefined);
});

test("a stale click becomes the next refresh's click, and clear-selection forgets it", () => {
  const { frame, link, heard, hear, render } = setup();
  hear("select");
  const old = frame.context();
  render();
  frame.emit("select", { path: "index.html", node: [0], reason: "click" }, { context: old });
  assert.deepEqual(heard, []);
  frame.emit("select", { path: "index.html", node: [0], reason: "refresh" });
  frame.emit("select", { path: "index.html", node: [0], reason: "refresh" });
  assert.deepEqual(heard.map(({ message }) => message.type === "select" && message.reason), ["click", "refresh"]);

  heard.length = 0;
  const older = frame.context();
  render();
  frame.emit("select", { path: "index.html", node: [0], reason: "click" }, { context: older });
  link.send({ type: "clear-selection" });
  frame.emit("select", { path: "index.html", node: [0], reason: "refresh" });
  assert.deepEqual(heard.map(({ message }) => message.type === "select" && message.reason), ["refresh"]);
  assert.equal(frame.last("clear-selection")?.source, "astro-native-preview-host");
});

test("a user's action from an older render is delivered; a press drag's start from one is not", () => {
  const { frame, link, heard, hear, render } = setup();
  for (const type of ["move", "text-edit", "press-drag", "pin-rects"] as const) hear(type);
  const old = frame.context();
  render();
  frame.emit("move", { direction: "down" }, { context: old });
  frame.emit("text-edit", { path: "index.html", node: [0, 0], before: "Hi", after: "Hey" }, { context: old });
  frame.emit("press-drag", { phase: "start", x: 1, y: 2, node: [0, 0], tag: "h1" }, { context: old });
  frame.emit("press-drag", { phase: "move", x: 3, y: 4 }, { context: old });
  frame.emit("pin-rects", { rects: [] }, { context: old });
  assert.deepEqual(heard.map(({ type, message }) => type === "press-drag" && message.type === "press-drag" ? message.phase : type), ["move", "text-edit", "move", "pin-rects"]);
  for (const { painted } of heard) assert.equal(painted, undefined);
  frame.emit("press-drag", { phase: "start", x: 1, y: 2, node: [0, 0], tag: "h1" });
  assert.deepEqual(heard.at(-1)?.painted, sources);
  // Stopped handlers hear nothing more.
  link.close();
  frame.emit("move", { direction: "up" });
  assert.equal(frame.listening(), false);
});

test("on returns the way to stop hearing", () => {
  const { frame, link } = setup();
  const seen: string[] = [];
  const stop = link.on("format", (message) => seen.push(message.format));
  frame.emit("format", { format: "em" });
  stop();
  frame.emit("format", { format: "strong" });
  assert.deepEqual(seen, ["em"]);
});

test("an inspection's answer survives a render requested meanwhile", async () => {
  const { frame, link, render } = setup();
  const answer = link.ask({ type: "inspect", request: { selector: "h1" } }, 8000);
  const asked = frame.last("inspect")!;
  render();
  link.stale("/");
  frame.emit("inspect-result", { id: asked.id, report: { count: 1 } }, { context: "1\n/" });
  assert.deepEqual((await answer)?.report, { count: 1 });
});

test("replies are matched by id and type", async () => {
  const { frame, link } = setup();
  const typing = link.ask({ type: "finish-typing" }, 1000);
  const patch = link.ask({ type: "patch-text", request: { path: "index.html", node: [0, 0] }, text: "Hey" }, 1000);
  const typingId = frame.last("finish-typing")!.id;
  const patchMessage = frame.last("patch-text")!;
  assert.ok("id" in patchMessage && typingId !== patchMessage.id);
  // Another request's id, then the right one.
  frame.emit("typing-finished", { id: patchMessage.id });
  frame.emit("patched", { id: patchMessage.id, ok: false });
  frame.emit("typing-finished", { id: typingId });
  assert.equal((await patch)?.ok, false);
  assert.equal((await typing)?.type, "typing-finished");
});

test("an ack after a newer render was asked for still reports the route drawn", () => {
  const { frame, link, render } = setup();
  const drawn: string[] = [];
  link.drawn((route) => drawn.push(route));
  render(sources, "/about/");
  const id = frame.last("update")!.id;
  link.stale("/about/");
  frame.emit("ack", { id }, { context: frame.context() });
  assert.deepEqual(drawn, ["/about/"]);
  // An older render's ack, after a newer one's: nothing more.
  frame.emit("ack", { id: id - 1 });
  frame.emit("ack", { id });
  assert.deepEqual(drawn, ["/about/"]);
});

test("a drop probe answered after a render was asked for gives undefined, as does one for another render", async () => {
  const { frame, link } = setup();
  const probe = link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000);
  const id = frame.last("drop-probe")!.id;
  link.stale("/");
  frame.emit("drop-containers", { id, path: "index.html", x: 1, y: 2, containers: [] });
  assert.equal(await probe, undefined);

  const other = link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000);
  frame.emit("drop-containers", { id: frame.last("drop-probe")!.id, path: "index.html", x: 1, y: 2, containers: [] }, { context: "0\n/" });
  assert.equal(await other, undefined);

  // A newer probe ends the one before; its answer comes back.
  const first = link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000);
  const second = link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000);
  assert.equal(await first, undefined);
  frame.emit("drop-containers", { id: frame.last("drop-probe")!.id, path: "index.html", x: 1, y: 2, containers: [] }, { context: link.context() });
  assert.equal((await second)?.report?.path, "index.html");

  // Cancelled (History shown): undefined at once.
  const cancelled = link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000);
  link.cancel("drop-probe");
  assert.equal(await cancelled, undefined);
});

test("each ask times out to undefined", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { link } = setup();
    const asks: [AskType, Promise<unknown>][] = [
      ["drop-probe", link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000)],
      ["finish-typing", link.ask({ type: "finish-typing" }, 1000)],
      ["patch-text", link.ask({ type: "patch-text", request: { path: "index.html", node: [0] }, text: "x" }, 1000)],
      ["inspect", link.ask({ type: "inspect", request: {} }, 8000)],
    ];
    const settled = new Set<AskType>();
    for (const [type, answer] of asks) void answer.then((value) => { assert.equal(value, undefined); settled.add(type); });
    mock.timers.tick(999);
    await Promise.resolve();
    assert.deepEqual([...settled], []);
    mock.timers.tick(1);
    await new Promise(setImmediate);
    assert.deepEqual([...settled].sort(), ["drop-probe", "finish-typing", "patch-text"]);
    mock.timers.tick(7000);
    await new Promise(setImmediate);
    assert.equal(settled.size, 4);
  } finally {
    mock.timers.reset();
  }
});

test("a late ready from the replaced document is ignored", () => {
  const { frame, link, heard, hear } = setup();
  hear("ready");
  frame.emit("ready", { load: "0" });
  assert.equal(link.reload(), 1);
  frame.emit("ready", { load: "0" });
  assert.equal(heard.length, 1);
  frame.emit("ready", { load: "1" });
  // A runtime that does not say its load is heard too.
  frame.emit("ready", {});
  assert.equal(heard.length, 3);
});

test("reload ends pending asks and forgets posted renders", async () => {
  const { frame, link } = setup();
  const drawn: string[] = [];
  link.drawn((route) => drawn.push(route));
  const answers = [
    link.ask({ type: "inspect", request: {} }, 8000),
    link.ask({ type: "finish-typing" }, 1000),
    link.ask({ type: "patch-text", request: { path: "index.html", node: [0] }, text: "x" }, 1000),
    link.ask({ type: "drop-probe", x: 1, y: 2, moving: undefined, bands: undefined }, 1000),
  ];
  const update = frame.last("update")!.id;
  const typing = frame.last("finish-typing")!.id;
  link.reload();
  assert.deepEqual(await Promise.all(answers), [undefined, undefined, undefined, undefined]);
  frame.emit("typing-finished", { id: typing });
  frame.emit("ack", { id: update });
  assert.deepEqual(drawn, []);
});

test("a ready forgets posted renders", () => {
  const { frame, link } = setup();
  const drawn: string[] = [];
  link.drawn((route) => drawn.push(route));
  const update = frame.last("update")!.id;
  frame.emit("ready", { load: "0" });
  frame.emit("ack", { id: update });
  assert.deepEqual(drawn, []);
});
