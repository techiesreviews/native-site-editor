import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffCounts, diffHunks, diffLines, sideBySideRows } from "../src/text-diff.ts";

test("diffLines keeps unchanged lines and marks added and deleted ones", () => {
  const lines = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne");
  assert.deepEqual(lines.map((l) => `${l.kind}:${l.text}:${l.line}`), ["same:a:1", "del:b:2", "add:B:2", "same:c:3", "same:d:4", "add:e:5"]);
  assert.deepEqual(diffLines("x", "x"), [{ kind: "same", text: "x", line: 1 }]);
  assert.deepEqual(diffLines("", "new"), [{ kind: "add", text: "new", line: 1 }]);
});

test("diffHunks groups changes with one line of context", () => {
  const before = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
  const after = before.replace("line 2", "line two").replace("line 9", "line nine");
  const hunks = diffHunks(before, after);
  assert.equal(hunks.length, 2);
  assert.deepEqual(hunks[0].lines.map((l) => l.kind), ["same", "del", "add", "same"]);
  assert.deepEqual(hunks[1].lines.map((l) => l.text), ["line 8", "line 9", "line nine", "line 10"]);
  assert.deepEqual(diffCounts(before, after), { added: 2, deleted: 2 });
});

test("sideBySideRows pairs removed and added lines with numbers on both sides and collapses unchanged runs", () => {
  const before = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
  const after = before.replace("line 2\n", "").replace("line 10", "line ten\nline ten and a half");
  const rows = sideBySideRows(before, after, 1);
  const show = (cell: { kind: string; text: string; line: number } | null) => (cell ? `${cell.line}${cell.kind === "same" ? " " : cell.kind === "add" ? "+" : "-"}${cell.text}` : "");
  assert.deepEqual(
    rows.map((row) => (row.kind === "gap" ? `gap ${row.count}` : `${show(row.left)} | ${show(row.right)}`)),
    [
      "1 line 1 | 1 line 1",
      "2-line 2 | ",
      "3 line 3 | 2 line 3",
      "gap 5",
      "9 line 9 | 8 line 9",
      "10-line 10 | 9+line ten",
      " | 10+line ten and a half",
      "11 line 11 | 11 line 11",
      "gap 1",
    ],
  );
  assert.equal(rows.filter((row) => row.kind === "change").length, 3);
});

test("sideBySideRows shows a new file on the right only and an unchanged file as one gap", () => {
  assert.deepEqual(sideBySideRows("", "a\nb"), [
    { kind: "change", left: null, right: { kind: "add", text: "a", line: 1 } },
    { kind: "change", left: null, right: { kind: "add", text: "b", line: 2 } },
  ]);
  assert.deepEqual(sideBySideRows("a\nb", "a\nb"), [{ kind: "gap", count: 2 }]);
  assert.deepEqual(sideBySideRows("a\nb\nc", "a\nx\nc", 3).map((row) => row.kind), ["same", "change", "same"]);
});
