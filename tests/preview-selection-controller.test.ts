import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewSelectionController, type PreviewSelectionPorts } from "../src/controllers/preview-selection-controller.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { StartTag } from "../shared/html-source.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const PAGE = "index.html", CARD = "components/x-card.html", MASTER = ".editor/masters/hero.html";
const pageSource = "<!doctype html><html><body><x-card></x-card><p>Hi</p></body></html>";
const cardSource = "<h2>Card</h2>";

const pick = (over: Partial<NativePreviewSelection> = {}): NativePreviewSelection =>
  ({ path: PAGE, tag: "p", text: "Hi", reason: "click", selectors: [], node: [1], ...over });
const instanceClick = (over: Partial<NativePreviewSelection> = {}) => pick({
  path: CARD, tag: "h2", text: "Card", node: [0],
  host: { tag: "x-card", selector: "x-card", path: PAGE, node: [0] }, ...over,
});

function fixture() {
  const state = {
    generation: 1, scope: "s1", request: 0,
    sources: { [PAGE]: pageSource, [CARD]: cardSource } as Record<string, string>,
    components: { "x-card": CARD } as Record<string, string>,
    master: undefined as { session: string; masterPath: string } | undefined,
    mounted: new Set<string>(),
    editingScope: undefined as string | undefined,
  };
  const log: string[] = [];
  const timers: { callback: () => void; cleared: boolean }[] = [];
  const opens: { path: string; epoch: number; done: ReturnType<typeof deferred<void>> }[] = [];
  const store = {
    selection: { value: undefined as NativePreviewSelection | undefined },
    openFile: { value: undefined as string | undefined },
    snapshot: { value: {} as unknown },
  };
  const ports: PreviewSelectionPorts = {
    generation: () => state.generation,
    scope: () => state.scope,
    store,
    site: () => ({ routes: { "/": PAGE }, components: state.components }),
    sources: () => ({ ...state.sources }),
    effectiveSource: path => path === MASTER ? "<section>Hero</section>" : state.sources[path],
    editableSource: path => state.sources[path],
    masterEdit: () => state.master,
    preview: () => ({
      route: () => "/",
      selectNode: target => log.push(`selectNode ${target.path} ${target.node.join(".")}`),
      clearSelection: () => log.push("clearSelection"),
      hideEditBar: () => log.push("hideEditBar"),
    }),
    editor: () => ({
      isMounted: path => state.mounted.has(path),
      markElement: (path, tag, reveal) => log.push(`mark ${path} ${tag ? "tag" : "none"} ${reveal}`),
    }),
    componentTag: path => Object.keys(state.components).find(tag => state.components[tag] === path),
    editingScopePath: () => state.editingScope,
    instanceContent: () => false,
    locateTag: (source, node) => tagAt(source, node) ? ({ name: tagAt(source, node) } as unknown as StartTag) : undefined,
    tagName: tagAt,
    openFile: (path, epoch) => {
      const done = deferred<void>();
      opens.push({ path, epoch, done });
      log.push(`open ${path}`);
      return done.promise;
    },
    renderEditBar: selection => log.push(`editBar ${selection.path}`),
    linkStyles: (selection, reveal) => log.push(`styles ${selection.path} ${reveal}`),
    clearMoveAction: () => log.push("clearMove"),
    structureSelect: target => log.push(`structure ${target ? target.node.join(".") : "none"}`),
    hideComponentTools: () => log.push("hideTools"),
    agentContext: () => log.push("agent"),
    announce: message => log.push(`announce ${message}`),
    setTimer: (callback) => { const timer = { callback, cleared: false }; timers.push(timer); return timer; },
    clearTimer: timer => { (timer as { cleared: boolean }).cleared = true; },
    beginReveal: () => { log.push("beginReveal"); return ++state.request; },
    styleRequest: () => state.request,
    clearStyles: () => log.push("clearStyles"),
  };
  const controller = createPreviewSelectionController(ports);
  return { controller, state, log, store, opens, timers };
}
// Element names by source and node, standing in for the host's DOM parse.
function tagAt(source: string, node: readonly number[]) {
  const key = node.join(".");
  if (source === pageSource) return ({ "0": "x-card", "1": "p" } as Record<string, string>)[key];
  if (source === "<section>Hero</section>") return key === "0" ? "section" : undefined;
  return key === "0" ? "h2" : undefined;
}
const announced = (log: string[]) => log.filter(line => line.startsWith("announce "));

