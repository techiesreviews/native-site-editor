// Line diff between a file's clean baseline and its draft, so Save to GitHub
// can show what a commit would change before it is made.
export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** 1-based line number in the baseline (`del`, `same`) or the draft (`add`). */
  line: number;
}

const splitLines = (text: string) => (text === "" ? [] : text.split("\n"));

/** Lines of `after` against `before`, in order, as kept, added and deleted lines. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before), b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "same", text: a[i], line: i + 1 });
  const midA = a.slice(start, endA), midB = b.slice(start, endB);
  // Longest common subsequence of the changed middle; a very large middle is
  // shown as a plain replacement to keep this instant.
  if (midA.length * midB.length > 4_000_000) {
    midA.forEach((text, i) => out.push({ kind: "del", text, line: start + i + 1 }));
    midB.forEach((text, i) => out.push({ kind: "add", text, line: start + i + 1 }));
  } else {
    const rows = midA.length + 1, cols = midB.length + 1;
    const lcs = new Uint32Array(rows * cols);
    for (let i = midA.length - 1; i >= 0; i--)
      for (let j = midB.length - 1; j >= 0; j--)
        lcs[i * cols + j] = midA[i] === midB[j] ? lcs[(i + 1) * cols + j + 1] + 1 : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    let i = 0, j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) { out.push({ kind: "same", text: midA[i], line: start + i + 1 }); i++; j++; }
      else if (i < midA.length && (j >= midB.length || lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1])) { out.push({ kind: "del", text: midA[i], line: start + i + 1 }); i++; }
      else { out.push({ kind: "add", text: midB[j], line: start + j + 1 }); j++; }
    }
  }
  for (let i = endA, j = endB; i < a.length; i++, j++) out.push({ kind: "same", text: a[i], line: i + 1 });
  return out;
}

export interface DiffHunk { lines: DiffLine[] }

/** Which lines are changed or within `context` lines of a change. */
function nearChanges(lines: DiffLine[], context: number) {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });
  return keep;
}

/** The changed lines with `context` kept lines around each run, grouped into hunks. */
export function diffHunks(before: string, after: string, context = 1): DiffHunk[] {
  const lines = diffLines(before, after);
  const keep = nearChanges(lines, context);
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  lines.forEach((line, index) => {
    if (!keep[index]) { current = null; return; }
    if (!current) hunks.push((current = { lines: [] }));
    current.lines.push(line);
  });
  return hunks;
}

/** Counts of added and deleted lines. */
export function diffCounts(before: string, after: string) {
  let added = 0, deleted = 0;
  for (const line of diffLines(before, after)) {
    if (line.kind === "add") added++;
    else if (line.kind === "del") deleted++;
  }
  return { added, deleted };
}

/** One side of a side-by-side row: a line of the baseline (left) or the draft (right). */
export interface SideCell {
  kind: "same" | "add" | "del";
  text: string;
  /** 1-based line number on its own side. */
  line: number;
}

/**
 * A row of the side-by-side comparison: a kept line on both sides, a changed
 * row (a removed line on the left and/or an added line on the right, `null`
 * where the other side has more lines), or a run of unchanged lines left out.
 */
export type SideBySideRow =
  | { kind: "same" | "change"; left: SideCell | null; right: SideCell | null }
  | { kind: "gap"; count: number };

/**
 * The baseline (left) against the draft (right), aligned by the LCS line diff:
 * each run of removed and added lines is paired row by row, `context` unchanged
 * lines are kept around it, and the unchanged lines between are one gap row.
 */
export function sideBySideRows(before: string, after: string, context = 3): SideBySideRow[] {
  const lines = diffLines(before, after);
  const keep = nearChanges(lines, context);
  const rows: SideBySideRow[] = [];
  let left = 0, right = 0, skipped = 0;
  const flush = () => { if (skipped) rows.push({ kind: "gap", count: skipped }); skipped = 0; };
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.kind === "same") {
      left++; right++;
      if (!keep[index]) skipped++;
      else {
        flush();
        rows.push({ kind: "same", left: { kind: "same", text: line.text, line: left }, right: { kind: "same", text: line.text, line: right } });
      }
      index++;
      continue;
    }
    flush();
    const removed: SideCell[] = [], added: SideCell[] = [];
    for (; index < lines.length && lines[index].kind !== "same"; index++) {
      const { kind, text } = lines[index];
      if (kind === "del") removed.push({ kind, text, line: ++left });
      else added.push({ kind, text, line: ++right });
    }
    for (let k = 0; k < Math.max(removed.length, added.length); k++)
      rows.push({ kind: "change", left: removed[k] ?? null, right: added[k] ?? null });
  }
  flush();
  return rows;
}
