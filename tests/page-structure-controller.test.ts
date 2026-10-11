import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageStructureController, type PageStructurePorts } from "../src/controllers/page-structure-controller.ts";
import { createGuardedEdits } from "../src/guarded-edit.ts";
import { createBlockMoves } from "../src/page-builder/block-move.ts";
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
  const notices: string[] = [], errors: string[] = [], forgotten: string[] = [];
  let refreshes = 0;
  const moves = createBlockMoves({
    edits, editing: () => undefined,
    mounted: path => mem.openFile() === path && mem.model(path) !== undefined,
    forgetOpening: () => painted => { forgotten.push(painted); },
  });
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
    refuse: (message: string) => notices.push(message),
    errorMessage: (error: unknown) => errors.push(error instanceof Error ? error.message : String(error)),
    moves,
  } as unknown as PageStructurePorts;
  const controller = createPageStructureController(ports);
  const target = { path: PAGE, node: [0, 0], tag: "section" };
  const page = () => edits.peek.source(PAGE);
  return { mem, edits, controller, ports, state, notices, errors, forgotten, target, page, refreshes: () => refreshes };
}

// What the bar holds for its selection: the painted bytes, the workspace then, and a guard on its selection and editor model.
function barMove(f: ReturnType<typeof fixture>, direction: "up" | "down") {
  const model = f.mem.workspace.modelState(PAGE)!, node = f.target.node;
  const options = { since: f.edits.stamp(), stale: MOVE_STALE, guard: () => model.isCurrent() && f.state.selected?.path === PAGE && f.state.selected.node.join() === node.join() };
  return () => f.controller.moveBlock({ path: PAGE, node, painted: SOURCE }, direction, options);
}

for (const moved of ["generation", "scope", "source", "selection", "version", "route", "remount"] as const) {
  test(`a bar's section move refuses once the ${moved} moved since it was offered`, () => {
    const f = fixture();
    const move = barMove(f, "down");
    if (moved === "generation") f.mem.bumpGeneration();
    if (moved === "scope") f.mem.setScope("lex/site@other");
    if (moved === "source") f.mem.typeInto(PAGE);
    if (moved === "selection") f.state.selected = { path: PAGE, node: [0, 1] };
    if (moved === "version") f.mem.setVersionView(true);
    if (moved === "route") f.mem.setRoute("/about");
    if (moved === "remount") f.mem.remount(PAGE);
    const before = f.page();
    assert.equal(move(), "stayed");
    assert.equal(f.page(), before);
    assert.deepEqual(f.mem.steps(), []);
    assert.deepEqual(f.notices, [MOVE_STALE]);
  });
}

test("a bar's section move answers the moved path, and nothing is said at an edge", () => {
  const f = fixture();
  assert.equal(barMove(f, "up")(), "stayed");
  assert.deepEqual(f.notices, []);
  assert.deepEqual(barMove(f, "down")(), [0, 1]);
  assert.deepEqual(f.mem.steps(), ["range"]);
});

// The bar drawn for a selection: its Move buttons, as the edit bar would press them (a detached button too).
function drawBar(f: ReturnType<typeof fixture>, node = f.target.node) {
  let model: { controls: { label?: string; disabled?: boolean; onPress?: () => void }[] } | undefined;
  Object.assign(f.ports, {
    nativePreview: { ...f.ports.nativePreview, showEditBar: (shown: typeof model) => { model = shown; }, hideEditBar: () => { model = undefined; } },
    nativeEditableSource: (path: string) => f.edits.peek.source(path),
    startTagAttribute: () => undefined, element: () => ({ textContent: "" }), setupScope: () => "scope", generation: 0,
    agentController: { captureAsk: () => undefined }, previewSelection: { textSelection: () => undefined }, cardControls: () => [],
    nativeTextTags: new Set(), nativeLinkParents: new Set(), nativeNamedDescendant: () => false, nativePictureSources: () => false,
  });
  f.controller.renderNativeEditBar({ path: PAGE, node, tag: "section", text: "", reason: "click", selectors: [], paintedSource: f.page(), rect: { x: 0, y: 0, width: 1, height: 1 } } as never);
  const button = (label: string) => model!.controls.find(control => control.label === label)!;
  return button;
}

test("the bar's Move buttons are off at the ends, and a detached one refuses once another section is selected", () => {
  const f = fixture();
  const button = drawBar(f);
  assert.equal(button("Move up").disabled, true);
  assert.equal(button("Move down").disabled, false);
  f.state.selected = { path: PAGE, node: [0, 1] };
  button("Move down").onPress!();
  assert.equal(f.page(), SOURCE);
  assert.deepEqual(f.notices, [MOVE_STALE]);
  f.state.selected = { path: PAGE, node: [0, 0] };
  drawBar(f)("Move down").onPress!();
  assert.equal(f.page(), "<main><section>B</section>\n<section>A</section></main>");
});

// A Structure row while another file is open: the page opens first, the move settles later.
const rowMove = (f: ReturnType<typeof fixture>, at: { node: number[]; painted: string }, direction: "up" | "down") =>
  f.controller.moveBlock({ path: PAGE, ...at }, direction, { stale: OPEN_STALE }) as Promise<unknown>;

test("Alt+Down on a row while another file is open opens the page, then answers the moved path", async () => {
  const f = fixture({ open: "styles/site.css" });
  assert.deepEqual(await rowMove(f, { node: [0, 0], painted: SOURCE }, "down"), [0, 1]);
  assert.equal(f.mem.openFile(), PAGE);
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.notices, []);
});

test("a section template made non-section during an Alt+Up wait refuses, writing nothing", async () => {
  const page = "<main><section>A</section><x-band></x-band></main>";
  const f = fixture({ page, open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = rowMove(f, { node: [0, 1], painted: page }, "up");
  await hold.reached;
  f.mem.writeDraft(BAND, "<div>Band</div>");
  hold.release();
  assert.equal(await moving, "stayed");
  assert.equal(f.page(), page);
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, [OPEN_STALE]);
});

test("a page draft written while its editor opens keeps the page unmounted and refuses the move", async () => {
  const f = fixture({ open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = rowMove(f, { node: [0, 0], painted: SOURCE }, "down");
  await hold.reached;
  const foreign = SOURCE.replace("<section>A", '<section data-agent="during-open">A');
  f.mem.writeDraft(PAGE, foreign);
  hold.release();
  assert.equal(await moving, "stayed");
  assert.equal(f.mem.model(PAGE), undefined);
  assert.equal(f.page(), foreign);
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, [OPEN_STALE]);
  assert.deepEqual(f.forgotten, [SOURCE]);
});

test("a repository change while the page opens drops the move without a word", async () => {
  const f = fixture({ open: "styles/site.css" });
  const hold = f.mem.holdOpen();
  const moving = rowMove(f, { node: [0, 0], painted: SOURCE }, "down");
  await hold.reached;
  f.mem.bumpGeneration();
  hold.release();
  assert.equal(await moving, "stayed");
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, []);
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
