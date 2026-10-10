import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FRAME_SOURCE, FRESHNESS, readFrameMessage, type FrameMessage } from "../src/components/preview-protocol";

const context = "1\n/\n\nindex.html:10:60:62";
const rect = { top: 1, left: 2, width: 3, height: 4, bottom: 5, right: 6 };
const long = (length: number) => "x".repeat(length);
const steps = (length: number) => Array.from({ length }, () => 0);
const file = new File(["png"], "a.png", { type: "image/png" });
const host = { tag: "card-item", selector: "card-item:nth-of-type(1)", path: "components/card-item.html", node: [0, 1], rect };
const grid = { path: "index.html", parent: [0], index: 1, position: 1, count: 3, row: true, beside: false, ghost: { top: 1, left: 2, width: 3, height: 4 } };

type Case = {
  /** Fields after `source`, `type` and `context`. */
  valid: Record<string, unknown>;
  /** What it reads as, when not the fields themselves. */
  read?: Record<string, unknown>;
  /** Field overrides that make the whole message unreadable. */
  malformed: Record<string, unknown>[];
};

// One valid message per frame type, as the runtime posts it, and malformed ones.
const cases: Record<FrameMessage["type"], Case> = {
  "typing-finished": { valid: { id: 3 }, malformed: [{ id: "3" }, { id: undefined }] },
  "image-drop": {
    valid: { path: "index.html", node: [0, 2], width: 640, files: [file] },
    malformed: [{ path: 1 }, { node: [] }, { node: [0, -1] }, { node: [0.5] }, { files: ["a.png"] }, { files: undefined }],
  },
  "image-edit": {
    valid: { path: "index.html", node: [0, 2], width: 640 },
    malformed: [{ path: undefined }, { node: [] }, { node: steps(501) }, { node: "0,2" }],
  },
  patched: { valid: { id: 4, ok: true }, malformed: [{ id: "4" }] },
  "text-edit": {
    valid: { path: "index.html", node: [0, 1], before: "Hi", after: "Hello" },
    malformed: [{ path: 2 }, { before: undefined }, { after: 5 }, { after: long(100_001) }, { node: steps(501) }, { node: [-1] }],
  },
  route: { valid: { href: "/about.html" }, malformed: [{ href: undefined }] },
  format: { valid: { format: "em" }, malformed: [{ format: "u" }] },
  move: { valid: { direction: "out" }, malformed: [{ direction: "left" }] },
  "press-drag": {
    valid: { phase: "start", x: 10, y: 20, alt: true, node: [0, 1], tag: "section", cls: "hero", band: true, template: false },
    malformed: [{ phase: "drop" }, { phase: undefined }],
  },
  "canvas-clear": { valid: {}, malformed: [] },
  "pin-rects": {
    valid: { rects: [{ id: "a", rect }, { id: "b", rect: { top: 1 } }, { rect }] },
    read: { rects: [{ id: "a", rect }, { id: "b", rect: null }] },
    malformed: [{ rects: { id: "a" } }],
  },
  "drop-containers": {
    valid: { id: 2, path: "index.html", x: 5, y: 6, containers: [] },
    read: { id: 2, report: { id: 2, path: "index.html", x: 5, y: 6, containers: [] } },
    malformed: [],
  },
  "dismiss-context-menu": { valid: {}, malformed: [] },
  "slot-ghosts": { valid: { report: { tag: "x-card" } }, malformed: [] },
  "inspect-result": { valid: { id: 7, report: { found: 1 } }, malformed: [] },
  ack: { valid: { id: 9 }, malformed: [] },
  ready: { valid: { load: "2" }, malformed: [{ load: 2 }] },
  error: { valid: { message: "Bad define" }, malformed: [{ message: undefined }] },
  "clear-error": { valid: {}, malformed: [] },
  "insert-points": {
    valid: {
      path: "index.html",
      points: [
        { parent: [0], index: 1, top: 10, left: 0, width: 300, before: long(70), tag: long(120), empty: true, height: 40 },
        { parent: [0], index: -1, top: 10, left: 0, width: 300 },
        { parent: [0], index: 2, top: Infinity, left: 0, width: 300 },
      ],
    },
    read: {
      path: "index.html",
      points: [{ path: "index.html", parent: [0], index: 1, top: 10, left: 0, width: 300, before: long(60), tag: long(100), empty: true, height: 40 }],
    },
    malformed: [{ path: undefined }, { points: {} }],
  },
  "section-hover": { valid: { item: { parent: [0, 1], index: 2 } }, malformed: [] },
  "text-selection": {
    valid: { selection: { start: 1, end: 4, text: "abc", wrappers: ["em", 3, "strong"] } },
    read: { selection: { start: 1, end: 4, text: "abc", wrappers: ["em", "strong"] } },
    malformed: [],
  },
  "item-grids": {
    valid: { hover: grid, selected: { ...grid, slot: "", index: -1, position: -1, count: 0 }, tracking: 5 },
    read: { hover: grid, selected: { ...grid, slot: "", index: -1, position: -1, count: 0 }, tracking: 5 },
    malformed: [],
  },
  structure: {
    valid: { path: "index.html", items: [{ tag: "main", node: [0], className: "page", text: long(90), heading: "Hi", children: [{ tag: "h1", node: [0, 0] }] }] },
    read: {
      path: "index.html",
      items: [{
        tag: "main", node: [0], className: "page", text: long(80), heading: "Hi", slot: "",
        children: [{ tag: "h1", node: [0, 0], className: "", text: "", heading: "", slot: "", children: [] }],
      }],
    },
    malformed: [{ path: 3 }],
  },
  "selection-rect": { valid: { rect }, malformed: [{ rect: { ...rect, top: NaN } }, { rect: undefined }] },
  select: {
    valid: {
      path: "index.html", tag: "h1", text: "Hi", reason: "click", node: [0, 0], pageNode: [0], link: "/a.html", rect,
      selector: long(2100), host, hostChain: [host], crumbs: [], menu: { x: 4, y: 5 },
      selectors: [{ path: "styles.css", selector: "h1" }], cascade: undefined,
    },
    read: {
      path: "index.html", tag: "h1", text: "Hi", reason: "click", node: [0, 0], pageNode: [0], link: "/a.html", rect,
      selector: long(2000), host, hostChain: [host], crumbs: [], menu: { x: 4, y: 5 },
      selectors: [{ path: "styles.css", selector: "h1" }], cascade: undefined,
    },
    malformed: [],
  },
  "default-styles": {
    valid: { selectors: [{ path: "styles.css", selector: "p" }, { selector: "p" }] },
    read: { selectors: [{ path: "styles.css", selector: "p" }], cascade: undefined },
    malformed: [],
  },
  "component-styles": { valid: { tags: ["x-card", 3] }, read: { tags: ["x-card"] }, malformed: [] },
  shortcut: { valid: { name: "palette" }, malformed: [{ name: 1 }] },
  "refusal-note-action": { valid: {}, malformed: [] },
};

