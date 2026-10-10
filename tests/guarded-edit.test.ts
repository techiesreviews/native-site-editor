// The guarded edit module (src/guarded-edit.ts) through its interface, on the
// memory workspace (tests/fakes/memory-workspace.ts) with the real receipt.
// Each case checks the Outcome, what was written and how many undo steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuardedEdits, STALE_MESSAGE, type PlanResult, type Reads, type RunOptions } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred, type MemoryWorkspace } from "./fakes/memory-workspace";

const PAGE = "<main><h1>Home</h1><p>Hello</p></main>";
const ABOUT = "<main><h1>About</h1></main>";
const CARD = "<template><article><slot></slot></article></template>";
const CSS = "h1 { color: red; }";
const site = { routes: { "/": "index.html", "/about/": "about.html" }, components: { "site-card": "components/site-card.html" } };

function setup(init: Parameters<typeof createMemoryWorkspace>[0] = {}) {
  const m = createMemoryWorkspace({
    branch: { "index.html": PAGE, "about.html": ABOUT, "old.html": "<p>old</p>", "components/site-card.html": CARD, "components/empty.html": "", "styles/site.css": CSS },
    open: "index.html", site, ...init,
  });
  return { m, edits: createGuardedEdits(m.workspace) };
}
/** Every file's bytes, every draft and the undo steps: what "nothing written" compares. */
const state = (m: MemoryWorkspace) => JSON.stringify({ files: m.files().map(path => [path, m.workspace.source(path), m.draft(path)]), steps: m.steps() });
const step = (path: string, after: string): PlanResult => ({ edits: new Map([[path, after]]), done: `Changed ${path}.`, undone: `Undid ${path}.` });
const insertH2 = (r: Reads): PlanResult => {
  const page = r.source("index.html")!;
  return { edits: new Map([["index.html", page.replace("</main>", "<h2>New</h2></main>")]]), done: "Heading added.", undone: "Undid adding the Heading.",
    select: { before: { path: "index.html", node: [0, 0] }, after: { path: "index.html", node: [0, 2] }, flash: "Into Main › after Paragraph" } };
};

/** Runs `plan`, holding it open after its reads while `meanwhile` changes the workspace; asserts nothing was written. */
async function racing(m: MemoryWorkspace, edits: ReturnType<typeof createGuardedEdits>, plan: (r: Reads) => PlanResult, meanwhile: () => void, options?: RunOptions) {
  const wait = deferred();
  const pending = edits.run(async r => { const result = plan(r); await wait.promise; return result; }, options);
  await Promise.resolve();
  meanwhile();
  const after = state(m);
  wait.resolve();
  const outcome = await pending;
  assert.equal(state(m), after, "nothing written");
  return outcome;
}
const staleOn = (changed: unknown) => ({ ok: false, reason: "stale", changed, message: STALE_MESSAGE });

// ---- Read staleness ----

test("a file read and edited by someone else before the commit is stale, nothing written", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => { r.source("about.html"); return insertH2(r); }, () => m.writeDraft("about.html", "<main>agent</main>"));
  assert.deepEqual(outcome, staleOn({ file: "about.html" }));
});

test("a template read through r.template that changes is stale on the template's file", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => { assert.equal(r.template("site-card")?.source, CARD); return insertH2(r); }, () => m.writeDraft("components/site-card.html", "<template><div><slot></slot></div></template>"));
  assert.deepEqual(outcome, staleOn({ file: "components/site-card.html" }));
});

test("a template's map entry moving to another file is stale on the site", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => { r.template("site-card"); return insertH2(r); },
    () => m.setSite({ ...site, components: { "site-card": "components/site-card/site-card.html" } }));
  assert.deepEqual(outcome, staleOn("site"));
});

