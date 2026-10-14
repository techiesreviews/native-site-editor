---
title: Agents set shape and focus, and trim
type: task (AFK)
status: in progress
assignee: claude (mm-45 runner)
blocked_by: [38-place-shape-and-focus, 40-trimmed-copies, 37-agents-adding]
builder: sol
phase: 3
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Placing and framing".

- Tools to set a place's shape and focus point, and to trim, zoom, turn or flip, which saves a Trimmed copy exactly as the popup does.
- Media chapter: phase 3's rules (shape and focus change only the place; trims make a new file for that place); starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: shape and focus written as the popup writes them; a trim makes a `-crop` file; the drift test passes.
