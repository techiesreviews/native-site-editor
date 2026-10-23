import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSheetWork } from "../src/page-builder/media-sheet-work";

// Ticket 23: the Media pane closing on a switch cancels its work, but an Improve images row under way
// (`finishes`) finishes in its workspace; closing a modal (the picker) cancels both.
test("the pane closing keeps an Improve images row under way and cancels other work; a modal cancels both", () => {
  const row = new AbortController();
  closeSheetWork({ work: row, finishes: row }, false);
  assert.equal(row.signal.aborted, false, "an Improve images row finishes");
  const preparing = new AbortController();
  closeSheetWork({ work: preparing, finishes: new AbortController() }, false);
  assert.equal(preparing.signal.aborted, true, "the Optimise sheet's preparation stops with the pane");
  const other = new AbortController();
  closeSheetWork({ work: other }, false);
  assert.equal(other.signal.aborted, true);
  const modal = new AbortController();
  closeSheetWork({ work: modal, finishes: modal }, true);
  assert.equal(modal.signal.aborted, true, "a modal close cancels a row too");
});
