---
title: "Show the agent working on a section, like a collaborator in Figma"
type: task (AFK)
status: open
assignee: lead-33 (this session)
builder: claude
blocked_by: [27-invisible-multiplayer, 29-simple-mcp-menu]
---

## Goal

Lex (2026-10-23), [request 03](../../../../work/lex-requests/issues/03-agent-working-on-section.md): "If the agent is doing something, if we are on the same page, show that the agent is working on a section." Part of the no-toasts rule: feedback where it happens.

## Decided behaviour

- While an agent changes a section (or a block inside it) on the page Lex is viewing, that section shows a **presence outline**: a thin outline in the agent's colour (the colour of the MCP control's dot) with a small **name chip** on its top-left corner ("Agent", or the agent's name when the connection knows it). It disappears the moment the agent's change lands or stops.
- **Look like collaborator presence in Paper, Figma and similar apps** so it is recognisable: research their pattern first (selection box in the collaborator's colour, name chip attached to the box corner, no extra text) and match it; record the references in Done.
- The section's row in Page Structure shows the same coloured dot while the agent works on it.
- Nothing on other pages (the request pins at the bottom right, the site-menu count and the MCP dot already cover that).
- Never blocks Lex: he can keep editing elsewhere on the page; no click target; no toast, no text beyond the name chip.
- Uses the editor's design tokens (no new raw colours; the check-colours guard applies).

## Files

- `src/components/native-preview-runtime.js` (draw the presence box, like the hover and selection boxes) and its message from the host
- `src/agent-site.ts` / `src/background-page.ts` (from slice 27): emit "agent working on <page, section path>" start and end
- `src/components/page-structure.ts` (+ CSS): the row dot
- `src/theme.css` only for one agent-presence token if none fits
- Tests: unit tests for the start/end events; `tests/native-save/native-agent-presence.spec.ts`

## Done when

- A browser spec: an agent edit on the shown page draws the outline and name chip on that section and its Page Structure row dot, both gone after the change lands; an agent edit on another page draws nothing on the shown page.
- `kit shots` of the presence box in light and dark at 390 and 1280 wide (Lex sees them).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-33 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
