---
title: "Claude Code waits as a long job"
type: task (AFK)
status: closed
assignee: am-17
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

## Done (2026-10-30)

- **Behaviour.** A 2026-07-28 client that declares the MCP tasks extension (`io.modelcontextprotocol/tasks`) on its `wait_for_requests` call gets a job ticket at once (`resultType: "task"`, no time limit). Each `tasks/get` look holds one ordinary wait in the editor tab (20 s) and answers `working`, or `completed` with the pin as `wait_for_requests`' own result. With the editor closed, other agents waiting or the editor busy, the job keeps working and asks to look again later (60, 30 or 10 s). `tasks/cancel` fences the job in the relay, so the next look answers `cancelled`; `tasks/update` is acknowledged. An unknown task id is refused (-32602). With waiting paused by the owner, the call answers at once as before. `server/discover` advertises the extension.
- **No pin is stored.** The job keeps no record anywhere: its id carries its start time, `all` and the agent's name. The relay holds only each look's wait, in memory, as for any wait.
- **Every other client** (legacy, or 2026-07-28 without the extension) keeps the 25-second wait, unchanged.
- **Agent text.** The `wait_for_requests` description and the `watch_editor` prompt say a long job needs no watchdog: call it again after each result.
- **Files.** `worker/mcp.ts` (jobs answered in `handleMcp` outside the SDK, whose 2026-07-28 `tools/call` results can only be complete), `tests/agent-long-job.test.ts` (new), `tests/agent-tool-table.test.ts` (tools/list pin, for the new description). There was nothing to change in `worker/agent-relay.ts`, `shared/agent-tool-table.ts` or `src/agent-prompts.ts`: the relay's wait and cancel fence already fit, and the curl connection prompt uses 2025-11-25.
- **Tests.** `tests/agent-long-job.test.ts`: a tasks-capable client gets the pin as the job result, and no Durable Object writes a key or holds the pin's text or id; a cancelled job says cancelled, unknown ids are refused, and invalid arguments get the SDK's own error; a client without tasks gets the 25-second wait.
- **Evidence.** `RESULT: ok unit 603/603 (40 files)` (`kit unit --affected`); `RESULT: ok specs none affected` (`kit specs --affected`); `npm run check` exit 0; `npm run lint` passes.
- **Unconfirmed.** Not yet tried against a real Claude Code session. The 20 s look and 1 s pause are a guess that keeps calls near today's watchdog rate.
- Feature list: no change (agent-side protocol only; the editor shows nothing new).
