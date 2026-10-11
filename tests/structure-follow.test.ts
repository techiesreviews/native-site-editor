import assert from "node:assert/strict";
import { test } from "node:test";
import { followRows } from "../src/components/structure-follow";

type Row = { tag: string; text?: string; children?: Row[] };
// Items as the preview reports them: node paths from their place in the tree.
function items(rows: Row[], at: number[] = []): Parameters<typeof followRows>[0] {
  return rows.map((row, index) => ({ tag: row.tag, className: undefined, text: row.text ?? "", heading: "", slot: "", node: [...at, index], children: items(row.children ?? [], [...at, index]) }));
}
const section = (text: string, children: Row[] = [{ tag: "h2", text }, { tag: "p", text: `${text} body` }]) => ({ tag: "section", text, children });
const page = (main: Row[]) => items([{ tag: "main", children: main }]);
const pairs = (map: (key: string) => string | undefined, keys: string[]) => keys.map(key => `${key}>${map(key) ?? "-"}`).join(" ");

test("a row removed above keeps the rows after it on their elements", () => {
  const before = page([{ tag: "p", text: "Before" }, section("Hero"), section("Feature"), section("Last")]);
  const after = page([section("Hero"), section("Feature"), section("Last")]);
  const follow = followRows(before, after);
  assert.equal(pairs(follow, ["0", "0.0", "0.1", "0.2", "0.2.1", "0.3"]), "0>0 0.0>- 0.1>0.0 0.2>0.1 0.2.1>0.1.1 0.3>0.2");
});

test("a row inserted above, and the Redo of a removal, move the rows after it down", () => {
  const before = page([section("Hero"), section("Feature")]);
  const after = page([section("New"), section("Hero"), section("Feature")]);
  assert.equal(pairs(followRows(before, after), ["0.0", "0.1", "0.1.0"]), "0.0>0.1 0.1>0.2 0.1.0>0.2.0");
});

test("an element whose text changed stays on its place; a reorder follows the elements", () => {
  const edited = followRows(page([section("Hero"), section("Feature")]), page([section("Hero!"), section("Feature")]));
  assert.equal(pairs(edited, ["0.0", "0.0.0", "0.1"]), "0.0>0.0 0.0.0>0.0.0 0.1>0.1");
  const moved = followRows(page([section("A"), section("B"), section("C")]), page([section("C"), section("A"), section("B")]));
  assert.equal(pairs(moved, ["0.0", "0.1", "0.2"]), "0.0>0.1 0.1>0.2 0.2>0.0");
});

test("a key below a row (formatting in a line of text) follows its row", () => {
  const follow = followRows(page([{ tag: "p", text: "Gone" }, section("Hero")]), page([section("Hero")]));
  assert.equal(follow("0.1.1.2"), "0.0.1.2");
  assert.equal(follow("0.0.4"), undefined);
});

test("a row replaced by a different element of another count is not followed", () => {
  const follow = followRows(page([section("A"), section("B")]), page([section("X"), section("Y"), section("Z")]));
  assert.equal(pairs(follow, ["0", "0.0", "0.1"]), "0>0 0.0>- 0.1>-");
});
