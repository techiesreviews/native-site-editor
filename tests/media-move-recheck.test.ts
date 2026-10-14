import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaMoveEdits, recheckMove, type MoveRecheckPorts } from "../src/page-builder/media-move-recheck";
import { createDraftStore } from "../src/draft-store";
import type { MediaMeasured } from "../src/page-builder/media-markup";

const source = '<main><section><img sizes="auto, 100vw" loading="lazy" src="new.jpg"></section><section><img sizes="100vw" fetchpriority="high" src="old.jpg"></section><img loading="lazy" src="hand.jpg"></main>';
const measured: MediaMeasured = { sizes: "90vw", firstScreen: true, large: true, images: [
  { node: [0, 0, 0], firstScreen: true, large: true },
  { node: [0, 1, 0], firstScreen: false, large: false },
  { node: [0, 2], firstScreen: false, large: false },
] };
function rewrite(text: string, edits: ReturnType<typeof mediaMoveEdits>) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

test("moved lazy image becomes eager with new sizes; former holder becomes lazy; hand-written kept", () => {
  const result = rewrite(source, mediaMoveEdits(source, measured, [{ node: [0, 0, 0], sizes: "90vw" }]));
  assert.match(result, /<img fetchpriority="high" sizes="90vw" src="new.jpg">/);
  assert.match(result, /<img loading="lazy" sizes="auto, 100vw" src="old.jpg">/);
  assert.match(result, /<img loading="lazy" src="hand.jpg">/);
  assert.equal(mediaMoveEdits(result, measured, [{ node: [0, 0, 0], sizes: "90vw" }]).length, 0);
});

test("moving below the fold adds auto; a hand-written holder becomes eager without sizes", () => {
  const report = { ...measured, images: measured.images.map((image, i) => ({ ...image, firstScreen: i === 2, large: i === 2 })) };
  const result = rewrite(source, mediaMoveEdits(source, report, [{ node: [0, 1, 0], sizes: "80vw" }]));
  assert.match(result, /sizes="auto, 80vw"/);
  assert.match(result, /<img fetchpriority="high" src="hand.jpg">/);
});

function setup() {
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" }, path = "index.html", tag = "move:1";
  const store = createDraftStore();
  const before = source.replace("new.jpg", "before.jpg");
  store.open(scope, path, { text: before, baseSha: "a".repeat(40) });
  store.edit({ scope, path, history: "h", text: source, group: tag });
  let changed = false, closed = 0;
  const stop = store.subscribe(event => { if (event.type === "text" || event.type === "history") changed = true; });
  const ports = {
    current: () => !changed && store.text(scope, path) === source && store.hasOpenGroup("h", tag),
    painted: () => source,
    measure: async () => measured,
    close: () => { stop(); store.closeGroup("h"); closed++; },
    edits: { now: (plan, options) => {
      const planned = plan({ source: () => store.text(scope, path), exists: () => true, template: () => undefined, site: () => undefined });
      if (!options?.guard?.() || !("done" in planned)) return { ok: false, reason: "refused", message: "stale" };
      const edits = planned.edits?.get(path);
      assert.ok(edits && typeof edits !== "string");
      store.edit({ scope, path, history: "h", changes: edits, group: options.group });
      return { ok: true, status: "applied" };
    } },
  } satisfies MoveRecheckPorts;
  return { scope, path, tag, store, before, ports, closed: () => closed };
}

test("re-check joins the move: one Undo and Redo restore both; group closes", async () => {
  const f = setup();
  await recheckMove(f.ports, f.path, source, [0, 0], f.tag);
  const after = f.store.text(f.scope, f.path);
  assert.notEqual(after, source);
  assert.equal(f.closed(), 1);
  assert.equal(f.store.hasOpenGroup("h"), false);
  await f.store.undo("h");
  assert.equal(f.store.text(f.scope, f.path), f.before);
  await f.store.redo("h");
  assert.equal(f.store.text(f.scope, f.path), after);
});

for (const action of ["edit", "undo", "failure", "route", "render"] as const) test(`re-check skips ${action} during measurement and closes its group`, async () => {
  const f = setup();
  let release!: (value: MediaMeasured) => void, fail!: (error: Error) => void;
  f.ports.measure = () => new Promise((resolve, reject) => { release = resolve; fail = reject; });
  const pending = recheckMove(f.ports, f.path, source, [0, 0], f.tag);
  if (action === "edit") f.store.edit({ scope: f.scope, path: f.path, history: "h", text: source + "!", group: true });
  if (action === "undo") await f.store.undo("h");
  if (action === "route") f.ports.current = () => false;
  if (action === "render") f.ports.painted = () => "other bytes";
  if (action === "failure") {
    fail(new Error("measurement failed"));
  } else release(measured);
  const before = f.store.text(f.scope, f.path);
  await pending;
  assert.equal(f.store.text(f.scope, f.path), before);
  assert.equal(f.closed(), 1);
  assert.equal(f.store.hasOpenGroup("h"), false);
});

test("timeout closes the group and a late measurement cannot write", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const f = setup();
  let release!: (value: MediaMeasured) => void;
  f.ports.measure = () => new Promise(resolve => { release = resolve; });
  const pending = recheckMove(f.ports, f.path, source, [0, 0], f.tag);
  context.mock.timers.tick(10000);
  await pending;
  assert.equal(f.closed(), 1);
  assert.equal(f.store.hasOpenGroup("h"), false);
  release(measured);
  await Promise.resolve();
  assert.equal(f.store.text(f.scope, f.path), source);
});
