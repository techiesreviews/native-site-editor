// Per-person Undo (ticket am-24): with a shared copy, someone else's change no
// longer clears this tab's Undo; the steps over the file move past it
// (src/shared-undo.ts `rebaseHistory` and `rebaseChanges`, through src/draft-store.ts `HistoryAccess`), so Undo
// and Redo take back only this tab's own words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChanges, createDraftStore, type DraftEvent, type NativeTyping, type TextChange } from "../src/draft-store.ts";
import { rebaseChanges, rebaseHistory } from "../src/shared-undo.ts";

const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const sha = "a".repeat(40);
const path = "index.html";
const history = "page";

function setup(text: string) {
  const store = createDraftStore({ now: () => 1 });
  store.open(scope, path, { text, baseSha: sha });
  const events: DraftEvent[] = [];
  store.subscribe(event => events.push(event));
  const now = () => store.text(scope, path)!;
  return {
    store, events, now,
    /** Lex's own edit, one undo step. */
    mine: (start: number, end: number, inserted: string) => assert.equal(store.edit({ scope, path, history, changes: [{ start, end, text: inserted }] }).ok, true),
    /** Anna's change, from the shared copy. */
    theirs: (changes: TextChange[]) => assert.equal(store.edit({ scope, path, changes, record: false, origin: "shared", rebase: rebaseHistory }).ok, true),
    at: (word: string) => now().indexOf(word),
  };
}

test("rebaseChanges: changes clear of each other move by the other's length", () => {
  // In "abcdef": mine removes "cd", theirs inserts "XY" at 0 and replaces "f" with "Z".
  const mine = [{ start: 2, end: 4, text: "" }], theirs = [{ start: 0, end: 0, text: "XY" }, { start: 5, end: 6, text: "Z" }];
  const moved = rebaseChanges(mine, theirs)!;
  assert.deepEqual(moved.mine, [{ start: 4, end: 6, text: "" }]);
  assert.deepEqual(moved.theirs, [{ start: 0, end: 0, text: "XY" }, { start: 3, end: 4, text: "Z" }]);
  // Both orders reach the same text.
  const both = applyChanges(applyChanges("abcdef", theirs).text, moved.mine).text;
  assert.equal(both, applyChanges(applyChanges("abcdef", mine).text, moved.theirs).text);
  assert.equal(both, "XYabeZ");
});

test("rebaseChanges: at one place theirs comes first; their typing inside a stretch mine removes splits it; other overlaps do not move", () => {
  // Touching ends are not overlaps.
  assert.deepEqual(rebaseChanges([{ start: 2, end: 4, text: "" }], [{ start: 4, end: 4, text: "!" }])?.mine, [{ start: 2, end: 4, text: "" }]);
  assert.deepEqual(rebaseChanges([{ start: 2, end: 4, text: "" }], [{ start: 2, end: 2, text: "!" }])?.mine, [{ start: 3, end: 5, text: "" }]);
  const same = rebaseChanges([{ start: 2, end: 2, text: "m" }], [{ start: 2, end: 2, text: "t" }])!;
  assert.equal(applyChanges(applyChanges("ab", [{ start: 2, end: 2, text: "t" }]).text, same.mine).text, "abtm");
  assert.equal(applyChanges(applyChanges("ab", [{ start: 2, end: 2, text: "m" }]).text, same.theirs).text, "abtm");
  // "Lex hello" with Lex's "hello" (5..9 and on) taken away by Undo, while Anna typed "X" inside it: her X stays.
  const split = rebaseChanges([{ start: 4, end: 9, text: "" }], [{ start: 6, end: 6, text: "X" }])!;
  assert.deepEqual(split.mine, [{ start: 4, end: 6, text: "" }, { start: 7, end: 10, text: "" }]);
  assert.equal(applyChanges("Lex heXllo", split.mine).text, "Lex X");
  assert.equal(applyChanges(applyChanges("Lex hello", [{ start: 4, end: 9, text: "" }]).text, split.theirs).text, "Lex X");
  // Anna removing some of Lex's words, or typing where his Undo would put words back, cannot move.
  assert.equal(rebaseChanges([{ start: 4, end: 9, text: "" }], [{ start: 6, end: 7, text: "" }]), undefined);
  assert.equal(rebaseChanges([{ start: 4, end: 4, text: "back" }], [{ start: 2, end: 6, text: "" }]), undefined);
});

