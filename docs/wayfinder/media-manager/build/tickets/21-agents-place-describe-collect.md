---
title: Agents place, swap, describe and collect
type: task (AFK)
status: open
assignee: claude (mm-21 runner)
blocked_by: [18-media-picker, 20-agents-see-media, 15-collection-records]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Agents". Each change is an ordinary unsaved change the user can undo; no extra Yes/No.

- **Place and swap** a media file already in Media into a place, with exactly the markup the editor writes (the picker's placing code).
- **Describe**: set a file's description or a place's own words, or mark Decorative; agent text carries the by-agent mark.
- **Collections**: create, rename, delete, add to, take out of.
- Never upload, fetch or generate media.

## Done when

- `tests/mcp-runtime.test.ts`: each tool, a refused upload-like call, the by-agent mark set.
- `@smoke` `tests/native-save/native-mcp-media.spec.ts`: with the editor open, a client lists media, places an image on the home page and writes its description; the canvas shows it, To check lists it, Undo removes it.