test("an open master refuses page selections and selections from another session", async () => {
  const f = fixture();
  f.state.master = { session: "m1", masterPath: MASTER };
  f.store.openFile.value = MASTER;
  f.store.selection.value = pick();
  await f.controller.select(pick());
  assert.deepEqual(announced(f.log), ["announce The page is read-only while its master is open. Choose Done to edit it."]);
  assert.equal(f.store.selection.value, undefined);
  assert.ok(f.log.includes("clearSelection") && f.log.includes("hideTools") && f.log.includes("structure none"));
  f.log.length = 0;
  f.state.master = undefined;
  await f.controller.select(pick({ path: MASTER, masterSession: "m1" }));
  assert.deepEqual(announced(f.log), ["announce That master is no longer open."]);
});

test("the open master's own copy in its session is selectable", async () => {
  const f = fixture();
  f.state.master = { session: "m1", masterPath: MASTER };
  f.store.openFile.value = MASTER;
  f.state.mounted.add(MASTER);
  const selection = pick({ path: MASTER, masterSession: "m1", node: [0], paintedSource: "<section>Hero</section>" });
  await f.controller.select(selection);
  assert.equal(f.store.selection.value, selection);
  assert.deepEqual(announced(f.log), []);
  assert.ok(f.log.includes(`editBar ${MASTER}`));
});

test("a selection painted from older source is refused; a refresh refusal is silent", async () => {
  const f = fixture();
  await f.controller.select(pick({ paintedSource: "old" }));
  assert.deepEqual(announced(f.log), ["announce The source changed. Wait for the preview before selecting this element."]);
  f.log.length = 0;
  await f.controller.select(pick({ paintedSource: "old", reason: "refresh" }));
  assert.deepEqual(announced(f.log), []);
  assert.ok(f.log.includes("clearSelection"));
});

test("an instance click redirects to its host and keeps the selection until the host arrives", async () => {
  const f = fixture();
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  const before = f.store.selection.value;
  const epoch = f.controller.selectionEpoch();
  await f.controller.select(instanceClick());
  assert.deepEqual(f.log, ["clearMove", `selectNode ${PAGE} 0`]);
  assert.equal(f.store.selection.value, before);
  assert.equal(f.controller.selectionEpoch(), epoch);
  // Unchanged snapshot: the host selection goes through.
  await f.controller.select(pick({ tag: "x-card", node: [0] }));
  assert.equal(f.store.selection.value?.node?.join("."), "0");
  assert.deepEqual(announced(f.log), []);
});

test("an instance whose sources changed before its host arrives is refused", async () => {
  const f = fixture();
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  await f.controller.select(instanceClick());
  f.state.sources[CARD] = "<h2>Other</h2>";
  await f.controller.select(pick({ tag: "x-card", node: [0] }));
  assert.deepEqual(announced(f.log), ["announce The instance changed before it could be selected. Select it again."]);
  assert.equal(f.store.selection.value, undefined);
  // The snapshot is used once.
  f.log.length = 0;
  await f.controller.select(pick({ tag: "x-card", node: [0] }));
  assert.deepEqual(announced(f.log), []);
});

test("an instance with a generation bump is refused", async () => {
  const f = fixture();
  await f.controller.select(instanceClick());
  f.state.generation++;
  await f.controller.select(pick({ tag: "x-card", node: [0] }));
  assert.deepEqual(announced(f.log), ["announce The instance changed before it could be selected. Select it again."]);
});

test("an unmapped template selection is refused", async () => {
  const f = fixture();
  await f.controller.select(instanceClick({ host: undefined }));
  assert.deepEqual(announced(f.log), ["announce Select the page instance, or choose Edit to edit its shared template."]);
});

test("a refresh marks and renders only when its file is open", async () => {
  const f = fixture();
  await f.controller.select(pick({ reason: "refresh" }));
  assert.ok(f.log.includes("hideEditBar"));
  assert.ok(!f.log.some(line => line.startsWith("editBar") || line === "agent" || line === "beginReveal"));
  f.log.length = 0;
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  await f.controller.select(pick({ reason: "refresh" }));
  assert.deepEqual(f.log, ["clearMove", "structure 1", `mark ${PAGE} tag false`, `editBar ${PAGE}`, `styles ${PAGE} false`]);
});

test("a reveal opens the file, then marks, renders and links styles", async () => {
  const f = fixture();
  f.store.openFile.value = "other.html";
  const done = f.controller.select(pick());
  await flush();
  assert.deepEqual(f.log, ["clearMove", "agent", "structure 1", "mark other.html none false", "beginReveal", `open ${PAGE}`]);
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  f.opens[0].done.resolve();
  await done;
  assert.deepEqual(f.log.slice(6), [`mark ${PAGE} tag true`, `editBar ${PAGE}`, `styles ${PAGE} true`]);
  // The mark consumed the pending click.
  f.log.length = 0;
  f.controller.replayPending(PAGE);
  assert.deepEqual(f.log, []);
});