test("Anna's change keeps Lex's Undo and Redo, which take back only his words", async () => {
  const lex = setup("<h1>Bread</h1><p>Open at seven.</p>");
  lex.mine(lex.at("Bread"), lex.at("Bread"), "Warm ");
  lex.mine(lex.at("seven"), lex.at("seven"), "half past ");
  lex.theirs([{ start: 0, end: 0, text: "<!-- Anna -->" }, { start: lex.now().length, end: lex.now().length, text: "<p>Closed Mondays.</p>" }]);
  assert.equal(lex.store.canUndo(history), true, "Anna's change no longer clears Lex's Undo");
  assert.equal((await lex.store.undo(history)).ok, true);
  assert.equal(lex.now(), "<!-- Anna --><h1>Warm Bread</h1><p>Open at seven.</p><p>Closed Mondays.</p>");
  // An Undo's text event carries ranges in the text as it is, so the code pane and the shared copy take back only his.
  const undone = lex.events.filter(event => event.type === "text" && event.origin === "undo").at(-1);
  assert.deepEqual(undone?.type === "text" && undone.changes, [{ start: lex.at("seven"), end: lex.at("seven") + "half past ".length, text: "" }]);
  // Anna again, between Lex's two Undos and on the redo side.
  lex.theirs([{ start: lex.at("Open"), end: lex.at("Open"), text: "We " }]);
  assert.equal((await lex.store.undo(history)).ok, true);
  assert.equal(lex.now(), "<!-- Anna --><h1>Bread</h1><p>We Open at seven.</p><p>Closed Mondays.</p>");
  assert.equal(lex.store.canUndo(history), false);
  lex.theirs([{ start: 0, end: "<!-- Anna -->".length, text: "" }]);
  assert.equal((await lex.store.redo(history)).ok, true);
  assert.equal((await lex.store.redo(history)).ok, true);
  assert.equal(lex.now(), "<h1>Warm Bread</h1><p>We Open at half past seven.</p><p>Closed Mondays.</p>");
  assert.equal(lex.store.canRedo(history), false);
});

test("Anna typing inside Lex's words: his Undo leaves hers", async () => {
  const lex = setup("<p></p>");
  lex.mine(3, 3, "Hello world");
  lex.theirs([{ start: lex.at(" world"), end: lex.at(" world"), text: " there" }]);
  assert.equal(lex.now(), "<p>Hello there world</p>");
  await lex.store.undo(history);
  assert.equal(lex.now(), "<p> there</p>");
  await lex.store.redo(history);
  assert.equal(lex.now(), "<p>Hello there world</p>");
});

test("a step Anna's change overlaps goes with the steps under it; newer steps stay", async () => {
  const lex = setup("<p>a</p>");
  lex.mine(3, 3, "Hello ");
  lex.mine(lex.at("</p>"), lex.at("</p>"), " again");
  lex.theirs([{ start: 3, end: 6, text: "" }]);
  assert.equal(lex.now(), "<p>lo a again</p>");
  await lex.store.undo(history);
  assert.equal(lex.now(), "<p>lo a</p>", "the newer step moved and undoes");
  assert.equal(lex.store.canUndo(history), false, "the overlapped step is gone");
  // Without the rebase (another tab's draft, say), the history over the file is cleared as before.
  lex.mine(0, 0, "x");
  assert.equal(lex.store.edit({ scope, path, changes: [{ start: 1, end: 1, text: "y" }], record: false, origin: "shared" }).ok, true);
  assert.equal(lex.store.canUndo(history), false);
  assert.equal(lex.store.canRedo(history), false);
});

test("a host action over the page goes with the steps under it; steps over other files keep", async () => {
  const lex = setup("<p>a</p>");
  lex.store.open(scope, "site.css", { text: "p{}", baseSha: sha });
  let undone = 0;
  lex.mine(0, 0, "<!-- 1 -->");
  lex.store.recordAction(history, { label: "Move section", undo: () => { undone++; } });
  lex.store.edit({ scope, path: "site.css", history, text: "p{color:red}" });
  lex.mine(lex.now().length, lex.now().length, "<!-- 2 -->");
  lex.theirs([{ start: lex.at("a"), end: lex.at("a") + 1, text: "b" }]);
  await lex.store.undo(history);
  assert.equal(lex.now(), "<!-- 1 --><p>b</p>");
  await lex.store.undo(history);
  assert.equal(lex.store.text(scope, "site.css"), "p{}", "a step over another file stays");
  assert.equal(lex.store.canUndo(history), false, "the action and the steps under it went");
  assert.equal(undone, 0);
});

test("typing in the code pane: open typing stays open and committed typing undoes whole, past Anna's change", async () => {
  const lex = setup("<p>a</p>");
  let nativeCalls = 0;
  const native = { undo: () => { nativeCalls++; return undefined; }, redo: () => { nativeCalls++; return undefined; } } satisfies NativeTyping;
  const typing = lex.store.beginTyping(scope, path, history, { version: 1, native });
  typing.input("<p>aX</p>", 2); typing.input("<p>aXY</p>", 3);
  typing.commit();
  typing.input("<p>aXYZ</p>", 4);
  lex.theirs([{ start: 0, end: 0, text: "<h1>Hi</h1>" }]);
  assert.equal(lex.now(), "<h1>Hi</h1><p>aXYZ</p>");
  typing.sync(5);
  typing.input("<h1>Hi</h1><p>aXYZW</p>", 6);
  assert.equal(lex.store.peek(history, "undo"), "Typing", "Anna's change did not split Lex's open typing");
  typing.commit();
  await lex.store.undo(history);
  assert.equal(lex.now(), "<h1>Hi</h1><p>aXY</p>", "the typing open over Anna's change undoes whole");
  await lex.store.undo(history);
  assert.equal(lex.now(), "<h1>Hi</h1><p>a</p>");
  assert.equal(nativeCalls, 0, "Monaco's stops under Anna's change are not asked for");
  await lex.store.redo(history);
  await lex.store.redo(history);
  assert.equal(lex.now(), "<h1>Hi</h1><p>aXYZW</p>");
  typing.dispose();
});

