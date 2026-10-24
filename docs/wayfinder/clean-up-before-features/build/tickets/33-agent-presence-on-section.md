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

- **Which section**: the section moved or removed; the section holding the element changed (make component, place, frame or loop media); the place a section is added to; the deepest section holding all the text an `edit_file`/`write_file` rewrites. An element outside any section shows on that element. Page details, file moves, text across two sections or outside them, the page's top level, and any file not a page of the site (a component's template: its change is every instance's, so no one instance is outlined; a stylesheet) show nothing (`agentPresenceTarget`, read with `readSource` as the preview counts the page).
- **Where**: only on the page shown, in the workspace the change began in. A change for another page draws nothing on the page shown; a pinned Media change running away from its page draws nothing; another branch or site opened while a change runs clears it from the preview and Page Structure (a same-named page there shows nothing). Today an agent's page edit opens its page (existing behaviour), so its outline shows there once that page is on show, never on the page that was shown before.
- **Colour**: one new token, `--agent-presence` (`src/theme.css`), the connected MCP dot's `--color-success`; the frame receives it resolved with the editor's other overlay colours (`src/theme.ts`, the `theme` message) and draws no presence until it has it: no raw colour of its own.
- **Name**: always "Agent": the browser does not learn the agent's name today (the Worker knows the MCP client's name): follow-up [35-agent-name-on-presence](35-agent-name-on-presence.md).
- **When it goes**: when the editor has applied the change. On the draft-and-receipt path the receipt and drafts are kept just after that, so the outline can go a moment before the change is stored.
- **Overlapping changes**: each keeps its own entry; the latest one still running shows, an earlier one again once the later ends.
- **Pattern** (Figma and Paper collaborator presence: the collaborator's selection outline in their colour, a filled name label in the same colour attached to the box's top-left corner, no other text). Recorded from the products' known behaviour.
- **Open item for Lex**: the ticket asked for researched references. Web search and fetch were not permitted in the build sessions, so no links are recorded; Figma's help article on multiplayer editing and Paper's docs on collaborators are the ones to check against the shots.

How it is built: `applySiteCommand` (`src/agent-site.ts`) starts the presence once a command is admitted (after the workflow and media-record refusals) and ends it in `finally`; the `presence` port (`createAgentPresence`, `src/agent-presence.ts`, wired in `src/main.ts`) finds the target in the page's text now, holds it to the workspace load it began in and paints both views (`nativePreview.agentPresence`, `pageStructure.agentPresence`), and draws again at each load (`nextLoad`); the runtime draws the box and chip like the hover and selection boxes (`agent-presence` host message, redrawn on scroll, resize and renders, sent again to a fresh frame document). `agentStructuralActions` passes the port through unchecked, `pinnedMediaActions` silences it while its change runs away from its page.

Tests: `tests/agent-presence.test.ts` (the target for every command kind; start before the write and end after it lands, is refused or is stale; a failing presence port never stops the change; painted and cleared once, cleared by another workspace's load, overlapping changes; a pinned Media change's presence only on its own page shown); `tests/preview-wire.test.ts` (the new host message); `tests/native-save/native-agent-presence.spec.ts` (a real MCP `edit_file` on the page shown draws the outline exactly round the hero section with the "Agent" chip on its corner in the agent's colour, not clickable, and the hero row's dot and busy mark, all gone after it lands; an edit of About's second section draws nothing on Home's matching section or row, read from the same frame document; a change held while it runs, with `page.route`, keeps its presence on a fresh frame document and loses it from the tree and frame when another branch opens; a held change for About's prose draws nothing on Home, then, once Lex opens About, stands exactly round About's prose section with its row busy, gone after it lands; at the very top of the page the chip stands inside the outline's corner).

Shots (`kit shots --spec .scratch/agent-presence-shots.spec.ts`, real starter, the feature section, light and dark at 390 and 1280): `.scratch/presence-shots/agent-presence-{390,1280}-{light,dark}.png`. A change lands too fast to photograph, so the shot sends the editor's own `agent-presence` message to the frame and keeps the row's class set by hand; the frame and the row's CSS draw it with the shipped code.

Bundle: `kit size` `RESULT: ok size boot 350 KB (±0 KB) vs dev@64addf7, budget 355 KB`. The new names (the `presence` port, the `agent-presence` host message and `theme.presence`, the two `agentPresence` view methods, `createAgentPresence`) add nothing measurable to boot; `agentPresenceTarget` sits in the lazily loaded agent chunk.

Commits: df8d4173 (the slice), 53fbe64a and 32e6b685 (review rounds 1 and 2), and this round.

Review decisions:
- Round 1, fixed: Page Structure kept the dot on a same-named page of another workspace after a switch (the presence moved to `src/agent-presence.ts`, cleared at each load); overlapping changes keep their own entries; the "nothing on Home" record now proves it read Home's own frame document; tests for pinned Media presence, the workspace switch and a fresh frame document. Follow-up ticket 35 filed for the agent's name.
- Round 2, fixed: no raw fallback colour in the runtime; About's presence is proven drawn on its own section (held change); unit cells for `loop_video` and a section place inside a section; the chip inside the outline at the page's top; the bundle delta above.
- Round 3, decided and pinned: an agent rewriting a component's template shows nothing (`createAgentPresence` takes only the site's pages; `tests/agent-presence.test.ts`).
- Rounds 1 to 3, not done: the researched references (above, open item for Lex): web search and fetch were refused in every build session. Lex either waives them or a session with web access records the links.

