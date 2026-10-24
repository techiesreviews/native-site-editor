// Undo on its own page (ticket 34, src/guarded-edit/parked.ts): a step that finished away from its page
// is parked for that page, and its history takes it once the page opens; never the page shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuardedEdits, type PlanResult, type Reads } from "../src/guarded-edit";
import { createParkedSteps, parkedTransitions, PARKED_LIMIT, type ParkedStep } from "../src/guarded-edit/parked";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { memoryUploadBytes, sweepUploads, uploadKey, uploadKeyHeld } from "../src/uploads";

const PAGE = "<main><h1>Home</h1><p>Hello</p></main>";
const ABOUT = "<main><h1>About</h1></main>";
const site = { routes: { "/": "index.html", "/about/": "about.html" }, components: {} };
const insertH2 = (r: Reads): PlanResult => ({ edits: new Map([["index.html", r.source("index.html")!.replace("</main>", "<h2>New</h2></main>")]]), done: "Heading added.", undone: "Undid adding the Heading." });
const NEW = PAGE.replace("</main>", "<h2>New</h2></main>");

function setup() {
  const m = createMemoryWorkspace({ branch: { "index.html": PAGE, "about.html": ABOUT, "notes.txt": "notes" }, open: "index.html", site });
  const parked: ParkedStep[] = [];
  const workspace = { ...m.workspace, park: (step: ParkedStep) => { parked.push(step); } };
  return { m, workspace, parked, edits: createGuardedEdits(workspace) };
}
/** Runs `plan` as finishing work and shows about.html while it waits, so it lands away. */
async function landAway(s: ReturnType<typeof setup>, plan: (r: Reads) => PlanResult, options: { anchor?: string } = {}) {
  const wait = deferred();
  const pending = s.edits.run(async r => { const result = plan(r); await wait.promise; return result; }, { finish: true, ...options });
  await Promise.resolve();
  s.m.setRoute("/about/"); await s.m.workspace.open("about.html");
  wait.resolve();
  return pending;
}
const recordOn = (s: ReturnType<typeof setup>, page: string) => (undo: () => boolean, redo: () => boolean, dispose: () => void) => s.m.workspace.recordHistory(page, undo, redo, dispose);

test("a step landing away is parked for its own page, with no Undo step on the page shown", async () => {
  const s = setup();
  assert.deepEqual(await landAway(s, insertH2), { ok: true, status: "applied" });
  assert.equal(s.m.draft("index.html")?.content, NEW);
  assert.deepEqual(s.m.steps(), [], "the page shown takes nothing");
  assert.equal(s.parked.length, 1);
  const [step] = s.parked;
  assert.equal(step.page, "index.html");
  assert.equal(step.before.get("index.html"), undefined);
  assert.equal(step.after.get("index.html")?.content, NEW);
  assert.equal(step.beforeSources.get("index.html"), PAGE);
  assert.equal(step.afterSources.get("index.html"), NEW);
});

test("its page opened, the parked step is its newest Undo: Undo takes it back, Redo puts it again", async () => {
  const s = setup();
  await landAway(s, insertH2);
  const steps = createParkedSteps({ open: () => undefined, transitions: step => parkedTransitions(s.workspace, step) });
  steps.park(s.parked[0]);
  // Another page open adopts nothing of it.
  steps.adopt(s.m.scope, "about.html", recordOn(s, "about.html"));
  assert.deepEqual(s.m.steps(), []);
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  steps.adopt(s.m.scope, "index.html", recordOn(s, "index.html"));
  assert.deepEqual(s.m.steps(), ["operation"]);
  assert.equal(steps.count(), 0);
  assert.equal(s.m.undo(), true);
  assert.equal(s.m.draft("index.html"), undefined, "the page is GitHub's again");
  assert.equal(s.m.model("index.html")?.text, PAGE, "its open model follows");
  assert.deepEqual(s.m.announced.at(-1), "Undid adding the Heading.");
  assert.equal(s.m.redo(), true);
  assert.equal(s.m.draft("index.html")?.content, NEW);
  assert.equal(s.m.model("index.html")?.text, NEW);
});

