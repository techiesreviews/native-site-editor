---
title: Replace everywhere
type: task (AFK)
status: open
assignee: claude (mm-53 runner)
blocked_by: [46-wide-use-scanner, 48-recently-removed]
builder: sol
phase: 4
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Replace everywhere".

- The new picture is prepared as at adding and takes over the old file's name and address, with its own responsive copies; the old picture goes to Recently removed.
- Each mention gets a quiet "new version" mark on its address so browsers fetch the new picture at once: `?v=` plus a short hash of the new bytes ★.
- Each place keeps its shape and focus, re-centred; places using a Trimmed copy of the old picture switch to the new picture in the same shape.
- If the type changes (`.jpg` → `.webp`), the base stays, mentions are updated, and Always keep files forward from the old address.

## Done when

- `tests/replace-everywhere.test.ts`: same name and address, version mark on every mention, copies remade, trimmed places switched, type change with forwarding for Always keep.
