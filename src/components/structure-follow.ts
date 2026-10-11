// Page Structure keeps per-row state (folded or not, the row marked selected)
// by node path. When the same page renders again with rows added, removed or
// moved above a row (Undo, Redo, an edit in code, Edit component mode ending
// because its instance moved), that path names another element. followRows
// reads where each earlier row's element is in the new tree, so the state
// follows the element and not the index.

type Item = { tag: string; className?: string; text: string; heading: string; slot: string; node: readonly number[]; children: readonly Item[] };

const key = (node: readonly number[]) => node.join(".");
// What an element reads as, its own name and text, then with everything in it (sections alike
// in name but holding other blocks differ), then only its kind (a Div whose cards changed).
const own = (item: Item) => JSON.stringify([item.tag, item.className ?? "", item.slot, item.heading, item.text]);
const deeply = new WeakMap<Item, string>();
const whole = (item: Item): string => {
  let text = deeply.get(item);
  if (text === undefined) deeply.set(item, text = `${own(item)}{${item.children.map(whole).join("")}}`);
  return text;
};
const kind = (item: Item) => JSON.stringify([item.tag, item.className ?? "", item.slot]);
const READS = [whole, own, kind];

// The longest run of equal values in `a` and `b`, as index pairs.
function common(a: string[], b: string[]): [number, number][] {
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const run: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) run.push([i++, j++]);
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return run;
}

// Pairs `before[from..to)` with `after[at..end)`: the longest run alike by the first read, each
// gap between by the next, and a gap left after the last read pairs in order when its counts match.
function pairRange(before: readonly Item[], after: readonly Item[], from: number, to: number, at: number, end: number, level: number, pairs: [number, number][]) {
  if (from === to || at === end) return;
  if (level === READS.length) {
    if (to - from === end - at) while (from < to) pairs.push([from++, at++]);
    return;
  }
  const a = before.slice(from, to).map(READS[level]), b = after.slice(at, end).map(READS[level]);
  let i = 0, j = 0;
  for (const [x, y] of [...common(a, b), [a.length, b.length] as [number, number]]) {
    pairRange(before, after, from + i, from + x, at + j, at + y, level + 1, pairs);
    if (x < a.length) pairs.push([from + x, at + y]);
    i = x + 1; j = y + 1;
  }
}

// Pairs of indexes, `before` to `after`, for one list of siblings (pairRange), then any element
// left that is the same, whole, as exactly one left on the other side (a move).
function pairSiblings(before: readonly Item[], after: readonly Item[]): [number, number][] {
  const pairs: [number, number][] = [];
  pairRange(before, after, 0, before.length, 0, after.length, 0, pairs);
  const a = before.map(whole), b = after.map(whole);
  const usedA = new Set(pairs.map(([x]) => x)), usedB = new Set(pairs.map(([, y]) => y));
  const left = (list: string[], used: Set<number>, text: string) => list.flatMap((value, index) => value === text && !used.has(index) ? [index] : []);
  for (let x = 0; x < a.length; x++) {
    if (usedA.has(x)) continue;
    const there = left(b, usedB, a[x]);
    if (there.length === 1 && left(a, usedA, a[x]).length === 1) { pairs.push([x, there[0]]); usedA.add(x); usedB.add(there[0]); }
  }
  return pairs;
}

/** Where a row key of `before` (or a key below a row) is in `after`; undefined when its element is gone. */
export function followRows(before: readonly Item[], after: readonly Item[]): (id: string) => string | undefined {
  const moved = new Map<string, string>(), rows = new Set<string>();
  const all = (list: readonly Item[]) => list.forEach(item => { rows.add(key(item.node)); all(item.children); });
  all(before);
  const walk = (from: readonly Item[], to: readonly Item[]) => {
    for (const [x, y] of pairSiblings(from, to)) {
      moved.set(key(from[x].node), key(to[y].node));
      walk(from[x].children, to[y].children);
    }
  };
  walk(before, after);
  return (id) => {
    for (let head = id; ; head = head.slice(0, head.lastIndexOf("."))) {
      const to = moved.get(head);
      if (to !== undefined) return to + id.slice(head.length);
      if (rows.has(head) || !head.includes(".")) return undefined;
    }
  };
}
