import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageStructureController, type PageStructurePorts } from "../src/controllers/page-structure-controller.ts";
import { createGuardedEdits } from "../src/guarded-edit.ts";
import { createBlockMoves, type BlockMovePorts } from "../src/page-builder/block-move.ts";
import { elementEnd, startTags } from "../shared/html-source.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { EditBarControl, EditBarModel } from "../src/components/edit-bar.ts";
import { createMemoryWorkspace } from "./fakes/memory-workspace.ts";
import { forEachAwait } from "./support/await-race.ts";

const PAGE = "index.html";
const SOURCE = "<main><section>A</section><section>B</section></main>";
const BAND = "components/x-band.html";
const MOVE_STALE = "The source or selection changed. Select the section again before moving it.";
const unused = (name: string) => (): never => { throw new Error(`unused port ${name}`); };
const OPEN_STALE = "The source changed while its editor opened. Select the section again before moving it.";

// The i-th element of <main> in these flat fixtures (the real locator needs a browser's parser).
function locateNativeElementRange(html: string, node: number[]) {
  const found = [...html.matchAll(/<(section|x-band)\b[^>]*>(.*?)<\/\1>/g)][node[1]];
  if (!found) return undefined;
  const start = found.index, end = start + found[0].length, closeStart = end - found[1].length - 3;
  return { start, end, tag: { name: found[1], start, nameEnd: start + 1 + found[1].length, end: start + found[0].indexOf(">") + 1 }, close: { start: closeStart, end } };
}

// The controller on the memory workspace and the real guarded edit module.
function fixture(init: { page?: string; open?: string; band?: string; editing?: string } = {}) {
  const mem = createMemoryWorkspace({
    branch: { [PAGE]: init.page ?? SOURCE, [BAND]: init.band ?? "<section>Band</section>", "styles/site.css": "body{}" },
    open: init.open ?? PAGE,
    site: { routes: { "/": PAGE }, components: { "x-band": BAND } },
  });
  const edits = createGuardedEdits(mem.workspace);
  const state: { selected: NativePreviewSelection | undefined } = { selected: { path: PAGE, node: [0, 0], tag: "section", text: "", reason: "click", selectors: [] } };
  const notices: string[] = [], errors: string[] = [], forgotten: string[] = [];
  let refreshes = 0;
  const moves = createBlockMoves({
    edits, editing: () => init.editing ? { template: init.editing, tag: "x-band" } : undefined,
    mounted: path => mem.openFile() === path && mem.model(path) !== undefined,
    forgetOpening: () => painted => { forgotten.push(painted); },
  } satisfies BlockMovePorts);
  const ports: PageStructurePorts = {
    edits,
    appStore: { openFile: { get value() { return mem.openFile(); } }, selection: { get value() { return state.selected; } } },
    editorModule: {
      isMounted: path => mem.model(path) !== undefined,
      captureFileModelState: (_scope, path) => mem.workspace.model(path),
      captureHistoryHost: path => mem.workspace.modelState(path),
      forgetDraftModel: () => false,
      closeActiveEditGroup: path => mem.workspace.closeGroup(path),
      replaceActiveRange: (edit, group = false) => { mem.workspace.change(edit.path, [edit], group); return true; },
      replaceActiveRanges: unused("replaceActiveRanges"),
      runVisualHistory: async direction => direction === "undo" ? mem.undo() : mem.redo(),
    },
    nativePreview: {
      route: () => "/", refresh: () => { refreshes++; },
      selectNode: unused("selectNode"), selectTextAfterUpdate: () => {}, selectAfterUpdate: () => {},
      showEditBar: unused("showEditBar"), hideEditBar: unused("hideEditBar"),
    },
    nativeSite: { routes: { "/": PAGE }, components: { "x-band": BAND } },
    nativeEditableTemplatePath: () => undefined,
    nativeEffectiveSource: (path: string) => edits.peek.source(path),
    draftScope: () => mem.scope,
    get versionView() { return undefined; },
    locateNativeElementRange,
    nativePageLabelOf: (path: string) => path,
    refuse: (message: string) => notices.push(message),
    errorMessage: (error: unknown) => errors.push(error instanceof Error ? error.message : String(error)),
    moves,
    componentTools: undefined,
    nativeEditableSource: path => edits.peek.source(path),
    element: unused("element"), generation: 0, setupScope: () => "scope",
    openNativeNavigation: unused("openNativeNavigation"),
    nativeSources: () => Object.fromEntries(mem.files().map(path => [path, edits.peek.source(path)!])),
    nativePageStyles: () => [], nativeTextTags: new Set(), nativeLinkParents: new Set(),
    previewSelection: { textSelection: () => undefined },
    wholeWrapper: () => undefined, nearestLink: () => undefined, nativeRouteInfo: () => ({}),
    nativeNamedDescendant: () => false, nativePictureSources: () => false,
    mediaPlaceState: undefined, changeMediaPlace: undefined, mediaVideoControls: undefined,
    mediaButton: undefined, mediaPlaceFrame: undefined, editImage: undefined,
    chooseMediaForImage: unused("chooseMediaForImage"),
    cardControls: () => [], agentController: { captureAsk: () => undefined },
    announce: text => mem.announced.push(text), restoreFile: unused("restoreFile"),
    updateNativePreviewSources: unused("updateNativePreviewSources"), pageStructure: undefined,
    elementPathAt: () => undefined, wrapperAround: () => undefined,
  } satisfies PageStructurePorts;
  const controller = createPageStructureController(ports);
  const target = { path: PAGE, node: [0, 0], tag: "section" };
  const page = () => edits.peek.source(PAGE);
  return { mem, edits, controller, ports, state, notices, errors, forgotten, target, page, refreshes: () => refreshes };
}

