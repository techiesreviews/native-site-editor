import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageStructureController, type PageStructurePorts } from "../src/controllers/page-structure-controller.ts";
import { createGuardedEdits } from "../src/guarded-edit.ts";
import { textRangeInSource } from "../shared/html-source.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";

const PAGE = "index.html";
const SOURCE = "<main><section>A</section><section>B</section></main>";
const BAND = "components/x-band.html";
const MOVE_STALE = "The source or selection changed. Select the section again before moving it.";
const OPEN_STALE = "The source changed while its editor opened. Select the section again before moving it.";

// The i-th element of <main> in these flat fixtures (the real locator needs a browser's parser).
function locateNativeElementRange(html: string, node: number[]) {
  const found = [...html.matchAll(/<(section|x-band)\b[^>]*>(.*?)<\/\1>/g)][node[1]];
  if (!found) return undefined;
  const start = found.index, end = start + found[0].length, closeStart = end - found[1].length - 3;
  return { start, end, tag: { name: found[1], start, end: start + found[0].indexOf(">") + 1 }, close: { start: closeStart, end } };
}

// The controller on the memory workspace and the real guarded edit module.
function fixture(init: { page?: string; open?: string; band?: string } = {}) {
  const mem = createMemoryWorkspace({
    branch: { [PAGE]: init.page ?? SOURCE, [BAND]: init.band ?? "<section>Band</section>", "styles/site.css": "body{}" },
    open: init.open ?? PAGE,
    site: { routes: { "/": PAGE }, components: { "x-band": BAND } } as never,
  });
  const edits = createGuardedEdits(mem.workspace);
  const state = { selected: { path: PAGE, node: [0, 0] } as { path: string; node: number[] } | undefined };
  const notices: string[] = [], errors: string[] = [];
  let previewUpdates = 0, refreshes = 0;
  const ports = {
    edits,
    appStore: { openFile: { get value() { return mem.openFile(); } }, selection: { get value() { return state.selected; } } },
    editorModule: { isMounted: (path: string) => mem.model(path) !== undefined, captureFileModelState: () => ({ isCurrent: () => true }), forgetDraftModel: () => false },
    nativePreview: { route: () => "/", refresh: () => { refreshes++; } },
    nativeSite: { routes: { "/": PAGE }, components: { "x-band": BAND } },
    nativeEditableTemplatePath: () => undefined,
    nativeEffectiveSource: (path: string) => edits.peek.source(path),
    draftScope: () => mem.scope,
    get versionView() { return undefined; },
    locateNativeElementRange, textRangeInSource,
    nativePageLabelOf: (path: string) => path,
    updateNativePreviewSources: () => { previewUpdates++; },
    refuse: (message: string) => notices.push(message),
    errorMessage: (error: unknown) => errors.push(error instanceof Error ? error.message : String(error)),
    itemsSlots: () => () => false,
  } as unknown as PageStructurePorts;
  const controller = createPageStructureController(ports);
  const target = { path: PAGE, node: [0, 0], tag: "section" };
  const page = () => edits.peek.source(PAGE);
  return { mem, edits, controller, state, notices, errors, target, page, previewUpdates: () => previewUpdates, refreshes: () => refreshes };
}

// What the bar offers: the painted bytes, the workspace now, and a guard on its selection and editor model.
function barOffer(f: ReturnType<typeof fixture>) {
  const model = f.mem.workspace.modelState(PAGE)!, node = f.target.node;
  return { painted: SOURCE, since: f.edits.stamp(), guard: () => model.isCurrent() && f.state.selected?.path === PAGE && f.state.selected.node.join() === node.join() };
}

for (const moved of ["generation", "scope", "source", "selection", "version", "route", "remount"] as const) {
  test(`a bar's section move refuses once the ${moved} moved since it was offered`, () => {
    const f = fixture();
    const offer = barOffer(f);
    if (moved === "generation") f.mem.bumpGeneration();
    if (moved === "scope") f.mem.setScope("lex/site@other");
    if (moved === "source") f.mem.typeInto(PAGE);
    if (moved === "selection") f.state.selected = { path: PAGE, node: [0, 1] };
    if (moved === "version") f.mem.setVersionView(true);
    if (moved === "route") f.mem.setRoute("/about");
    if (moved === "remount") f.mem.remount(PAGE);
    const before = f.page();
    assert.equal(f.controller.moveNativeSection(f.target, "down", offer), "stayed");
    assert.equal(f.page(), before);
    assert.deepEqual(f.mem.steps(), []);
    assert.deepEqual(f.notices, [MOVE_STALE]);
  });
}

test("a section move writes one step by the editor's move engine, keeps the section selected, and undoes", () => {
  const f = fixture();
  assert.equal(f.controller.moveNativeSection(f.target, "down", barOffer(f)), "moved");
  assert.equal(f.page(), "<main><section>B</section>\n<section>A</section></main>");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.mem.selected, [{ path: PAGE, node: [0, 1] }]);
  assert.equal(f.mem.announced.at(-1), "Moved down");
  assert.equal(f.mem.undo(), true);
  assert.equal(f.page(), SOURCE);
});

test("a structure row's section move (no selection) moves from the bytes painted for it", () => {
  const f = fixture();
  f.state.selected = undefined;
  assert.equal(f.controller.moveNativeSection(f.target, "down", { painted: SOURCE }), "moved");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.equal(fixture().controller.moveNativeSection(f.target, "down", { painted: "<main></main>" }), "stayed");
});

