---
title: "An older look at a long job always says \"still working\" (follow-up on 52)"
type: task (AFK)
status: open
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
