import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChanges, createDraftStore, diffRange, RECEIPT_REFUSAL, type DraftEvent, type DraftPersistence } from "../src/draft-store.ts";
import { DraftStore, draftKey, memoryDrafts, type SavedDraft } from "../src/drafts.ts";

const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const sha = (c: string) => c.repeat(40);
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
/** A plain persistence double: records by path, with a switch to fail writes. */
function records() {
  const map = new Map<string, SavedDraft>();
  const layer = {
    map, fail: false, error: null as string | null,
    get: (_scope: unknown, path: string) => map.get(path),
    save(draft: SavedDraft) {
      if (layer.fail) { layer.error = "Draft could not be saved."; return false; }
      if (!draft.deleted && draft.baseSha !== null && draft.content === draft.original) map.delete(draft.path); else map.set(draft.path, draft);
      return true;
    },
    remove: (_scope: unknown, path: string) => { map.delete(path); return true; },
  };
  return layer;
}
function setup(persistence: DraftPersistence = records()) {
  const store = createDraftStore({ persistence, now: () => 1 });
  const events: DraftEvent[] = [];
  store.subscribe(event => events.push(event));
  return { store, events, persistence };
}

test("applyChanges and diffRange produce exact inverses", () => {
  const applied = applyChanges("hello world", [{ start: 6, end: 11, text: "there" }, { start: 0, end: 5, text: "Hi" }]);
  assert.equal(applied.text, "Hi there");
  assert.equal(applyChanges(applied.text, applied.inverse).text, "hello world");
  assert.throws(() => applyChanges("abc", [{ start: 0, end: 2, text: "" }, { start: 1, end: 3, text: "" }]), RangeError);
  assert.throws(() => applyChanges("abc", [{ start: 0, end: 1, text: "x", expected: "b" }]), /no longer matches/);
  assert.deepEqual(diffRange("aXa", "aYYa"), { start: 1, end: 2, text: "YY" });
  assert.deepEqual(diffRange("aaa", "aa"), { start: 2, end: 3, text: "" });
});

test("open takes the persisted draft, recognizes a lost publish, and reports a conflict", () => {
  const persistence = records();
  persistence.map.set("a.html", { ...scope, version: 1, path: "a.html", baseSha: sha("a"), original: "one", content: "two", updatedAt: 1 });
  const { store } = setup(persistence);
  const opened = store.open(scope, "a.html", { text: "one", baseSha: sha("a") });
  assert.equal(opened.file.text, "two");
  assert.equal(opened.conflict, false);
  assert.equal(store.open(scope, "a.html", { text: "zero", baseSha: sha("b") }).conflict, true);
  // GitHub now has the draft's text: the publish went through.
  const reopened = store.open(scope, "a.html", { text: "two", baseSha: sha("c") });
  assert.equal(reopened.conflict, false);
  assert.equal(reopened.file.changed, false);
  assert.equal(persistence.map.has("a.html"), false);
  assert.equal(store.open(scope, "b.html", { text: "fresh", baseSha: sha("d") }).file.text, "fresh");
});

test("range and whole-text edits undo and redo, with text events carrying ranges", async () => {
  const { store, events, persistence } = setup();
  store.open(scope, "a.html", { text: "<p>Hello</p>", baseSha: sha("a") });
  const bad = store.edit({ scope, path: "a.html", changes: [{ start: 3, end: 8, expected: "Nope!", text: "x" }] });
  assert.equal(bad.ok, false);
  assert.ok(store.edit({ scope, path: "a.html", history: "page", label: "Edit text", changes: [{ start: 3, end: 8, expected: "Hello", text: "Bye" }] }).ok);
  assert.equal(store.text(scope, "a.html"), "<p>Bye</p>");
  assert.equal((persistence as ReturnType<typeof records>).map.get("a.html")?.content, "<p>Bye</p>");
  assert.ok(store.edit({ scope, path: "a.html", history: "page", label: "Agent", text: "<p>All new</p>" }).ok);
  assert.equal(store.peek("page", "undo"), "Agent");
  assert.ok((await store.undo("page")).ok);
  assert.equal(store.text(scope, "a.html"), "<p>Bye</p>");
  assert.ok((await store.undo("page")).ok);
  assert.equal(store.text(scope, "a.html"), "<p>Hello</p>");
  assert.equal(store.get(scope, "a.html")?.changed, false);
  assert.equal((persistence as ReturnType<typeof records>).map.has("a.html"), false);
  assert.equal(store.canUndo("page"), false);
  assert.ok((await store.redo("page")).ok);
  assert.equal(store.text(scope, "a.html"), "<p>Bye</p>");
  const undoEvent = events.find(event => event.type === "text" && event.origin === "undo");
  assert.ok(undoEvent?.type === "text" && undoEvent.changes?.length);
  assert.ok(events.some(event => event.type === "history" && event.history === "page"));
  // A new edit clears Redo.
  assert.ok((await store.undo("page")).ok);
  store.edit({ scope, path: "a.html", history: "page", text: "<p>Other</p>" });
  assert.equal(store.canRedo("page"), false);
});

