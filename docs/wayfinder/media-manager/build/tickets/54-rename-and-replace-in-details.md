---
title: Rename and Replace everywhere in details
type: task (AFK)
status: open
assignee:
blocked_by: [52-rename-everywhere, 53-replace-everywhere, 14-file-details]
builder: claude
phase: 4
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14).

- The name field in details renames; before saving it says a taken name is taken and suggests the numbered one. The "Keep the old address working" tick box shows under it (ticked for Always keep files).
- **Replace everywhere** in a picture's details opens the picker to choose the new picture, says what will happen, and confirms. Ticket 09's Replace for one place stays in the popup.

## Done when

- `@smoke` `tests/native-save/native-media-rename.spec.ts`: rename a used image in details; the page still shows it under the new name; `_redirects` has the line when ticked.
- Nightly: taken name suggestion; Replace everywhere changes the picture on two pages with the version mark.