const message = (type: string, fields: Record<string, unknown>) => ({ source: FRAME_SOURCE, type, context, ...fields });

test("every frame type reads a valid message into its typed shape", () => {
  for (const [type, { valid, read }] of Object.entries(cases)) {
    const expected = { source: FRAME_SOURCE, type, context, ...(read ?? valid) };
    const got = readFrameMessage(message(type, valid));
    // Fields the message type declares but the case left out read as undefined.
    assert.deepEqual(Object.fromEntries(Object.entries(got ?? {}).filter(([, value]) => value !== undefined)),
      Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined)), type);
  }
});

test("a malformed message, or one not from the runtime, reads as nothing", () => {
  for (const [type, { valid, malformed }] of Object.entries(cases)) {
    for (const override of malformed) assert.equal(readFrameMessage(message(type, { ...valid, ...override })), undefined, `${type} ${JSON.stringify(override)}`);
    assert.equal(readFrameMessage({ ...message(type, valid), source: undefined }), undefined, `${type} without source`);
    assert.equal(readFrameMessage({ ...message(type, valid), source: "astro-native-preview-host" }), undefined, `${type} from the host`);
  }
  assert.equal(readFrameMessage(message("canvas-spacing", {})), undefined);
  assert.equal(readFrameMessage(undefined), undefined);
  assert.equal(readFrameMessage("astro-native-preview"), undefined);
});

