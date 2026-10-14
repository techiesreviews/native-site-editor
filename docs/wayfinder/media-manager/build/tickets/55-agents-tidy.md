---
title: Agents remove, keep, restore, rename and replace
type: task (AFK)
status: open
assignee: claude (mm-55 runner)
blocked_by: [50-clean-up-review, 51-recently-removed-list, 54-rename-and-replace-in-details, 45-agents-frame-and-trim]
builder: sol
phase: 4
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Clean-up" and [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Agents".

- Agents may remove unused files; a still-used file only after it has been swapped out of every mention (refused otherwise, naming the mentions).
- Never remove Always keep files; may add Always keep, never take it off.
- May restore from Recently removed; families go together.
- May rename (same rules) and use Replace everywhere only with a file already in Media.
- Media chapter: phase 4's rules; starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: each allowed action; refusals for a used file, an Always keep file, taking Always keep off, Replace everywhere with an outside file; the drift test passes.
