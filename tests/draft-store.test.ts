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

test("grouped edits are one step until the group closes; companions follow the step", async () => {
  const { store } = setup();
  store.open(scope, "a.html", { text: "ab", baseSha: sha("a") });
  const log: string[] = [];
  const companion = (name: string) => ({ undo: () => log.push(`undo ${name}`), redo: () => log.push(`redo ${name}`) });
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

test("attachCompanion only ties to the latest, current step", async () => {
  const { store } = setup();
  store.open(scope, "a.css", { text: "a{}", baseSha: sha("a") });
  const result = store.edit({ scope, path: "a.css", history: "h", text: "a{color:red}" });
  assert.ok(result.ok && result.step);
  let undone = 0;
  assert.equal(store.attachCompanion("h", result.step!, { undo: () => undone++, redo: () => {} }), true);
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
  const save = persistence.save;
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
  typing.input("xabZ", 6);
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
