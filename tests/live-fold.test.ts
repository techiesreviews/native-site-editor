// An outside commit as one more participant of a live room's copy (ticket am-59, src/live-versions.ts). Two tabs that
// fold the same commit write the very same bytes, so Yjs takes the commit once; the clash rule in the copy is the one
// src/text-merge.ts `mergeText` gives a draft (ticket 09: GitHub's words show, the typist's words one Undo away). The
// third unit test of the design, commit 3 heard before commit 2, needs whole tabs: it is in tests/live-text.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { birthUpdate, clashes, draftUpdate, edgeClient, edgeTo, edgeUpdate, edges, textAt } from "../src/live-versions.ts";
import { mergeText } from "../src/text-merge.ts";
import { diffRange } from "../src/draft-store.ts";
import type { TextChange } from "../src/draft-store.ts";

const V0 = "a".repeat(40), V1 = "b".repeat(40);

/** A tab's copy born at V0 with `text`, and its text. */
async function copyOf(text: string) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, await birthUpdate(Y, V0, text));
  return doc;
}
/** A tab's own typing: `typed` over GitHub's V0 (`base`), written on the copy as it was at V0 under `client`. */
function type(doc: Y.Doc, base: string, typed: string, client: number) {
  const update = draftUpdate(Y, doc, edgeTo(edges(Y, doc), V0)!, base, typed, client);
  Y.applyUpdate(doc, update);
  return update;
}
/** The outside participant's update bringing GitHub's V1 (`text`) into `doc`. */
async function outside(doc: Y.Doc, text: string) {
  const from = edgeTo(edges(Y, doc), V0)!;
  return edgeUpdate(Y, doc, from, V1, text, await edgeClient(V0, V1, from.snapshot))!;
}
const text = (doc: Y.Doc) => doc.getText("source").toString();
/** The clash rule for the tab typing under `own` (its typing: `typed`) once V1 came in, made under its client id: its
 * own words that go taken out, GitHub's words it took out put back. */
function settle(doc: Y.Doc, own: number, typed: Uint8Array) {
  const all = edges(Y, doc), gone = Y.decodeUpdate(typed).ds;
  const { out, back } = clashes(Y, doc, all, edgeTo(all, V1)!, client => client === own, (client, clock) => Y.isDeleted(gone, Y.createID(client, clock)));
  // As src/live-text.ts: the words coming back first, then this tab's change, made as the difference still left.
  const draft = out.reduce((from, change) => from.slice(0, change.start) + change.text + from.slice(change.end), text(doc));
  if (back) Y.applyUpdate(doc, back);
  const was = doc.clientID, source = doc.getText("source"), left = diffRange(text(doc), draft);
  doc.clientID = own;
  doc.transact(() => { source.delete(left.start, left.end - left.start); source.insert(left.start, left.text); });
  doc.clientID = was;
  return { out, back, settled: text(doc) };
}
/** Words in `text` that none of `from` has: two words glued together, or one cut apart. */
const strange = (text: string, ...from: string[]) => {
  const known = new Set(from.join(" ").match(/[\p{L}\p{N}_]+/gu));
  return (text.match(/[\p{L}\p{N}_]+/gu) ?? []).filter(word => !known.has(word));
};

test("a word typed here and saved, coming in again as GitHub's: the second goes, as no clash (no Undo step of its own) (am-59)", async () => {
  const base = "<h1>Fresh bread</h1>\n<p>Open at seven.</p>\n", github = base.replace("<p>Open", "Sunday <p>Open");
  const doc = await copyOf(base), typed = type(doc, base, github, 7);
  Y.applyUpdate(doc, await outside(doc, github));
  assert.equal(text(doc), base.replace("<p>Open", "Sunday Sunday <p>Open"), "the copy holds it twice before the clash rule");
  const all = edges(Y, doc), gone = Y.decodeUpdate(typed).ds;
  const found = clashes(Y, doc, all, edgeTo(all, V1)!, client => client === 7, (client, clock) => Y.isDeleted(gone, Y.createID(client, clock)));
  assert.equal(found.clashed, false);
  assert.equal(settle(doc, 7, typed).settled, github);
});

