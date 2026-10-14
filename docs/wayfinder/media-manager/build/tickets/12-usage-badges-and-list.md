---
title: Usage badges and the list view
type: task (AFK)
status: open
assignee:
blocked_by: [10-one-bar, 11-usage-records]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Usage" and "Opening and views".

- A numbered badge on each tile counts distinct pages; hover or keyboard focus expands it to **Used on X pages**; tapping opens the usage text and page names.
- A checked file with no uses: **0** expanding to **No uses found**. Other uses and **Not checked yet** are shown apart.
- Usage and selection targets at least 44 px and never overlapping.
- The **list view** (from More) shows name, file size and usage.

## Done when

- `@smoke` `tests/native-save/native-media-screen.spec.ts`: Media opens on All with one tile per family, a used image shows its page count, hovering reads "Used on 1 page", the list view shows its size.
- Nightly: 0 / No uses found, Not checked yet, tap opens page names.
