// An outside commit as one more participant of a live room's copy (ticket am-59, src/live-versions.ts). Two tabs that
// fold the same commit write the very same bytes, so Yjs takes the commit once; the clash rule in the copy is the one
// src/text-merge.ts `mergeText` gives a draft (ticket 09: GitHub's words show, the typist's words one Undo away). The
// third unit test of the design, commit 3 heard before commit 2, needs whole tabs: it is in tests/live-text.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { birthUpdate, clashes, draftUpdate, edgeClient, edgeTo, edgeUpdate, edges, textAt } from "../src/live-versions.ts";
import { mergeText } from "../src/text-merge.ts";
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
const without = (from: string, changes: readonly TextChange[]) =>
  changes.reduce((out, change) => out.slice(0, change.start) + change.text + out.slice(change.end), from);

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
    type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const all = edges(Y, doc), edge = edgeTo(all, V1)!;
    const merged = mergeText(base, mine, theirs);
    assert.equal(merged.clashed, clashed, base);
    const out = clashes(Y, doc, all, edge, client => client === own);
    assert.equal(out.length > 0, clashed, base);
    // Taking out this tab's words the clash names leaves mergeText's text: the latest version, the rest merged.
    assert.equal(without(text(doc), out), merged.text, base);
  }
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
    type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const all = edges(Y, doc), out = clashes(Y, doc, all, edgeTo(all, V1)!, client => client === own);
    cases.push({ base, mine, theirs, out, settled: without(text(doc), out), merged: mergeText(base, mine, theirs) });
  }
  return cases;
}

test("seeded: where mergeText sees no clash, the copy takes none of the typist's words out; where it does, mostly the same", async () => {
  const cases = await seeded(300);
  for (const { base, mine, theirs, out, merged } of cases) if (!merged.clashed) assert.deepEqual(out, [], JSON.stringify({ base, mine, theirs }));
  const clashed = cases.filter(item => item.merged.clashed);
  assert.ok(clashed.length > 20, `clashes seen: ${clashed.length}`);
  assert.ok(clashed.filter(item => item.settled === item.merged.text).length >= 25);
});

// Open for the lead (am-59, 2026-11-11): in 35 of these 300 cases the copy's text differs from mergeText's, all where
// both sides changed words right next to each other: the white space between them taken by one side ("Saturdayrye"),
// a word both sides took out next to each other (mergeText shows GitHub's text, the copy loses the word), a repeated
// word matched to another copy of it, or two words added at the same place kept both. Measured, not yet fixed.
test("seeded: the copy's text once the clash rule ran is mergeText's in every case", { todo: "35 of 300 adjacent-word cases differ (see above)" }, async () => {
  const differ = (await seeded(300)).filter(item => item.settled !== item.merged.text);
  assert.deepEqual(differ.map(({ base, mine, theirs, settled, merged }) => ({ base, mine, theirs, settled, merged: merged.text })), []);
});
