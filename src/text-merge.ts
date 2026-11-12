// The three-way text merge (ticket am-33): a draft and GitHub's new text, both changed from the text the draft started
// from, merged by line and then by word inside lines both changed, so only the same words changed on both sides clash
// (ticket 09). Used by outside changes folding in (src/outside-merge.ts); its diff by runs (`runChanges`) by a shared
// copy putting back what a tab typed while away (src/live-text.ts). No DOM, no I/O.

import type { TextChange } from "./draft-store";

/** Past this many line differences one side is taken as a single change (Myers' trace grows with its square). */
const MAX_LINE_EDITS = 2_000;

/** A side's change to the starting text: lines `[start, end)` of it replaced by `lines`. */
interface Hunk { start: number; end: number; lines: string[] }

const splitLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Pairs of equal lines `[i, j]` (a's line i is b's line j), in order: Myers' shortest edit script. */
function matchLines(a: readonly number[], b: readonly number[]): [number, number][] {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // After each round d, v's band [-(d + 1), d + 1]: what the walk back reads.
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, MAX_LINE_EDITS) && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    trace.push(v.slice(off - d - 1, off + d + 2));
  }
  if (found < 0) return [];
  const pairs: [number, number][] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const before = trace[d - 1], at = (k: number) => before[k + d];
    const k = x - y;
    const back = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const fromX = at(back), fromY = fromX - back;
    while (x > fromX && y > fromY) pairs.push([--x, --y]);
    x = fromX; y = fromY;
  }
  while (x > 0 && y > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

/** What `side` changed of `base` (both as line ids), with `lines` the side's own lines; `match` pairs their equal parts. */
function hunks(base: readonly number[], side: readonly number[], lines: readonly string[], match = matchLines): Hunk[] {
  const out: Hunk[] = [];
  let i = 0, j = 0;
  for (const [bi, si] of [...match(base, side), [base.length, side.length] as [number, number]]) {
    if (bi > i || si > j) out.push({ start: i, end: bi, lines: lines.slice(j, si) });
    i = bi + 1; j = si + 1;
  }
  return out;
}

/** Whether two changes touch the same starting lines: overlapping ranges, or insertions at one place. */
const meets = (a: Hunk, b: Hunk) => (a.start < b.end && b.start < a.end) || (a.start === a.end && b.start === b.end && a.start === b.start)
  || (a.start === a.end && b.start < a.start && a.start < b.end) || (b.start === b.end && a.start < b.start && b.start < a.end);

/** `base`'s lines `[start, end)` with `side`'s changes in that range made. */
function rewrite(base: readonly string[], start: number, end: number, side: readonly Hunk[]) {
  const out: string[] = [];
  let at = start;
  for (const hunk of side) { out.push(...base.slice(at, hunk.start), ...hunk.lines); at = hunk.end; }
  out.push(...base.slice(at, end));
  return out.join("");
}

export interface Merged {
  /** The latest version: both sides' changes, GitHub's (`theirs`) where both changed the same words. */
  text: string;
  /** The same with Lex's (`ours`) words where both changed the same words: what one Undo brings back. */
  mine: string;
  clashed: boolean;
}

/** Words, runs of white space and single other characters: where a clashing line is merged again. */
export const splitWords = (text: string) => text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];

/** Each distinct part as a number, so the diff compares numbers. */
function numbered(...sides: string[][]) {
  const ids = new Map<string, number>();
  return sides.map(parts => parts.map(part => { let found = ids.get(part); if (found === undefined) ids.set(part, found = ids.size); return found; }));
}

/**
 * The three-way merge of `base` split in parts (lines, or words): `ours` and `theirs` both changed from it. Changes to
 * different parts merge by themselves; parts both sides changed alike are taken once. Parts both changed differently
 * are merged again by `deeper` (lines by word) when given, else they clash.
 */
