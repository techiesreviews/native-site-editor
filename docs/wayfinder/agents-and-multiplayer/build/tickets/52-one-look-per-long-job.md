---
title: "A long wait job holds one wait, and never loses a pin (follow-up on 17)"
type: task (AFK)
status: open
assignee: am-52
builder: claude
blocked_by: [17-long-job-wait]
---

## Goal

Slice 17's final review left a P2 race ([ticket 17 Follow-ups](17-long-job-wait.md#follow-ups)): each `tasks/get` look at a long wait job waits in the relay under the task id (`worker/mcp.ts` about line 1112), and nothing stops two looks of the same job from holding waits at once. The relay's `calls` map uses a random key per dispatch (`worker/agent-relay.ts` about lines 295 and 314) and `dispatch` only counts site-wide waits (about line 285), so one job can hold all of a site's waits (`WAITS_PER_SITE`, three): other agents are told "waiting", and a pin that arrives while two looks are held can be taken by one look and lost to the job. Fix before stage 2.

## Decided behaviour

- A job holds at most one wait in the relay: a new look at the same job replaces the older one (which answers "still working"), and a pin is handed to exactly one look.
- Other agents' waits are never crowded out by one job's looks.
- Also take ticket 17's two P3s and test gaps if small.

## Files

- `worker/mcp.ts`, `worker/agent-relay.ts`, `tests/agent-long-job.test.ts` (and relay tests)

## Done when

- A test: three overlapping looks at one job hold one wait, and a pin sent during them reaches the job once; fails before the fix.
- A test: while a job is looking, another agent's wait still gets its pins.
- `kit unit --affected`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
