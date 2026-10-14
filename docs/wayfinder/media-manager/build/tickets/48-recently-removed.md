---
title: Recently removed
type: task (AFK)
status: in-progress
assignee: claude (mm-48 runner)
blocked_by: [47-clean-up-suggestions, 40-trimmed-copies]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "Removing and getting files back" and "Image families".

- Removing a file records it in `.editor/media.json`'s removed list (slice 05) for 30 days.
- **GitHub projects** restore from the repository's history (the blob at the last commit that had it), so the site does not grow and visitors cannot reach removed files. **Local folder projects** keep a copy in the browser for 30 days; clearing browser data loses it.
- A restored file returns to the same address; its records (collections, description, Always keep) come back.
- Families (copies, original, and from phase 5 the still and subtitles) are removed and restored together; Trimmed copies made from it stay while used.
- An old trimmed copy replaced on re-crop (slice 40) now goes here too.
- Before saving, Undo works as for other changes. Entries older than 30 days are dropped.

## Done when

- `tests/recently-removed.test.ts`: record on remove, restore from a blob SHA, local browser copy, family together, 30-day expiry, restore to the same address.
- `tests/media-workspace.test.ts`: remove and restore as batches.
