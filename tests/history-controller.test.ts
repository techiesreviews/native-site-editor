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
  let path = "index.html", draft = false;
  let revision = 1, opened = false, destroyed = 0, mounted = 0, unsubscribed = 0, restored = 0, viewed = 0, files = 0;
  let resize: (() => void) | undefined;
  const style: Record<string, string> = {};
  const panel = { style, matches: () => opened, hidePopover: () => { opened = false; }, showPopover: () => { opened = true; }, replaceChildren: () => { mounted++; }, getBoundingClientRect: () => ({ width: 300 }) } as unknown as HTMLElement;
  let anchor = { getBoundingClientRect: () => ({ bottom: 40, right: 700 }) } as HTMLElement;
  const options: Parameters<typeof createCommitHistory>[0][] = [];
  const loads: ReturnType<typeof deferred<Awaited<ReturnType<HistoryPorts["loadHistory"]>>>>[] = [];
  const module = { createCommitHistory: (value: Parameters<typeof createCommitHistory>[0]) => { options.push(value); return { root: {} as HTMLElement, destroy: () => { destroyed++; }, mark: () => {}, refresh: () => {} }; } } as unknown as Awaited<ReturnType<HistoryPorts["loadHistory"]>>;
  const controller = createHistoryController({
    capture: () => { const own = revision, file = path; return { key: `${own}`, repo: "lex/site", branch: "main", path: file, empty, isCurrent: site => own === revision && (site || file === path), hasDraft: () => draft, viewing: () => "commit" } satisfies HistoryContext; },
    panel: () => panel, anchor: () => anchor, loadHistory: () => { const load = deferred<typeof module>(); loads.push(load); return load.promise; },
    emptyMessage: () => ({} as HTMLElement), viewport: () => ({ width: 800, height: 600 }),
    onResize: callback => { resize = callback; return () => { resize = undefined; unsubscribed++; }; },
    openFile: () => { files++; }, view: () => { viewed++; }, restored: async () => { restored++; }, expired: () => {}, onError: error => { throw error; },
  });
  return { controller, loads, options, style, load: (index = 0) => loads[index].resolve(module), change: () => { revision++; }, replaceAnchor: () => { anchor = { getBoundingClientRect: () => ({ bottom: 80, right: 600 }) } as HTMLElement; }, navigate: () => { path = "other.html"; }, edit: () => { draft = true; }, resize: () => resize?.(), counters: () => ({ opened, destroyed, mounted, unsubscribed, restored, viewed, files }) };
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


test("site History survives toolbar replacement and cross-file navigation", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  f.options[0].onScope("site"); f.load(1); await new Promise<void>(resolve => setImmediate(resolve));
  const site = f.options[1]; site.onOpenFile("other.html", {} as never, "head");
  f.navigate(); f.replaceAnchor();
  assert.equal(site.isCurrent(), true);
  site.onOpenFile("third.html", {} as never, "head");
  assert.equal(f.counters().files, 2);
  f.controller.position(); assert.equal(f.style.top, "86px");
  f.change(); assert.equal(site.isCurrent(), false);
});

test("file History survives a toolbar remount but refuses another file", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  f.replaceAnchor(); assert.equal(f.options[0].isCurrent(), true);
  f.navigate(); assert.equal(f.options[0].isCurrent(), false);
});

test("closing hides presentation while accepted restore retains file completion ownership", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const options = f.options[0];
  const toggle = f.controller.open(); f.load(1); await toggle;
  assert.equal(options.isCurrent(), false);
  assert.equal(options.isRestoreCurrent?.(), true);
  await options.onRestored({} as never); assert.equal(f.counters().restored, 1);
  assert.equal(f.counters().opened, false);
  f.navigate(); assert.equal(options.isRestoreCurrent?.(), false);
  await options.onRestored({} as never); assert.equal(f.counters().restored, 1);
});

test("disposed or replaced workspace refuses accepted restore completion", async () => {
  for (const invalidate of ["destroy", "workspace"] as const) {
    const f = fixture(), first = f.controller.open(); f.load(); await first;
    const options = f.options[0];
    if (invalidate === "destroy") f.controller.destroy(); else f.change();
    assert.equal(options.isRestoreCurrent?.(), false);
    await options.onRestored({} as never); assert.equal(f.counters().restored, 0);
  }
});


test("a draft made while a restore waits refuses completion on that source", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const options = f.options[0]; f.controller.close(); f.edit();
  assert.equal(options.isRestoreCurrent?.(), false);
  await options.onRestored({} as never); assert.equal(f.counters().restored, 0);
});

test("reopening History does not revive callbacks from the closed presentation", async () => {
  const f = fixture(), first = f.controller.open(); f.load(); await first;
  const previous = f.options[0]; f.controller.close();
  const next = f.controller.open(); f.load(1); await next;
  assert.equal(previous.isCurrent(), false); assert.equal(previous.isRestoreCurrent?.(), false);
  assert.equal(f.options[1].isCurrent(), true);
});
