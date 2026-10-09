import assert from "node:assert/strict";
import test from "node:test";
import { backChain, drillChain } from "../src/page-builder/edit-component-chain.ts";

const section = { tag: "section-work", templatePath: "section.html", node: [0, 2] };
const card = { tag: "card-project", templatePath: "card.html", node: [0, 1, 0, 0] };
const note = { tag: "card-note", templatePath: "note.html", node: [0, 2] };

test("drill keeps the page instance and records each nested template instance", () => {
  const chain = drillChain(drillChain([section], card), note);
  assert.deepEqual(chain, [section, card, note]);
  assert.deepEqual(backChain(chain, 0), [section]);
  assert.deepEqual(backChain(chain, 1), [section, card]);
  assert.deepEqual(chain, [section, card, note]);
});

test("re-drilling a tag returns to its original level, never adds recursion", () => {
  const chain = [section, card, note];
  assert.deepEqual(drillChain(chain, { ...card, node: [9] }), [section, card]);
  assert.deepEqual(drillChain(chain, section), [section]);
  assert.deepEqual(drillChain(chain, note), chain);
  assert.deepEqual(backChain(chain, -1), chain);
  assert.deepEqual(backChain(chain, 10), chain);
});
