// Undoing one agent change (ticket am-15): the changes this tab keeps (src/agent-changes.ts), their undo as a
// guarded edit that puts the drafts before them back (`restore`, src/guarded-edit/commit.ts) on the memory
// workspace with the real receipt, discard_change's preparation (shared/agent-edit.ts) and its command (src/agent-site.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuardedEdits, type GuardedEdits, type PlanResult } from "../src/guarded-edit";
import { discardPlan, keptChange, keptChanges, latestChange, noteAgentChange, undoLatestChange, undoAgentChanges, undoState, type AgentChange } from "../src/agent-changes";
import { applySiteCommand, type AgentSiteActions } from "../src/agent-site";
import { prepareAgentEdit, type AgentEdit } from "../shared/agent-edit";
import type { AgentCommand } from "../shared/agent";
import type { SiteFiles } from "../shared/site-files";
import type { DraftScope } from "../src/drafts";
import { createMemoryWorkspace, type MemoryWorkspace } from "./fakes/memory-workspace";
import { forEachAwait } from "./support/await-race";

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
  const drafts = (path: string) => m.draft(path);
  assert.equal(undoState(m.scope, ["mcp-all"], drafts, "grant-a"), "ready");

  const kept = keptChange(m.scope, "mcp-all")!;
  const outcome = await edits.run(r => discardPlan([kept], r, drafts, m.openFile()));
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(m.draft("index.html"), undefined);
  assert.equal(m.workspace.exists("new.css"), false);
  assert.equal(m.workspace.source("old.css"), "p {}");
  assert.equal(m.draft("old.css"), undefined);
  assert.equal(m.announced.at(-1), "Undid Copy editor's change.");
  // The undo is one step of its own, after the change's two.
  assert.deepEqual(m.steps(), ["operation", "operation", "operation"]);
  // Read from the drafts: undone now, and a second undo is refused as such.
  assert.equal(undoState(m.scope, ["mcp-all"], drafts, "grant-a"), "undone");
  assert.deepEqual(await edits.run(r => discardPlan([kept], r, drafts, m.openFile())),
    { ok: false, reason: "refused", message: "mcp-all is undone already: the files are as they were before." });
  // Undo (Ctrl+Z) brings the change back, and with it its Undo; Redo undoes it again.
  assert.equal(m.undo(), true);
  assert.equal(JSON.stringify(sources(m, paths).map(([path, text]) => [path, text])), JSON.stringify(JSON.parse(changed).map(([path, text]: string[]) => [path, text])));
  assert.equal(undoState(m.scope, ["mcp-all"], drafts, "grant-a"), "ready");
  assert.equal(m.redo(), true);
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(m.workspace.exists("new.css"), false);
  assert.equal(undoState(m.scope, ["mcp-all"], drafts, "grant-a"), "undone");
});

