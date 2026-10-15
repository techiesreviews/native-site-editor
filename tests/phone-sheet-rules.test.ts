import test from "node:test";
import assert from "node:assert/strict";
import { CANVAS_MIN, FLICK, FOLD_BELOW, SHEET_MIN, dragSize, firstSize, keySheet, readSheet, settleSheet, sheetBounds } from "../src/components/phone-sheet-rules.ts";

// A 390×844 phone: about 580 px shared by the page and the open sheet.
const bounds = sheetBounds(580);

test("the sheet leaves the page its minimum and opens at half the room", () => {
  assert.deepEqual(bounds, { min: SHEET_MIN, max: 580 - CANVAS_MIN });
  assert.equal(firstSize(580), 290);
  // A tiny window: no room for an open sheet at all, never a negative size.
  assert.deepEqual(sheetBounds(100), { min: 0, max: 0 });
});

test("a drag follows the finger, resists past the tallest and stops at folded", () => {
  assert.equal(dragSize(300, bounds), 300);
  assert.equal(dragSize(bounds.max + 100, bounds), bounds.max + 20);
  assert.equal(dragSize(-50, bounds), 0);
});

test("a slow release stays where it was let go, within the bounds", () => {
  assert.deepEqual(settleSheet(250, 0, 290, bounds), { open: true, size: 250 });
  assert.deepEqual(settleSheet(120, 0.1, 290, bounds), { open: true, size: SHEET_MIN });
  assert.deepEqual(settleSheet(bounds.max + 20, 0, 290, bounds), { open: true, size: bounds.max });
});

test("a release low down or a flick down folds and keeps the last open size", () => {
  assert.deepEqual(settleSheet(FOLD_BELOW - 1, 0, 290, bounds), { open: false, size: 290 });
  assert.deepEqual(settleSheet(400, -FLICK, 290, bounds), { open: false, size: 290 });
});

test("a flick up opens to at least the last open size", () => {
  // From folded, a short flick brings back the remembered height.
  assert.deepEqual(settleSheet(30, FLICK, 290, bounds), { open: true, size: 290 });
  assert.deepEqual(settleSheet(380, 1.2, 290, bounds), { open: true, size: 380 });
});

test("keys grow, shrink, fold and fill the sheet", () => {
  const open = { open: true, size: 290 };
  assert.deepEqual(keySheet("ArrowUp", open, bounds), { open: true, size: 330 });
  assert.deepEqual(keySheet("ArrowDown", open, bounds), { open: true, size: 250 });
  assert.deepEqual(keySheet("ArrowDown", { open: true, size: SHEET_MIN }, bounds), { open: false, size: SHEET_MIN });
  assert.deepEqual(keySheet("ArrowUp", { open: false, size: 290 }, bounds), open);
  assert.deepEqual(keySheet("Home", open, bounds), { open: false, size: 290 });
  assert.deepEqual(keySheet("End", { open: false, size: 290 }, bounds), { open: true, size: bounds.max });
  assert.equal(keySheet("Tab", open, bounds), undefined);
});

test("only a whole remembered state is read back", () => {
  assert.deepEqual(readSheet('{"open":true,"size":300}'), { open: true, size: 300 });
  assert.equal(readSheet(null), undefined);
  assert.equal(readSheet("{"), undefined);
  assert.equal(readSheet('{"open":true,"size":0}'), undefined);
  assert.equal(readSheet('{"size":300}'), undefined);
});