test("a draft changed since the step refuses its Undo, and nothing is written", async () => {
  const s = setup();
  await landAway(s, insertH2);
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  s.m.typeInto("index.html", "<main>typed</main>");
  const { undo } = parkedTransitions(s.workspace, s.parked[0]);
  assert.equal(undo(), false);
  assert.equal(s.m.draft("index.html")?.content, "<main>typed</main>");
  assert.match(s.m.refusals.at(-1)!, /index\.html changed since/);
});

test("typing on its page not yet in its draft refuses the parked Undo and keeps what was typed", async () => {
  const s = setup();
  await landAway(s, insertH2);
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  // The open model moved on; its draft still holds the step's text (typing not flushed yet).
  const model = s.m.model("index.html")!;
  model.text = "<main>typed, unsaved</main>"; model.version += 1000;
  const { undo } = parkedTransitions(s.workspace, s.parked[0]);
  assert.equal(undo(), false);
  assert.equal(s.m.model("index.html")?.text, "<main>typed, unsaved</main>");
  assert.equal(s.m.draft("index.html")?.content, NEW);
});

test("only the files a parked step wrote prove its Undo: its page and what its plan read may change since", async () => {
  const s = setup();
  const notes = (r: Reads): PlanResult => { r.source("about.html"); r.source("notes.txt"); return { edits: new Map([["notes.txt", "notes, by an agent"]]), done: "Notes changed.", undone: "Undid the notes." }; };
  await landAway(s, notes, { anchor: "index.html" });
  const [step] = s.parked;
  assert.equal(step.page, "index.html");
  assert.deepEqual([...step.after.keys()], ["notes.txt"], "the page it belongs to is not one of its files");
  s.m.writeDraft("about.html", "<main>read, then changed</main>");
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  s.m.typeInto("index.html", "<main>typed on its page</main>");
  const { undo } = parkedTransitions(s.workspace, step);
  assert.equal(undo(), true);
  assert.equal(s.m.draft("notes.txt"), undefined);
  assert.equal(s.m.draft("index.html")?.content, "<main>typed on its page</main>");
});

test("a page created away is parked on the page itself; its Undo removes it and opens the page it was made on", async () => {
  const s = setup();
  const create = (r: Reads): PlanResult => { r.exists("new.html"); return { creates: [{ path: "new.html", content: "<p>new</p>" }], open: "new.html", done: "Created.", undone: "Removed." }; };
  assert.deepEqual(await landAway(s, create, { anchor: "index.html" }), { ok: true, status: "applied" });
  assert.equal(s.parked[0].page, "new.html");
  assert.equal(s.parked[0].home, "index.html");
  s.m.close();
  await s.m.workspace.open("new.html");
  const { undo } = parkedTransitions(s.workspace, s.parked[0]);
  s.m.workspace.recordHistory("new.html", undo, () => false, () => {});
  assert.equal(s.m.undo(), true);
  assert.equal(s.m.draft("new.html"), undefined);
});

test("a step that deleted its own page away is parked on the home page, its Undo bringing the file back", async () => {
  const s = setup();
  const remove = (r: Reads): PlanResult => { r.source("notes.txt"); return { deletes: ["notes.txt"], done: "Deleted.", undone: "Restored." }; };
  assert.deepEqual(await landAway(s, remove, { anchor: "notes.txt" }), { ok: true, status: "applied" });
  assert.equal(s.m.draft("notes.txt")?.deleted, true);
  assert.deepEqual(s.parked.map(step => [step.page, step.home]), [["index.html", undefined]]);
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  const { undo } = parkedTransitions(s.workspace, s.parked[0]);
  assert.equal(undo(), true);
  assert.equal(s.m.draft("notes.txt"), undefined);
});