test("a path read as absent that is created meanwhile is stale on its existence", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => {
    assert.equal(r.exists("new.html"), false);
    return { creates: [{ path: "new.html", content: "<p>new</p>" }], done: "Created.", undone: "Undid." };
  }, () => m.writeDraft("new.html", "<p>theirs</p>"));
  assert.deepEqual(outcome, staleOn({ exists: "new.html" }));
});

test("a route added after r.site() is stale on the site", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => { r.site(); return insertH2(r); }, () => m.setSite({ ...site, routes: { ...site.routes, "/new/": "new.html" } }));
  assert.deepEqual(outcome, staleOn("site"));
});

test("an empty file read and then filled is stale (an empty template is still a read)", async () => {
  const { m, edits } = setup();
  const outcome = await racing(m, edits, r => { assert.equal(r.source("components/empty.html"), ""); return insertH2(r); }, () => m.writeDraft("components/empty.html", "<p>filled</p>"));
  assert.deepEqual(outcome, staleOn({ file: "components/empty.html" }));
});

test("a read of a mounted file is proved by its model too: typing that ends on the same bytes is stale", async () => {
  const { m, edits } = setup({ mounted: ["styles/site.css"] });
  const outcome = await racing(m, edits, r => { r.source("styles/site.css"); return insertH2(r); }, () => { m.typeInto("styles/site.css", "x"); m.typeInto("styles/site.css", CSS); });
  assert.deepEqual(outcome, staleOn({ file: "styles/site.css" }));
});

test("a peek read that changes does not refuse, and peek reads are not escaped reads", async () => {
  const { m, edits } = setup();
  const wait = deferred();
  const pending = edits.run(async r => { edits.peek.source("about.html"); const result = insertH2(r); await wait.promise; return result; });
  m.writeDraft("about.html", "<main>agent</main>");
  wait.resolve();
  assert.deepEqual(await pending, { ok: true, status: "applied" });
  assert.equal(m.escapedReads(), 0);
  m.source("index.html");
  assert.equal(m.escapedReads(), 1);
});

// ---- Await and lazy-import staleness ----

const stampChanges: [string, (m: MemoryWorkspace) => void, unknown][] = [
  ["the generation bumps", m => m.bumpGeneration(), "generation"],
  ["another repository or branch opens", m => m.setScope("lex/other@main"), "scope"],
  ["a version view opens", m => m.setVersionView(true), "version-view"],
  ["another page is shown", m => m.setRoute("/about/"), "route"],
  ["Edit component mode is entered", m => m.enterEditMode(), "edit-mode"],
  ["Edit component mode is left", m => m.leaveEditMode(), "edit-mode"],
  ["Edit component mode is left and entered again", m => { m.leaveEditMode(); m.enterEditMode(); }, "edit-mode"],
];
for (const [what, change, key] of stampChanges) {
  test(`stale when ${what} during a wait inside the plan`, async () => {
    const { m, edits } = setup();
    if (/left/.test(what)) m.enterEditMode();
    assert.deepEqual(await racing(m, edits, insertH2, () => change(m)), staleOn(key));
  });
  test(`stale when ${what} between the action's start (since) and run`, async () => {
    const { m, edits } = setup();
    if (/left/.test(what)) m.enterEditMode();
    const since = edits.stamp();
    change(m);
    assert.equal(since.holds(), false);
    assert.deepEqual(since.changed(), key);
    const before = state(m);
    assert.deepEqual(await edits.run(insertH2, { since }), staleOn(key));
    assert.equal(state(m), before);
  });
}

for (const [what, change] of [
  ["the anchor page is closed", (m: MemoryWorkspace) => m.close()],
  ["the anchor page is mounted again", (m: MemoryWorkspace) => m.remount("index.html")],
  ["someone types into the anchor page", (m: MemoryWorkspace) => m.typeInto("index.html")],
] as const) test(`stale on the anchor when ${what} during the plan`, async () => {
  const { m, edits } = setup();
  assert.deepEqual(await racing(m, edits, r => { r.source("about.html"); return { edits: new Map([["about.html", "<main>x</main>"]]), done: "d", undone: "u" }; }, () => change(m)), staleOn("anchor"));
});

