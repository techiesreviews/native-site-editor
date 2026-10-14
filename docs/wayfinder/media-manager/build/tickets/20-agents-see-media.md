---
title: Agents see media (list and preview tools)
type: task (AFK)
status: open
assignee: claude (mm-20 runner)
blocked_by: [11-usage-records, 13-descriptions-and-decorative]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Seeing media". Agents work through the open editor, as every agent edit does today (`worker/mcp.ts`).

- **`list_media`**: every media file with kind, size, Image family, uses, description (by agent or Decorative), collections, Always keep and Not checked yet.
- **`preview_media`**: a small preview of a picture so an agent can describe it; the open tab makes it (for example a 512 px WebP) ★.
- Tool descriptions point to the conventions' Media chapter (slice 22) rather than restating rules.

## Done when

- `tests/mcp-runtime.test.ts`: both tools in the tool list; `list_media` over a small site with a family, a description and an unchecked file; `preview_media` returns an image for a picture and a clear refusal for a PDF.
