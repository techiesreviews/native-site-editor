---
title: Collection records and starting collections
type: task (AFK)
status: open
assignee: claude (mm-15 runner)
blocked_by: [05-media-records, 08-media-undo-without-page]
builder: sol
phase: 1
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Collections work like tags" and "First open on an existing site".

- Operations, each one Undo step: new collection, add files to a collection, **take out of** a collection (membership only), rename (a taken name is refused, never merged), delete (only the group; files stay under All and other collections).
- **Starting collections** on first open: folders with real names become collections (`images/logos/` → Logos); date folders (`uploads/2023/09/`) and generic storage folders (`images`, `uploads`, `media/images` and the other kind folders) do not; names shown readably. Old tags already became collections in slice 05. No file moves.
- Collections never go to Recently removed.

## Done when

- `tests/media-collections.test.ts`: every operation and its undo; taken name refused; delete keeps files; starting collections from a techies-reviews-like tree (logos, brand, dated uploads, generic folders).