test("discarding an open group restores its first state and leaves no undo or redo step", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", history: "h", text: "aXb" });
  const before = store.get(scope, "a.html")!.revision;
  const log: string[] = [];
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 2, end: 2, text: "y" }], companion: { undo: () => { log.push("undo"); }, redo: () => { log.push("redo"); } } });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 3, end: 3, text: "z" }] });
  assert.equal(store.text(scope, "a.html"), "aXyzb");
  assert.equal(store.discardGroup("h"), true);
  assert.equal(store.text(scope, "a.html"), "aXb");
  assert.equal(store.get(scope, "a.html")!.revision, before);
  assert.deepEqual(log, ["undo"]);
  assert.equal(store.canRedo("h"), false);
  // The step before the group is the next Undo, and still applies.
  assert.ok((await store.undo("h")).ok);
  assert.equal(store.text(scope, "a.html"), "ab");
  // A closed group, or none, is not discarded.
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 0, end: 0, text: "!" }] });
  store.closeGroup("h");
  assert.equal(store.discardGroup("h"), false);
  assert.equal(store.text(scope, "a.html"), "!ab");
});

test("grouped edits are one step until the group closes; companions follow the step", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  const log: string[] = [];
  const companion = (name: string) => ({ undo: () => { log.push(`undo ${name}`); }, redo: () => { log.push(`redo ${name}`); } });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 1, end: 1, text: "x" }], companion: companion("one") });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 2, end: 2, text: "y" }], companion: companion("two") });
  store.closeGroup("h");
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 4, end: 4, text: "!" }] });
  assert.equal(store.text(scope, "a.html"), "axyb!");
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "axyb");
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "ab");
  assert.deepEqual(log, ["undo two", "undo one"]);
  await store.redo("h");
  assert.equal(store.text(scope, "a.html"), "axyb");
  assert.deepEqual(log.slice(2), ["redo one", "redo two"]);
});

test("a per-step companion joins a group only when the step has none yet", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  const log: string[] = [];
  const hooks = (name: string) => ({ undo: () => { log.push(`undo ${name}`); }, redo: () => { log.push(`redo ${name}`); }, perStep: true });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 1, end: 1, text: "x" }], companion: hooks("one") });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 2, end: 2, text: "y" }], companion: hooks("two") });
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "ab");
  await store.redo("h");
  assert.deepEqual(log, ["undo one", "redo one"]);
});

test("a companion's ready refuses the move whole while history waits; the step stays and later moves", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  const log: string[] = [];
  let reason: string | undefined, release = () => {};
  const companion = {
    undo: () => { log.push("undo"); }, redo: () => { log.push("redo"); },
    ready: (direction: "undo" | "redo") => new Promise<string | undefined>(resolve => { log.push(`ready ${direction}`); release = () => resolve(reason); }),
  };
  store.edit({ scope, path: "a.html", history: "h", changes: [{ start: 1, end: 1, text: "x" }], companion });
  const undoing = store.undo("h");
  // While it is asked, Undo and Redo wait.
  assert.equal(store.canUndo("h"), false);
  assert.deepEqual(await store.redo("h"), { ok: false, error: "Undo and Redo wait for the current change to finish." });
  release(); assert.equal((await undoing).ok, true);
  assert.equal(store.text(scope, "a.html"), "ab");
  reason = "x.html already exists.";
  const redoing = store.redo("h"); release();
  assert.deepEqual(await redoing, { ok: false, error: "x.html already exists." });
  assert.equal(store.text(scope, "a.html"), "ab");
  assert.equal(store.canRedo("h"), true);
  // An edit made while Redo is asked takes the step's place: the Redo goes no further.
  reason = undefined;
  const late = store.redo("h");
  store.edit({ scope, path: "a.html", history: "h", changes: [{ start: 0, end: 0, text: "!" }] });
  release();
  assert.deepEqual(await late, { ok: false, error: "The history changed meanwhile." });
  assert.equal(store.text(scope, "a.html"), "!ab");
  assert.equal((await store.undo("h")).ok, true);
  store.edit({ scope, path: "a.html", history: "h", changes: [{ start: 1, end: 1, text: "x" }], companion });
  const undoingAgain = store.undo("h"); release();
  assert.equal((await undoingAgain).ok, true);
  log.length = 0;
  const again = store.redo("h"); release();
  assert.equal((await again).ok, true);
  assert.equal(store.text(scope, "a.html"), "axb");
  assert.deepEqual(log, ["ready redo", "redo"]);
});

test("a companion refusing as it runs takes back those that ran, and the text does not move", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  const log: string[] = [];
  let refuse = false;
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 1, end: 1, text: "x" }], companion: { undo: () => { log.push("undo one"); }, redo: () => { log.push("redo one"); } } });
  store.edit({ scope, path: "a.html", history: "h", group: true, changes: [{ start: 2, end: 2, text: "y" }], companion: { undo: () => { log.push("undo two"); }, redo: () => refuse ? "two refused" : void log.push("redo two") } });
  store.closeGroup("h");
  assert.equal((await store.undo("h")).ok, true);
  refuse = true;
  assert.deepEqual(await store.redo("h"), { ok: false, error: "two refused" });
  assert.equal(store.text(scope, "a.html"), "ab");
  assert.deepEqual(log, ["undo two", "undo one", "redo one", "undo one"]);
  assert.equal(store.canRedo("h"), true);
});