test("a reveal stops when the style request or generation moves during the open", async () => {
  for (const bump of ["request", "generation"] as const) {
    const f = fixture();
    const done = f.controller.select(pick());
    await flush();
    f.store.openFile.value = PAGE;
    f.state.mounted.add(PAGE);
    if (bump === "request") f.state.request++; else f.state.generation++;
    f.opens[0].done.resolve();
    await done;
    assert.ok(!f.log.some(line => line.startsWith("editBar") || line.startsWith("mark ")), bump);
  }
});

test("clearing the selection hides the bar and clears the linked styles", async () => {
  const f = fixture();
  f.store.selection.value = pick();
  await f.controller.select({ path: "", tag: "", text: "", reason: "click", selectors: [] });
  assert.equal(f.store.selection.value, undefined);
  assert.deepEqual(f.log, ["clearMove", "agent", "structure none", "clearMove", "hideEditBar", "hideTools", "beginReveal", "clearStyles"]);
});

test("a pending click replays once mounted in the same generation, not a stale one", async () => {
  for (const stale of [false, true]) {
    const f = fixture();
    void f.controller.select(pick());
    await flush();
    f.store.openFile.value = PAGE;
    f.controller.replayPending(PAGE);
    assert.equal(f.log.filter(line => line === "beginReveal").length, 1, "not mounted yet");
    f.state.mounted.add(PAGE);
    if (stale) f.state.generation++;
    f.controller.replayPending(PAGE);
    await flush();
    assert.equal(f.log.filter(line => line === "beginReveal").length, stale ? 1 : 2);
    // Cleared first: a second replay does nothing.
    f.controller.replayPending(PAGE);
    await flush();
    assert.equal(f.log.filter(line => line === "beginReveal").length, stale ? 1 : 2);
  }
});

test("source intent names the template while its file is open and expires otherwise", () => {
  const f = fixture();
  f.state.editingScope = "fallback.html";
  f.controller.recordIntent(PAGE);
  assert.equal(f.controller.editableTemplatePath(), "fallback.html", "not a component");
  f.controller.recordIntent(CARD);
  assert.equal(f.controller.editableTemplatePath(), "fallback.html", "not open");
  f.store.openFile.value = CARD;
  f.state.mounted.add(CARD);
  assert.equal(f.controller.editableTemplatePath(), CARD);
  f.state.scope = "s2";
  assert.equal(f.controller.editableTemplatePath(), "fallback.html", "other scope");
  f.state.scope = "s1";
  f.state.generation++;
  assert.equal(f.controller.editableTemplatePath(), "fallback.html", "other generation");
});

test("a page click clears the source intent", async () => {
  const f = fixture();
  f.controller.recordIntent(CARD);
  f.store.openFile.value = CARD;
  f.state.mounted.add(CARD);
  void f.controller.select(pick());
  await flush();
  assert.equal(f.controller.editableTemplatePath(), undefined);
});

test("waitFor resolves with the matching selection after the store is written, or times out", async () => {
  const f = fixture();
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  const waited = f.controller.waitFor(PAGE, [1], 5000);
  let seen: NativePreviewSelection | undefined;
  void waited.then(selection => { seen = selection; });
  await f.controller.select(pick({ node: [0], tag: "x-card" }));
  await flush();
  assert.equal(seen, undefined);
  const selection = pick();
  await f.controller.select(selection);
  assert.equal(await waited, selection);
  assert.equal(f.store.selection.value, selection);
  assert.equal(f.timers[0].cleared, true);
  const late = f.controller.waitFor(PAGE, [9], 5000);
  f.timers[1].callback();
  assert.equal(await late, undefined);
});

test("the selection counter moves only when the path or node changes", async () => {
  const f = fixture();
  f.store.openFile.value = PAGE;
  f.state.mounted.add(PAGE);
  await f.controller.select(pick());
  assert.equal(f.controller.selectionEpoch(), 1);
  await f.controller.select(pick({ reason: "refresh" }));
  assert.equal(f.controller.selectionEpoch(), 1);
  await f.controller.select(pick({ node: [0], tag: "x-card" }));
  assert.equal(f.controller.selectionEpoch(), 2);
});

test("text and grid reports re-render the bar only when they change", () => {
  const f = fixture();
  const handlers = f.controller.handlers();
  f.store.selection.value = pick();
  const text = { start: 0, end: 2, text: "Hi", wrappers: [] };
  handlers.onTextSelection(text);
  handlers.onTextSelection({ ...text });
  assert.deepEqual(f.controller.textSelection(), { ...text, path: PAGE, node: [1] });
  const grid = { selected: { path: PAGE, parent: [0], index: 0, row: 0 } } as unknown as Parameters<typeof handlers.onItemGrids>[0];
  handlers.onItemGrids(grid);
  handlers.onItemGrids(grid);
  assert.deepEqual(f.log, [`editBar ${PAGE}`, `editBar ${PAGE}`]);
});
