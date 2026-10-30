// Undoing one agent change (ticket am-15): the changes this tab keeps (src/agent-changes.ts), their undo as a
// guarded edit that puts the drafts before them back (`restore`, src/guarded-edit/commit.ts) on the memory
// workspace with the real receipt, discard_change's preparation (shared/agent-edit.ts) and its command (src/agent-site.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuardedEdits, type PlanResult } from "../src/guarded-edit";
import { changeUndone, discardPlan, keptChange, noteAgentChange, undoState, type AgentChange } from "../src/agent-changes";
import { applySiteCommand, type AgentSiteActions } from "../src/agent-site";
import { prepareAgentEdit, type AgentEdit } from "../shared/agent-edit";
import type { AgentCommand } from "../shared/agent";
import type { SiteFiles } from "../shared/site-files";
import { createMemoryWorkspace, type MemoryWorkspace } from "./fakes/memory-workspace";

const PAGE = "<main><h1>Home</h1><p>Hello</p></main>";
const site = { routes: { "/": "index.html", "/about/": "about.html" }, components: {} };

function setup() {
  const m = createMemoryWorkspace({ branch: { "index.html": PAGE, "about.html": "<main><h1>About</h1></main>", "old.css": "p {}" }, open: "index.html", site });
  return { m, edits: createGuardedEdits(m.workspace) };
}
/** An agent's change as its commit sees it: the drafts of `paths` before and after `plan`, kept under `id`. */
async function agentChange(m: MemoryWorkspace, edits: ReturnType<typeof createGuardedEdits>, id: string, paths: string[], plan: PlanResult, grant = "grant-a") {
  const before = new Map(paths.map(path => [path, m.draft(path)] as const));
  const outcome = await edits.run(r => {
    for (const path of paths) r.source(path);
    return plan;
  }, { anchor: "index.html" });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const change: AgentChange = { id, grant, agent: "Copy editor", operation: "write_file", scope: m.scope, page: "index.html",
    before, after: new Map(paths.map(path => [path, m.draft(path)] as const)) };
  noteAgentChange(change);
  return change;
}
const sources = (m: MemoryWorkspace, paths: string[]) => paths.map(path => [path, m.workspace.source(path) ?? null, m.draft(path) ?? null]);

test("an agent's change is undone whole: its page edited, a file created and one deleted are as before, and Undo and Redo take it back and forth", async () => {
  const { m, edits } = setup();
  const paths = ["index.html", "new.css", "old.css"];
  const was = JSON.stringify(sources(m, paths));
  // The plan reads through r: the fake's agent change, made with the editor's own commit.
  const change = await agentChange(m, edits, "mcp-all", ["index.html", "new.css"], {
    edits: new Map([["index.html", PAGE.replace("Hello", "Hi there")]]), creates: [{ path: "new.css", content: "h1 {}" }],
    done: "Agent change.", undone: "Undid agent change.",
  });
  // The delete in a plan of its own, so both kinds of draft are in one kept change.
  await edits.run(r => { r.source("old.css"); return { deletes: ["old.css"], done: "Deleted.", undone: "Restored." }; }, { anchor: "index.html" });
  noteAgentChange({ ...change, before: new Map([...change.before, ["old.css", undefined]]), after: new Map(paths.map(path => [path, m.draft(path)] as const)) });
  const changed = JSON.stringify(sources(m, paths));
  assert.notEqual(changed, was);
  assert.equal(undoState(m.scope, ["mcp-all"]), "ready");

  const kept = keptChange(m.scope, "mcp-all")!;
  const outcome = await edits.run(r => discardPlan(kept, r, path => m.draft(path), m.openFile()));
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  changeUndone(kept);
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(m.draft("index.html"), undefined);
  assert.equal(m.workspace.exists("new.css"), false);
  assert.equal(m.workspace.source("old.css"), "p {}");
  assert.equal(m.draft("old.css"), undefined);
  assert.equal(m.announced.at(-1), "Undid Copy editor's change.");
  // The undo is one step of its own, after the change's two.
  assert.deepEqual(m.steps(), ["operation", "operation", "operation"]);
  assert.equal(undoState(m.scope, ["mcp-all"]), "undone");
  assert.equal(keptChange(m.scope, "mcp-all"), undefined);
  // Undo brings the change back; Redo undoes it again.
  assert.equal(m.undo(), true);
  assert.equal(JSON.stringify(sources(m, paths).map(([path, text]) => [path, text])), JSON.stringify(JSON.parse(changed).map(([path, text]: string[]) => [path, text])));
  assert.equal(m.redo(), true);
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(m.workspace.exists("new.css"), false);
});

