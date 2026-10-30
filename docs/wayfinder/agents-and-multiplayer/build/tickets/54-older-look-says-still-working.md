---
title: "An older look at a long job always says \"still working\" (follow-up on 52)"
type: task (AFK)
status: closed
assignee: am-54
builder: claude
blocked_by: [52-one-look-per-long-job]
---

## Goal

Slice 52 (PR #273) made each long wait job hold one relay wait, a newer look taking it over. Its final review left one race (two P2s, [ticket 52 Follow-ups](52-one-look-per-long-job.md#follow-ups)): when something changed between two looks (the agent's name, or watching switched off), the older look answers "finished" instead of "still working". The newer look keeps running, and a pin it takes reaches an agent that already thinks the job is done; the agent only gets it back by asking again with `all: true`.

## Decided behaviour

- A look that a newer look took over always answers "still working"; only the newest look gives the job's final answer.
- Also take ticket 52's three test gaps if small.

## Files

- `worker/mcp.ts`, `worker/agent-relay.ts`, `tests/agent-long-job.test.ts`, `tests/agent-relay.test.ts`

## Done when

- Tests for "name changed between looks" and "watching switched off between looks": the older look says still working, the pin reaches the newest look once; both fail before the fix.
- `kit unit --affected`, `npm run check`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-30)

- An older look that a newer look took over now always answers "still working" (`working`, 1 s), including when the agent's name changed or watching was switched off between the two looks. Only the newest look gives the job's final answer.
- The relay marks the newest look's answer `tookOver` when it ended a wait the tab already had, and passes the mark on to any later look that takes over from it. That look ends the job with the hint "This look ended an earlier look's wait at this job; requests that wait may have taken come back with all: true.", even when nothing came, so the hint always reaches the agent (`worker/agent-relay.ts`, `worker/mcp.ts`).
- Tests (`tests/agent-long-job.test.ts`): "watching switched off between looks" (reworked) and "name changed between looks" (new). In both, the earlier look says working, the pin sent to the newest look reaches the job once, and only one look completes. Both fail on the code before the fix. A third new test covers a late takeover near the held deadline: the tab never answers, and the job ends with the timeout hint at the MCP level.
- Tests (`tests/agent-relay.test.ts`): `tookOver` on the newest look's outcome, passed on through a same-command takeover and absent when nothing sent was ended. Also a takeover of an unsent wait whose newer look then leaves: it settles cancelled/not-sent, with no cancel frame, no waits left, and no command on the handshake.
- The agent's name can change more than once in a row. A look in the middle of the chain is itself a takeover, but it still answers "still working". It passes its mark on, and only the newest look ends the job with the hint. If a marked look ends while the editor is closed or never got the wait, its answer keeps that reason next to the hint. Tests: a three-look chain in `tests/agent-relay.test.ts`, and a third renamed look in the "changed agent name" test. Both fail on the code before this fix.
- Feature list: no change (agent-facing job answers only; nothing in the editor changes).
- Checks: `kit unit --affected` ok 662/662, `npm run check` ok, `npm run lint` ok, `kit doctor` ok 11/11.