test("attachCompanion only ties to the latest, current step", async () => {
  const { store } = setup();
  store.open(scope, "a.css", { text: "a{}", baseSha: sha("a") });
  const result = store.edit({ scope, path: "a.css", history: "h", text: "a{color:red}" });
  assert.ok(result.ok && result.step);
  let undone = 0;
  assert.equal(store.attachCompanion("h", result.step!, { undo: () => { undone++; }, redo: () => {} }), true);
  store.edit({ scope, path: "a.css", history: "h", text: "a{color:blue}" });
  assert.equal(store.attachCompanion("h", result.step!, { undo: () => {}, redo: () => {} }), false);
  await store.undo("h"); await store.undo("h");
  assert.equal(undone, 1);
});

test("a multi-file receipt applies, undoes and redoes whole, including new and deleted files", async () => {
  const persistence = records();
  const { store, events } = setup(persistence);
  store.open(scope, "index.html", { text: "<link href=old.css>", baseSha: sha("a") });
  store.open(scope, "old.css", { text: "p{}", baseSha: sha("b") });
  const result = store.applyReceipt("page", "Rename stylesheet", [
    { scope, path: "index.html", expected: "<link href=old.css>", after: { text: "<link href=new.css>", base: "<link href=old.css>", baseSha: sha("a") } },
    { scope, path: "old.css", expected: "p{}", after: { text: "p{}", base: "p{}", baseSha: sha("b"), flags: { deleted: true, movedTo: "new.css" } } },
    { scope, path: "new.css", expected: null, after: { text: "p{}", base: "p{}", baseSha: null, flags: { movedFrom: "old.css", sourceSha: sha("b") } } },
  ]);
  assert.ok(result.ok);
  assert.equal(persistence.map.get("old.css")?.deleted, true);
  assert.equal(persistence.map.get("new.css")?.movedFrom, "old.css");
  assert.equal(store.changed().length, 3);
  assert.ok((await store.undo("page")).ok);
  assert.equal(store.text(scope, "index.html"), "<link href=old.css>");
  assert.equal(store.get(scope, "new.css"), undefined);
  assert.equal(persistence.map.size, 0);
  assert.ok(events.some(event => event.type === "file" && event.path === "new.css" && event.change === "dropped"));
  assert.ok((await store.redo("page")).ok);
  assert.equal(store.text(scope, "new.css"), "p{}");
  assert.equal(persistence.map.get("old.css")?.movedTo, "new.css");
  // A receipt checks what it expects first.
  const stale = store.applyReceipt("page", "x", [{ scope, path: "index.html", expected: "something else", after: null }]);
  assert.equal(stale.ok, false);
});

test("a receipt refuses partial undo when any of its files changed since", async () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "A", baseSha: sha("a") });
  store.open(scope, "b.css", { text: "B", baseSha: sha("b") });
  store.applyReceipt("page", "Both", [
    { scope, path: "a.html", after: { text: "A2", base: "A", baseSha: sha("a") } },
    { scope, path: "b.css", after: { text: "B2", base: "B", baseSha: sha("b") } },
  ]);
  // Another history edits one of its files.
  store.edit({ scope, path: "b.css", history: "styles", text: "B3" });
  assert.equal(store.canUndo("page"), false);
  const refused = await store.undo("page");
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.error.startsWith(RECEIPT_REFUSAL));
  assert.equal(store.text(scope, "a.html"), "A2");
  assert.equal(store.text(scope, "b.css"), "B3");
  // Undone there, the receipt can move again; the step stays in place meanwhile.
  await store.undo("styles");
  assert.ok((await store.undo("page")).ok);
  assert.deepEqual([store.text(scope, "a.html"), store.text(scope, "b.css")], ["A", "B"]);
  // A foreign write to a persisted draft refuses too.
  await store.redo("page");
  persistence.map.set("a.html", { ...persistence.map.get("a.html")!, content: "from another tab" });
  assert.equal((await store.undo("page")).ok, false);
  assert.equal(store.text(scope, "b.css"), "B2");
});

test("a receipt whose persistence fails is rolled back whole", () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "A", baseSha: sha("a") });
  store.open(scope, "b.html", { text: "B", baseSha: sha("b") });
  let calls = 0;
  const save = persistence.save.bind(persistence);
  persistence.save = (draft: SavedDraft) => (++calls === 2 ? false : save(draft));
  const result = store.applyReceipt("h", "x", [
    { scope, path: "a.html", after: { text: "A2", base: "A", baseSha: sha("a") } },
    { scope, path: "b.html", after: { text: "B2", base: "B", baseSha: sha("b") } },
  ]);
  persistence.save = save;
  assert.equal(result.ok, false);
  assert.deepEqual([store.text(scope, "a.html"), store.text(scope, "b.html")], ["A", "B"]);
  assert.equal(persistence.map.size, 0);
  assert.equal(store.canUndo("h"), false);
});

