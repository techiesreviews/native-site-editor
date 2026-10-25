---
title: "Claude Code waits as a long job"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-agent-tools-see-and-say]
---

## Goal

Agents Lex runs himself drop less while listening ([research 02](../../tickets/02-research-what-an-mcp-can-do.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 06, item 4](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- Where the client supports the MCP tasks extension (Claude Code on 2026-07-28 connections), `wait_for_requests` returns a job ticket whose result arrives when a pin comes.
- Every other client keeps today's 25-second wait.
- The relay keeps only the wait, never the pin's content.

## Files

Expected (confirm while designing): `worker/mcp.ts`, `worker/agent-relay.ts`, `shared/agent-tool-table.ts`, `src/agent-prompts.ts`; MCP tests for both paths.

## Done when

- An MCP test with a tasks-capable client gets the pin as a job result.
- A client without tasks still gets the 25-second wait.
- Durable Object storage holds no pin content (test).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-17 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-17 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
