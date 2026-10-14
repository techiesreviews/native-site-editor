---
title: The To check list
type: task (AFK)
status: open
assignee: claude (mm-19 runner)
blocked_by: [14-file-details]
builder: claude
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Descriptions": Media gets a **To check** list of agent-written descriptions (and, from phase 5, subtitles).

- Each row: the picture or file, its text, **OK** and **Edit**. OK clears the by-agent mark; editing clears it too.
- A small "by agent" mark shows on the file and in details until checked.
- Reached from More with a count ★; empty list says so.

## Done when

- Nightly case in `native-media-screen.spec.ts`, seeding `.editor/media.json` with an agent-written description: the list shows it, OK clears the mark, the mark stays cleared after Publish.