test("host actions: async, refusal keeps the step, no redo clears Redo, hold and running block", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "A", baseSha: sha("a") });
  let refuse = true, disposed = 0;
  store.edit({ scope, path: "a.html", history: "h", text: "A1" });
  store.recordAction("h", { label: "Move page", undo: async () => !refuse, redo: () => true, dispose: () => disposed++ });
  assert.equal((await store.undo("h")).ok, false);
  assert.equal(store.peek("h", "undo"), "Move page");
  refuse = false;
  const release = store.hold("h");
  assert.equal(store.canUndo("h"), false);
  assert.equal((await store.undo("h")).ok, false);
  release();
  let finish!: (value: boolean) => void;
  store.recordAction("h", { label: "Slow", undo: () => new Promise<boolean>(resolve => { finish = resolve; }) });
  assert.equal(disposed, 0);
  const slow = store.undo("h");
  assert.equal((await store.undo("h")).ok, false, "a second Undo waits for the first");
  finish(true);
  assert.ok((await slow).ok);
  assert.equal(store.canRedo("h"), false, "an action without redo clears Redo");
  assert.ok((await store.undo("h")).ok);
  assert.ok((await store.redo("h")).ok);
  store.clearHistory();
  assert.equal(disposed, 1);
});

test("typing sessions follow keystrokes without steps and commit as one step", async () => {
  const persistence = records();
  const { store, events } = setup(persistence);
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", history: "h", label: "Visual", text: "x!" });
  const typing = store.beginTyping(scope, "a.html", "h");
  assert.throws(() => store.beginTyping(scope, "a.html", "h"));
  typing.input("x!a"); typing.input("x!ab");
  assert.equal(persistence.map.get("a.html")?.content, "x!ab");
  assert.ok(events.some(event => event.type === "text" && event.origin === "typing"));
  assert.equal(store.peek("h", "undo"), "Visual");
  assert.equal(store.canUndo("h"), true);
  // Undo commits the pending typing first, then undoes it as one step.
  assert.ok((await store.undo("h")).ok);
  assert.equal(store.text(scope, "a.html"), "x!");
  assert.ok((await store.undo("h")).ok);
  assert.equal(store.text(scope, "a.html"), "x");
  await store.redo("h"); await store.redo("h");
  assert.equal(store.text(scope, "a.html"), "x!ab");
  // Typed and erased: no step, and the step below stays valid.
  typing.input("x!abc"); typing.input("x!ab");
  assert.equal(typing.commit(), undefined);
  assert.equal(store.canUndo("h"), true);
  // A visual edit over pending typing commits the typing as its own step first.
  typing.input("x!abQ");
  store.edit({ scope, path: "a.html", history: "h", label: "Visual 2", changes: [{ start: 0, end: 1, text: "y" }] });
  assert.equal(store.text(scope, "a.html"), "y!abQ");
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "x!abQ");
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "x!ab");
  typing.dispose();
  typing.input("ignored");
  assert.equal(store.text(scope, "a.html"), "x!ab");
});

test("a change outside history clears the journals over that file", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.open(scope, "b.html", { text: "b", baseSha: sha("b") });
  store.edit({ scope, path: "a.html", history: "h", text: "a1" });
  store.edit({ scope, path: "b.html", history: "other", text: "b1" });
  store.edit({ scope, path: "a.html", text: "outside", record: false });
  assert.equal(store.canUndo("h"), false);
  assert.equal(store.canUndo("other"), true);
});

test("retain keeps a clean entry; release evicts it; drop and forget respect leases", () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  const release = store.retain(scope, "a.html");
  assert.equal(store.drop(scope, "a.html"), false);
  assert.equal(store.forget(scope, "a.html"), false);
  release();
  assert.equal(store.get(scope, "a.html"), undefined, "a clean, unreferenced entry goes with its last lease");
  store.open(scope, "b.html", { text: "b", baseSha: sha("b") });
  store.edit({ scope, path: "b.html", text: "b1" });
  store.retain(scope, "b.html")();
  assert.equal(store.text(scope, "b.html"), "b1", "a changed entry stays");
  assert.equal(store.forget(scope, "b.html"), true);
  assert.equal(persistence.map.get("b.html")?.content, "b1", "forget keeps the persisted draft");
  store.open(scope, "b.html", { text: "b", baseSha: sha("b") });
  assert.equal(store.text(scope, "b.html"), "b1");
  assert.equal(store.drop(scope, "b.html"), true);
  assert.equal(persistence.map.has("b.html"), false);
});

test("discard, markSaved, acceptBase and reload", async () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", history: "h", text: "a1" });
  assert.ok(store.discard(scope, "a.html", "h").ok);
  assert.equal(store.text(scope, "a.html"), "a");
  assert.ok((await store.undo("h")).ok, "Discard can be undone");
  assert.equal(store.text(scope, "a.html"), "a1");
  store.open(scope, "new.html", { text: "", baseSha: null });
  store.edit({ scope, path: "new.html", text: "hi" });
  assert.equal(persistence.map.get("new.html")?.baseSha, null);
  assert.ok(store.discard(scope, "new.html").ok);
  assert.equal(store.get(scope, "new.html"), undefined);
  assert.equal(persistence.map.has("new.html"), false);
  // Saved with text typed during the save: that text stays a draft.
  store.markSaved(scope, "a.html", { baseSha: sha("c"), original: "a0" });
  assert.equal(persistence.map.get("a.html")?.original, "a0");
  assert.equal(persistence.map.get("a.html")?.baseSha, sha("c"));
  store.acceptBase(scope, "a.html", { text: "a1", baseSha: sha("d") });
  assert.equal(store.get(scope, "a.html")?.changed, false);
  // Another tab wrote the draft: adopted, history over it cleared.
  persistence.map.set("a.html", { ...scope, version: 1, path: "a.html", baseSha: sha("d"), original: "a1", content: "theirs", updatedAt: 2 });
  assert.equal(store.reload(scope, "a.html"), true);
  assert.equal(store.text(scope, "a.html"), "theirs");
  assert.equal(store.canUndo("h"), false);
});