test("a change whose file changed since is refused, naming the file, and nothing is written", async () => {
  const { m, edits } = setup();
  const change = await agentChange(m, edits, "mcp-typed", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Hi")]]), done: "Changed.", undone: "Undid." });
  m.typeInto("index.html");
  const steps = m.steps().length, text = m.workspace.source("index.html");
  const outcome = await edits.run(r => discardPlan([change], r, path => m.draft(path), m.openFile()));
  assert.deepEqual(outcome, { ok: false, reason: "refused",
    message: "index.html changed since Copy editor's change mcp-typed, so it cannot be undone as a whole. Change it back with the edit tools." });
  assert.equal(m.steps().length, steps);
  assert.equal(m.workspace.source("index.html"), text);
  // Still offered (pressed, it says which file), as the user may type it back.
  assert.equal(undoState(m.scope, ["mcp-typed"], path => m.draft(path), "grant-a"), "ready");
});

test("the page shown stays open after an undo while it is there; one the change created gives way to the change's page, then the home page", () => {
  const { m } = setup();
  const created = { ...m.scope, version: 1 as const, path: "team.html", baseSha: null, original: "", content: "<main>Team</main>", updatedAt: 1 };
  const change: AgentChange = { id: "mcp-page", grant: "g", agent: "", operation: "create_page", scope: m.scope, page: "about.html",
    before: new Map([["team.html", undefined]]), after: new Map([["team.html", created]]) };
  const reads = { source: () => undefined, exists: (path: string) => path !== "team.html", template: () => undefined, site: () => ({ routes: { ...site.routes, "/team/": "team.html" }, components: {} }) };
  const plan = (open: string | undefined, drafts = (path: string) => path === "team.html" ? created : undefined) => discardPlan([change], reads, drafts, open) as { open?: string; restore: Map<string, unknown>; done: string };
  assert.equal(plan("index.html").open, "index.html");
  assert.equal(plan("team.html").open, "about.html");
  assert.equal(plan("team.html").done, "Undid the agent's change.");
  assert.deepEqual([...plan("team.html").restore], [["team.html", undefined]]);
  assert.equal((discardPlan([{ ...change, page: "team.html" }], reads, path => path === "team.html" ? created : undefined, "team.html") as { open?: string }).open, "index.html");
});

test("the tab keeps the latest 40 changes per site and branch", () => {
  const scope = { account: "lex", repoId: 99, repo: "lex/other", branch: "dev" };
  const draft = (n: number) => ({ ...scope, version: 1 as const, path: "a.html", baseSha: "s", original: "", content: String(n), updatedAt: n });
  for (let n = 0; n < 45; n++) noteAgentChange({ id: `c-${n}`, grant: "g", agent: "A", operation: "write_file", scope, page: "a.html", before: new Map(), after: new Map([["a.html", draft(n)]]) });
  assert.equal(keptChange(scope, "c-4"), undefined);
  assert.equal(keptChange(scope, "c-5")?.id, "c-5");
  assert.equal(keptChange({ ...scope, branch: "main" }, "c-44"), undefined);
  assert.equal(undoState(scope, ["c-1", "c-44"], () => draft(44), "g"), "ready");
  assert.equal(undoState(scope, ["c-1"], () => undefined, "g"), undefined, "none kept");
  assert.equal(undoState(scope, [], () => undefined, "g"), undefined);
  // Another account's site of the same id and branch is another workspace.
  assert.equal(keptChange({ ...scope, account: "sam" }, "c-44"), undefined);
  // A change that wrote nothing is not kept.
  noteAgentChange({ id: "c-none", grant: "g", agent: "A", operation: "write_file", scope, page: "a.html", before: new Map(), after: new Map() });
  assert.equal(keptChange(scope, "c-none"), undefined);
  // A file its commit lists as it was (the page open, which it stayed on) is no file it changed.
  noteAgentChange({ id: "c-open", grant: "g", agent: "A", operation: "write_file", scope, page: "b.html",
    before: new Map([["a.html", draft(44)], ["b.html", undefined]]), after: new Map([["a.html", { ...draft(44), updatedAt: 99 }], ["b.html", { ...draft(1), path: "b.html" }]]) });
  assert.deepEqual([...keptChange(scope, "c-open")!.after.keys()], ["b.html"]);
  assert.equal(latestChange(scope, { grant: "g", name: "A" }, "a.html")?.id, "c-44");
});

const request = (change: string, grantId = "grant-a"): AgentEdit => ({ operation: "edit", tool: "discard_change", args: { change }, id: "mcp-undo", grantId, createdAt: 1 });
test("discard_change is prepared on the change's own page, and refused for a change not kept or another connection's", async () => {
  // Preparing discard_change reads no file.
  const files = {} satisfies Pick<SiteFiles, never> as SiteFiles, context = { pages: [] };
  const kept = (id: string) => id === "mcp-1" ? { grant: "grant-a", page: "about.html" } : undefined;
  assert.deepEqual(await prepareAgentEdit(request("mcp-1"), context, files, undefined, kept), { operation: "discard_change", input: { path: "about.html", args: { change: "mcp-1" } } });
  await assert.rejects(prepareAgentEdit(request("mcp-2"), context, files, undefined, kept), /No change mcp-2 is kept in this editor tab/);
  await assert.rejects(prepareAgentEdit(request("mcp-1", "grant-b"), context, files, undefined, kept), /mcp-1 is another connection's change/);
});

test("the discard_change command undoes the agent's own change where it is shown, and only there", async () => {
  const { m, edits } = setup();
  await agentChange(m, edits, "mcp-cmd", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Hey")]]), done: "Changed.", undone: "Undid." });
  const shown = { scope: m.scope, draft: (path: string) => m.draft(path), openFile: m.openFile() };
  // discard_change uses only these ports; any other would fail as a TypeError.
  const actions = (over: Partial<Pick<AgentSiteActions, "shown">> = {}) => ({ edits, shown: () => shown, ...over }) satisfies Pick<AgentSiteActions, "edits" | "shown"> as AgentSiteActions;
  const command = (grantId = "grant-a"): AgentCommand => ({ id: "mcp-undo", operation: "discard_change", path: "index.html", branch: "main", repoId: 1, grantId,
    commit: "", content: "", args: { change: "mcp-cmd" }, state: "pending", createdAt: 1 });
  await assert.rejects(applySiteCommand(actions(), command("grant-b")), /No change mcp-cmd of yours is kept in this editor tab any more/);
  await assert.rejects(applySiteCommand(actions({ shown: () => ({ ...shown, scope: { ...m.scope, branch: "dev" } }) }), command()), /Show this site and branch in the editor/);
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Hey"));
  const done = await applySiteCommand(actions(), command());
  assert.deepEqual(done, { message: "Undid change mcp-cmd: its files are as they were before it, unsaved.", result: { files: "index.html" } });
  assert.equal(m.workspace.source("index.html"), PAGE);
  await assert.rejects(applySiteCommand(actions(), command()), /mcp-cmd is undone already/);
});

/** The user's Undo on a pin's card over the memory workspace (src/agent-changes.ts `undoAgentChanges`). */
/** `shown`: the workspace shown now; the click's own is the memory workspace's, taken as it is pressed. */
const undoPorts = (m: MemoryWorkspace, edits: Pick<GuardedEdits, "run">, shown: () => DraftScope | undefined = () => m.scope) =>
  ({ scope: m.scope, shown, edits, draft: (_scope: DraftScope, path: string) => m.draft(path), openFile: () => m.openFile() });

for (const order of ["oldest first", "newest first"] as const)
  test(`the pin's Undo puts back two changes of one file newest first, as one step, with their ids ${order}`, async () => {
    const { m, edits } = setup();
    await agentChange(m, edits, `two-a-${order}`, ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "One")]]), done: "1.", undone: "1." });
    await agentChange(m, edits, `two-b-${order}`, ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Two")]]), done: "2.", undone: "2." });
    const ids = [`two-a-${order}`, `two-b-${order}`];
    if (order === "newest first") ids.reverse();
    assert.deepEqual(keptChanges(m.scope, ids).map(change => change.id), [`two-b-${order}`, `two-a-${order}`]);
    const steps = m.steps().length, said: unknown[] = [], workspace = m.workspace, announce = workspace.announce.bind(workspace);
    workspace.announce = (message, as) => { said.push(as); announce(message, as); };
    await undoAgentChanges(ids, "grant-a", undoPorts(m, edits));
    // Said only, no toast: the card's Undone shows it.
    assert.deepEqual(said, ["quiet"]);
    assert.equal(m.workspace.source("index.html"), PAGE);
    assert.equal(m.draft("index.html"), undefined);
    assert.equal(m.steps().length, steps + 1, "one step");
    assert.equal(m.announced.at(-1), "Undid Copy editor's changes.");
    assert.equal(undoState(m.scope, ids, path => m.draft(path), "grant-a"), "undone");
    // Ctrl+Z brings both back.
    assert.equal(m.undo(), true);
    assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Two"));
    assert.equal(undoState(m.scope, ids, path => m.draft(path), "grant-a"), "ready");
  });

