import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistoryController, type HistoryContext, type HistoryPorts } from "../src/controllers/history-controller.ts";
import type { createCommitHistory } from "../src/components/commit-history.ts";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture(empty = false) {
  let revision = 1, opened = false, destroyed = 0, mounted = 0, unsubscribed = 0, restored = 0, viewed = 0, files = 0;
  let resize: (() => void) | undefined;
  const style: Record<string, string> = {};
  const panel = { style, matches: () => opened, hidePopover: () => { opened = false; }, showPopover: () => { opened = true; }, replaceChildren: () => { mounted++; }, getBoundingClientRect: () => ({ width: 300 }) } as unknown as HTMLElement;
  const anchor = { getBoundingClientRect: () => ({ bottom: 40, right: 700 }) } as HTMLElement;
  const options: Parameters<typeof createCommitHistory>[0][] = [];
  const loads: ReturnType<typeof deferred<Awaited<ReturnType<HistoryPorts["loadHistory"]>>>>[] = [];
  const module = { createCommitHistory: (value: Parameters<typeof createCommitHistory>[0]) => { options.push(value); return { root: {} as HTMLElement, destroy: () => { destroyed++; }, mark: () => {}, refresh: () => {} }; } } as unknown as Awaited<ReturnType<HistoryPorts["loadHistory"]>>;
  const controller = createHistoryController({
    capture: () => { const own = revision; return { key: `${own}`, repo: "lex/site", branch: "main", path: "index.html", empty, isCurrent: () => own === revision, hasDraft: () => true, viewing: () => "commit" } satisfies HistoryContext; },
    panel: () => panel, anchor: () => anchor, loadHistory: () => { const load = deferred<typeof module>(); loads.push(load); return load.promise; },
    emptyMessage: () => ({} as HTMLElement), viewport: () => ({ width: 800, height: 600 }),
    onResize: callback => { resize = callback; return () => { resize = undefined; unsubscribed++; }; },
    openFile: () => { files++; }, view: () => { viewed++; }, restored: async () => { restored++; }, expired: () => {}, onError: error => { throw error; },
  });
  return { controller, loads, options, style, load: (index = 0) => loads[index].resolve(module), change: () => { revision++; }, resize: () => resize?.(), counters: () => ({ opened, destroyed, mounted, unsubscribed, restored, viewed, files }) };
}

test("same-target loads deduplicate and preserve bounded placement and resize teardown", async () => {
  const f = fixture(), first = f.controller.open(); assert.equal(f.controller.open(), first);
  f.load(); await first;
  assert.equal(f.options.length, 1); assert.equal(f.counters().opened, true);
  assert.equal(f.style.top, "46px"); assert.equal(f.style.right, "100px");
  f.resize(); f.controller.destroy();
  assert.equal(f.counters().destroyed, 1); assert.equal(f.counters().unsubscribed, 1); assert.equal(f.counters().opened, false);
});

test("destroy refuses a late mount and an old finalizer cannot clear a restarted load", async () => {
  const f = fixture(), first = f.controller.open(); f.controller.destroy();
  const second = f.controller.open(); f.load(); await first;
  assert.equal(f.options.length, 0); assert.equal(f.controller.open(), second);
  f.load(1); await second; assert.equal(f.options.length, 1); f.controller.destroy();
});

test("navigation during loading refuses the captured target", async () => {
  const f = fixture(), first = f.controller.open(); f.change(); f.load(); await first;
  assert.equal(f.options.length, 0); assert.equal(f.counters().mounted, 0);
});

test("empty repository mounts its message without creating request UI", async () => {
  const f = fixture(true), first = f.controller.open(); f.load(); await first;
  assert.equal(f.options.length, 0); assert.equal(f.counters().mounted, 1); assert.equal(f.counters().opened, true);
  f.controller.destroy();
});

test("stale request callbacks cannot view, open, restore or switch scope", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const options = f.options[0]; f.change();
  assert.equal(options.isCurrent(), false); assert.equal(options.hasDraft(), false); assert.equal(options.viewing(), undefined);
  options.onView({} as never, "head", false); options.onOpenFile("file.html", {} as never, "head");
  await options.onRestored({} as never); options.onScope("site");
  assert.equal(f.counters().viewed, 0); assert.equal(f.counters().files, 0); assert.equal(f.counters().restored, 0); assert.equal(f.loads.length, 1);
  f.controller.destroy();
});

test("scope switch rebuilds once and rejects the previous instance callbacks", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const previous = f.options[0]; previous.onScope("site");
  f.load(1); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.options[1].scope, "site"); assert.equal(f.counters().destroyed, 1); assert.equal(previous.isCurrent(), false);
  previous.onView({} as never, "head", false); assert.equal(f.counters().viewed, 0);
  f.controller.destroy();
});
