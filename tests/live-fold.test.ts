// An outside commit as one more participant of a live room's copy (ticket am-59, src/live-versions.ts). Two tabs that
// fold the same commit write the very same bytes, so Yjs takes the commit once; the clash rule in the copy is the one
// src/text-merge.ts `mergeText` gives a draft (ticket 09: GitHub's words show, the typist's words one Undo away). The
// third unit test of the design, commit 3 heard before commit 2, needs whole tabs: it is in tests/live-text.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { birthUpdate, clashes, draftUpdate, edgeClient, edgeTo, edgeUpdate, edges, newestOf, occurrenceAfter, occurrenceOn, textAt, tipOf, wholeWords, type Edge } from "../src/live-versions.ts";
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

test("a text GitHub brings back (A to B to A to B to A) is its next occurrence, after the one before it, and the tip from it (am-59)", () => {
  const A = "a".repeat(40), B = "b".repeat(40), none = new Uint8Array();
  const way = (from: string, to: string): Edge => ({ id: `e:${to}`, from, to, snapshot: none });
  const all = [way("", A), way(A, B), way(B, `${A}~1`), way(`${A}~1`, `${B}~1`), way(`${B}~1`, `${A}~2`)];
  assert.equal(occurrenceOn(all, A, B), B, "B after the first A is the B the copy holds");
  assert.equal(occurrenceOn(all, `${A}~1`, B), `${B}~1`);
  assert.equal(occurrenceOn(all, `${B}~1`, A), `${A}~2`);
  assert.equal(occurrenceOn(all, `${A}~1`, A), `${A}~1`, "a version is its own text's occurrence");
  assert.equal(newestOf(all, A), `${A}~2`);
  assert.equal(newestOf(all, "c".repeat(40)), undefined);
  assert.equal(occurrenceAfter(all, A, B, true), `${A}~2`, "the latest A that came after a B");
  assert.equal(occurrenceAfter(all, A, "c".repeat(40), false), A, "the copy's first version came after none it holds");
  assert.equal(occurrenceAfter(all.slice(0, 2), A, B, true), undefined, "an A after B the copy lacks");
  assert.equal(tipOf(all, `${A}~1`), `${A}~2`);
  assert.equal(tipOf(all.slice(0, 3), `${A}~1`), `${A}~1`, "the tip from A's second occurrence is not B");
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

test("two clashes far apart on one page each end as mergeText's: GitHub's words show, the typist's one Undo away (am-59)", async () => {
  // About 1.7 KB: the two clashes are too far apart to be matched as one stretch.
  const filler = Array.from({ length: 36 }, (_, index) => `<p>Line ${index} of the page, unchanged by anyone.</p>\n`).join("");
  const base = `<p>Open Tuesday to Saturday</p>\n${filler}<p>Bakes Monday to Friday</p>\n`;
  const mine = base.replace("to Saturday", "to").replace("to Friday", "to");
  const theirs = base.replace("Tuesday to", "Tuesday").replace("Monday to", "Monday");
  const merged = mergeText(base, mine, theirs);
  assert.ok(base.length > 1_600 && merged.clashed);
  const doc = await copyOf(base), own = 7;
  const typed = type(doc, base, mine, own);
  Y.applyUpdate(doc, await outside(doc, theirs));
  const { settled, back } = settle(doc, own, typed);
  assert.equal(settled, merged.text);
  assert.ok(settled.includes("Saturday") && settled.includes("Friday"), "GitHub kept Saturday and Friday: this tab's taking them out is undone");
  assert.ok(back, "the words this tab took out come back");
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

test("a word put back in a clash goes back whole, signs and all: words others put in beside it cannot cut it apart (TOOLS-216)", async () => {
  const base = "<p>«3» «17» end</p>\n", mine = "<p>end</p>\n", theirs = "<p>«3» «30» end</p>\n";
  const doc = await copyOf(base), typed = type(doc, base, mine, 7);
  Y.applyUpdate(doc, await outside(doc, theirs));
  const gone = Y.decodeUpdate(typed).ds, took = (client: number, clock: number) => Y.isDeleted(gone, Y.createID(client, clock));
  const { back } = clashes(Y, doc, edges(Y, doc), edgeTo(edges(Y, doc), V1)!, client => client === 7, took);
  assert.ok(back, "«3» comes back");
  // One item per word put back, from white space to white space ("<p>«3»"), not "«", "3" and "»" each in a place of its own.
  const put = Y.decodeUpdate(back).structs.flatMap(struct => struct instanceof Y.Item && struct.content instanceof Y.ContentString ? [struct.content.str] : []);
  assert.ok(put.some(item => item.includes("«3»")), JSON.stringify(put));
});

test("a clash takes this tab's words out whole: a word of its own that stays keeps its own characters (TOOLS-223)", async () => {
  const cases = [
    // GitHub replaced w0 and took out w2: «12» and «21» go, «11» stays.
    { base: "<p>w0 w1 w2 w3</p>\n", mine: "<p>w0 w1 «12» «21» w2 «11» w3</p>\n", theirs: "<p>Z0 w1 w3</p>\n" },
    // The same with a word of GitHub's coming back (the white space after "Z1").
    { base: "<p>w0 w1 w2 w3</p>\n", mine: "<p>w0 w2 «4» «12» w3 «11»</p>\n", theirs: "<p>w0 Z1 w2</p>\n" },
  ];
  for (const { base, mine, theirs } of cases) {
    const doc = await copyOf(base), own = 7;
    const typed = type(doc, base, mine, own);
    Y.applyUpdate(doc, await outside(doc, theirs));
    const before = text(doc), { out, settled } = settle(doc, own, typed);
    // Taken out by matching characters alike, "«21» «1" and "1» " made «11» of two words' characters: a tab carrying its
    // own words over by their ids then put "«1" in one place and "1»" in another.
    for (const change of out) if (!change.text) assert.match(before.slice(change.start, change.end), /^(\s|«\d+»)+$/, `${before} ${JSON.stringify(out)}`);
    assert.equal(settled, mergeText(base, mine, theirs).text);
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

// LIVE_FOLD_SPOT=1 plays 1000 cases; a larger number plays that many.
test("seeded spot check: 1000 cases or LIVE_FOLD_SPOT", { skip: !process.env.LIVE_FOLD_SPOT && "set LIVE_FOLD_SPOT=1" }, async () => {
  assert.deepEqual(await differing(Math.max(1000, Number(process.env.LIVE_FOLD_SPOT) || 0)), []);
});

test("taking out whole words leaves a take-out as it is when no whole runs make the same text", () => {
  // "ab" was typed as one run by someone else: taking out only "b" cannot be made of whole runs of this tab's own.
  const changes: TextChange[] = [{ start: 1, end: 2, text: "" }];
  wholeWords("ab cd", changes, () => false, index => index === 0);
  assert.deepEqual(changes, [{ start: 1, end: 2, text: "" }]);
});

test("taking out whole words leaves take-outs as they are when the stretch is too long to match", () => {
  // 2,001 signs of this tab's own, each typed apart, every other one taken out: too many to match, so nothing moves
  // (matched, the alike signs would let it keep the first 1,000 and take out the last 1,000 in one go).
  const text = "x".repeat(2001);
  const changes: TextChange[] = Array.from({ length: 1000 }, (_, index) => ({ start: 2 * index + 1, end: 2 * index + 2, text: "" }));
  const before = changes.map(change => ({ ...change }));
  wholeWords(text, changes, () => true, () => false);
  assert.deepEqual(changes, before);
});