test("a typing step partly undone through Monaco's stops goes, and an open group closes at Anna's change", async () => {
  const lex = setup("x");
  const stops = [{ text: "x", version: 1 }, { text: "xab", version: 3 }, { text: "xabcd", version: 5 }];
  let at = 2;
  const native = {
    undo(expected: number) { if (stops[at].version !== expected || at === 0) return undefined; return stops[--at]; },
    redo(expected: number) { if (stops[at].version !== expected || at === stops.length - 1) return undefined; return stops[++at]; },
  } satisfies NativeTyping;
  const typing = lex.store.beginTyping(scope, path, history, { version: 1, native });
  typing.input("xab", 3); typing.input("xabcd", 5);
  typing.commit();
  await lex.store.undo(history);
  assert.equal(lex.now(), "xab");
  lex.theirs([{ start: 0, end: 0, text: "A" }]);
  assert.equal(lex.store.canUndo(history), false);
  assert.equal(lex.store.canRedo(history), false);
  typing.dispose();
  // Inline typing on the page: its group ends at Anna's change, so each part undoes on its own.
  assert.equal(lex.store.edit({ scope, path, history, group: true, changes: [{ start: 4, end: 4, text: "1" }] }).ok, true);
  lex.theirs([{ start: 0, end: 0, text: "B" }]);
  assert.equal(lex.store.edit({ scope, path, history, group: true, changes: [{ start: 6, end: 6, text: "2" }] }).ok, true);
  assert.equal(lex.now(), "BAxab12");
  await lex.store.undo(history);
  assert.equal(lex.now(), "BAxab1");
  await lex.store.undo(history);
  assert.equal(lex.now(), "BAxab");
});

test("a multi-file receipt over the page goes with the steps under it; Lex's later edit still undoes", async () => {
  const lex = setup("<p>a</p>");
  lex.store.open(scope, "site.css", { text: "p{}", baseSha: sha });
  const after = (text: string, base: string) => ({ text, base, baseSha: sha });
  assert.equal(lex.store.applyReceipt(history, "Rename class", [
    { scope, path, after: after('<p class="b">a</p>', "<p>a</p>") },
    { scope, path: "site.css", after: after(".b{}", "p{}") },
  ]).ok, true);
  lex.mine(lex.at("a</p>"), lex.at("a</p>"), "Lex ");
  lex.theirs([{ start: 0, end: 0, text: "<h1>Anna</h1>" }]);
  await lex.store.undo(history);
  assert.equal(lex.now(), '<h1>Anna</h1><p class="b">a</p>');
  assert.equal(lex.store.canUndo(history), false, "the receipt and the steps under it went");
  assert.equal(lex.store.text(scope, "site.css"), ".b{}", "its other file is untouched");
});

test("a typing step fully undone, on the redo side, comes back whole after Anna's text without Monaco's stops", async () => {
  const lex = setup("x");
  const stops = [{ text: "x", version: 1 }, { text: "xab", version: 3 }];
  let at = 1, redoCalls = 0;
  const native = {
    undo(expected: number) { if (stops[at].version !== expected || at === 0) return undefined; return stops[--at]; },
    redo() { redoCalls++; return undefined; },
  } satisfies NativeTyping;
  const typing = lex.store.beginTyping(scope, path, history, { version: 1, native });
  typing.input("xab", 3);
  typing.commit();
  await lex.store.undo(history);
  assert.equal(lex.now(), "x");
  lex.theirs([{ start: 0, end: 0, text: "Anna " }]);
  assert.equal((await lex.store.redo(history)).ok, true);
  assert.equal(lex.now(), "Anna xab");
  assert.equal(redoCalls, 0);
  typing.dispose();
});

test("Anna's change while Lex's Undo waits: that Undo stops, her change is there once, and the next Undo takes his back", async () => {
  const lex = setup("<p>a</p>");
  let release!: () => void, asked = 0, undone = 0;
  const companion = {
    ready: () => { asked++; return asked === 1 ? new Promise<undefined>(resolve => { release = () => resolve(undefined); }) : undefined; },
    undo: () => { undone++; },
    redo: () => {},
  };
  assert.equal(lex.store.edit({ scope, path, history, changes: [{ start: 3, end: 3, text: "Lex " }], companion }).ok, true);
  const waiting = lex.store.undo(history);
  lex.theirs([{ start: 0, end: 0, text: "<h1>Anna</h1>" }]);
  release();
  assert.deepEqual(await waiting, { ok: false, error: "The history changed meanwhile." });
  assert.equal(lex.now(), "<h1>Anna</h1><p>Lex a</p>");
  assert.equal(undone, 0);
  assert.equal((await lex.store.undo(history)).ok, true);
  assert.equal(lex.now(), "<h1>Anna</h1><p>a</p>");
  assert.equal(undone, 1);
});
