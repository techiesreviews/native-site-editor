// The workspace session (src/workspace-session.ts) through its interface:
// one rule for the same workspace, the load counter's stamps, and the keys
// drafts, setup and media are kept under. The last cases run the guarded edit
// module on the memory workspace with a session in place of its generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceSession, same, workspaceKeys, type WorkspaceScope } from "../src/workspace-session";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";

type GitHubScope = Extract<WorkspaceScope, { kind: "github" }>;
const lex: GitHubScope = { kind: "github", account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const folder: WorkspaceScope = { kind: "folder", folderId: "folder-1" };

test("one account whatever its capitals", () => {
  const capital: WorkspaceScope = { ...lex, account: "Lex" };
  assert.ok(same(lex, capital));
  assert.deepEqual(workspaceKeys(capital), workspaceKeys(lex));
  assert.ok(!same(lex, { ...lex, account: "someone" }));
});

test("a repository is its id: a re-created one is another, a renamed one is the same", () => {
  const recreated: WorkspaceScope = { ...lex, repoId: 2 };
  assert.ok(!same(lex, recreated));
  assert.notDeepEqual(workspaceKeys(recreated), workspaceKeys(lex));
  const renamed: WorkspaceScope = { ...lex, repo: "lex/new-name" };
  assert.ok(same(lex, renamed));
  assert.deepEqual(workspaceKeys(renamed), workspaceKeys(lex));
});

test("another branch is another workspace; an empty branch is none", () => {
  assert.ok(!same(lex, { ...lex, branch: "dev" }));
  const empty: WorkspaceScope = { ...lex, branch: "" };
  assert.ok(!same(empty, empty));
  assert.ok(!same(empty, lex));
  assert.equal(workspaceKeys(empty), undefined);
  assert.equal(createWorkspaceSession(empty).keys(), undefined);
});

test("a version view is another scope, with the same drafts, setup and media", () => {
  const older: GitHubScope = { ...lex, view: "abc123:index.html" };
  assert.ok(!same(lex, older));
  assert.ok(same(older, { ...older, account: "LEX" }));
  assert.ok(!same(older, { ...older, view: "def456:index.html" }));
  assert.deepEqual(workspaceKeys(older), workspaceKeys(lex));
});

test("GitHub and local-folder scopes are never the same", () => {
  const named: WorkspaceScope = { kind: "folder", folderId: "lex/site" };
  assert.ok(!same(lex, named));
  assert.ok(!same(named, lex));
  assert.ok(same(folder, { kind: "folder", folderId: "folder-1" }));
  assert.ok(!same(folder, { kind: "folder", folderId: "folder-2" }));
  assert.ok(!same(folder, undefined));
  assert.ok(!same(undefined, undefined));
  const github = workspaceKeys(lex)!, local = workspaceKeys(folder)!;
  for (const key of ["drafts", "setup", "media"] as const) assert.notEqual(github[key], local[key]);
});

test("each key kind is its own namespace", () => {
  const keys = workspaceKeys(lex)!;
  assert.equal(new Set([keys.drafts, keys.setup, keys.media]).size, 3);
});

test("a stamp holds until the next load, and says what moved", () => {
  const session = createWorkspaceSession(lex);
  const reload = session.begin();
  assert.ok(reload.holds());
  assert.equal(reload.changed(), undefined);
  session.next({ ...lex, account: "Lex" });
  assert.ok(!reload.holds());
  assert.equal(reload.changed(), "generation");

  const view = session.begin();
  session.next({ ...lex, view: "abc123:index.html" });
  assert.ok(!view.holds());
  assert.equal(view.changed(), "version-view");

  const other = session.begin();
  session.next({ ...lex, branch: "dev" });
  assert.equal(other.changed(), "scope");
  // The stamp keeps where its work began, so that work can finish there.
  assert.deepEqual({ load: other.load, scope: other.scope }, { load: 2, scope: { ...lex, view: "abc123:index.html" } });
  const out = session.begin();
  session.next(undefined);
  assert.equal(out.changed(), "scope");
  assert.equal(session.current().scope, undefined);
  assert.equal(session.keys(), undefined);
});

test("the load counter grows with each load; keys follow the scope open", () => {
  const session = createWorkspaceSession();
  assert.deepEqual(session.current(), { load: 0, scope: undefined });
  session.next(lex);
  assert.deepEqual(session.current(), { load: 1, scope: lex });
  assert.deepEqual(session.keys(), workspaceKeys(lex));
  session.next(folder);
  assert.equal(session.current().load, 2);
  assert.deepEqual(session.keys(), workspaceKeys(folder));
  assert.deepEqual(session.keys(lex), workspaceKeys(lex));
});

test("on the memory workspace, a guarded edit's stamp stops holding after the session's next load", () => {
  const session = createWorkspaceSession(lex);
  const m = createMemoryWorkspace({ branch: { "index.html": "<main></main>" }, open: "index.html", session });
  const edits = createGuardedEdits(m.workspace);
  assert.equal(m.workspace.scope(), workspaceKeys(lex)!.setup);
  const held = edits.stamp("repository");
  session.next({ ...lex, account: "LEX" });
  assert.ok(!held.holds());
  assert.equal(held.changed(), "generation");
  const moved = edits.stamp("repository");
  session.next({ ...lex, repoId: 2 });
  assert.equal(moved.changed(), "scope");
});
