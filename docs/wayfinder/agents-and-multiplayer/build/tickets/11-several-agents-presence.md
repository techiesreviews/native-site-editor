---
title: "Several agents: names, colours and presence"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Show every agent working while Lex works, each in its own colour and name ([approved mock-up](../../prototypes/05-agents-at-once.html)). Builds on clean-up slice 33's single-agent presence (`src/agent-presence.ts`).

## Decided behaviour

[Ticket 05, items 1, 3 and 5](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- Every agent tool takes an optional short `name`; the connection prompt tells each subagent to name itself.
- Colours come in order of arrival from existing theme colours (MCP green, components violet, video pink, data teal); orange stays for a question and blue for Lex's selection.
- On the page: an outline and name chip per agent, with the chip orange while that agent asks a question.
- The agent's dot shows on its section's row in Page Structure and on another page's row in Pages and files.
- Reading the site tells each agent who works on what.
- No progress bars, status text or toasts.

## Files

Expected (confirm while designing): `src/agent-presence.ts`, `src/components/native-preview-runtime.js` (several boxes), `src/components/page-structure.ts` (+ CSS), `src/pages-and-files-explorer.ts` (+ CSS), `shared/agent-tool-table.ts` (the `name` argument), `shared/agent-read.ts` (who works on what), `src/agent-prompts.ts`, `src/theme.css` only if a token is missing; tests and a new `tests/native-save/native-several-agents.spec.ts`.

## Done when

- A spec with three named agents on the shown page draws three outlines with chips in three colours; Page Structure rows carry their dots; an agent on another page shows a dot on that page's row.
- An agent's question turns its chip orange.
- `get_site` lists who works on what.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-11 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-11 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
