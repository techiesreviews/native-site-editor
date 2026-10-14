---
title: Agents place with the same markup and may change settings
type: task (AFK)
status: open
assignee: claude (mm-37 runner)
blocked_by: [33-placed-image-markup, 26-adding-settings, 22-media-chapter-and-mcp-docs]
builder: sol
phase: 2
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Placing and framing" and "Settings".

- Agents' placements (slice 21) write exactly slice 33's markup, including copies for older images (slice 35).
- A tool to read and change the site's adding settings, shown and undoable like other agent changes.
- Media chapter: phase 2's rules (folders and names, the markup is the editor's, settings); starter `AGENTS.md`, `fixtures/actual-starter` and the vendored copy refreshed in this slice.

## Done when

- `tests/mcp-runtime.test.ts`: an agent placement equals the editor's markup for the same place; the settings tool changes and reports settings.
- The drift test passes.
