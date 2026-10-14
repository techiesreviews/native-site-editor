---
title: Drop to add into the viewed collection
type: task (AFK)
status: in-progress
assignee: claude (mm-17 runner)
blocked_by: [16-collections-in-media]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Adding by drop".

- Dropping files on Media starts adding at once; the grid stays usable. Progress is drawn on the new tiles, with a small tray where failed files stay findable, and Cancel.
- Dropped files join the collection being viewed; under All collections they join none.
- A search that hides the new files offers a way to show them.
- **Add new file** in More opens the file chooser and follows the same path.
- Uses today's Optimise path and defaults until phase 2 replaces it (slice 23); the Optimise sheet's before/after review stays reachable from the tray.

## Done when

- Nightly cases in `native-media-collections.spec.ts`: drop two images while viewing a collection, both join it; cancel one mid-way; drop while searching shows "Show new files".
- No change to what is stored compared with today's Images tab upload.
