---
title: "Delete key removes the selected element; no delete icon on Structure rows"
type: task (AFK)
status: closed
assignee:
blocked_by: [79-click-selects-double-click-edits]
builder: sol
phase: 4
---

## What

Lex (2026-10-09):
- **Delete / Backspace on a selected element** (not editing text) removes it, as one undo step, on the canvas and on a focused Structure row; the selection moves to the next sibling, else the previous, else the parent. While editing text, the keys work as text keys (slice 79's editing state).
- Same in Edit component mode on the template's parts (removing a slot's element removes the slot, per decision 6, in the same undo step).
- Not on the page's header/footer components, `<main>`, or parts inside a component on the page (outside Edit component mode).
- **No delete icon on Structure rows** (remove it); the edit bar's remove action stays.

## Done when

- Unit tests for the next-selection rule; nightly spec: select a paragraph, Delete → gone, one undo restores; Delete while editing text deletes a character; Structure row without the icon, Delete on a focused row removes it.

## Done (2026-10-10)

- Delete/Backspace (not typing) runs the edit bar's Remove, which now exists for any element on a page but `<main>`, the page's header/footer and parts inside an instance (`pageRemovable`, `src/page-builder/remove.ts`; a card's own Remove stays, items-slot cards included); in Edit component mode for any template part but the root and a nested instance's insides. Removing a slot's element (its slot's only element) removes the `<slot>` and every page's fill in one operation (`templateRemoval`, reusing `slotChangePages`). One rule picks the next selection for every Remove: next sibling, else previous, else parent (a `<slot>` gives its element). A focused Structure row's Delete runs the same Remove and focuses the next row. There was no delete icon on Structure rows to remove.
- Built by Sol, review fixes by Claude: the slice 81 commit and its review-fix commit.
- Tests: `tests/remove.test.ts` (8); nightly `native-delete-key.spec.ts` (Delete + one undo, Backspace/Delete while typing, Structure row Delete and focus, protected rows/parts, host Backspace selects the parent); @actual cases in `native-edit-component-mode-actual.spec.ts` (slot element removes slot and page fill, one undo; items-slot card from its Structure row); `native-structure`/`native-edit-bar` specs updated for the next-sibling rule and Remove on any element.
