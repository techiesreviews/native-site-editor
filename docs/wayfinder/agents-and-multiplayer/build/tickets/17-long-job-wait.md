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

- **Behaviour.** A 2026-07-28 client that declares the MCP tasks extension (`io.modelcontextprotocol/tasks`) on its `wait_for_requests` call gets a job ticket at once (`resultType: "task"`, no time limit). Each `tasks/get` look holds one ordinary wait in the editor tab (20 s) and answers `working`, or `completed` with the pin as `wait_for_requests`' own result. With the editor closed, other agents waiting, or a wait the relay never sent (editor busy), the job keeps working and asks to look again later (60, 30 or 10 s). A wait the tab got but whose answer was lost (timeout, lost connection) may have taken pins, so the job ends with today's answer, whose hint says to call again with `all: true`. A job also ends without a pin on a refusal from the tab, a connection that must connect again, or waiting paused by the owner; an answer too large, or a relay request that throws, ends it with the same `all: true` hint. `tasks/cancel` answers `cancelled`, ends a look the tab holds, and the relay refuses the job's looks for a day (in memory, at most 16 jobs per connection, so no connection pushes out another's; a relay wake forgets them). A look whose caller leaves ends only that look. A `notifications/cancelled` with a look's own request id never ends the job: the look waits under its task id, so it runs out its 20 s hold. One connection's `tasks/cancel` never cancels another's job. `tasks/update` is acknowledged. A task id not shaped like this server's jobs is refused (-32602); ids are not tied to a connection, and a look always runs under the caller's own. With waiting paused by the owner, a new call answers at once as before. `server/discover` advertises the extension.
- **No pin is stored.** The job keeps no record anywhere: its id carries its start time, `all` and the agent's name. The relay holds only each look's wait, in memory, as for any wait.
- **Every other client** (legacy, or 2026-07-28 without the extension) keeps the 25-second wait, unchanged.
- **Agent text.** The `wait_for_requests` description and the `watch_editor` prompt say a long job needs no watchdog: its result arrives when a request comes or the wait ends; call it again after each result.
- **Files.** `worker/mcp.ts` (jobs answered in `handleMcp` outside the SDK, whose 2026-07-28 `tools/call` results can only be complete), `worker/agent-relay.ts` (the jobs' long cancel memory), `tests/agent-long-job.test.ts` (new), `tests/agent-relay.test.ts`, `tests/fakes/counted-agent.ts` (its `env`, to switch waiting off), `tests/agent-tool-table.test.ts` (tools/list pin, for the new description). There was nothing to change in `shared/agent-tool-table.ts` or `src/agent-prompts.ts`: the curl connection prompt uses 2025-11-25.
- **Tests.** `tests/agent-long-job.test.ts`: a tasks-capable client gets the pin as the job result, and no Durable Object writes a key or holds the pin's text or id; a cancelled job says cancelled, still so ten minutes later; `tasks/cancel` ends a held look and tells the tab; `tasks/update` answers for a known job; unknown ids are refused, and invalid arguments get the SDK's own error; the job keeps working with the editor closed (60 s), the waits full (30 s) and the editor busy (10 s), and ends with the `all: true` hint on a wait the tab never answered; it ends on a refusal from the tab, a connection that must connect again and paused waiting; a look whose caller leaves leaves the job waiting; a cancel of a look's request id leaves its wait held until its hold ends; another connection's `tasks/cancel` leaves the job waiting; an answer too large and a relay request that throws end the job with the `all: true` hint; with waiting paused a tasks-capable call answers at once with no job; a client without tasks gets the 25-second wait. `tests/agent-relay.test.ts`: a job's cancel lasts a day, 16 per connection, and another connection's cancels never push it out.
- **Evidence.** `RESULT: ok unit 635/635 (41 files)` (`kit unit --affected`); `RESULT: ok specs none affected` (`kit specs --affected`); `npm run check` exit 0; `npm run lint` passes.
- **Unconfirmed.** Not yet tried against a real Claude Code session. The 20 s look (a long poll, which the tasks extension does not expect) and 1 s pause are a guess that keeps calls near today's watchdog rate; Claude Code's own timeout for `tasks/get` should be well above 20 s.
- **Stateless by design.** The job keeps nothing between looks, so `completed` and (after a relay wake) `cancelled` are final only for a client that stops looking, as the tasks extension asks. A repeated `tasks/get` after `completed` waits again; and a look whose answer is lost after the tab took pins (its caller left, or its `completed` answer never arrived) loses them for this job, as a lost `wait_for_requests` answer does today: they come back with `all: true` or on a follow-up. Remembering outcomes in the relay would cost a record per job for a client that misbehaves.
- Feature list: no change (agent-side protocol only; the editor shows nothing new).

### Follow-ups

- Standards (P2): 7e2519b16:worker/mcp.ts:1112 — P2 race: each `tasks/get` look waits in the relay under the task id. Nothing stops two looks of the same job from holding waits at the same time. The relay's `calls` map uses a random key per dispatch (`worker/agent-relay.ts:295,314`), and `dispatch` only counts site-wide waits (`worker/agent-relay.ts:285`). The test at `tests/agent-long-job.test.ts:196-198` shows one job holding all of the site's waits (`WAITS_PER_SITE`, three) through three overlapping looks. This causes two problems: Other agents get "waiting" for as long as those looks are held. If a pin arrives while two looks are held, the first answer takes it and its look answers `completed`. A client that stops polling after the first `completed` (as the tasks extension asks) may drop the other look's `completed` with any pins it took. Those pins are already marked seen, and nothing tells the agent to use `all: true`. This can happen when Claude Code's `tasks/get` timeout or retry is shorter than the 20 s hold (`JOB_HOLD_MS`). The Done section lists that timeout as unconfirmed. Fix: allow one wait per (grantId, cancelKey.requestId) when the key has the `JOB_ID_PREFIX`. In `AgentRelay.dispatch`, finish an earlier pending call with the same job key as `not-sent` before queuing the new one, or refuse the new one with `waiting`. (CODING_STANDARDS "Racing and speculative reads": exactly one path wins; the losing result writes nothing.)
- Standards (P3): 7e2519b16:worker/agent-relay.ts:384 — P3 fault: `cancel` decides that a key is a job just from the `"wait:"` prefix. A client's ordinary JSON-RPC request id is chosen by the client and can be a string starting with `wait:`. A `notifications/cancelled` for that id (`worker/mcp.ts` relayCancel path) is then stored in `cancelledJobs` for a day, not `recentCancels` for 10 s. The same id is then refused for that connection for 24 h, and it takes one of the 16 job slots. Fix: pass an explicit flag, for example `{ job: true }` in the identity header from the `tasks/cancel` branch only. The relay should store a day-long cancel only when that flag is set.
- Standards (P3): 7e2519b16:tests/agent-long-job.test.ts:318 — P3 style: the `SESSIONS` override `{ ...sessions, get: id => ... { fetch: () => Promise.reject(...) } }` is a fake object with no `satisfies` and no declared type. A change to the namespace or stub shape would therefore not fail to compile. Fix: type it, for example `satisfies Pick<DurableObjectNamespace, "get" | "idFromName">`, or use a declared stub type. (CODING_STANDARDS "Test fixtures": type fakes with `satisfies` or a declared type.)
- Validation gaps (gap): Overlapping looks of one job: start a job with `hold: true`, send two `tasks/get` for it, wait for both commands, push one pin, then release. Assert that only one look completes with the pin and the other stays `working`, or answers without taking pins. This would fail today, which confirms the race above.
- Validation gaps (gap): Day-long cancel scope: in `tests/agent-relay.test.ts`, `h.relay.cancel({ requestId: "wait:not-a-job", grantId: "one" })` sent through the `notifications/cancelled` path, then `h.advance(11_000)`. Assert that it is no longer refused. This needs the explicit job flag described above.
- Validation gaps (gap): Agents paused (`agentControls(env).relay` off, `AGENTS_PAUSED`) while a job is open: start a job, switch the relay off, look once. Assert `completed` with `isError` and the `AGENTS_PAUSED` text, and that `commands.length === 0`. No test covers this branch of `dispatch` for a job.
- Validation gaps (gap): `tasks/get` from a 2026-07-28 client that does not declare the tasks extension, using a valid job id. Nothing pins down that it is still answered: `jobMessage` routes `tasks/*` without checking `declaresTasks`. Add an assertion for the intended behaviour, either answered or refused.

