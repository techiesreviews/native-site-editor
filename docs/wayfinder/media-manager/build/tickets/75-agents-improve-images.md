---
title: Agents run Improve images
type: task (AFK)
status: in-progress
assignee: claude (mm-75 runner)
blocked_by: [74-improve-images-screen, 69-agents-video-audio]
builder: sol
phase: 6
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Improve images".

- Agents may run it per page, per component or all: lighter files for heavy pictures, GIFs to Looping videos, missing copies and markup. It runs in the open tab with no extra Yes/No.
- Outside pictures are left as they are and listed for Lex; switching YouTube or Vimeo players stays with Lex.
- Media chapter: phase 6's rules; starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: a run fixes heavy files and GIFs, skips outside pictures and players, and reports them; the drift test passes.