test("fields a receiver acts without read as undefined or their default", () => {
  const select = readFrameMessage(message("select", { path: 3, reason: "hover", node: steps(501), rect: { top: 1 }, menu: { x: "4", y: 5 }, hostChain: [] }));
  assert.ok(select?.type === "select");
  assert.equal(select.path, undefined);
  assert.equal(select.reason, undefined);
  assert.equal(select.node, undefined);
  assert.equal(select.rect, undefined);
  assert.equal(select.menu, undefined);
  assert.equal(select.hostChain, undefined);
  assert.equal(select.text, "");
  assert.deepEqual(select.selectors, []);
  // A stale click still counts as a click whatever else it carries.
  assert.equal(readFrameMessage(message("select", { reason: "click", context: 5 }))?.type, "select");

  const press = readFrameMessage(message("press-drag", { phase: "start", node: "0", tag: 3, x: "a" }));
  assert.ok(press?.type === "press-drag");
  assert.deepEqual([press.node, press.tag, press.cls, press.alt, press.band, press.template, Number.isNaN(press.x)], [undefined, undefined, "", false, false, false, true]);

  const grids = readFrameMessage(message("item-grids", { hover: { ...grid, index: -1 }, selected: { ...grid, ghost: undefined }, tracking: 0 }));
  assert.deepEqual(grids && { ...grids, source: undefined }, { source: undefined, type: "item-grids", context, hover: null, selected: null, tracking: undefined });

  assert.deepEqual(readFrameMessage(message("section-hover", { item: { parent: [0], index: -1 } })), { source: FRAME_SOURCE, type: "section-hover", context, item: undefined });
  assert.deepEqual(readFrameMessage(message("text-selection", { selection: { start: 4, end: 1, text: "abc" } })), { source: FRAME_SOURCE, type: "text-selection", context, selection: undefined });
  assert.deepEqual(readFrameMessage(message("text-selection", { selection: { start: 2, end: 2, text: "", caret: true } })),
    { source: FRAME_SOURCE, type: "text-selection", context, selection: { start: 2, end: 2, text: "", wrappers: [], caret: true } });
  assert.deepEqual(readFrameMessage(message("text-selection", { selection: { start: 0, end: 1, text: long(100_001) } })),
    { source: FRAME_SOURCE, type: "text-selection", context, selection: undefined });
  assert.deepEqual(readFrameMessage(message("patched", { id: 1 })), { source: FRAME_SOURCE, type: "patched", context, id: 1, ok: false });
  assert.deepEqual(readFrameMessage(message("ack", { id: "4" })), { source: FRAME_SOURCE, type: "ack", context, id: 4 });
  assert.deepEqual(readFrameMessage(message("ready", { load: undefined, context: undefined })), { source: FRAME_SOURCE, type: "ready", context: undefined, load: undefined });
  const drop = readFrameMessage(message("drop-containers", { id: "2", path: 1, x: 5, y: 6, containers: [] }));
  assert.deepEqual(drop, { source: FRAME_SOURCE, type: "drop-containers", context, id: undefined, report: undefined });
  const images = readFrameMessage(message("image-edit", { path: "index.html", node: [1], width: "640" }));
  assert.equal(images?.type === "image-edit" && images.width, undefined);
});

test("the reader keeps today's limits", () => {
  const pins = readFrameMessage(message("pin-rects", { rects: Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, rect })) }));
  assert.equal(pins?.type === "pin-rects" && pins.rects.length, 200);
  const points = readFrameMessage(message("insert-points", { path: "index.html", points: Array.from({ length: 600 }, (_, index) => ({ parent: [], index, top: 0, left: 0, width: 1 })) }));
  assert.equal(points?.type === "insert-points" && points.points.length, 500);
  // 2000 structure rows in all, 12 levels deep.
  const rows = readFrameMessage(message("structure", { path: "", items: Array.from({ length: 2100 }, (_, i) => ({ tag: "p", node: [i] })) }));
  assert.equal(rows?.type === "structure" && rows.items.length, 2000);
  // Children count toward the 2000 too.
  const tree = readFrameMessage(message("structure", { path: "", items: Array.from({ length: 1500 }, (_, i) => ({ tag: "ul", node: [i], children: [{ tag: "li", node: [i, 0] }] })) }));
  const total = (items: { children: unknown[] }[]): number => items.reduce((sum, item) => sum + 1 + total(item.children as { children: unknown[] }[]), 0);
  assert.equal(tree?.type === "structure" && total(tree.items), 2000);
  const wrapped = readFrameMessage(message("text-selection", { selection: { start: 0, end: 1, text: "a", wrappers: Array.from({ length: 60 }, () => "em") } }));
  assert.equal(wrapped?.type === "text-selection" && wrapped.selection?.wrappers.length, 50);
  let deep: Record<string, unknown> = { tag: "div", node: [0] };
  for (let i = 0; i < 20; i++) deep = { tag: "div", node: [0], children: [deep] };
  const nested = readFrameMessage(message("structure", { path: "", items: [deep] }));
  let depth = 0;
  for (let items = nested?.type === "structure" ? nested.items : []; items.length; items = items[0].children) depth++;
  assert.equal(depth, 13);
  const chain = readFrameMessage(message("select", { hostChain: Array.from({ length: 17 }, () => host) }));
  assert.equal(chain?.type === "select" && chain.hostChain, undefined);
  const named = readFrameMessage(message("select", { host: { ...host, tag: long(120), path: 3 } }));
  assert.deepEqual(named?.type === "select" && named.host, { tag: long(100), selector: host.selector });
  // Image drops and section hovers never had a step limit.
  assert.equal(readFrameMessage(message("image-drop", { path: "a.html", node: steps(600), files: [] }))?.type, "image-drop");
  assert.equal(readFrameMessage(message("section-hover", { item: { parent: steps(600), index: 0 } }))?.type === "section-hover", true);
});

test("freshness: a press drag's start is a render, its later steps actions", () => {
  assert.deepEqual(FRESHNESS["press-drag"], { start: "render", move: "action", end: "action", cancel: "action" });
  assert.equal(FRESHNESS["inspect-result"], "reply");
  assert.equal(FRESHNESS.ack, "reply");
  assert.equal(FRESHNESS["pin-rects"], "whole");
  assert.equal(FRESHNESS.ready, "lifecycle");
  assert.equal(Object.keys(FRESHNESS).length, Object.keys(cases).length);
});