test("two tabs folding the same commit write the same bytes, whatever each typed meanwhile, and the words enter once", async () => {
  const base = "<h1>Fresh bread</h1>\n<p>Open Tuesday to Saturday.</p>\n";
  const github = base.replace("Saturday", "Sunday").replace("Fresh bread", "Fresh bread daily");
  const anna = await copyOf(base), lex = await copyOf(base);
  // Each typed something the other has not heard yet.
  const annaTyped = type(anna, base, base.replace("<h1>", "<h1>Our "), 11);
  const lexTyped = type(lex, base, base.replace("Open", "Open from"), 22);
  const fromAnna = await outside(anna, github), fromLex = await outside(lex, github);
  assert.ok(fromAnna.length > 0);
  assert.deepEqual(fromAnna, fromLex);
  // Each takes its own fold, then hears the other's typing and the other's (identical) fold.
  Y.applyUpdate(anna, fromAnna);
  Y.applyUpdate(lex, fromLex);
  Y.applyUpdate(anna, lexTyped);
  Y.applyUpdate(lex, annaTyped);
  Y.applyUpdate(anna, fromLex);
  Y.applyUpdate(lex, fromAnna);
  assert.equal(text(anna), text(lex));
  assert.equal(text(anna), "<h1>Our Fresh bread daily</h1>\n<p>Open from Tuesday to Sunday.</p>\n");
  assert.equal(textAt(Y, anna, edges(Y, anna), V1), github);
  // One way into V1 in both copies.
  assert.deepEqual(edges(Y, anna).map(edge => `${edge.from}>${edge.to}`.replace(/(.)\1{39}/g, "$1")).sort(), [">a", "a>b"]);
});

test("the clash in the copy is mergeText's: GitHub's words show where both changed the same words, the rest merges", async () => {
  const cases: { base: string; mine: string; theirs: string; clashed: boolean }[] = [
    // The same word changed on both sides: GitHub's shows.
    { base: "<p>Open Tuesday to Saturday.</p>\n", mine: "<p>Open Tuesday to Sunday.</p>\n", theirs: "<p>Open Tuesday to Friday.</p>\n", clashed: true },
    // Different words on one line: both stay.
    { base: "<p>Open Tuesday to Saturday, 9 to 5.</p>\n", mine: "<p>Open Tuesday to Sunday, 9 to 5.</p>\n", theirs: "<p>Open Tuesday to Saturday, 8 to 4.</p>\n", clashed: false },
    // Lines apart.
    { base: "one\ntwo\nthree\n", mine: "one\nTWO\nthree\n", theirs: "one\ntwo\nTHREE\n", clashed: false },
  ];
  for (const { base, mine, theirs, clashed } of cases) {
    const doc = await copyOf(base), own = 7;
    const typed = type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const merged = mergeText(base, mine, theirs);
    assert.equal(merged.clashed, clashed, base);
    const { out, settled } = settle(doc, own, typed);
    assert.equal(out.length > 0, clashed, base);
    // Taking out this tab's words the clash names leaves mergeText's text: the latest version, the rest merged.
    assert.equal(settled, merged.text, base);
  }
});

test("where both changed words right next to each other, no word is glued to another or lost (lead, 2026-11-11)", async () => {
  const cases = [
    // This tab took out the last word, GitHub put one in before it: "Saturdayrye" before.
    { base: "<p>Open Tuesday to Saturday to</p>\n", mine: "<p>Open Tuesday to Saturday</p>\n", theirs: "<p>Open Tuesday to Saturday rye to</p>\n" },
    // Each took out a word next to the other's: one of them lost before.
    { base: "<p>rye to Saturday</p>\n", mine: "<p>rye to</p>\n", theirs: "<p>rye Saturday</p>\n" },
    // GitHub replaced the word this tab took out, with the white space after it: "toto5" before.
    { base: "<p>Saturday1 bread3 to5 daily</p>\n", mine: "<p>Saturday1 to5 daily</p>\n", theirs: "<p>Saturday1 to to5 daily</p>\n" },
    // GitHub replaced a word this tab put another right after: "Saturdaydaily" before.
    { base: "<p>to5 bread</p>\n", mine: "<p>to5 bread Saturday</p>\n", theirs: "<p>to5 daily</p>\n" },
  ];
  for (const { base, mine, theirs } of cases) {
    const doc = await copyOf(base), own = 7;
    const typed = type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const { settled } = settle(doc, own, typed);
    assert.deepEqual(strange(settled, base, mine, theirs), [], settled);
    assert.equal(settled, mergeText(base, mine, theirs).text);
  }
});