test("drafts round-trip through the IndexedDB layer and report unpersisted edits", async () => {
  const db = memoryDrafts();
  const first = new DraftStore(storage(), db);
  await first.load("lex");
  const store = createDraftStore({ persistence: first });
  store.open(scope, "index.html", { text: "<h1>Hi</h1>", baseSha: sha("a") });
  store.edit({ scope, path: "index.html", history: "h", changes: [{ start: 4, end: 6, expected: "Hi", text: "Hello" }] });
  assert.equal(store.unpersisted(), false);
  await first.flush();
  assert.equal(db.map.get(draftKey(scope, "index.html"))?.content, "<h1>Hello</h1>");
  const second = new DraftStore(storage(), db);
  await second.load("lex");
  const reloaded = createDraftStore({ persistence: second });
  const { file } = reloaded.open(scope, "index.html", { text: "<h1>Hi</h1>", baseSha: sha("a") });
  assert.equal(file.text, "<h1>Hello</h1>");
  assert.equal(file.base, "<h1>Hi</h1>");
  assert.deepEqual(reloaded.changed().map(entry => entry.path), ["index.html"]);
  // Undo back to the base removes the stored draft.
  await store.undo("h");
  await first.flush();
  assert.equal(db.map.has(draftKey(scope, "index.html")), false);
  // A file whose base is unknown is not persisted, and says so.
  const loose = createDraftStore({ persistence: first });
  loose.open(scope, "x.txt", { text: "x" });
  loose.edit({ scope, path: "x.txt", text: "y" });
  assert.equal(loose.unpersisted(), true);
});

test("subscribers can unsubscribe and a throwing listener does not break a step", () => {
  const store = createDraftStore();
  store.subscribe(() => { throw new Error("listener"); });
  let seen = 0;
  const off = store.subscribe(() => seen++);
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", text: "b" });
  const count = seen;
  assert.ok(count > 0);
  off();
  store.edit({ scope, path: "a.html", text: "c" });
  assert.equal(seen, count);
  assert.equal(store.text(scope, "a.html"), "c");
});

test("review fix: Redo of a receipt refuses to overwrite a foreign draft written at a path it had removed", async () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "index.html", { text: "A", baseSha: sha("a") });
  assert.ok(store.applyReceipt("page", "Add page", [
    { scope, path: "index.html", after: { text: "A2", base: "A", baseSha: sha("a") } },
    { scope, path: "new.html", expected: null, after: { text: "mine", base: "", baseSha: null } },
  ]).ok);
  assert.ok((await store.undo("page")).ok);
  assert.equal(persistence.map.has("new.html"), false);
  // Another tab persists a draft at the path the receipt's Undo left absent.
  const theirs: SavedDraft = { ...scope, version: 1, path: "new.html", baseSha: null, original: "", content: "theirs", updatedAt: 9 };
  persistence.map.set("new.html", theirs);
  assert.equal(store.canRedo("page"), false);
  const redo = await store.redo("page");
  assert.equal(redo.ok, false);
  assert.equal(persistence.map.get("new.html"), theirs);
  assert.equal(store.text(scope, "index.html"), "A");
});

test("review fix: a receipt recorded by a listener during Undo keeps its history entry", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.open(scope, "b.css", { text: "b", baseSha: sha("b") });
  store.edit({ scope, path: "a.html", history: "h", label: "Visual", text: "a1" });
  let reacted = false;
  store.subscribe(event => {
    if (reacted || event.type !== "text" || event.origin !== "undo") return;
    reacted = true;
    // The journal has already moved when the event arrives.
    assert.equal(store.peek("h", "redo"), "Visual");
    assert.ok(store.applyReceipt("h", "Follow-up", [{ scope, path: "b.css", after: { text: "b2", base: "b", baseSha: sha("b") } }]).ok);
  });
  assert.ok((await store.undo("h")).ok);
  assert.ok(reacted);
  assert.equal(store.peek("h", "undo"), "Follow-up");
  assert.ok((await store.undo("h")).ok);
  assert.equal(store.text(scope, "b.css"), "b");
  assert.equal(store.text(scope, "a.html"), "a");
});