test("the pin's Undo is whole or nothing: one of its changes changed since refuses all, and nothing is undone", async () => {
  const { m, edits } = setup();
  await agentChange(m, edits, "whole-a", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "One")]]), done: "1.", undone: "1." });
  await agentChange(m, edits, "whole-b", ["about.html"], { edits: new Map([["about.html", "<main><h1>Team</h1></main>"]]), done: "2.", undone: "2." });
  m.typeInto("index.html");
  const was = JSON.stringify(sources(m, ["index.html", "about.html"])), steps = m.steps().length;
  await assert.rejects(undoAgentChanges(["whole-a", "whole-b"], "grant-a", undoPorts(m, edits)), { message: "This page changed since Copy editor's change. Nothing was undone." });
  assert.equal(JSON.stringify(sources(m, ["index.html", "about.html"])), was);
  assert.equal(m.steps().length, steps);
});

test("the pin's Undo of a change the agent discarded already does nothing, and its card reads Undone", async () => {
  const { m, edits } = setup();
  const change = await agentChange(m, edits, "gone-a", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "One")]]), done: "1.", undone: "1." });
  await edits.run(r => discardPlan([change], r, path => m.draft(path), m.openFile()));
  const steps = m.steps().length;
  await undoAgentChanges(["gone-a"], "grant-a", undoPorts(m, edits));
  assert.equal(m.steps().length, steps);
  assert.equal(undoState(m.scope, ["gone-a"], path => m.draft(path), "grant-a"), "undone");
  await assert.rejects(undoAgentChanges(["never-kept"], "grant-a", undoPorts(m, edits)), /no longer keeps the agent's change/);
});

