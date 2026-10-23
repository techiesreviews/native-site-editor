// The production adapter of the guarded edit seam (src/editor-workspace.ts) over a faked host:
// the anchor proof and the editor calls its range writes make.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditorWorkspace, type WorkspaceHost } from "../src/editor-workspace";
import { draftKey } from "../src/drafts";
import { createWorkspaceSession, githubScope, type SessionStamp } from "../src/workspace-session";

function fake(account = "lex") {
  let open: string | undefined = "index.html", pane = 1, revision = 1, snapshot = true;
  const calls: string[] = [], restored: SessionStamp[] = [], session = createWorkspaceSession(githubScope({ account, repoId: 1, repo: "lex/site", branch: "main" }));
  const host = {
    session: { ...session, shown: () => snapshot ? session.current().scope : undefined }, versionView: () => false, route: () => "/", editModeEntry: () => undefined, agentActing: () => false,
    site: () => undefined, files: () => [], store: () => ({ error: null, get: () => undefined, save: () => true, remove: () => true }),
    source: () => "", exists: () => false, base: () => undefined,
    branchText: async () => undefined, entry: async () => undefined, createProblem: async () => undefined, openFile: () => open,
    restore: async (path: string, at: SessionStamp) => { open = path; restored.push(at); },
    editor: {
      isMounted: (path: string) => path === open,
      getMountedSource: () => "",
      captureFileModelState: () => { const seen = revision; return { isCurrent: () => revision === seen }; },
      captureHistoryHost: (path: string) => { if (path !== open) return undefined; const seen = pane; return { isCurrent: () => pane === seen }; },
      retainFileModel: () => () => {}, evictDraftModel: () => undefined, prepareHistorySources: () => undefined,
      replaceActiveRanges: (edits, companion) => { calls.push(`ranges ${edits.length}${companion ? " hooked" : ""}`); companion?.undo(); },
      replaceActiveRange: (_edit, group) => { calls.push(`range group=${group}`); },
      closeActiveEditGroup: path => { calls.push(`close ${path}`); },
      recordHistoryAction: () => true, holdHistoryRefresh: () => () => {},
    },
    shareHistory: () => () => {}, onMount: () => {}, paneFile: () => undefined, closePane: () => {}, afterFileChanges: () => {},
    openAfter: async () => {}, showRow: () => {}, status: () => "",
    select: request => { calls.push(`select ${request?.node.join(".") ?? "none"}`); },
    flash: request => { calls.push(`flash ${request.node.join(".")}`); },
    announce: message => { calls.push(`say ${message}`); },
    refuse: message => { calls.push(`refuse ${message}`); }, error: () => {},
  } satisfies WorkspaceHost;
  return { workspace: createEditorWorkspace(host), calls, restored, showSnapshot: (shows: boolean) => { snapshot = shows; }, remount: () => { pane++; }, type: () => { revision++; }, bump: () => { session.next(session.current().scope); }, show: (path: string) => { open = path; } };
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

test("a login differing only in capitals keeps its drafts and its setup checklist", () => {
  const lower = fake("lex").workspace, upper = fake("Lex").workspace;
  assert.equal(draftKey(upper.draftScope()!, "index.html"), draftKey(lower.draftScope()!, "index.html"));
  assert.equal(upper.scope(), lower.scope());
  assert.notEqual(upper.scope(), "");
});

test("work begun while the load's snapshot is not on show yet holds once it shows, until the next load", async () => {
  // main.ts drops its setup-key re-checks: the snapshot arriving is no new load, so it does not stop the work.
  const f = fake();
  f.showSnapshot(false);
  assert.equal(f.workspace.draftScope(), undefined);
  assert.equal(f.workspace.scope(), "");
  await f.workspace.open("about.html");
  const [at] = f.restored;
  f.showSnapshot(true);
  assert.notEqual(f.workspace.scope(), "");
  assert.equal(at.holds(), true);
  f.bump();
  assert.equal(at.holds(), false);
});