test("review fix: a typing step keeps Monaco's undo stops, in order with visual steps", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  store.open(scope, "b.css", { text: "b", baseSha: sha("b") });
  // A fake pane: Monaco's undo stops (alternative version ids) for what is typed below.
  const stops = [{ text: "x", version: 1 }, { text: "xab", version: 3 }, { text: "xabcd", version: 5 }];
  let at = 2, nativeCalls = 0;
  const native = {
    undo(expected: number) { nativeCalls++; if (stops[at].version !== expected || at === 0) return undefined; return stops[--at]; },
    redo(expected: number) { nativeCalls++; if (stops[at].version !== expected || at === stops.length - 1) return undefined; return stops[++at]; },
  };
  const typing = store.beginTyping(scope, "a.html", "h", { version: 1, native });
  typing.input("xa", 2); typing.input("xab", 3); typing.input("xabc", 4); typing.input("xabcd", 5);
  typing.commit();
  store.edit({ scope, path: "b.css", history: "h", label: "Style", text: "b1" });
  const texts = () => [store.text(scope, "a.html"), store.text(scope, "b.css")];
  await store.undo("h");
  assert.deepEqual(texts(), ["xabcd", "b"]);
  await store.undo("h");
  assert.deepEqual(texts(), ["xab", "b"], "one Monaco stop per Undo");
  assert.equal(store.peek("h", "undo"), "Typing");
  await store.undo("h");
  assert.deepEqual(texts(), ["x", "b"]);
  assert.equal(store.canUndo("h"), false);
  await store.redo("h");
  assert.deepEqual(texts(), ["xab", "b"]);
  await store.redo("h");
  assert.deepEqual(texts(), ["xabcd", "b"]);
  await store.redo("h");
  assert.deepEqual(texts(), ["xabcd", "b1"]);
  assert.equal(nativeCalls, 4);
  // Partly undone, then new typing: the step ends where it was, the pane's redo is gone.
  await store.undo("h"); await store.undo("h");
  const historyEvents: string[] = [];
  store.subscribe(event => { if (event.type === "history") historyEvents.push(event.history); });
  typing.input("xabZ", 6);
  assert.deepEqual(historyEvents, ["h"]);
  assert.equal(store.canRedo("h"), false);
  typing.commit();
  assert.equal(store.canRedo("h"), false);
  // With the pane closed, a typing step undoes whole.
  typing.dispose();
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "xab");
  await store.undo("h");
  assert.equal(store.text(scope, "a.html"), "x");
  assert.equal(nativeCalls, 5);
});

test("wiring: a host write keeps the steps below it and its undo restores the exact revision", async () => {
  const { store, events } = setup();
  store.open(scope, "a.html", { text: "a0", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", history: "h", label: "Visual", text: "a1" });
  const visual = store.get(scope, "a.html")!.revision;
  const moved = store.write(scope, "a.html", "a2")!;
  assert.equal(moved.before, visual);
  assert.equal(store.text(scope, "a.html"), "a2");
  const last = events.at(-1);
  assert.equal(last?.type === "text" ? last.origin : undefined, "receipt");
  // The host puts its text back at the revision it had: the visual step undoes again.
  store.write(scope, "a.html", "a1", moved.before);
  assert.equal(store.get(scope, "a.html")!.revision, visual);
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(store.text(scope, "a.html"), "a0");
});

test("wiring: Undo and Redo put back the very records a step left, and adopt takes a host's record for the same text", async () => {
  const persistence = records();
  const { store } = setup(persistence);
  persistence.map.set("new.html", { ...scope, version: 1, path: "new.html", baseSha: null, original: "", content: "<p>Created</p>", updatedAt: 1 });
  const created = persistence.map.get("new.html")!;
  store.open(scope, "new.html", { text: "", baseSha: null });
  store.edit({ scope, path: "new.html", history: "h", text: "<p>Created and edited</p>" });
  const edited = persistence.map.get("new.html")!;
  assert.notEqual(edited, created);
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(persistence.map.get("new.html"), created);
  assert.equal((await store.redo("h")).ok, true);
  assert.equal(persistence.map.get("new.html"), edited);
  // A host writes the record for this text with a flag: the store takes it as its own.
  const flagged = { ...edited, movedFrom: "old.html" };
  persistence.map.set("new.html", flagged);
  assert.equal(store.adopt(scope, "new.html"), true);
  assert.equal(store.get(scope, "new.html")!.flags?.movedFrom, "old.html");
  assert.equal((await store.undo("h")).ok, true);
  // Another text is another writer's: not adopted, and Redo over the file refuses.
  persistence.map.set("new.html", { ...flagged, content: "foreign" });
  assert.equal(store.adopt(scope, "new.html"), false);
  assert.equal((await store.redo("h")).ok, false);
});

test("wiring: hasTyping follows a live pane's typing steps; retry writes a failed draft again", () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  const typing = store.beginTyping(scope, "a.html", "h", { version: 1 });
  typing.input("xy", 2);
  typing.commit();
  assert.equal(store.hasTyping(scope, "a.html"), true);
  assert.equal(store.hasHistory(), true);
  typing.dispose();
  assert.equal(store.hasTyping(scope, "a.html"), false);
  persistence.fail = true;
  store.edit({ scope, path: "a.html", text: "xyz" });
  assert.equal(store.unpersisted(), true);
  persistence.fail = false;
  store.retry();
  assert.equal(store.unpersisted(), false);
  assert.equal(persistence.map.get("a.html")?.content, "xyz");
});

test("review fix: an edit commits typing still open in another file of its history first, so Undo goes newest first", async () => {
  const { store } = setup();
  store.open(scope, "page.html", { text: "p", baseSha: sha("a") });
  store.open(scope, "site.css", { text: "c", baseSha: sha("b") });
  const typing = store.beginTyping(scope, "site.css", "h", { version: 1 });
  typing.input("cX", 2);
  // A visual page edit before the stylesheet's typing settled.
  store.edit({ scope, path: "page.html", history: "h", text: "p2" });
  typing.commit();
  assert.equal((await store.undo("h")).ok, true);
  assert.deepEqual([store.text(scope, "page.html"), store.text(scope, "site.css")], ["p", "cX"]);
  assert.equal((await store.undo("h")).ok, true);
  assert.deepEqual([store.text(scope, "page.html"), store.text(scope, "site.css")], ["p", "c"]);
});

test("review fix: typing erased in a pane whose undo stack moved stays a step, so Undo keeps stepping", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  // A pane double: versions are its undo stops, texts what each stop shows.
  const texts = new Map<number, string>([[1, "x"], [2, "xa"], [3, "xab"], [4, "xa"]]);
  let version = 1;
  const stops = [1];
  const typing = store.beginTyping(scope, "a.html", "h", { version, native: {
    undo(expected) { if (version !== expected || stops.length < 2) return undefined; stops.pop(); version = stops.at(-1)!; return { text: texts.get(version)!, version }; },
    redo() { return undefined; },
  } });
  const type = (to: number) => { version = to; stops.push(to); typing.input(texts.get(to)!, to); };
  type(2); typing.commit();
  type(3); type(4); typing.commit();
  assert.equal(store.text(scope, "a.html"), "xa");
  assert.equal((await store.undo("h")).ok, true);
  // This double gives Backspace its own native stop, as Monaco may do.
  assert.equal(store.text(scope, "a.html"), "xab");
  for (let presses = 0; presses < 3 && store.text(scope, "a.html") !== "x"; presses++) assert.equal((await store.undo("h")).ok, true);
  assert.equal(store.text(scope, "a.html"), "x");
});