test("a stamp taken at a click survives the run opening the anchor page", async () => {
  const { m, edits } = setup({ open: "about.html" });
  const since = edits.stamp();
  const outcome = await edits.run(insertH2, { since, anchor: "index.html" });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.openFile(), "index.html");
  assert.match(m.workspace.source("index.html")!, /<h2>New<\/h2>/);
});

test("a change while the anchor page opens is stale and the plan never runs", async () => {
  const { m, edits } = setup({ open: "about.html" });
  const hold = m.holdOpen();
  let planned = false;
  const pending = edits.run(r => { planned = true; return insertH2(r); }, { anchor: "index.html" });
  await hold.reached;
  m.bumpGeneration();
  hold.release();
  assert.deepEqual(await pending, staleOn("generation"));
  assert.equal(planned, false);
  assert.deepEqual(m.steps(), []);
});

test("guard() false at commit is stale on the guard", async () => {
  const { m, edits } = setup();
  let selected = true;
  assert.deepEqual(await racing(m, edits, insertH2, () => { selected = false; }, { guard: () => selected }), staleOn("guard"));
});

// ---- Apply staleness (the commit's own waits) ----

test("a change during the commit's branch read is stale and writes nothing", async () => {
  const { m, edits } = setup();
  const before = state(m);
  const hold = m.holdBranchRead();
  const pending = edits.run(r => {
    r.source("styles/site.css");
    return { edits: new Map([["about.html", r.source("about.html")!.replace("About", "Team")]]), done: "d", undone: "u" };
  });
  await hold.reached;
  m.writeDraft("styles/site.css", "h1 { color: blue; }");
  hold.release();
  assert.deepEqual(await pending, staleOn({ file: "styles/site.css" }));
  assert.equal(m.draft("about.html"), undefined);
  assert.deepEqual(m.steps(), []);
  assert.notEqual(state(m), before);
});

let selectedNow = true;
for (const [what, change, key] of [
  ["the generation bumps", (m: MemoryWorkspace) => m.bumpGeneration(), "generation"],
  ["another page is shown", (m: MemoryWorkspace) => m.setRoute("/about/"), "route"],
  ["the guard turns false", () => { selectedNow = false; }, "guard"],
  ["someone types into the anchor page", (m: MemoryWorkspace) => m.typeInto("index.html"), "anchor"],
] as const) test(`stale on ${JSON.stringify(key)} when ${what} during the commit's branch read`, async () => {
  const { m, edits } = setup();
  selectedNow = true;
  const hold = m.holdBranchRead();
  const pending = edits.run(r => ({ edits: new Map([["about.html", r.source("about.html") + "!"]]), done: "d", undone: "u" }), { guard: () => selectedNow });
  await hold.reached;
  change(m);
  hold.release();
  assert.deepEqual(await pending, staleOn(key));
  assert.equal(m.draft("about.html"), undefined);
  assert.deepEqual(m.steps(), []);
});

for (const [where, init] of [["a draft", { drafts: { "new.html": "<p>draft</p>" } }], ["a branch file", { branch: { "index.html": PAGE, "new.html": "<p>branch</p>" } }]] as const)
  test(`creating a file that exists as ${where} is refused`, async () => {
    const { m, edits } = setup(init);
    const before = state(m);
    const outcome = await edits.run(() => ({ creates: [{ path: "new.html", content: "<p>mine</p>" }], done: "d", undone: "u" }));
    assert.deepEqual(outcome, { ok: false, reason: "refused", message: "new.html already exists. No files were changed." });
    assert.equal(state(m), before);
  });