function mergeParts(baseParts: string[], ourParts: string[], theirParts: string[], deeper?: (base: string, ours: string, theirs: string) => Merged, match = matchLines): Merged {
  const [b, o, t] = numbered(baseParts, ourParts, theirParts);
  const tagged = [...hunks(b, o, ourParts, match).map(hunk => ({ hunk, mine: true })), ...hunks(b, t, theirParts, match).map(hunk => ({ hunk, mine: false }))]
    .sort((x, y) => x.hunk.start - y.hunk.start || x.hunk.end - y.hunk.end);
  let text = "", mine = "", at = 0, clashed = false;
  for (let index = 0; index < tagged.length;) {
    // One group: every change that touches another of it.
    const group = [tagged[index++]];
    let start = group[0].hunk.start, end = group[0].hunk.end;
    while (index < tagged.length && group.some(item => meets(item.hunk, tagged[index].hunk) || tagged[index].hunk.start < end)) {
      const next = tagged[index++];
      group.push(next);
      start = Math.min(start, next.hunk.start); end = Math.max(end, next.hunk.end);
    }
    const kept = baseParts.slice(at, start).join("");
    text += kept; mine += kept; at = end;
    const ourSide = group.filter(item => item.mine).map(item => item.hunk), theirSide = group.filter(item => !item.mine).map(item => item.hunk);
    const theirText = rewrite(baseParts, start, end, theirSide), ourText = rewrite(baseParts, start, end, ourSide);
    if (ourSide.length && theirSide.length && ourText !== theirText) {
      // Both changed these lines: merged again by word, a clash only where the same words changed.
      const inner = deeper?.(baseParts.slice(start, end).join(""), ourText, theirText);
      if (inner) { text += inner.text; mine += inner.mine; clashed ||= inner.clashed; continue; }
      clashed = true;
    }
    text += theirSide.length ? theirText : ourText;
    mine += ourSide.length ? ourText : theirText;
  }
  const rest = baseParts.slice(at).join("");
  return { text: text + rest, mine: mine + rest, clashed };
}

/** The changes that turn `from` into `to` by runs of white space and runs of anything else, in order: the runs both
 * have stay out of every change, so a word is changed whole or not at all. */
export function runChanges(from: string, to: string): TextChange[] {
  return partChanges(from, to, text => text.match(/\s+|\S+/g) ?? []);
}

/**
 * The changes that turn `from` into `to` by words, runs of white space and single other characters, in order. Parts
 * found once in each text are kept first, as a patience diff keeps them (the longest run of them in the same order),
 * and the parts between are compared again the same way, then by Myers' shortest script; so a word both texts have
 * once stays out of every change rather than being taken out in one place and put in again in another, which spaces
 * and brackets, found everywhere, would otherwise make look as short.
 */
export function wordChanges(from: string, to: string): TextChange[] {
  const a = splitWords(from), b = splitWords(to), [x, y] = numbered(a, b), pairs = matchParts(x, y);
  const offsets = [0];
  for (const part of a) offsets.push(offsets.at(-1)! + part.length);
  const out: TextChange[] = [];
  let i = 0, j = 0;
  for (const [ai, bj] of [...pairs, [a.length, b.length] as [number, number]]) {
    if (ai > i || bj > j) out.push({ start: offsets[i], end: offsets[ai], text: b.slice(j, bj).join("") });
    i = ai + 1; j = bj + 1;
  }
  return slide(from, out);
}

/** Pairs of equal parts `[i, j]` (x's part i is y's part j), in order: parts found once in each kept first (patience),
 * the parts between compared again the same way, then by Myers' shortest script (`wordChanges`). */
function matchParts(x: readonly number[], y: readonly number[]): [number, number][] {
  const pairs: [number, number][] = [];
  const walk = (aLo: number, aHi: number, bLo: number, bHi: number) => {
    while (aLo < aHi && bLo < bHi && x[aLo] === y[bLo]) pairs.push([aLo++, bLo++]);
    const tail: [number, number][] = [];
    while (aLo < aHi && bLo < bHi && x[aHi - 1] === y[bHi - 1]) tail.unshift([--aHi, --bHi]);
    const count = (ids: readonly number[], lo: number, hi: number) => {
      const seen = new Map<number, number>();
      for (let at = lo; at < hi; at++) seen.set(ids[at], seen.has(ids[at]) ? -1 : at);
      return seen;
    };
    const inA = count(x, aLo, aHi), inB = count(y, bLo, bHi), common: [number, number][] = [];
    for (const [id, at] of inA) { const there = inB.get(id); if (at >= 0 && there !== undefined && there >= 0) common.push([at, there]); }
    common.sort((p, q) => p[0] - q[0]);
    // The longest run of them in the same order in both (patience sorting).
    const piles: number[] = [], back: number[] = [];
    common.forEach(([, j], index) => {
      let lo = 0, hi = piles.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (common[piles[mid]][1] < j) lo = mid + 1; else hi = mid; }
      back[index] = lo ? piles[lo - 1] : -1;
      piles[lo] = index;
    });
    const anchors: [number, number][] = [];
    for (let index = piles.length ? piles[piles.length - 1] : -1; index >= 0; index = back[index]) anchors.unshift(common[index]);
    if (!anchors.length) {
      for (const [i, j] of matchLines(x.slice(aLo, aHi), y.slice(bLo, bHi))) pairs.push([aLo + i, bLo + j]);
    } else {
      let i = aLo, j = bLo;
      for (const [ai, bj] of anchors) { walk(i, ai, j, bj); pairs.push([ai, bj]); i = ai + 1; j = bj + 1; }
      walk(i, aHi, j, bHi);
    }
    pairs.push(...tail);
  };
  walk(0, x.length, 0, y.length);
  return pairs;
}