let races = 0;
test("the pin's Undo writes nothing once another site or branch is shown at any of its awaits", async () => {
  let shownScope: DraftScope | undefined;
  const awaits = await forEachAwait(race => {
    const { m, edits } = setup(), id = `race-${++races}`;
    shownScope = m.scope;
    // Its guarded edit, and the plan within it, each an await the switch may land in.
    const raced: Pick<GuardedEdits, "run"> = { run: (plan, options) => race.port("run", () => edits.run(r => race.port("plan", async () => plan(r))(), options))() };
    const done = agentChange(m, edits, id, ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Race")]]), done: "r.", undone: "r." })
      .then(() => undoAgentChanges([id], "grant-a", undoPorts(m, raced, () => shownScope)).catch(() => undefined));
    return { done, m };
  }, () => { shownScope = { ...shownScope!, branch: "other" }; }, run => {
    assert.equal(run.m.workspace.source("index.html"), PAGE.replace("Hello", "Race"), "nothing undone");
  });
  assert.equal(awaits, 2);
});

test("a pin offers to undo only its own agent's changes: ids of another connection's are left alone", async () => {
  const { m, edits } = setup();
  await agentChange(m, edits, "theirs-b", ["about.html"], { edits: new Map([["about.html", "<main><h1>Team</h1></main>"]]), done: "b.", undone: "b." }, "grant-b");
  const drafts = (path: string) => m.draft(path);
  // Agent A's pin names B's change: nothing to undo from it.
  assert.equal(undoState(m.scope, ["theirs-b"], drafts, "grant-a"), undefined);
  assert.equal(undoState(m.scope, ["theirs-b"], drafts, undefined), undefined, "a pin with no agent");
  await assert.rejects(undoAgentChanges(["theirs-b"], "grant-a", undoPorts(m, edits)), /no longer keeps the agent's change/);
  assert.equal(m.workspace.source("about.html"), "<main><h1>Team</h1></main>");
  // B's own pin does.
  assert.equal(undoState(m.scope, ["theirs-b"], drafts, "grant-b"), "ready");
});

test("a move is undone whole: the file at its old path, the new one gone, a page's rewritten link as before, Undo and Redo back and forth", async () => {
  const { m, edits } = setup();
  const paths = ["old.css", "styles/new.css", "index.html"], linked = PAGE.replace("</main>", '<link href="/styles/new.css"></main>');
  const change = await agentChange(m, edits, "mcp-move", paths, {
    moves: [{ from: "old.css", to: "styles/new.css" }], edits: new Map([["index.html", linked]]), done: "Moved.", undone: "Moved back." });
  assert.equal(m.draft("styles/new.css")?.movedFrom, "old.css");
  assert.equal(m.workspace.exists("old.css"), false);
  const moved = JSON.stringify(sources(m, paths));
  const drafts = (path: string) => m.draft(path);
  assert.deepEqual(await edits.run(r => discardPlan([change], r, drafts, m.openFile())), { ok: true, status: "applied" });
  assert.equal(m.workspace.source("old.css"), "p {}");
  assert.equal(m.draft("old.css"), undefined);
  assert.equal(m.workspace.exists("styles/new.css"), false);
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(undoState(m.scope, ["mcp-move"], drafts, "grant-a"), "undone");
  assert.equal(m.undo(), true);
  assert.equal(JSON.stringify(sources(m, paths).map(([path, text]) => [path, text])), JSON.stringify(JSON.parse(moved).map(([path, text]: string[]) => [path, text])));
  assert.equal(undoState(m.scope, ["mcp-move"], drafts, "grant-a"), "ready");
  assert.equal(m.redo(), true);
  assert.equal(m.workspace.exists("styles/new.css"), false);
  assert.equal(m.workspace.source("old.css"), "p {}");
});

test("in the user's words: a refusal names the page and the agent, never a file path, the change's id or the agent's tools", () => {
  const { m } = setup();
  const typed = { ...m.scope, version: 1 as const, path: "index.html", baseSha: "sha-0", original: PAGE, content: "typed", updatedAt: 9 };
  const change: AgentChange = { id: "mcp-words", grant: "g", agent: "Copy editor", operation: "write_file", scope: m.scope, page: "index.html",
    before: new Map([["index.html", undefined]]), after: new Map([["index.html", { ...typed, content: "agent" }]]) };
  const reads = { source: () => undefined, exists: () => true, template: () => undefined, site: () => site };
  assert.deepEqual(discardPlan([change], reads, () => typed, "index.html", "user"), { refuse: "This page changed since Copy editor's change. Nothing was undone." });
  // Another page shown: the changed one by its title, else as another page; a file that is no page, as one of the change's.
  const titled = { ...reads, source: (path: string) => path === "index.html" ? "<!doctype html><html><head><title>Home &amp; studio</title></head><body><main></main></body></html>" : undefined };
  assert.deepEqual(discardPlan([change], titled, () => typed, "about.html", "user"), { refuse: "The page “Home & studio” changed since Copy editor's change. Nothing was undone." });
  assert.deepEqual(discardPlan([change], reads, () => typed, "about.html", "user"), { refuse: "Another page changed since Copy editor's change. Nothing was undone." });
  const styles = { ...change, page: "site.css", after: new Map([["site.css", { ...typed, path: "site.css", content: "agent" }]]), before: new Map([["site.css", undefined]]) };
  assert.deepEqual(discardPlan([styles], reads, () => ({ ...typed, path: "site.css" }), "index.html", "user"), { refuse: "One of its files changed since Copy editor's change. Nothing was undone." });
  assert.deepEqual(discardPlan([change], reads, () => typed, "index.html"),
    { refuse: "index.html changed since Copy editor's change mcp-words, so it cannot be undone as a whole. Change it back with the edit tools." });
  assert.deepEqual(discardPlan([change], reads, () => undefined, "index.html", "user"), { refuse: "This is undone already." });
});

test("the pin's Undo of a click whose site was left before it ran writes nothing", async () => {
  const { m, edits } = setup();
  await agentChange(m, edits, "left-a", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Left")]]), done: "l.", undone: "l." });
  await assert.rejects(undoAgentChanges(["left-a"], "grant-a", undoPorts(m, edits, () => ({ ...m.scope, branch: "other" }))),
    { message: "The site changed meanwhile. Nothing was undone; try again." });
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Left"));
});

test("past 16 M characters of text, the oldest changes go first", () => {
  const scope = { account: "lex", repoId: 77, repo: "lex/big", branch: "main" };
  const big = (n: number) => ({ ...scope, version: 1 as const, path: `big-${n}.html`, baseSha: null, original: "", content: "x".repeat(9 * 1024 * 1024), updatedAt: n });
  noteAgentChange({ id: "big-1", grant: "g", agent: "A", operation: "write_file", scope, page: "big-1.html", before: new Map(), after: new Map([["big-1.html", big(1)]]) });
  assert.equal(keptChange(scope, "big-1")?.id, "big-1");
  noteAgentChange({ id: "big-2", grant: "g", agent: "A", operation: "write_file", scope, page: "big-2.html", before: new Map(), after: new Map([["big-2.html", big(2)]]) });
  assert.equal(keptChange(scope, "big-1"), undefined);
  assert.equal(keptChange(scope, "big-2")?.id, "big-2");
});

test("an agent's chip finds its latest change to the page it shows on: by connection, name, page and site", async () => {
  const { m, edits } = setup();
  const who = { grant: "grant-chip", name: "Copy editor" };
  await agentChange(m, edits, "chip-1", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "One")]]), done: "1.", undone: "1." }, who.grant);
  // Its command about the home page, but it changed about.html alone: only about.html's chip offers it (it waits on that page).
  await agentChange(m, edits, "chip-2", ["about.html"], { edits: new Map([["about.html", "<main><h1>Team</h1></main>"]]), done: "2.", undone: "2." }, who.grant);
  assert.equal(latestChange(m.scope, who, "about.html")?.id, "chip-2");
  assert.equal(latestChange(m.scope, who, "index.html")?.id, "chip-1", "a change that landed on another page");
  await agentChange(m, edits, "chip-3", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Three")]]), done: "3.", undone: "3." }, who.grant);
  assert.equal(latestChange(m.scope, who, "index.html")?.id, "chip-3");
  assert.equal(latestChange(m.scope, { ...who, name: "Designer" }, "index.html"), undefined, "another agent on the connection");
  assert.equal(latestChange(m.scope, { ...who, grant: "grant-other" }, "index.html"), undefined, "another connection");
  assert.equal(latestChange({ ...m.scope, branch: "other" }, who, "index.html"), undefined, "another branch");
  assert.equal(latestChange(m.scope, who, "team.html"), undefined);
});