test("deleting a missing file is refused", async () => {
  const { m, edits } = setup();
  const outcome = await edits.run(r => { r.exists("gone.html"); return { deletes: ["gone.html"], done: "d", undone: "u" }; });
  assert.deepEqual(outcome, { ok: false, reason: "refused", message: "gone.html is not there any more." });
  assert.deepEqual(m.steps(), []);
});

test("moving onto an existing path is refused", async () => {
  const { m, edits } = setup();
  const before = state(m);
  const outcome = await edits.run(r => { r.source("old.html"); return { moves: [{ from: "old.html", to: "about.html" }], done: "d", undone: "u" }; });
  assert.deepEqual(outcome, { ok: false, reason: "refused", message: "about.html already exists. No files were changed." });
  assert.equal(state(m), before);
});

// ---- One undo step ----

test("two edits, a create and a delete are one undo step; Undo restores all and selects before, Redo after", async () => {
  const { m, edits } = setup();
  const before = state(m);
  const outcome = await edits.run(r => {
    const page = r.source("index.html")!, about = r.source("about.html")!;
    r.source("old.html");
    return {
      edits: new Map([["index.html", page.replace("Home", "Start")], ["about.html", about.replace("About", "Team")]]),
      creates: [{ path: "team.html", content: "<p>team</p>" }], deletes: ["old.html"],
      select: { before: { path: "index.html", node: [0, 0] }, after: { path: "index.html", node: [0, 1] }, flash: "After Heading" },
      done: "Four files changed.", undone: "Undid four files.",
    };
  });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["operation"]);
  const applied = state(m);
  assert.match(m.workspace.source("index.html")!, /Start/);
  assert.equal(m.workspace.source("about.html"), ABOUT.replace("About", "Team"));
  assert.equal(m.workspace.source("team.html"), "<p>team</p>");
  assert.equal(m.workspace.exists("old.html"), false);
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 1], source: PAGE.replace("Home", "Start") });
  assert.deepEqual(m.flashed, ["After Heading"]);
  assert.equal(m.announced.at(-1), "Four files changed.");

  assert.equal(m.undo(), true);
  assert.equal(state(m).replace(/"steps":\[[^\]]*\]/, ""), before.replace(/"steps":\[[^\]]*\]/, ""));
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 0] });
  assert.equal(m.announced.at(-1), "Undid four files.");
  assert.equal(m.redo(), true);
  assert.equal(state(m), applied);
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 1] });
});

test("select.historyOnly: even one file takes the receipt, the step leaves the selection alone, Undo and Redo select", async () => {
  const { m, edits } = setup();
  const select = { before: { path: "index.html", node: [0, 0] }, after: { path: "index.html", node: [0, 1] }, historyOnly: true };
  const outcome = await edits.run(r => ({ edits: new Map([["index.html", r.source("index.html")!.replace("Hello", "Hi")]]), select, done: "d", undone: "u" }));
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["operation"]);
  assert.deepEqual(m.selected, []);
  assert.equal(m.undo(), true);
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 0] });
  assert.equal(m.redo(), true);
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 1] });
  assert.throws(() => edits.now(r => ({ edits: new Map([["index.html", r.source("index.html") + "!"]]), select, done: "d", undone: "u" })), /historyOnly/);
});

test("Undo refuses, with the receipt's message, once a file of the step moved since", async () => {
  const { m, edits } = setup();
  await edits.run(r => ({ edits: new Map([["index.html", r.source("index.html") + "!"], ["about.html", r.source("about.html") + "!"]]), done: "d", undone: "u" }));
  m.writeDraft("about.html", "<main>agent</main>");
  const after = state(m);
  assert.equal(m.undo(), false);
  assert.match(m.refusals.at(-1)!, /about\.html/);
  assert.equal(state(m), after);
});

// ---- Path choice ----

