---
title: "Moving a block leaves no blank lines in the source"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 78 (see its Done note and its screenshots): when a block is moved (drag, Structure row, Alt+arrows), the source keeps a blank line (or its old indentation) where the block was. The shared move edit (`nativeMoveEdit` in src/page-builder/native-operations.ts) should take the block's own line out cleanly and indent it to its new place, so the code pane reads as if the block had always been there. Keep the move one guarded edit and one undo step.

## Done when

- Unit tests: moving the first, a middle and the last child out of and into containers leaves no blank or whitespace-only lines and indents to the new depth; text-level (inline) moves untouched.

## Done (2026-10-10)

- `nativeMoveEdit` takes a block that is alone on its line out with its line (the line break before it through its trailing spaces; the one after it on a file's first line), and a block landing beside itself in another slot is rewritten in place; an empty destination already split over two lines takes the block on its own line. Elements sharing a line with text or other elements, and anything inside a `<pre>`, still lose only their bytes. Still one guarded edit, one undo step; CRLF kept.
- Commits "Moving a block takes its own line out and indents it to its new place (slice 98)" (built by Sol, `pre` guard added), "Move-keys spec: a moved section child leaves no blank line (slice 98)".
- Tests: `tests/native-operations.test.ts` (first/middle/last child out of and into containers at deeper and shallower depths, same-parent reorder, empty inline and multi-line parents, CRLF and tabs, first/last file line, text-level moves unchanged, beside itself into another items slot, protected content, `<pre>`); `native-move-keys.spec.ts` expectation updated.