test("a section move at the first sibling records no history and says nothing", () => {
  const f = fixture();
  assert.equal(f.controller.moveNativeSection(f.target, "up", barOffer(f)), "stayed");
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.mem.announced, []);
});

test("a section component moves when its template is a section, not when it is not", () => {
  const page = "<main><x-band></x-band><section>B</section></main>";
  const band = { path: PAGE, node: [0, 0], tag: "x-band" };
  const f = fixture({ page });
  assert.equal(f.controller.isNativeSectionTag("x-band"), true);
  assert.equal(f.controller.moveNativeSection(band, "down", { painted: page }), "moved");
  const g = fixture({ page, band: "<div>Band</div>" });
  assert.equal(g.controller.isNativeSectionTag("x-band"), false);
  assert.equal(g.controller.moveNativeSection(band, "down", { painted: page }), undefined);
  assert.deepEqual(g.mem.steps(), []);
});

test("MCP move_section (moveNativeSectionTo) moves by the editor's engine as one step, keeping CRLF and leaving no blank line", () => {
  const source = "<main>\r\n  <section>A</section>\r\n  <section>B</section>\r\n  <section>C</section>\r\n</main>\r\n";
  const f = fixture({ page: source });
  assert.equal(f.controller.moveNativeSectionTo(f.target, [0], 3), "moved");
  assert.equal(f.page(), "<main>\r\n  <section>B</section>\r\n  <section>C</section>\r\n  <section>A</section>\r\n</main>\r\n");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.mem.selected, [{ path: PAGE, node: [0, 2] }]);
  // Its own gaps stay without a step (said); another parent is refused.
  const moved = f.page();
  const g = fixture({ page: moved });
  assert.equal(g.controller.moveNativeSectionTo({ ...g.target, node: [0, 2] }, [0], 3), "stayed");
  assert.equal(g.mem.announced.at(-1), "Section stayed in place");
  assert.equal(g.controller.moveNativeSectionTo(g.target, [], 0), undefined);
  assert.deepEqual(g.mem.steps(), []);
});

test("Alt+Down on a row while another file is open opens the page, then moves the section as one step", async () => {
  const f = fixture({ open: "styles/site.css" });
  await f.controller.moveNativeSectionAfterOpening(f.target, "down", SOURCE);
  assert.equal(f.mem.openFile(), PAGE);
  assert.equal(f.page(), "<main><section>B</section>\n<section>A</section></main>");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.notices, []);
});

test("leaving Edit component mode while the page opens still moves the section", async () => {
  const f = fixture({ open: "styles/site.css" });
  f.mem.enterEditMode();
  const hold = f.mem.holdOpen();
  const moving = f.controller.moveNativeSectionAfterOpening(f.target, "down", SOURCE);
  await hold.reached;
  f.mem.leaveEditMode();
  hold.release();
  await moving;
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.notices, []);
});

test("a section template made non-section during an Alt+Up wait refuses, writing nothing", async () => {
  const page = "<main><section>A</section><x-band></x-band></main>";
  const f = fixture({ page, open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = f.controller.moveNativeSectionAfterOpening({ path: PAGE, node: [0, 1], tag: "x-band" }, "up", page);
  await hold.reached;
  f.mem.writeDraft(BAND, "<div>Band</div>");
  hold.release();
  await moving;
  assert.equal(f.page(), page);
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, ["The section could not be moved"]);
});

test("a page draft written while its editor opens keeps the page unmounted and refuses the move", async () => {
  const f = fixture({ open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = f.controller.moveNativeSectionAfterOpening(f.target, "down", SOURCE);
  await hold.reached;
  const foreign = SOURCE.replace("<section>A", '<section data-agent="during-open">A');
  f.mem.writeDraft(PAGE, foreign);
  hold.release();
  await moving;
  assert.equal(f.mem.model(PAGE), undefined);
  assert.equal(f.page(), foreign);
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, [OPEN_STALE]);
  assert.equal(f.previewUpdates(), 1);
});

test("a repository change while the page opens drops the move without a word", async () => {
  const f = fixture({ open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = f.controller.moveNativeSectionAfterOpening(f.target, "down", SOURCE);
  await hold.reached;
  f.mem.bumpGeneration();
  hold.release();
  await moving;
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, []);
});

test("text typed in the preview is one step on the open page, the element selected after it", async () => {
  const f = fixture();
  await f.controller.applyNativeTextEdit({ path: PAGE, node: [0, 0], before: "A", after: "AB" } as never);
  assert.equal(f.page(), "<main><section>AB</section><section>B</section></main>");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.mem.selected, [{ path: PAGE, node: [0, 0] }]);
  assert.equal(f.mem.announced.at(-1), "Text changed");
  // A change that cannot be placed refreshes the preview and says so, writing nothing.
  await f.controller.applyNativeTextEdit({ path: PAGE, node: [0, 0], before: "nothing like it", after: "x" } as never);
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.equal(f.refreshes(), 1);
  assert.match(f.errors.at(-1) ?? "", /could not be placed/);
});

test("queued text edits apply in the order typed, each its own guarded step", async () => {
  const f = fixture();
  void f.controller.applyNativeTextEdit({ path: PAGE, node: [0, 0], before: "A", after: "AB" } as never);
  await f.controller.applyNativeTextEdit({ path: PAGE, node: [0, 0], before: "AB", after: "ABC" } as never);
  assert.equal(f.page(), "<main><section>ABC</section><section>B</section></main>");
  assert.deepEqual(f.mem.steps(), ["range", "range"]);
});