test("the chip's Undo puts back the agent's latest change, reads Undone, is offered again after Ctrl+Z, and is refused once the user typed there", async () => {
  const { m, edits } = setup();
  const who = { grant: "grant-chip-undo", name: "Copy editor" }, drafts = (path: string) => m.draft(path);
  await agentChange(m, edits, "chip-undo", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Hi there")]]), done: "1.", undone: "1." }, who.grant);
  const latest = () => latestChange(m.scope, who, "index.html")!;
  assert.equal(undoState(m.scope, [latest().id], drafts, who.grant), "ready");
  await undoAgentChanges([latest().id], who.grant, undoPorts(m, edits));
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(undoState(m.scope, [latest().id], drafts, who.grant), "undone");
  // The editor's Undo of that undo brings the change back, and the chip offers Undo again.
  assert.equal(m.undo(), true);
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Hi there"));
  assert.equal(undoState(m.scope, [latest().id], drafts, who.grant), "ready");
  // Typed in since: refused in the user's words, nothing written.
  m.typeInto("index.html");
  const text = m.workspace.source("index.html"), steps = m.steps().length;
  await assert.rejects(undoAgentChanges([latest().id], who.grant, undoPorts(m, edits)), { message: "This page changed since Copy editor's change. Nothing was undone." });
  assert.equal(m.workspace.source("index.html"), text);
  assert.equal(m.steps().length, steps);
});

test("the chip's Undo is refused when the agent changed the page again since the chip offered its change, and nothing is written", async () => {
  const { m, edits } = setup();
  const who = { grant: "grant-chip-newer", name: "Copy editor" };
  await agentChange(m, edits, "chip-offered", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "One")]]), done: "1.", undone: "1." }, who.grant);
  await agentChange(m, edits, "chip-newer", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Two")]]), done: "2.", undone: "2." }, who.grant);
  const steps = m.steps().length;
  await assert.rejects(undoLatestChange(who, "index.html", "chip-offered", undoPorts(m, edits)), { message: "Copy editor changed this page again meanwhile. Nothing was undone; try again." });
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Two"));
  assert.equal(m.steps().length, steps);
  // The one offered now goes.
  await undoLatestChange(who, "index.html", "chip-newer", undoPorts(m, edits));
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "One"));
});