test("a change whose file changed since is refused, naming the file, and nothing is written", async () => {
  const { m, edits } = setup();
  const change = await agentChange(m, edits, "mcp-typed", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Hi")]]), done: "Changed.", undone: "Undid." });
  m.typeInto("index.html");
  const steps = m.steps().length, text = m.workspace.source("index.html");
  const outcome = await edits.run(r => discardPlan(change, r, path => m.draft(path), m.openFile()));
  assert.deepEqual(outcome, { ok: false, reason: "refused",
    message: "index.html changed since Copy editor's change mcp-typed, so it cannot be undone as a whole. Change it back with the edit tools." });
  assert.equal(m.steps().length, steps);
  assert.equal(m.workspace.source("index.html"), text);
  assert.equal(undoState(m.scope, ["mcp-typed"]), "ready", "still kept: the user may type it back");
});

test("the page shown stays open after an undo while it is there; one the change created gives way to the change's page, then the home page", () => {
  const { m } = setup();
  const created = { ...m.scope, version: 1 as const, path: "team.html", baseSha: null, original: "", content: "<main>Team</main>", updatedAt: 1 };
  const change: AgentChange = { id: "mcp-page", grant: "g", agent: "", operation: "create_page", scope: m.scope, page: "about.html",
    before: new Map([["team.html", undefined]]), after: new Map([["team.html", created]]) };
  const reads = { source: () => undefined, exists: (path: string) => path !== "team.html", template: () => undefined, site: () => ({ routes: { ...site.routes, "/team/": "team.html" }, components: {} }) };
  const plan = (open: string | undefined, drafts = (path: string) => path === "team.html" ? created : undefined) => discardPlan(change, reads, drafts, open) as { open?: string; restore: Map<string, unknown>; done: string };
  assert.equal(plan("index.html").open, "index.html");
  assert.equal(plan("team.html").open, "about.html");
  assert.equal(plan("team.html").done, "Undid the agent's change.");
  assert.deepEqual([...plan("team.html").restore], [["team.html", undefined]]);
  assert.equal((discardPlan({ ...change, page: "team.html" }, reads, path => path === "team.html" ? created : undefined, "team.html") as { open?: string }).open, "index.html");
});

test("the tab keeps the latest 40 changes per site and branch", () => {
  const scope = { account: "lex", repoId: 99, repo: "lex/other", branch: "dev" };
  const draft = (n: number) => ({ ...scope, version: 1 as const, path: "a.html", baseSha: "s", original: "", content: String(n), updatedAt: n });
  for (let n = 0; n < 45; n++) noteAgentChange({ id: `c-${n}`, grant: "g", agent: "A", operation: "write_file", scope, page: "a.html", before: new Map(), after: new Map([["a.html", draft(n)]]) });
  assert.equal(keptChange(scope, "c-4"), undefined);
  assert.equal(keptChange(scope, "c-5")?.id, "c-5");
  assert.equal(keptChange({ ...scope, branch: "main" }, "c-44"), undefined);
  assert.equal(undoState(scope, ["c-1", "c-44"]), "ready");
  assert.equal(undoState(scope, []), undefined);
  // A change that wrote nothing is not kept.
  noteAgentChange({ id: "c-none", grant: "g", agent: "A", operation: "write_file", scope, page: "a.html", before: new Map(), after: new Map() });
  assert.equal(keptChange(scope, "c-none"), undefined);
});

const request = (change: string, grantId = "grant-a"): AgentEdit => ({ operation: "edit", tool: "discard_change", args: { change }, id: "mcp-undo", grantId, createdAt: 1 });
test("discard_change is prepared on the change's own page, and refused for a change not kept or another connection's", async () => {
  const files = {} as SiteFiles, context = { pages: [] };
  const kept = (id: string) => id === "mcp-1" ? { grant: "grant-a", page: "about.html" } : undefined;
  assert.deepEqual(await prepareAgentEdit(request("mcp-1"), context, files, undefined, kept), { operation: "discard_change", input: { path: "about.html", args: { change: "mcp-1" } } });
  await assert.rejects(prepareAgentEdit(request("mcp-2"), context, files, undefined, kept), /No change mcp-2 is kept in this editor tab/);
  await assert.rejects(prepareAgentEdit(request("mcp-1", "grant-b"), context, files, undefined, kept), /mcp-1 is another connection's change/);
});

test("the discard_change command undoes the agent's own change where it is shown, and only there", async () => {
  const { m, edits } = setup();
  await agentChange(m, edits, "mcp-cmd", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Hey")]]), done: "Changed.", undone: "Undid." });
  const shown = { scope: m.scope, draft: (path: string) => m.draft(path), openFile: m.openFile() };
  const actions = (over: Partial<AgentSiteActions> = {}) => ({ edits, shown: () => shown, ...over }) as AgentSiteActions;
  const command = (grantId = "grant-a"): AgentCommand => ({ id: "mcp-undo", operation: "discard_change", path: "index.html", branch: "main", repoId: 1, grantId,
    commit: "", content: "", args: { change: "mcp-cmd" }, state: "pending", createdAt: 1 });
  await assert.rejects(applySiteCommand(actions(), command("grant-b")), /No change mcp-cmd of yours is kept in this editor tab any more/);
  await assert.rejects(applySiteCommand(actions({ shown: () => ({ ...shown, scope: { ...m.scope, branch: "dev" } }) }), command()), /Show this site and branch in the editor/);
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Hey"));
  const done = await applySiteCommand(actions(), command());
  assert.deepEqual(done, { message: "Undid change mcp-cmd: its files are as they were before it, unsaved.", result: { files: "index.html" } });
  assert.equal(m.workspace.source("index.html"), PAGE);
  await assert.rejects(applySiteCommand(actions(), command()), /No change mcp-cmd of yours/);
});
