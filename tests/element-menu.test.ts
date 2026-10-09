import assert from "node:assert/strict";
import test from "node:test";
import { elementMenuItems, type ElementMenuTarget } from "../src/components/element-menu.ts";

test("element menu providers receive the same target and preserve action order", () => {
  const target: ElementMenuTarget = { path: "index.html", node: [0, 1], tag: "section" };
  const seen: ElementMenuTarget[] = [];
  const make = { label: "Make component", run() {} };
  const slot = { label: "Make slot", run() {} };
  assert.deepEqual(elementMenuItems(target, [
    value => { seen.push(value); return [make]; },
    value => { seen.push(value); return []; },
    value => { seen.push(value); return [slot]; },
  ]), [make, slot]);
  assert.ok(seen.every(value => value === target));
  assert.deepEqual(elementMenuItems(target, []), []);
});
