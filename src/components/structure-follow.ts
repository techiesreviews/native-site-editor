// Page Structure keeps per-row state (folded or not, the row marked selected)
// by node path. When the same page renders again with rows added, removed or
// moved above a row (Undo, Redo, an edit in code, Edit component mode ending
// because its instance moved), that path names another element. followRows
// reads where each earlier row's element is in the new tree, so the state
// follows the element and not the index.

type Item = { tag: string; className?: string; text: string; heading: string; slot: string; node: readonly number[]; children: readonly Item[] };

const key = (node: readonly number[]) => node.join(".");
const sameAs = (item: Item) => JSON.stringify([item.tag, item.className ?? "", item.slot, item.heading, item.text]);

// Pairs of indexes, `before` to `after`, for one list of siblings: the longest run of elements
// that read the same, then, between two of those, equal counts in order (an edited element),
// then any element left that reads the same as exactly one left on the other side (a move).
function pairSiblings(before: readonly Item[], after: readonly Item[]): [number, number][] {
  const a = before.map(sameAs), b = after.map(sameAs);
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const common: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) common.push([i++, j++]);
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  for (const [ci, cj] of [...common, [a.length, b.length] as [number, number]]) {
    if (ci - i === cj - j) while (i < ci) pairs.push([i++, j++]);
    i = ci; j = cj;
    if (ci < a.length) pairs.push([i++, j++]);
  }
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
