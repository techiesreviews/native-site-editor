---
title: "Show the agent working on a section, like a collaborator in Figma"
type: task (AFK)
status: closed
assignee: lead-33
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

## Done (2026-10-24)

While an agent's change runs on the page Lex is viewing, the section it works on shows a **presence outline**: a 2 px line in the agent's colour round the section, with a small filled **"Agent"** chip on its top-left corner (just above the line, or inside it at the very top of the page), and nothing else. That section's Page Structure row shows the same coloured dot after its name and is marked busy (`aria-busy`) for screen readers. Both go the moment the change lands or stops (refused, stale, failed). Nothing is a click target, nothing blocks editing elsewhere, no toast, no other text.

- **Which section**: the section moved or removed; the section holding the element changed (make component, place, frame or loop media); the place a section is added to; the deepest section holding all the text an `edit_file`/`write_file` rewrites. An element outside any section shows on that element. Page details, file moves, text across two sections or outside them, and the page's top level show nothing (`agentPresenceTarget`, read with `readSource` as the preview counts the page).
- **Where**: only on the page shown, in the workspace the change began in. A change for another page draws nothing on the page shown; a pinned Media change running away from its page draws nothing. Today an agent's page edit opens its page (existing behaviour), so its outline shows there once that page is on show, never on the page that was shown before.
- **Colour**: one new token, `--agent-presence` (`src/theme.css`), the connected MCP dot's `--color-success`; the frame receives it resolved with the editor's other overlay colours (`src/theme.ts`, the `theme` message).
- **Name**: always "Agent": the browser does not learn the agent's name today (the Worker knows the MCP client's name; passing it on is a follow-up).
- **Pattern** (Figma and Paper collaborator presence: the collaborator's selection outline in their colour, a filled name label in the same colour attached to the box's top-left corner, no other text). Recorded from the products' known behaviour; a web lookup was not available in this session.

How it is built: `applySiteCommand` (`src/agent-site.ts`) starts the presence once a command is admitted (after the workflow and media-record refusals) and ends it in `finally`; the `presence` port in `src/main.ts` finds the target in the page's text now and paints both views (`nativePreview.agentPresence`, `pageStructure.agentPresence`); the runtime draws the box and chip like the hover and selection boxes (`agent-presence` host message, redrawn on scroll, resize and renders, sent again to a fresh frame document). `agentStructuralActions` passes the port through unchecked, `pinnedMediaActions` silences it while its change runs away from its page.

Tests: `tests/agent-presence.test.ts` (the target for every command kind; start before the write and end after it lands, is refused or is stale; a failing presence port never stops the change); `tests/preview-wire.test.ts` (the new host message); `tests/native-save/native-agent-presence.spec.ts` (a real MCP `edit_file` on the page shown draws the outline exactly round the hero section with the "Agent" chip on its corner in the agent's colour, not clickable, and the hero row's dot and busy mark, all gone after it lands; an edit of About's second section draws nothing on Home's matching section or row, only on About's own once it shows).

Shots (`kit shots --spec .scratch/agent-presence-shots.spec.ts`, real starter, the feature section, light and dark at 390 and 1280): `.scratch/presence-shots/agent-presence-{390,1280}-{light,dark}.png`. A change lands too fast to photograph, so the shot sends the editor's own `agent-presence` message to the frame and keeps the row's class set by hand; the frame and the row's CSS draw it with the shipped code.

