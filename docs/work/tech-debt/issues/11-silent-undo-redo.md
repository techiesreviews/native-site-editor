---
title: Undo and Redo give no feedback when the history cannot move
status: needs-triage
assignee:
blocked_by: []
---

# Undo and Redo give no feedback when the history cannot move

## What

Found in the release triage (2026-10-08). Since the draft store holds a
history that spans files (`dbee5e2`), this sequence ends in silence:

1. Add a section (several files written as one step).
2. Type in the stylesheet pane.
3. Undo in the page editor: the stylesheet typing is undone (correct).
4. Undo again: nothing changes and no notice shows; Redo afterwards also does
   nothing.

Data stays consistent, nothing is partially reverted. Before `dbee5e2` this
path showed the "touched several files together" refusal notice; that path
still exists (`src/components/source-editor.ts` around 470–480,
`src/draft-store.ts:661`) but no longer fires here.

## Impact

Low: a user cannot tell "nothing left to undo here" from a stuck editor.
`native-static-section-save-host.spec.ts` marks the case as a known gap.

## Decide

Whether Undo/Redo should say why it did nothing (a status line or notice),
and in which cases.