test("one mounted file with ranges takes the editor's own step", async () => {
  const { m, edits } = setup();
  const outcome = await edits.run(r => {
    const page = r.source("index.html")!, start = page.indexOf("Hello");
    return { edits: new Map([["index.html", [{ start, end: start + 5, text: "Hi", expected: "Hello" }]]]), done: "Text changed", undone: "u" };
  });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["range"]);
  assert.equal(m.workspace.source("index.html"), PAGE.replace("Hello", "Hi"));
  assert.equal(m.announced.at(-1), "Text changed");
  assert.equal(m.undo(), true);
  assert.equal(m.workspace.source("index.html"), PAGE);
});

test("full text for the anchor alone also takes the editor's step; several files take the receipt", async () => {
  const { m, edits } = setup();
  await edits.run(insertH2);
  assert.deepEqual(m.steps(), ["range"]);
  await edits.run(r => ({ edits: new Map([["index.html", r.source("index.html") + " "], ["styles/site.css", r.source("styles/site.css") + " "]]), done: "d", undone: "u" }));
  assert.deepEqual(m.steps(), ["range", "operation"]);
  // An open file other than the anchor, alone: the anchor's history takes it through the receipt.
  await edits.run(r => ({ edits: new Map([["about.html", r.source("about.html") + " "]]), done: "d", undone: "u" }));
  assert.deepEqual(m.steps(), ["range", "operation", "operation"]);
});

test("now() writes the anchor's ranges synchronously as one step", () => {
  const { m, edits } = setup();
  const outcome = edits.now(insertH2);
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["range"]);
  assert.deepEqual(m.selected.at(-1), { path: "index.html", node: [0, 2] });
});

// ---- unchanged, stayed, refuse ----

test("writes equal to the reads are unchanged and record nothing", async () => {
  const { m, edits } = setup();
  const before = state(m);
  assert.deepEqual(await edits.run(r => ({ edits: new Map([["index.html", r.source("index.html")!]]), done: "d", undone: "u" })), { ok: true, status: "unchanged" });
  assert.equal(state(m), before);
  assert.deepEqual(m.announced, []);
});

test("stayed announces and records nothing; refuse returns its text", async () => {
  const { m, edits } = setup();
  assert.deepEqual(await edits.run(() => ({ stayed: "Already first." })), { ok: true, status: "stayed" });
  assert.deepEqual(m.announced, ["Already first."]);
  assert.deepEqual(await edits.run(() => ({ refuse: "index.html is not there any more." })), { ok: false, reason: "refused", message: "index.html is not there any more." });
  assert.deepEqual(m.steps(), []);
});

test("a plan that refuses on bytes that moved meanwhile is stale, not refused", async () => {
  const { m, edits } = setup();
  assert.deepEqual(await racing(m, edits, r => { r.source("about.html"); return { refuse: "No." }; }, () => m.writeDraft("about.html", "x")), staleOn({ file: "about.html" }));
});

// ---- Programmer errors ----

test("writing a path the plan never read throws", async () => {
  const { edits } = setup();
  await assert.rejects(edits.run(() => step("about.html", "x")), /never read through r/);
  await assert.rejects(edits.run(r => { r.exists("old.html"); return { edits: new Map([["old.html", "x"]]), done: "d", undone: "u" }; }), /bytes the plan never read/);
  await assert.rejects(edits.run(() => ({ deletes: ["old.html"], done: "d", undone: "u" })), /never read through r/);
});

test("r used after the plan returned throws", async () => {
  const { edits } = setup();
  let kept: Reads | undefined;
  await edits.run(r => { kept = r; return { stayed: "s" }; });
  assert.throws(() => kept!.source("index.html"), /after the plan returned/);
});

test("ranges whose expected slice is not the bytes read throw", async () => {
  const { edits } = setup();
  await assert.rejects(edits.run(r => { r.source("index.html"); return { edits: new Map([["index.html", [{ start: 0, end: 6, text: "<div>", expected: "<span>" }]]]), done: "d", undone: "u" }; }), /expects bytes/);
});

