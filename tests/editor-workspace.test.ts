// The production adapter of the guarded edit seam (src/editor-workspace.ts) over a faked host:
// the anchor proof and the editor calls its range writes make.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditorWorkspace, type WorkspaceHost } from "../src/editor-workspace";

function fake() {
  let generation = 0, open: string | undefined = "index.html", pane = 1, revision = 1;
  const calls: string[] = [];
  const host = {
    generation: () => generation, setupScope: () => "scope", versionView: () => false, route: () => "/", editModeEntry: () => undefined,
    draftScope: () => ({ account: "lex", repoId: 1, repo: "lex/site", branch: "main" }), agentActing: () => false,
    site: () => undefined, files: () => [], store: () => ({ error: null, get: () => undefined, save: () => true, remove: () => true }),
    source: () => "", exists: () => false, base: () => undefined,
    branchText: async () => undefined, entry: async () => undefined, createProblem: async () => undefined, openFile: () => open,
    restore: async (path: string) => { open = path; },
    editor: {
      isMounted: (path: string) => path === open,
      getMountedSource: () => "",
      captureFileModelState: () => { const seen = revision; return { isCurrent: () => revision === seen }; },
      captureHistoryHost: (path: string) => { if (path !== open) return undefined; const seen = pane; return { isCurrent: () => pane === seen }; },
      retainFileModel: () => () => {}, evictDraftModel: () => undefined, prepareHistorySources: () => undefined,
      replaceActiveRanges: (edits, companion) => { calls.push(`ranges ${edits.length}${companion ? " hooked" : ""}`); companion?.undo(); },
      replaceActiveRange: (_edit, group) => { calls.push(`range group=${group}`); },
      closeActiveEditGroup: path => { calls.push(`close ${path}`); }, hasOpenEditGroup: () => false,
      recordHistoryAction: () => true, holdHistoryRefresh: () => () => {},
    },
    shareHistory: () => () => {}, onMount: () => {}, paneFile: () => undefined, closePane: () => {}, afterFileChanges: () => {},
    openAfter: async () => {}, showRow: () => {}, status: () => "",
    select: request => { calls.push(`select ${request?.node.join(".") ?? "none"}`); },
    flash: request => { calls.push(`flash ${request.node.join(".")}`); },
    announce: message => { calls.push(`say ${message}`); },
    refuse: message => { calls.push(`refuse ${message}`); }, error: () => {},
  } satisfies WorkspaceHost;
  return { workspace: createEditorWorkspace(host), calls, remount: () => { pane++; }, type: () => { revision++; }, bump: () => { generation++; }, show: (path: string) => { open = path; } };
}

test("the anchor holds while the same pane shows the page at the same revision", () => {
  for (const [what, change] of [["a pane mounted again", "remount"], ["typing", "type"], ["a new generation", "bump"]] as const) {
    const f = fake(), anchor = f.workspace.anchor("index.html")!;
    assert.equal(anchor.isCurrent(), true);
    f[change]();
    assert.equal(anchor.isCurrent(), false, what);
  }
  const f = fake(), anchor = f.workspace.anchor("index.html")!;
  f.show("about.html");
  assert.equal(anchor.isCurrent(), false);
  assert.equal(f.workspace.anchor("index.html"), undefined);
});

test("ranges go through the editor's own step, its hooks on Undo and Redo; a typing group through its grouped range", () => {
  const f = fake(), edit = { start: 0, end: 0, text: "x", expected: "" };
  f.workspace.replaceRanges("index.html", [edit, { ...edit, start: 1, end: 1 }], false);
  f.workspace.replaceRanges("index.html", [edit], false, { undo: () => { f.calls.push("undo hook"); }, redo: () => {} });
  f.workspace.replaceRanges("index.html", [edit], true);
  assert.throws(() => f.workspace.replaceRanges("index.html", [edit, edit], true));
  f.workspace.select({ path: "index.html", node: [0, 1] }, "After Heading");
  f.workspace.select(undefined, "ignored");
  assert.deepEqual(f.calls, ["ranges 2", "ranges 1 hooked", "undo hook", "range group=true", "select 0.1", "flash 0.1", "select none"]);
});