test("new typing erases Redo immediately, even when typed text is erased before commit", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  let current = { text: "x", version: 1 };
  const typing = store.beginTyping(scope, "a.html", "h", { version: 1, native: {
    undo(expected) { if (current.version !== expected) return undefined; return current = { text: "x", version: 1 }; },
    redo() { return undefined; },
  } });
  current = { text: "xa", version: 2 }; typing.input(current.text, current.version); typing.commit();
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(store.canRedo("h"), true);
  current = { text: "xb", version: 3 }; typing.input(current.text, current.version);
  assert.equal(store.canRedo("h"), false);
  current = { text: "x", version: 4 }; typing.input(current.text, current.version);
  assert.equal(store.canRedo("h"), false);
  assert.notEqual(typing.commit(), undefined);
  assert.equal(store.canRedo("h"), false);
  assert.equal((await store.redo("h")).ok, false);
  assert.equal((await store.undo("h")).ok, true);
});

test("truncating a partly undone native typing step emits history before settling", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "x", baseSha: sha("a") });
  const typing = store.beginTyping(scope, "a.html", "h", { version: 1, native: {
    undo(expected) { return expected === 3 ? { text: "xa", version: 2 } : undefined; },
    redo() { return undefined; },
  } });
  typing.input("xa", 2); typing.input("xab", 3); typing.commit();
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(store.canRedo("h"), true);
  const events: string[] = [];
  store.subscribe(event => { if (event.type === "history") events.push(event.history); });
  typing.input("xaZ", 4);
  assert.equal(store.canRedo("h"), false);
  assert.deepEqual(events, ["h"]);
});

test("review fix: pending typing in two panes and a later edit undo newest first, in either pane order", async () => {
  for (const [first, second] of [["site.css", "page.html"], ["page.html", "site.css"]]) {
    const { store } = setup();
    store.open(scope, "page.html", { text: "p", baseSha: sha("a") });
    store.open(scope, "site.css", { text: "c", baseSha: sha("b") });
    // Session registration order must not determine keystroke order.
    const panes = new Map(["page.html", "site.css"].map(path => [path, store.beginTyping(scope, path, "h", { version: 1 })]));
    panes.get(first)!.input(store.text(scope, first) + "1", 2 + 10 * 0);
    panes.get(second)!.input(store.text(scope, second) + "2", 2 + 10 * 1);
    // Switching files commits the first pane immediately, before any timer.
    assert.equal(panes.get(first)!.commit(), undefined);
    store.edit({ scope, path: "page.html", history: "h", text: store.text(scope, "page.html") + "E" });
    const states: string[] = [];
    const snap = () => states.push(`${store.text(scope, "page.html")}|${store.text(scope, "site.css")}`);
    snap();
    for (let i = 0; i < 3; i++) { assert.equal((await store.undo("h")).ok, true); snap(); }
    // Newest first: the edit, then the second pane's typing, then the first's.
    const page = (path: string, typed: boolean) => (path === "page.html" ? "p" : "c") + (typed ? (path === first ? "1" : "2") : "");
    const at = (pageTyped: boolean, cssTyped: boolean, edit: boolean) => `${page("page.html", pageTyped)}${edit ? "E" : ""}|${page("site.css", cssTyped)}`;
    const firstIsPage = first === "page.html";
    assert.deepEqual(states, [
      at(true, true, true),
      at(true, true, false),
      firstIsPage ? at(true, false, false) : at(false, true, false),
      at(false, false, false),
    ]);
  }
});

