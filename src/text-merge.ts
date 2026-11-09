// The three-way text merge (ticket am-33): a draft and GitHub's new text, both changed from the text the draft started
// from, merged by line and then by word inside lines both changed, so only the same words changed on both sides clash
// (ticket 09). Used by outside changes folding in (src/outside-merge.ts) and by a shared copy taking a tab that joins
// it from a newer version (src/live-text.ts). No DOM, no I/O.

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

/** What `side` changed of `base` (both as line ids), with `lines` the side's own lines. */
function hunks(base: readonly number[], side: readonly number[], lines: readonly string[]): Hunk[] {
  const out: Hunk[] = [];
  let i = 0, j = 0;
  for (const [bi, si] of [...matchLines(base, side), [base.length, side.length] as [number, number]]) {
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
const splitWords = (text: string) => text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];

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
function mergeParts(baseParts: string[], ourParts: string[], theirParts: string[], deeper?: (base: string, ours: string, theirs: string) => Merged): Merged {
  const [b, o, t] = numbered(baseParts, ourParts, theirParts);
  const tagged = [...hunks(b, o, ourParts).map(hunk => ({ hunk, mine: true })), ...hunks(b, t, theirParts).map(hunk => ({ hunk, mine: false }))]
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

/**
 * The three-way merge: `ours` (the draft) and `theirs` (GitHub's new text), both changed from `base` (the text the
 * draft started from). By line first; lines both sides changed are merged again by word, so only the same words
 * changed on both sides clash (ticket 09: "the same words changed on both sides").
 */
export function mergeText(base: string, ours: string, theirs: string): Merged {
  if (ours === base || ours === theirs) return { text: theirs, mine: theirs, clashed: false };
  if (theirs === base) return { text: ours, mine: ours, clashed: false };
  return mergeParts(splitLines(base), splitLines(ours), splitLines(theirs),
    (b, o, t) => mergeParts(splitWords(b), splitWords(o), splitWords(t)));
}

/** The changes, word by word, that turn `from` into `to`, in `from`'s offsets (in order, none overlapping). */
export function wordChanges(from: string, to: string): TextChange[] {
  if (from === to) return [];
  const fromParts = splitWords(from), toParts = splitWords(to), [f, t] = numbered(fromParts, toParts);
  const offsets = [0];
  for (const part of fromParts) offsets.push(offsets.at(-1)! + part.length);
  return hunks(f, t, toParts).map(hunk => ({ start: offsets[hunk.start], end: offsets[hunk.end], text: hunk.lines.join("") }));
}

/** The changes, character by character, that turn `from` into `to`, in `from`'s offsets; none past the diff's limit
 * (`MAX_LINE_EDITS` differences): one change for the whole span then. */
export function charChanges(from: string, to: string): TextChange[] {
  if (from === to) return [];
  const fromParts = [...from], toParts = [...to], [f, t] = numbered(fromParts, toParts);
  const offsets = [0];
  for (const part of fromParts) offsets.push(offsets.at(-1)! + part.length);
  return hunks(f, t, toParts).map(hunk => ({ start: offsets[hunk.start], end: offsets[hunk.end], text: hunk.lines.join("") }));
}
