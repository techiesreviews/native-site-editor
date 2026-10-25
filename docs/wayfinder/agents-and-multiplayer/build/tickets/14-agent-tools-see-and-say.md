---
title: "Agent tools: page picture, I'm working here, next steps, shorter instructions"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Agents check their own work and show where they work; replies teach the next step and save tokens ([research 02](../../tickets/02-research-what-an-mcp-can-do.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 06, item 5](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- A picture of the preview at Lex's width or a phone width, as the receiving tab renders it.
- An "I'm working here" tool (page and section) that drives slice 11's presence.
- Every edit reply names the logical next step.
- The server instructions open with "start with `get_site`; pins come from `wait_for_requests`" within Codex's first 512 characters.

## Files

Expected (confirm while designing): `shared/agent-tool-table.ts`, `worker/mcp.ts`, `src/agent-site.ts`, a new `src/agent-picture.ts` (how the tab makes the image is this slice's design question, in `decide`), `src/agent-prompts.ts`, `docs/mcp.md`; tests including an MCP spec for the picture tool.

## Done when

- An MCP spec gets a picture at 390 and at Lex's width.
- The working-here tool draws presence.
- A unit test pins the next-step lines and the first 512 characters of the instructions.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-14 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-14 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