test("two writes to one path throw", async () => {
  const { edits } = setup();
  await assert.rejects(edits.run(r => { r.source("old.html"); return { edits: new Map([["old.html", "x"]]), deletes: ["old.html"], done: "d", undone: "u" }; }), /written twice/);
});

test("now() with creates, with another file, with an async plan or with an unopened anchor throws; run() with a group throws", async () => {
  const { edits } = setup();
  assert.throws(() => edits.now(() => ({ creates: [{ path: "x.html", content: "" }], done: "d", undone: "u" })), /cannot create/);
  assert.throws(() => edits.now(r => ({ edits: new Map([["about.html", r.source("about.html") + "!"]]), done: "d", undone: "u" })), /writes only its anchor/);
  assert.throws(() => edits.now((async () => ({ stayed: "s" })) as never), /synchronous plan/);
  assert.throws(() => edits.now(insertH2, { anchor: "about.html" }), /open and mounted/);
  await assert.rejects(edits.run(insertH2, { group: "title" }), /now\(\) only/);
});

// ---- Typing groups ----

const typed = (letter: string) => (r: Reads): PlanResult => {
  const page = r.source("index.html")!, at = page.indexOf("</h1>");
  return { edits: new Map([["index.html", [{ start: at, end: at, text: letter }]]]), done: "Text changed", undone: "u" };
};

test("three now() calls with one group key are one undo step", () => {
  const { m, edits } = setup();
  for (const letter of "abc") assert.deepEqual(edits.now(typed(letter), { group: "title" }), { ok: true, status: "applied" });
  assert.deepEqual(m.steps(), ["range"]);
  assert.match(m.workspace.source("index.html")!, /Homeabc<\/h1>/);
  assert.equal(m.undo(), true);
  assert.equal(m.workspace.source("index.html"), PAGE);
});

test("another group key, a run, or a stale read closes the group", async () => {
  const { m, edits } = setup();
  edits.now(typed("a"), { group: "title" });
  edits.now(typed("b"), { group: "text" });
  assert.deepEqual(m.steps(), ["range", "range"]);
  await edits.run(typed("c"));
  edits.now(typed("d"), { group: "text" });
  assert.deepEqual(m.steps(), ["range", "range", "range", "range"]);
  const since = edits.stamp();
  m.bumpGeneration();
  assert.deepEqual(edits.now(typed("e"), { group: "text", since }), staleOn("generation"));
  edits.now(typed("f"), { group: "text" });
  assert.deepEqual(m.steps(), ["range", "range", "range", "range", "range"]);
});

// ---- Review follow-ups (slice 10) ----

test("a route removed after r.site() is stale on the site; a file read as there and deleted meanwhile is stale on its existence", async () => {
  const { m, edits } = setup();
  assert.deepEqual(await racing(m, edits, r => { r.site(); return insertH2(r); }, () => m.setSite({ ...site, routes: { "/": "index.html" } })), staleOn("site"));
  assert.deepEqual(await racing(m, edits, r => { assert.equal(r.exists("old.html"), true); return insertH2(r); }, () => m.deleteFile("old.html")), staleOn({ exists: "old.html" }));
});

test("a move with an edit at its new path: ranges against the moved file's bytes, one step, undone whole", async () => {
  const { m, edits } = setup();
  const before = state(m);
  const outcome = await edits.run(r => {
    const old = r.source("old.html")!, at = old.indexOf("old");
    return { moves: [{ from: "old.html", to: "archive/old.html" }], edits: new Map([["archive/old.html", [{ start: at, end: at + 3, text: "archived", expected: "old" }]]]), done: "Moved.", undone: "Undid the move." };
  });
  assert.deepEqual(outcome, { ok: true, status: "applied" });
  assert.equal(m.workspace.exists("old.html"), false);
  assert.equal(m.workspace.source("archive/old.html"), "<p>archived</p>");
  assert.deepEqual(m.steps(), ["operation"]);
  assert.equal(m.undo(), true);
  assert.equal(state(m).replace(/"steps":\[[^\]]*\]/, ""), before.replace(/"steps":\[[^\]]*\]/, ""));
});

