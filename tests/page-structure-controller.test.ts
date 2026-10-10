import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageStructureController, type PageStructurePorts } from "../src/controllers/page-structure-controller.ts";
import type { ElementRange } from "../src/native-source-location.ts";

const PAGE = "index.html";
const SOURCE = "<main><section>A</section><section>B</section></main>";
function fixture() {
  const state = { generation: 1, scope: "one", source: SOURCE, current: true, mounted: true,
    selected: { path: PAGE, node: [0, 0] }, version: false };
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
    locateNativeElementRange: (_source: string, node: number[]) => ranges[node[1]] as ElementRange | undefined,
    announce: (message: string) => notices.push(message), refuse: (message: string) => notices.push(message), element: () => ({ textContent: "" }),
    errorMessage: (error: unknown) => notices.push(String(error)), itemsSlots: () => () => false,
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

test("section move writes one edit by the editor's move engine and retains selection", () => {
  const f = fixture(); const proof = f.controller.sectionMoveProof(SOURCE, f.target.node, true);
  assert.equal(f.controller.moveNativeSection(f.target, "down", proof), "moved");
  assert.equal(f.writes.length, 1);
  const [edit] = f.writes[0] as { start: number; end: number; text: string; expected: string }[];
  assert.equal(SOURCE.slice(0, edit.start) + edit.text + SOURCE.slice(edit.end), "<main><section>B</section>\n<section>A</section></main>");
  assert.deepEqual(f.selections, [{ path: PAGE, node: [0, 1] }]);
});

test("MCP move_section (moveNativeSectionTo) moves by the editor's engine as one write, keeping CRLF and leaving no blank line", () => {
  const f = fixture();
  f.state.source = "<main>\r\n  <section>A</section>\r\n  <section>B</section>\r\n  <section>C</section>\r\n</main>\r\n";
  const before = f.state.source;
  assert.equal(f.controller.moveNativeSectionTo(f.target, [0], 3), "moved");
  assert.equal(f.writes.length, 1);
  const edits = f.writes[0] as { start: number; end: number; text: string }[];
  assert.equal(edits.length, 1);
  assert.equal(before.slice(0, edits[0].start) + edits[0].text + before.slice(edits[0].end), "<main>\r\n  <section>B</section>\r\n  <section>C</section>\r\n  <section>A</section>\r\n</main>\r\n");
  assert.deepEqual(f.selections, [{ path: PAGE, node: [0, 2] }]);
  // Its own gaps stay without a write; another parent is refused.
  assert.equal(f.controller.moveNativeSectionTo(f.target, [0], 1), "stayed");
  assert.equal(f.controller.moveNativeSectionTo(f.target, [], 0), undefined);
  assert.equal(f.writes.length, 1);
});

test("section move at the first sibling records no history", () => {
  const f = fixture(); const proof = f.controller.sectionMoveProof(SOURCE, f.target.node, true);
  assert.equal(f.controller.moveNativeSection(f.target, "up", proof), "stayed");
  assert.equal(f.writes.length, 0); assert.equal(f.notices.length, 0);
});

