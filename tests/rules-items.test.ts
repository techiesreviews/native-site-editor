import assert from "node:assert/strict";
import test from "node:test";
import { CARD_ITEM_TAGS, ITEM_TAGS, itemKind, NOT_GRIDS, repeatedRun } from "../src/page-builder/rules/items.ts";

test("an item's kind is its custom element, or its tag and sorted classes for an item tag", () => {
  assert.equal(itemKind("card-project", undefined), "card-project");
  assert.equal(itemKind("li", ""), "li");
  assert.equal(itemKind("div", "card  featured"), "div.card.featured");
  assert.equal(itemKind("div", "featured card"), "div.card.featured");
  assert.equal(itemKind("p", "lead"), undefined);
  assert.equal(itemKind("section", ""), undefined);
  assert.equal(itemKind("section-feature", "", true), undefined);
});

test("a grid is two or more children of one kind, the largest group winning", () => {
  assert.deepEqual(repeatedRun(["card-project", "card-project"]), { kind: "card-project", indexes: [0, 1] });
  assert.deepEqual(repeatedRun([undefined, "li", "li", "li"]), { kind: "li", indexes: [1, 2, 3] });
  assert.deepEqual(repeatedRun(["div.a", "div.b", "div.b", "div.a", "div.a"]), { kind: "div.a", indexes: [0, 3, 4] });
  assert.equal(repeatedRun(["div.a", "div.b", undefined]), undefined);
  assert.equal(repeatedRun([]), undefined);
});

test("card item tags are item tags except list items, which only work in their list", () => {
  for (const tag of ["article", "div", "figure", "a", "blockquote"]) assert.ok(CARD_ITEM_TAGS.has(tag));
  assert.ok(!CARD_ITEM_TAGS.has("li"));
  assert.ok(!CARD_ITEM_TAGS.has("dd"));
  for (const tag of CARD_ITEM_TAGS) assert.ok(ITEM_TAGS.has(tag));
  assert.equal(CARD_ITEM_TAGS.size, ITEM_TAGS.size - 2);
});

test("page containers never count as grids", () => {
  assert.deepEqual([...NOT_GRIDS], ["html", "head", "body", "main"]);
});
