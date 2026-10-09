---
title: "Undo and redo of steps that create files are all or nothing"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude ★
phase: 3
---

## What

Found by slice 27 (see its Done note): redo puts the page edit back at once and re-creates the component's files afterwards; if re-creating them fails (e.g. a file now exists at that path) the instance is back without its files. Make component (slices 10, 64) has the same shape. Make every history step that creates or deletes files alongside a page edit all or nothing on undo and redo, using the history mechanism that already lets a redo wait and refuse: check the files can be written before applying the page edit, and refuse the redo with a reason otherwise. Covers + New component, Make component (incl. card files and copied CSS) and the placeholder image (slice 30).

## Done when

- Unit tests for the refusal; a nightly browser test: create a component, undo, create a conflicting file at the path, redo → refused with a reason and nothing half-applied; plain redo still works.
