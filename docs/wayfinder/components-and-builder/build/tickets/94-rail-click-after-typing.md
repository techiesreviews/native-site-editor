---
title: "Clicking a rail block right after typing inserts instead of refusing"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 79 (see its Done note): typing in a text block and then clicking a block in the rail is refused with "The page is still updating" (also before slice 79). The click should finish typing (as Esc does: saved as one undo step) and then insert after that block as usual, once the typing's edit has been applied. Same for dropping a rail block while typing.

## Done when

- Nightly spec: type in a paragraph, click Paragraph in the rail → the typed text is kept and a new paragraph is inserted after it; two undo steps.