test("edit flushes its target and history's pending typing by first keystroke across histories", () => {
  for (const first of ["page.html", "site.css"]) {
    const { store } = setup();
    store.open(scope, "page.html", { text: "p", baseSha: sha("a") });
    store.open(scope, "site.css", { text: "c", baseSha: sha("b") });
    const page = store.beginTyping(scope, "page.html", "page-history");
    const css = store.beginTyping(scope, "site.css", "edit-history");
    if (first === "page.html") { page.input("p1"); css.input("c1"); }
    else { css.input("c1"); page.input("p1"); }
    const histories: string[] = [];
    store.subscribe(event => { if (event.type === "history") histories.push(event.history); });
    store.edit({ scope, path: "page.html", history: "edit-history", text: "p1E" });
    assert.deepEqual(histories, first === "page.html"
      ? ["page-history", "edit-history", "edit-history"]
      : ["edit-history", "page-history", "edit-history"]);
  }
});

test("wiring: Save's drafts are the store's, including a change whose write keeps failing", () => {
  const persistence = records();
  const { store } = setup(persistence);
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.open(scope, "b.html", { text: "b", baseSha: sha("b") });
  store.edit({ scope, path: "a.html", text: "a1" });
  persistence.fail = true;
  store.edit({ scope, path: "b.html", text: "b1" });
  const drafts = store.drafts(scope, () => [...persistence.map.values()]);
  assert.deepEqual(drafts.map(draft => [draft.path, draft.content]), [["a.html", "a1"], ["b.html", "b1"]]);
  assert.equal(store.drafts({ ...scope, branch: "other" }, () => []).length, 0);
  persistence.fail = false;
  assert.equal(store.drafts(scope, () => [...persistence.map.values()]).length, 2);
  assert.equal(persistence.map.get("b.html")?.content, "b1");
});

test("state subscribers observe the final journal after an event listener records a follow-up receipt", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.open(scope, "b.css", { text: "b", baseSha: sha("b") });
  store.edit({ scope, path: "a.html", history: "h", label: "Visual", text: "a1" });
  let accepted = false;
  store.subscribe(event => {
    if (event.type === "text" && event.origin === "undo") accepted = store.applyReceipt("h", "Follow-up", [
      { scope, path: "b.css", after: { text: "b2", base: "b", baseSha: sha("b") } },
    ]).ok;
  });
  const seen: unknown[] = [];
  store.subscribeState(() => { seen.push([store.text(scope, "a.html"), store.text(scope, "b.css"), store.peek("h", "undo"), store.peek("h", "redo")]); });
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(accepted, true);
  assert.deepEqual(seen, [["a", "b2", "Follow-up", undefined]]);
});

test("state listener mutations notify again without nested delivery or losing their history step", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  let depth = 0, maxDepth = 0, reacted = false;
  const seen: unknown[] = [];
  store.subscribeState(() => {
    depth++;
    maxDepth = Math.max(maxDepth, depth);
    seen.push([store.text(scope, "a.html"), store.peek("h", "undo")]);
    if (!reacted) {
      reacted = true;
      store.edit({ scope, path: "a.html", history: "h", label: "Follow-up", text: "a2" });
    }
    depth--;
  });
  store.edit({ scope, path: "a.html", history: "h", label: "Visual", text: "a1" });
  assert.equal(maxDepth, 1);
  assert.deepEqual(seen, [["a1", "Visual"], ["a2", "Follow-up"]]);
  assert.equal((await store.undo("h")).ok, true);
  assert.equal(store.text(scope, "a.html"), "a1");
});

test("state listeners unsubscribe, isolate exceptions and ignore retries with no state change", () => {
  const persistence = records();
  persistence.fail = true;
  const { store } = setup(persistence);
  store.subscribeState(() => { throw new Error("listener"); });
  let count = 0;
  const off = store.subscribeState(() => { count++; });
  store.open(scope, "a.html", { text: "a", baseSha: sha("a") });
  store.edit({ scope, path: "a.html", text: "a1" });
  assert.equal(count, 2);
  store.retry();
  assert.equal(count, 2);
  persistence.fail = false;
  store.retry();
  assert.equal(count, 3);
  off();
  store.clear();
  assert.equal(count, 3);
});

test("opening a recovered publish preserves event order and count while observers see its settled base", () => {
  const persistence = records();
  persistence.map.set("a.html", { ...scope, version: 1, path: "a.html", original: "base", content: "published", baseSha: sha("a"), updatedAt: 1 });
  const { store } = setup(persistence);
  const seen: unknown[] = [];
  store.subscribe(event => { seen.push([event.type, event.type === "file" ? event.change : undefined, store.get(scope, "a.html")?.base]); });
  let notifications = 0;
  store.subscribeState(() => { notifications++; });
  store.open(scope, "a.html", { text: "published", baseSha: sha("b") });
  assert.deepEqual(seen, [["file", "opened", "published"], ["file", "base", "published"]]);
  assert.equal(notifications, 1);
});
