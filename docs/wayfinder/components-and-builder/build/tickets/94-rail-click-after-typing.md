---
title: "Clicking a rail block right after typing inserts instead of refusing"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 79 (see its Done note): typing in a text block and then clicking a block in the rail is refused with "The page is still updating" (also before slice 79). The click should finish typing (as Esc does: saved as one undo step) and then insert after that block as usual, once the typing's edit has been applied. Same for dropping a rail block while typing.

## Done when

- Nightly spec: type in a paragraph, click Paragraph in the rail → the typed text is kept and a new paragraph is inserted after it; two undo steps.

## Done (2026-10-10)

- A rail click or rail drop while typing first finishes typing as Escape does (runtime `finish-typing` → `leaveEditing`, answered after its text edit; `nativePreview.finishTyping()`), waits for the text-edit queue (`pageStructureController.textEdits()`), then inserts with the click's proof still holding. The block-insert controller accepts a selection or drop painted from bytes that differ only by text typed inside the selected element (`nativeEditInside`); other changes still refuse "The page is still updating".
- Commit "Rail click or drop right after typing inserts instead of refusing (slice 94)" (Sol built).
- Tests: `tests/block-insert-controller.test.ts` (typed inside accepted, outside refused, click and drop); nightly `native-blocks.spec.ts` (type in the lead, click Paragraph at once: text kept, new paragraph after it, two undo steps; replaces the focus-first spec) and `native-block-drag.spec.ts` (rail drop while typing, two undo steps).