/** How well a change's end sits between characters `left` and `right`: a line, white space or a tag's edge. The text's
 * own edges count as white space: src/live-versions.ts `wordRuns` diffs a run of the text cut at white space. */
const fit = (left: string | undefined, right: string | undefined) =>
  left === "\n" || right === "\n" ? 2 : left === undefined || right === undefined || /\s/.test(left) || /\s/.test(right) || left === ">" || right === "<" ? 1 : 0;

/**
 * `changes` (on `text`, in order) with each one that only takes out or only puts in moved sideways, as far as it makes
 * the same text, to where its ends sit best (`fit`): taking out "«12» " rather than "12» «", so the parts a change
 * leaves are whole words, as a person would have typed them (as diff-match-patch's lossless clean-up moves its edits).
 */
function slide(text: string, changes: TextChange[]) {
  return changes.map((change, index) => {
    const low = index ? changes[index - 1].end : 0, high = index + 1 < changes.length ? changes[index + 1].start : text.length;
    if (change.start === change.end && change.text) {
      // Put in at `at`: moving one left takes the character before it to the front, when the text ends with it.
      let at = change.start, put = change.text;
      const score = (where: number, text2: string) => fit(text[where - 1], text2[0]) + fit(text2[text2.length - 1], text[where]);
      // Where it was found wins a tie: the diff's own choice among repeated words, as src/text-merge.ts merges them.
      let best = { at, put, score: score(at, put) };
      while (at > low && text[at - 1] === put[put.length - 1]) { put = text[at - 1] + put.slice(0, -1); at--; }
      if (score(at, put) > best.score) best = { at, put, score: score(at, put) };
      while (at < high && text[at] === put[0]) {
        put = put.slice(1) + text[at]; at++;
        const score = fit(text[at - 1], put[0]) + fit(put[put.length - 1], text[at]);
        if (score > best.score) best = { at, put, score };
      }
      return { start: best.at, end: best.at, text: best.put };
    }
    if (change.start < change.end && !change.text) {
      let start = change.start, end = change.end;
      const score = (from: number, to: number) => fit(text[from - 1], text[from]) + fit(text[to - 1], text[to]);
      let best = { start, end, score: score(start, end) };
      while (start > low && text[start - 1] === text[end - 1]) { start--; end--; }
      if (score(start, end) > best.score) best = { start, end, score: score(start, end) };
      while (end < high && text[start] === text[end]) {
        start++; end++;
        const score = fit(text[start - 1], text[start]) + fit(text[end - 1], text[end]);
        if (score > best.score) best = { start, end, score };
      }
      return { start: best.start, end: best.end, text: "" };
    }
    return change;
  });
}

function partChanges(from: string, to: string, split: (text: string) => string[]): TextChange[] {
  const a = split(from), b = split(to), [x, y] = numbered(a, b);
  const offsets = [0];
  for (const part of a) offsets.push(offsets.at(-1)! + part.length);
  return hunks(x, y, b).map(hunk => ({ start: offsets[hunk.start], end: offsets[hunk.end], text: hunk.lines.join("") }));
}

/**
 * The three-way merge: `ours` (the draft) and `theirs` (GitHub's new text), both changed from `base` (the text the
 * draft started from). By line first; lines both sides changed are merged again by word, so only the same words
 * changed on both sides clash (ticket 09: "the same words changed on both sides").
 */
export function mergeText(base: string, ours: string, theirs: string): Merged {
  if (ours === base || ours === theirs) return { text: theirs, mine: theirs, clashed: false };
  if (theirs === base) return { text: ours, mine: ours, clashed: false };
  // By word as `wordChanges` pairs them: a word each side has once is kept first, so spaces and signs, found everywhere,
  // do not pair one side's word with another word of the other ("«3» «17»" against "«21» «3»": «3» stays «3»).
  return mergeParts(splitLines(base), splitLines(ours), splitLines(theirs),
    (b, o, t) => mergeParts(splitWords(b), splitWords(o), splitWords(t), undefined, matchParts));
}
