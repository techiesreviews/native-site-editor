import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageStructureController, type PageStructurePorts } from "../src/controllers/page-structure-controller.ts";
import type { ElementRange } from "../src/native-source-location.ts";

const PAGE = "index.html";
const SOURCE = "<main><section>A</section><section>B</section></main>";
function fixture() {
  const state = { generation: 1, scope: "one", source: SOURCE, current: true, mounted: true,
    selected: { path: PAGE, node: [0, 0] }, master: undefined as { masterPath: string } | undefined, version: false };
  const notices: string[] = [], writes: unknown[] = [], selections: unknown[] = [];
  const ranges = [
    { start: 6, end: 26, tag: { name: "section", start: 6, end: 15 } },
    { start: 26, end: 46, tag: { name: "section", start: 26, end: 35 } },
  ];
  const ports = {
    get generation() { return state.generation; }, setupScope: () => state.scope,
    draftScope: () => ({ account: "a", repoId: 1, repo: "r", branch: "b" }),
    get versionView() { return state.version || undefined; },
    appStore: { openFile: { value: PAGE }, selection: { get value() { return state.selected; } } },
    editorModule: { isMounted: () => state.mounted, captureFileModelState: () => ({ isCurrent: () => state.current }),
      replaceActiveRanges: (edits: unknown) => writes.push(edits) },
    nativePreview: { selectAfterUpdate: (next: unknown) => selections.push(next) },
    nativeEditableSource: () => state.source, nativeSources: () => ({ [PAGE]: state.source }),
    nativeOpenMaster: () => state.master, isPrivateMasterPath: (path: string) => path.startsWith(".editor/masters/"),
    locateNativeElementRange: (_source: string, node: number[]) => ranges[node[1]] as ElementRange | undefined,
    announce: (message: string) => notices.push(message), element: () => ({ textContent: "" }),
    errorMessage: (error: unknown) => notices.push(String(error)),
  } as unknown as PageStructurePorts;
  const controller = createPageStructureController(ports);
  const target = { path: PAGE, node: [0, 0], tag: "section" };
  return { controller, state, ports, notices, writes, selections, target };
}

test("page structure records one replacement with expected bytes and next selection", () => {
  const f = fixture();
  assert.equal(f.controller.applyNativeChange(PAGE, SOURCE, [{ start: 15, end: 16, text: "C" }], [0, 0], "Changed"), true);
  assert.deepEqual(f.writes, [[{ path: PAGE, start: 15, end: 16, text: "C", expected: "A" }]]);
  assert.deepEqual(f.selections, [{ path: PAGE, node: [0, 0] }]);
});

test("page structure refuses changed source before selecting or writing", () => {
  const f = fixture(); f.state.source = "changed";
  assert.equal(f.controller.applyNativeChange(PAGE, SOURCE, [], undefined, "Changed"), false);
  assert.equal(f.writes.length, 0); assert.equal(f.selections.length, 0);
  assert.deepEqual(f.notices, ["The source changed. Select the element again and try again."]);
});

test("page structure refuses a closed private master", () => {
  const f = fixture();
  assert.equal(f.controller.applyNativeChange(".editor/masters/hero.html", SOURCE, [], undefined, "Changed"), false);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.notices, ["That master is no longer open. Choose Edit on the section again."]);
});

for (const guard of ["generation", "scope", "source", "model", "selection", "version"] as const) {
  test(`section move retains the original ${guard} proof`, () => {
    const f = fixture(); const proof = f.controller.sectionMoveProof(SOURCE, f.target.node, true);
    if (guard === "generation") f.state.generation++;
    if (guard === "scope") f.state.scope = "two";
    if (guard === "source") f.state.source = "changed";
    if (guard === "model") f.state.current = false;
    if (guard === "selection") f.state.selected = { path: PAGE, node: [0, 1] };
    if (guard === "version") f.state.version = true;
    assert.equal(f.controller.moveNativeSection(f.target, "down", proof), "stayed");
    assert.equal(f.writes.length, 0); assert.equal(f.selections.length, 0);
    assert.deepEqual(f.notices, ["The source or selection changed. Select the section again before moving it."]);
  });
}

test("section move writes the swap in one call and retains selection", () => {
  const f = fixture(); const proof = f.controller.sectionMoveProof(SOURCE, f.target.node, true);
  assert.equal(f.controller.moveNativeSection(f.target, "down", proof), "moved");
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.selections, [{ path: PAGE, node: [0, 1] }]);
});

