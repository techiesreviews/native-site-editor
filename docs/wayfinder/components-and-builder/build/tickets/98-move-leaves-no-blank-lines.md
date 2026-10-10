---
title: "Moving a block leaves no blank lines in the source"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 78 (see its Done note and its screenshots): when a block is moved (drag, Structure row, Alt+arrows), the source keeps a blank line (or its old indentation) where the block was. The shared move edit (`nativeMoveEdit` in src/page-builder/native-operations.ts) should take the block's own line out cleanly and indent it to its new place, so the code pane reads as if the block had always been there. Keep the move one guarded edit and one undo step.

## Done when

- Unit tests: moving the first, a middle and the last child out of and into containers leaves no blank or whitespace-only lines and indents to the new depth; text-level (inline) moves untouched.