let chipRaces = 0;
test("the chip's Undo writes nothing once another site or branch is shown at any of its awaits", async () => {
  let shownScope: DraftScope | undefined;
  const awaits = await forEachAwait(race => {
    const { m, edits } = setup(), id = `chip-race-${++chipRaces}`, who = { grant: `grant-${id}`, name: "Copy editor" };
    shownScope = m.scope;
    const raced: Pick<GuardedEdits, "run"> = { run: (plan, options) => race.port("run", () => edits.run(r => race.port("plan", async () => plan(r))(), options))() };
    const done = agentChange(m, edits, id, ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Race")]]), done: "r.", undone: "r." }, who.grant)
      .then(() => undoLatestChange(who, "index.html", id, undoPorts(m, raced, () => shownScope)).then(() => undefined, (error: Error) => error.message));
    return { done, m };
  }, () => { shownScope = { ...shownScope!, branch: "other" }; }, async run => {
    assert.equal(run.m.workspace.source("index.html"), PAGE.replace("Hello", "Race"), "nothing undone");
    assert.equal(await run.done, "The site changed meanwhile. Nothing was undone; try again.");
  });
  assert.equal(awaits, 2);
});

test("the chip's Undo of a change this tab no longer keeps (past the 40 kept) is refused, and nothing is written", async () => {
  const { m, edits } = setup();
  const who = { grant: "grant-chip-gone", name: "Copy editor" };
  await agentChange(m, edits, "chip-gone", ["index.html"], { edits: new Map([["index.html", PAGE.replace("Hello", "Gone")]]), done: "1.", undone: "1." }, who.grant);
  const scope = { account: "lex", repoId: 77, repo: "lex/elsewhere", branch: "main" };
  const draft = (n: number) => ({ ...scope, version: 1 as const, path: "a.html", baseSha: "s", original: "", content: String(n), updatedAt: n });
  for (let n = 0; n < 40; n++) noteAgentChange({ id: `evict-${n}`, grant: "g", agent: "A", operation: "write_file", scope, page: "a.html", before: new Map(), after: new Map([["a.html", draft(n)]]) });
  assert.equal(latestChange(m.scope, who, "index.html"), undefined);
  const steps = m.steps().length;
  await assert.rejects(undoLatestChange(who, "index.html", "chip-gone", undoPorts(m, edits)), { message: "This tab no longer keeps the agent's change. Change it back by hand." });
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Gone"));
  assert.equal(m.steps().length, steps);
});
