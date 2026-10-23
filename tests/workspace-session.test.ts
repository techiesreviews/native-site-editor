// The workspace session (src/workspace-session.ts) through its interface:
// one rule for the same workspace, the load counter's stamps, and the keys
// drafts, setup and media are kept under. The last cases run the guarded edit
// module on the memory workspace with a session in place of its generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceSession, draftScopeOf, githubScope, holdsDraftScope, same, sameBranch, sameRepository, setupKeyOf, workspaceKeys, type WorkspaceScope } from "../src/workspace-session";
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

test("a repository is compared by name only when an id is not known, ignoring capitals", () => {
  const named: WorkspaceScope = { ...lex, repoId: 0, repo: "Lex/Site" };
  assert.ok(same(named, lex));
  assert.ok(same(lex, named));
  assert.ok(!same(named, { ...lex, repo: "lex/other" }));
  assert.ok(!same({ ...named, repo: "" }, { ...lex, repo: "" }), "no id and no name is no repository");
  assert.equal(workspaceKeys(named), undefined, "nothing is kept under a repository known only by name");
  // Both ids known: the name does not count (renamed and re-created repositories).
  assert.ok(sameBranch({ repoId: 1, repo: "lex/old", branch: "main" }, { repoId: 1, repo: "lex/new", branch: "main" }));
  assert.ok(!sameBranch({ repoId: 1, repo: "lex/site", branch: "main" }, { repoId: 2, repo: "lex/site", branch: "main" }));
  assert.ok(sameBranch({ repo: "lex/site", branch: "main" }, { repoId: 2, repo: "LEX/site", branch: "main" }));
  assert.ok(!sameBranch({ repo: "lex/site", branch: "main" }, { repoId: 2, repo: "lex/site", branch: "dev" }));
  assert.ok(!sameBranch({ repoId: 1, branch: "" }, { repoId: 1, branch: "" }));
  assert.ok(!sameBranch(undefined, undefined));
});

// The agent menu's checks (src/components/agent-menu.ts) in the shapes it passes: the open and pinned
// repositories as { repoId, repo: fullName, branch }, a hub grant, and an approval that names no id.
test("the agent menu's repository checks: a renamed repository stays pinned; an approval matches by name, any capitals", () => {
  const pinned = { repoId: 1, repo: "lex/site", branch: "main" }, renamed = { ...pinned, repo: "lex/renamed" };
  assert.ok(sameBranch(renamed, pinned), "live(at) holds and no move shows");
  const grant = { id: "g", repoId: 1, repo: "lex/site", branch: "main", via: "oauth" };
  assert.ok(sameBranch(grant, renamed), "liveGrants() keeps the grant");
  assert.ok(!sameBranch({ ...pinned, repoId: 2 }, pinned), "a re-created repository is a move");
  assert.ok(!sameBranch({ ...pinned, branch: "dev" }, pinned), "another branch is a move");
  const approval = { at: 1, repo: "Lex/Site", branch: "main", approval: "a" };
  assert.ok(sameBranch(approval, pinned), "matches(approval)");
  assert.ok(!sameBranch(approval, renamed), "an approval names its repository; a renamed one is another");
  assert.ok(!sameBranch({ ...approval, branch: "dev" }, pinned));
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

test("a stamp keeps where it began even when the caller changes its own scope object", () => {
  const mine: GitHubScope = { ...lex };
  const session = createWorkspaceSession(mine);
  const stamp = session.begin();
  mine.branch = "dev";
  session.next(mine);
  assert.equal((stamp.scope as GitHubScope).branch, "main");
  assert.equal(stamp.changed(), "scope");
  assert.throws(() => { (session.current().scope as GitHubScope).branch = "other"; }, TypeError);
  assert.equal((session.current().scope as GitHubScope).branch, "dev");
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

test("a draft scope is a GitHub scope under the same rule, and back", () => {
  const draft = { account: "Lex", repoId: 1, repo: "lex/site", branch: "main" };
  assert.ok(same(githubScope(draft), lex));
  assert.ok(same(githubScope({ account: "lex", repoId: 1, branch: "main" }), lex));
  assert.deepEqual(draftScopeOf(githubScope(draft)), draft);
  assert.equal(draftScopeOf(folder), undefined);
  assert.equal(draftScopeOf(undefined), undefined);
});

test("within one load the scope never moves: a stamp begun before its snapshot shows holds after, until the next load", () => {
  // main.ts names the scope as the load starts; `draftScope()` and `setupScope()` show it once its snapshot arrives,
  // which is no new load, so the setup-key re-checks beside the load checks were redundant.
  const session = createWorkspaceSession();
  session.next(lex);
  const loading = session.begin();
  assert.ok(loading.holds());
  assert.equal(setupKeyOf(loading.scope), setupKeyOf(session.current().scope));
  session.next(lex);
  assert.ok(!loading.holds());
  assert.equal(loading.changed(), "generation");
});

test("work begun with nothing open sees any later load as another scope", () => {
  // awaitNativeResync refuses then: the agent's command was checked against no site, and a site opened meanwhile.
  const session = createWorkspaceSession();
  const idle = session.begin();
  session.next(lex);
  assert.equal(idle.changed(), "scope");
  assert.equal(setupKeyOf(undefined), "");
});

test("a draft scope belongs to a workspace under the one account rule", () => {
  assert.ok(holdsDraftScope(lex, { account: "LEX", repoId: 1, branch: "main" }));
  assert.ok(!holdsDraftScope(lex, { account: "lex", repoId: 1, branch: "dev" }));
  assert.ok(!holdsDraftScope(undefined, { account: "lex", repoId: 1, branch: "main" }));
});

// Ticket 23: a Files drop that finished elsewhere names the repository only when it is another one.
test("sameRepository is one repository by id (by name only without ids), whatever the branch", () => {
  assert.equal(sameRepository({ repoId: 1, repo: "lex/site" }, { repoId: 1, repo: "lex/renamed" }), true);
  assert.equal(sameRepository({ repoId: 1, repo: "lex/site" }, { repoId: 2, repo: "lex/site" }), false);
  assert.equal(sameRepository({ repo: "Lex/Site" }, { repo: "lex/site" }), true);
  assert.equal(sameRepository(undefined, { repoId: 1 }), false);
});
