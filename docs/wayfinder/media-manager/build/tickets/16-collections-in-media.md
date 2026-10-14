---
title: Collections in Media
type: task (AFK)
status: open
assignee:
blocked_by: [10-one-bar, 15-collection-records]
builder: claude
phase: 1
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) and the selection bar from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11).

- The Collections dropdown narrows the grid; its last item opens **Manage collections** (every collection with Rename and Delete, plus New collection).
- While viewing a collection, More offers Rename collection and Delete collection.
- Selecting files shows a reachable bar: **Add to collection** (with New collection), and inside a collection **Take out of <name>** and **Remove file** as separate actions.
- Details shows and edits a file's collections.

## Done when

- `@smoke` `tests/native-save/native-media-collections.spec.ts`: create a collection, add two files, view it, take one out (the file stays under All), Undo.
- Nightly: rename to a taken name says it is taken; delete a collection keeps its files; starting collections appear on a fixture with named folders.