test("two tabs putting back the same word write the same bytes, and it shows once", async () => {
  const base = "<p>rye to Saturday</p>\n", mine = "<p>rye to</p>\n", theirs = "<p>rye Saturday</p>\n";
  const anna = await copyOf(base), lex = await copyOf(base);
  // Both tabs of one browser went in with the same draft: the same update, the same client id, both took the word out.
  const typed = type(anna, base, mine, 7);
  Y.applyUpdate(lex, typed);
  for (const doc of [anna, lex]) Y.applyUpdate(doc, await outside(doc, theirs));
  const gone = Y.decodeUpdate(typed).ds, took = (client: number, clock: number) => Y.isDeleted(gone, Y.createID(client, clock));
  const [fromAnna, fromLex] = [anna, lex].map(doc => clashes(Y, doc, edges(Y, doc), edgeTo(edges(Y, doc), V1)!, client => client === 7, took).back!);
  assert.ok(fromAnna.length > 0);
  assert.deepEqual(fromAnna, fromLex);
  for (const doc of [anna, lex]) { Y.applyUpdate(doc, fromAnna); Y.applyUpdate(doc, fromLex); }
  assert.equal(text(anna), text(lex));
  assert.equal(text(anna), theirs);
});

/** Seeded one-word changes (replaced, put in or taken out) on both sides of a short paragraph: each case's base, this
 * tab's text and GitHub's, the copy's text once the clash rule ran, and mergeText's. */
async function seeded(runs: number) {
  let state = 59;
  const next = (n: number) => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state % n; };
  const words = ["Open", "Tuesday", "to", "Saturday", "bread", "rye", "daily"];
  const word = () => words[next(words.length)] + (next(3) ? "" : String(next(9)));
  const change = (from: string[]) => {
    const out = [...from], at = next(out.length + 1), kind = next(3);
    if (kind === 0 && at < out.length) out[at] = word();
    else if (kind === 1 || !out.length) out.splice(at, 0, word());
    else out.splice(Math.min(at, out.length - 1), 1);
    return out;
  };
  const cases: { base: string; mine: string; theirs: string; out: TextChange[]; settled: string; merged: ReturnType<typeof mergeText> }[] = [];
  for (let run = 0; run < runs; run++) {
    const list = Array.from({ length: 3 + next(4) }, word);
    const base = `<p>${list.join(" ")}</p>\n`, mine = `<p>${change(list).join(" ")}</p>\n`, theirs = `<p>${change(list).join(" ")}</p>\n`;
    if (mine === base || theirs === base) continue;
    const doc = await copyOf(base), own = 7;
    const typed = type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const { out, settled } = settle(doc, own, typed);
    cases.push({ base, mine, theirs, out, settled, merged: mergeText(base, mine, theirs) });
  }
  return cases;
}

test("seeded: where mergeText sees no clash, every word the typist put in stays", async () => {
  const cases = await seeded(300);
  assert.ok(cases.filter(item => item.merged.clashed).length > 20);
  for (const { base, mine, theirs, settled, merged } of cases) {
    if (merged.clashed) continue;
    // Each word this tab put in still shows.
    for (const word of strange(mine, base)) assert.ok(settled.includes(word), JSON.stringify({ base, mine, theirs, settled }));
  }
});

/** Seeded cases whose copy, once the clash rule ran, is not mergeText's text, each with any glued or cut word. */
async function differing(runs: number) {
  return (await seeded(runs)).filter(item => item.settled !== item.merged.text)
    .map(({ base, mine, theirs, settled, merged }) => ({ base, mine, theirs, settled, merged: merged.text, strange: strange(settled, base, mine, theirs) }));
}

// Lead, 2026-11-11: glued words ("Saturdayrye") and a lost word are data loss. Every case, both sides changing words
// right next to each other included, ends as mergeText's text: every word whole, no one's words lost.
test("seeded: the copy's text once the clash rule ran is mergeText's in every case", async () => {
  assert.deepEqual(await differing(300), []);
});

test("seeded spot check: 1000 cases", { skip: !process.env.LIVE_FOLD_SPOT && "set LIVE_FOLD_SPOT=1" }, async () => {
  assert.deepEqual(await differing(1000), []);
});
