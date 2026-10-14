---
title: The Recently removed list; removing a used file warns
type: task (AFK)
status: open
assignee:
blocked_by: [48-recently-removed]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Taking out vs removing".

- A **Recently removed** list in Media (from More): each file with its date and one-click restore, even after saving.
- **Remove file** in details and the selection bar now always allows removal: a still-used file warns with the pages that use it and that their pictures will break, then allows; Lex can open a page to swap the picture first. Replaces slice 14's refusal.

## Done when

- Nightly in `native-media-cleanup.spec.ts`: remove a used file after the warning, publish, restore it from Recently removed; the page shows it again.