test("a destination taken during the commit's waits (a folder there now) is stale, nothing moved", async () => {
  const { m, edits } = setup();
  const hold = m.holdBranchRead();
  const pending = edits.run(r => { r.source("old.html"); return { moves: [{ from: "old.html", to: "new.html" }], done: "d", undone: "u" }; });
  await hold.reached;
  m.writeDraft("new.html/child.txt", "x");
  hold.release();
  assert.deepEqual(await pending, staleOn({ exists: "new.html" }));
  assert.equal(m.workspace.exists("old.html"), true);
  assert.deepEqual(m.steps(), []);
});

test("two operations over one file undo one after the other", async () => {
  const { m, edits } = setup();
  const both = (mark: string) => (r: Reads): PlanResult => ({ edits: new Map([["index.html", r.source("index.html") + mark], ["about.html", r.source("about.html") + mark]]), done: "d", undone: "u" });
  await edits.run(both("1"));
  await edits.run(both("2"));
  assert.equal(m.undo(), true, m.refusals.join(" "));
  assert.equal(m.undo(), true, m.refusals.join(" "));
  assert.equal(m.workspace.source("index.html"), PAGE);
  assert.equal(m.workspace.source("about.html"), ABOUT);
  assert.equal(m.redo(), true);
  assert.equal(m.redo(), true);
  assert.equal(m.workspace.source("about.html"), `${ABOUT}12`);
});

test("Undo refuses once a template the step read (and did not write) changed", async () => {
  const { m, edits } = setup();
  await edits.run(r => { r.template("site-card"); return { edits: new Map([["index.html", r.source("index.html") + "!"], ["about.html", r.source("about.html") + "!"]]), done: "d", undone: "u" }; });
  m.writeDraft("components/site-card.html", "<template><div></div></template>");
  assert.equal(m.undo(), false);
  assert.match(m.refusals.at(-1)!, /site-card/);
});

test("a stale read inside a grouped now() closes the group", () => {
  const { m, edits } = setup();
  edits.now(typed("a"), { group: "title" });
  const outcome = edits.now(r => { r.source("about.html"); m.writeDraft("about.html", "x"); return typed("b")(r); }, { group: "title" });
  assert.deepEqual(outcome, staleOn({ file: "about.html" }));
  edits.now(typed("c"), { group: "title" });
  assert.deepEqual(m.steps(), ["range", "range"]);
});

test("another key that writes nothing still ends the group; a first group never joins the editor's open one", () => {
  const { m, edits } = setup();
  edits.now(typed("a"), { group: "title" });
  assert.deepEqual(edits.now(r => ({ edits: new Map([["index.html", r.source("index.html")!]]), done: "d", undone: "u" }), { group: "text" }), { ok: true, status: "unchanged" });
  edits.now(typed("b"), { group: "title" });
  assert.deepEqual(m.steps(), ["range", "range"]);

  const other = setup();
  other.m.workspace.change("index.html", [{ start: 0, end: 0, text: "x", expected: "" }], true);
  other.edits.now(typed("a"), { group: "title" });
  assert.deepEqual(other.m.steps(), ["range", "range"]);
});

test("a step written and recorded whose page refresh then fails is applied, with the refresh's message", async () => {
  const { m, edits } = setup();
  m.failRefresh();
  const outcome = await edits.run(r => { r.exists("new.html"); return { creates: [{ path: "new.html", content: "<p>new</p>" }], done: "Created.", undone: "Undid." }; });
  assert.deepEqual(outcome, { ok: true, status: "applied", message: "The files changed, but the editor changed while opening them. Review the current drafts." });
  assert.deepEqual(m.steps(), ["operation"]);
  assert.equal(m.workspace.source("new.html"), "<p>new</p>");
});
