---
title: The Media tab badge and the Always keep mark
type: task (AFK)
status: open
assignee:
blocked_by: [47-clean-up-suggestions]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "How Lex finds out" and "Always keep".

- A small count badge on the **Media** tab, visible from anywhere, like an unread count. Clean up in More shows the same count.
- It goes away when nothing is left or Lex dismisses it; after dismissing it returns only when new unused files appear.
- A small Always keep mark on the file's tile and in details.
- Phase 6 adds Improve images to the count.

## Done when

- Nightly in `native-media-cleanup.spec.ts`: the badge counts an unused file; dismiss hides it; a new unused file brings it back; an Always keep file is not counted and shows its mark.