// An unsaved upload deleted away: its bytes outlive sweeps while the parked step lives, so its Undo
// brings back a picture that is still there; the step let go (out of history, signed out), they go.
test("a parked step holds the bytes of an upload it deleted until it is let go", async () => {
  const s = setup(), bytes = memoryUploadBytes(), key = uploadKey(s.m.scope, "f".repeat(40));
  await bytes.put(key, new Blob(["picture"]));
  s.m.workspace.store.save({ ...s.m.scope, version: 1, path: "images/new.png", baseSha: null, original: "", content: "", updatedAt: 1,
    opaque: true, sourceSha: "f".repeat(40), upload: { type: "image/png", size: 7 } });
  const remove = (r: Reads): PlanResult => { r.source("images/new.png"); return { deletes: ["images/new.png"], done: "Deleted.", undone: "Restored." }; };
  assert.deepEqual(await landAway(s, remove, { anchor: "index.html" }), { ok: true, status: "applied" });
  assert.equal(s.m.draft("images/new.png"), undefined, "an unsaved upload deleted leaves no draft");
  const steps = createParkedSteps({ open: () => undefined, transitions: step => parkedTransitions(s.workspace, step) });
  steps.park(s.parked[0]);
  await sweepUploads(bytes, s.m.scope, []);
  assert.ok(await bytes.get(key), "kept while parked");
  s.m.setRoute("/"); await s.m.workspace.open("index.html");
  steps.adopt(s.m.scope, "index.html", (undo, redo, dispose) => s.m.workspace.recordHistory("index.html", undo, redo, dispose));
  await sweepUploads(bytes, s.m.scope, []);
  assert.ok(await bytes.get(key), "kept while in its page's history");
  assert.equal(s.m.undo(), true);
  assert.equal(s.m.draft("images/new.png")?.sourceSha, "f".repeat(40));
  assert.ok(await bytes.get(key), "the upload is back with its bytes");
  // Parked again and signed out: its holds go with it.
  const other = setup();
  await landAway(other, remove2(other));
  const parked = createParkedSteps({ open: () => undefined, transitions: step => parkedTransitions(other.workspace, step) });
  parked.park(other.parked[0]);
  assert.equal(uploadKeyHeld(uploadKey(other.m.scope, "e".repeat(40))), true);
  parked.clear();
  assert.equal(uploadKeyHeld(uploadKey(other.m.scope, "e".repeat(40))), false);
});
function remove2(s: ReturnType<typeof setup>) {
  s.m.workspace.store.save({ ...s.m.scope, version: 1, path: "images/old.png", baseSha: null, original: "", content: "", updatedAt: 1,
    opaque: true, sourceSha: "e".repeat(40), upload: { type: "image/png", size: 7 } });
  return (r: Reads): PlanResult => { r.source("images/old.png"); return { deletes: ["images/old.png"], done: "Deleted.", undone: "Restored." }; };
}

test("parked steps: one landing on its page open now is recorded there at once; at most PARKED_LIMIT wait", () => {
  const s = setup(), recorded: string[] = [];
  const step = (page: string): ParkedStep => ({ scope: s.m.scope, page, before: new Map(), after: new Map(), beforeSources: new Map(), afterSources: new Map(), done: "", undone: "" });
  const steps = createParkedSteps({ open: (_scope, page) => page === "index.html" ? () => { recorded.push(page); return true; } : undefined,
    transitions: () => ({ undo: () => true, redo: () => true }) });
  steps.park(step("index.html"));
  assert.deepEqual(recorded, ["index.html"]);
  assert.equal(steps.count(), 0);
  for (let index = 0; index < PARKED_LIMIT + 5; index++) steps.park(step(`page-${index}.html`));
  assert.equal(steps.count(), PARKED_LIMIT);
  // Another branch's page of the same path is not this one.
  steps.adopt({ ...s.m.scope, branch: "feature" }, "page-10.html", () => { recorded.push("feature"); return true; });
  assert.deepEqual(recorded, ["index.html"]);
  steps.clear();
  assert.equal(steps.count(), 0);
});
