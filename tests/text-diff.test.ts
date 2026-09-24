import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffCounts, diffHunks, diffLines } from "../src/text-diff.ts";

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