// What the bar holds for its selection: the painted bytes, the workspace then, and a guard on its selection and editor model.
function barMove(f: ReturnType<typeof fixture>, direction: "up" | "down") {
  const model = f.mem.workspace.modelState(PAGE)!, node = f.target.node;
  const options = { since: f.edits.stamp(), stale: MOVE_STALE, guard: () => model.isCurrent() && f.state.selected?.path === PAGE && f.state.selected.node?.join() === node.join() };
  return () => f.controller.moveBlock({ path: PAGE, node, painted: SOURCE }, direction, options);
}

for (const moved of ["generation", "scope", "source", "selection", "version", "route", "remount"] as const) {
  test(`a bar's section move refuses once the ${moved} moved since it was offered`, () => {
    const f = fixture();
    const move = barMove(f, "down");
    if (moved === "generation") f.mem.bumpGeneration();
    if (moved === "scope") f.mem.setScope("lex/site@other");
    if (moved === "source") f.mem.typeInto(PAGE);
    if (moved === "selection") f.state.selected = { ...f.state.selected!, path: PAGE, node: [0, 1] };
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
function drawBar(f: ReturnType<typeof fixture>, node = f.target.node, extra: Partial<PageStructurePorts> = {}, link?: string, tag = "section") {
  let model: EditBarModel | undefined;
  const rendering: Partial<PageStructurePorts> = {
    nativePreview: { ...f.ports.nativePreview!, showEditBar: shown => { model = shown; }, hideEditBar: () => { model = undefined; } },
    // Only textContent is used by the controller's status port in this Node fixture.
    element: <T extends HTMLElement>() => ({ textContent: "" }) as T,
    ...extra,
  };
  Object.assign(f.ports, rendering);
  f.controller.renderEditBar({ path: PAGE, node, tag, link, text: "", reason: "click", selectors: [], paintedSource: f.page(), rect: { top: 0, left: 0, bottom: 1, right: 1, width: 1, height: 1 } });
  const button = (label: string) => model!.controls.find(control => control.label === label)!;
  return button;
}

test("the bar's Move buttons are off at the ends, and a detached one refuses once another section is selected", () => {
  const f = fixture();
  const button = drawBar(f);
  const up = button("Move up"), down = button("Move down");
  assert.ok(up.kind === "button");
  assert.ok(down.kind === "button");
  assert.equal(up.disabled, true);
  assert.equal(down.disabled, false);
  f.state.selected = { ...f.state.selected!, path: PAGE, node: [0, 1] };
  down.onPress();
  assert.equal(f.page(), SOURCE);
  assert.deepEqual(f.notices, [MOVE_STALE]);
  f.state.selected = { ...f.state.selected!, path: PAGE, node: [0, 0] };
  const fresh = drawBar(f)("Move down");
  assert.ok(fresh.kind === "button");
  fresh.onPress();
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

// Text edits committed while the page is not open: the first opens it, the second waits its turn.
function openingFixture() {
  const f = fixture({ open: "styles/site.css" });
  const restores: string[] = [];
  f.ports.restoreFile = async (path, _epoch, options) => { restores.push(path); await f.mem.workspace.open(path, options?.beforeMount); };
  const type = (before: string, after: string) => f.controller.applyNativeTextEdit({ path: PAGE, node: [0, 0], before, after });
  return { ...f, restores, type };
}

test("text edits queued while the page opens apply in the order typed once it mounts", async () => {
  const f = openingFixture();
  const hold = f.mem.holdOpen();
  const first = f.type("A", "AB"), second = f.type("AB", "ABC");
  await hold.reached;
  assert.equal(f.page(), SOURCE);
  hold.release();
  await Promise.all([first, second]);
  assert.equal(f.page(), "<main><section>ABC</section><section>B</section></main>");
  assert.deepEqual(f.mem.steps(), ["range", "range"]);
  assert.deepEqual(f.restores, [PAGE]);
  assert.deepEqual(f.errors, []);
  assert.equal(f.mem.undo(), true);
  assert.equal(f.page(), "<main><section>AB</section><section>B</section></main>");
});

for (const moved of ["generation", "scope"] as const) {
  test(`a ${moved} change while queued text edits wait for the page writes neither`, async () => {
    const points = await forEachAwait(race => {
      const f = openingFixture();
      const restore = f.ports.restoreFile;
      f.ports.restoreFile = race.port("restoreFile", (...args: Parameters<typeof restore>) => restore(...args));
      const done = Promise.all([f.type("A", "AB"), f.type("AB", "ABC")]);
      return { ...f, done };
    }, f => { if (moved === "generation") f.mem.bumpGeneration(); else f.mem.setScope("lex/site@other"); }, f => {
      assert.equal(f.page(), SOURCE);
      assert.deepEqual(f.mem.steps(), []);
      assert.deepEqual(f.errors, []);
    });
    assert.equal(points, 1);
  });
}

test("a template row moves through the now-shaped editing port and leaves the page alone", () => {
  const band = "<section><div>A</div><div>B</div></section>";
  const f = fixture({ open: BAND, band, editing: BAND });
  assert.deepEqual(f.controller.moveBlock({ path: BAND, node: [0, 0], painted: band }, "down", {}), [0, 1]);
  assert.equal(f.edits.peek.source(BAND), "<section><div>B</div>\n<div>A</div></section>");
  assert.equal(f.page(), SOURCE);
  assert.deepEqual(f.notices, []);
});

test("link popup writes chosen and typed page routes with the live site prefix", () => {
  const f = fixture({ page: '<main><section><a href="/old/">Old</a></section></main>' });
  f.mem.writeDraft(".editor/config.json", '{"site":{"url":"https://user.github.io/my-site/"}}');
  const rangeOf = (html: string, name: string) => {
    const tags = startTags(html);
    return elementEnd(html, tags, tags.findIndex(tag => tag.name === name), html.length);
  };
  const address = drawBar(f, f.target.node, {
    nativeRouteInfo: () => ({ title: "Home" }),
    nearestLink: html => ({ range: rangeOf(html, "a")!, node: [0, 0, 0] }),
    locateNativeElementRange: (html, node) => rangeOf(html, node.length === 3 ? "a" : "section"),
    editorModule: { ...f.ports.editorModule!, replaceActiveRange: edit => {
      const source = f.page()!;
      assert.equal(source.slice(edit.start, edit.end), edit.expected);
      f.mem.typeInto(PAGE, source.slice(0, edit.start) + edit.text + source.slice(edit.end));
      return true;
    } },
  }, "/old/")("Address");
  assert.ok(address.kind === "address");
  assert.deepEqual(address.suggestions, [{ label: "Home (/)", value: "/my-site/" }]);
  address.onInput!(address.suggestions![0].value);
  assert.equal(f.page(), '<main><section><a href="/my-site/">Old</a></section></main>');
  address.onInput!("/about/");
  assert.equal(f.page(), '<main><section><a href="/my-site/about/">Old</a></section></main>');
  f.mem.writeDraft(".editor/config.json", '{"site":{"url":"https://user.github.io/elsewhere/"}}');
  address.onInput!("/about/");
  assert.equal(f.page(), '<main><section><a href="/elsewhere/about/">Old</a></section></main>');
  assert.deepEqual(f.errors, []);
});

// These fixtures have unique tag names; use the node-safe source parser as a locator.
function rangeOf(html: string, name: string) {
  const tags = startTags(html);
  return elementEnd(html, tags, tags.findIndex(tag => tag.name === name), html.length);
}

function textBarPorts(f: ReturnType<typeof fixture>, wrappers: string[] = []): Partial<PageStructurePorts> {
  return {
    nativeTextTags: new Set(["p"]), nativeLinkParents: new Set(["p"]),
    previewSelection: { textSelection: () => ({ path: PAGE, node: f.target.node, start: 0, end: 5, text: "Hello", wrappers }) },
    locateNativeElementRange: (html, node) => rangeOf(html, node.length === 3 ? "a" : "p"),
    wrapperAround: (inner, _at, names) => names.map(name => rangeOf(inner, name)).find(Boolean),
    elementPathAt: (html, at) => startTags(html).some(tag => tag.start === at) ? [0] : undefined,
  };
}

test("an attribute field groups typed values into one guarded step with Undo and Redo", () => {
  const source = '<main><button name="old">Send</button></main>';
  const f = fixture({ page: source });
  const name = drawBar(f, f.target.node, { locateNativeElementRange: html => rangeOf(html, "button") }, undefined, "button")("Name");
  assert.ok(name.kind === "address");
  name.onOpen!();
  name.onInput("new");
  name.onInput("newer");
  name.onClose!();
  assert.equal(f.page(), '<main><button name="newer">Send</button></main>');
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.deepEqual(f.mem.selected.at(-1), { path: PAGE, node: f.target.node });
  assert.equal(f.mem.announced.at(-1), "Name changed");
  assert.equal(f.mem.undo(), true);
  assert.equal(f.page(), source);
  assert.equal(f.mem.announced.at(-1), "Undid: Name changed");
  assert.equal(f.mem.redo(), true);
  assert.equal(f.page(), '<main><button name="newer">Send</button></main>');
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.errors, []);
});

test("an attribute field refuses once its selection changes", () => {
  const source = '<main><button name="old">Send</button><p>Elsewhere</p></main>';
  const f = fixture({ page: source });
  const name = drawBar(f, f.target.node, { locateNativeElementRange: html => rangeOf(html, "button") }, undefined, "button")("Name");
  assert.ok(name.kind === "address");
  name.onOpen!();
  f.state.selected = { ...f.state.selected!, node: [0, 1] };
  name.onInput("new");
  assert.equal(f.page(), source);
  assert.deepEqual(f.mem.steps(), []);
  assert.deepEqual(f.notices, ["The source or selection changed. Select the element again before editing its fields."]);
});

test("Bold wraps selected text and unwraps formatted text through the edit bar", () => {
  const source = "<main><p>Hello world</p></main>";
  const f = fixture({ page: source });
  const bold = drawBar(f, f.target.node, textBarPorts(f), undefined, "p")("B");
  assert.ok(bold.kind === "button");
  assert.equal(bold.pressed, false);
  bold.onPress();
  assert.equal(f.page(), "<main><p><strong>Hello</strong> world</p></main>");
  assert.deepEqual(f.mem.steps(), ["range"]);
  assert.equal(f.mem.undo(), true);
  assert.equal(f.page(), source);
  assert.equal(f.mem.redo(), true);
  const unbold = drawBar(f, f.target.node, textBarPorts(f, ["strong"]), undefined, "p")("B");
  assert.ok(unbold.kind === "button");
  assert.equal(unbold.pressed, true);
  unbold.onPress();
  assert.equal(f.page(), source);
  assert.deepEqual(f.mem.steps(), ["range", "range"]);
  assert.equal(f.mem.undo(), true);
  assert.equal(f.page(), "<main><p><strong>Hello</strong> world</p></main>");
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.notices, []);
});

test("Link wraps selected text; leaving its unused Address removes the empty link and its undo step", async () => {
  const source = "<main><p>Hello world</p></main>";
  const f = fixture({ page: source });
  const link = drawBar(f, f.target.node, textBarPorts(f), undefined, "p")("Link");
  assert.ok(link.kind === "button");
  link.onPress();
  assert.equal(f.page(), '<main><p><a href="">Hello</a> world</p></main>');
  assert.deepEqual(f.mem.steps(), ["range"]);
  const address = drawBar(f, f.target.node, textBarPorts(f, ["a"]), undefined, "p")("Address");
  assert.ok(address.kind === "address");
  assert.equal(address.open, true);
  assert.equal(address.value, "");
  f.state.selected = { ...f.state.selected!, node: [0, 1] };
  // The edit bar closes the old popup when the selection moves, without any Address input.
  address.onClose!();
  await Promise.resolve();
  assert.equal(f.page(), source);
  assert.deepEqual(f.mem.steps(), []);
  assert.equal(f.mem.undo(), false);
  assert.deepEqual(f.notices, []);
  assert.deepEqual(f.errors, []);
});

test("the bar includes the cardControls port's controls only outside sections and template roots", () => {
  for (const kind of ["plain", "section", "template root"] as const) {
    const tag = kind === "section" ? "section" : "div";
    const f = fixture({ page: `<main><${tag}>Content</${tag}></main>` });
    const calls: { selection: NativePreviewSelection; source: string }[] = [];
    const card: EditBarControl = { kind: "button", label: "Card control", onPress: () => {} };
    const extra: Partial<PageStructurePorts> = {
      locateNativeElementRange: html => rangeOf(html, tag),
      cardControls: (selection, source) => { calls.push({ selection, source }); return [card]; },
    };
    if (kind === "template root") Object.assign(extra, { componentTools: {
      mode: {
        now: () => ({ page: PAGE, node: [0], chain: [], tag: "x-band", template: PAGE, entry: {}, notes: [] }),
        entry: unused("mode.entry"), opened: unused("mode.opened"), enter: unused("mode.enter"),
        open: unused("mode.open"), rename: unused("mode.rename"), keep: unused("mode.keep"), kept: unused("mode.kept"),
        dismissNotes: unused("mode.dismissNotes"), sync: unused("mode.sync"), leave: unused("mode.leave"), destroy: unused("mode.destroy"),
      },
      isTemplateRoot: () => true, variantControls: () => [], controls: () => [], removeControl: () => [], show: () => {}, identity: () => ({}),
      makeFromAgent: unused("makeFromAgent"), menuItems: unused("menuItems"), slotMenu: unused("slotMenu"),
      instanceSelection: unused("instanceSelection"), structure: unused("structure"), textRow: unused("textRow"), templateRows: unused("templateRows"),
      refresh: unused("refresh"), editComponent: unused("editComponent"), newComponent: unused("newComponent"),
      fillInstanceSlot: unused("fillInstanceSlot"), destroy: unused("destroy"),
    } satisfies NonNullable<PageStructurePorts["componentTools"]> });
    const control = drawBar(f, f.target.node, extra, undefined, tag)("Card control");
    assert.equal(control, kind === "plain" ? card : undefined, kind);
    assert.equal(calls.length, kind === "plain" ? 1 : 0, kind);
    if (kind === "plain") {
      assert.equal(calls[0].source, f.page());
      assert.deepEqual(calls[0].selection.node, f.target.node);
      assert.equal(calls[0].selection.tag, "div");
    }
  }
});