test("section move at the first sibling records no history", () => {
  const f = fixture(); const proof = f.controller.sectionMoveProof(SOURCE, f.target.node, true);
  assert.equal(f.controller.moveNativeSection(f.target, "up", proof), "stayed");
  assert.equal(f.writes.length, 0); assert.equal(f.notices.length, 0);
});

function structureFixture() {
  const state = { current: true, revision: "one", source: SOURCE, open: PAGE,
    master: false, linked: true, selected: undefined as unknown };
  let resolve!: (value: unknown) => void;
  const pending = new Promise(resolveSelection => { resolve = resolveSelection; });
  const log: string[] = [], edits: unknown[][] = [];
  const proof = { isCurrent: () => state.current };
  const selection = { path: PAGE, node: [0, 0], paintedSource: SOURCE };
  const controller = createPageStructureController({
    draftScope: () => ({ account: "a", repoId: 1, repo: "r", branch: "b" }),
    masterRevision: () => state.revision,
    editorModule: { captureFileModelState: () => { log.push("proof"); return proof; } },
    nativePreview: { selectNode: () => log.push("selectNode") },
    nativeMasterEdit: () => state.master ? {} : undefined,
    appStore: { openFile: { get value() { return state.open; } }, selection: { get value() { return state.selected; } } },
    nativeEffectiveSource: () => state.source,
    previewSelection: { waitFor: () => { log.push("waitFor"); return pending; } },
    nativeMasterSelection: () => ({}),
    masterController: { identity: () => ({ linked: state.linked, onEdit: () => {} }) },
    pagePartController: { identity: () => ({ linked: state.linked, onEdit: () => {} }) },
    runMasterEdit: (...args: unknown[]) => edits.push(args),
    announce: (message: string) => log.push(message),
  } as unknown as PageStructurePorts);
  return { controller, state, selection, resolve, log, edits, proof };
}

test("Structure Edit waits before selection and passes its original proof to master editing", async () => {
  const f = structureFixture(); const run = f.controller.editSharedRoot(PAGE, [0, 0], SOURCE, false);
  assert.deepEqual(f.log, ["proof", "waitFor", "selectNode"]);
  f.state.selected = f.selection; f.resolve(f.selection); await run;
  assert.equal(f.edits.length, 1); assert.equal(f.edits[0][2], f.proof);
  assert.equal(f.edits[0][4], "one"); assert.equal(f.log.filter(item => item === "proof").length, 1);
});

for (const guard of ["model", "revision", "source", "openFile", "master", "selection", "paintedSource", "linked", "timeout"] as const) {
  test(`Structure Edit refuses ${guard} changed while selection awaits`, async () => {
    const f = structureFixture(); const run = f.controller.editSharedRoot(PAGE, [0, 0], SOURCE, true);
    f.state.selected = f.selection;
    if (guard === "model") f.state.current = false;
    if (guard === "revision") f.state.revision = "two";
    if (guard === "source") f.state.source = "changed";
    if (guard === "openFile") f.state.open = "other.html";
    if (guard === "master") f.state.master = true;
    if (guard === "selection") f.state.selected = { ...f.selection };
    if (guard === "paintedSource") f.selection.paintedSource = "changed";
    if (guard === "linked") f.state.linked = false;
    f.resolve(guard === "timeout" ? undefined : f.selection); await run;
    assert.equal(f.edits.length, 0);
    assert.equal(f.log.at(-1), "The page changed. Select the element again.");
    assert.equal(f.log.filter(item => item === "proof").length, 1);
  });
}

test("Structure repaint reads the latest shown structure and refuses changed painted bytes", () => {
  const shown = { path: PAGE, paintedSource: SOURCE };
  let current = shown, source = SOURCE;
  const updates: unknown[] = [];
  const controller = createPageStructureController({
    get nativeShownStructure() { return current; },
    appStore: { openFile: { value: PAGE } }, nativeEffectiveSource: () => source,
    pageStructure: { update: (value: unknown) => updates.push(value) },
  } as unknown as PageStructurePorts);
  controller.repaint(); source = "changed"; controller.repaint();
  current = { path: PAGE, paintedSource: source }; controller.repaint();
  assert.deepEqual(updates, [shown, current]);
});
