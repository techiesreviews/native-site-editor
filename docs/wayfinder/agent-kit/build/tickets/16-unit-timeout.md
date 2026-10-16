---
title: "unit.sh: a per-test timeout"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: free
---

## What

- `unit.sh` passes `--test-timeout=${ASE_UNIT_TIMEOUT_MS:-120000}` to every `tsx --test` run (both the selected-files path and the full run, which must call `tsx --test tests/*.test.ts` directly instead of `npm test` so the flag reaches it) so one hung test fails with its name instead of hanging the run.
- The summary names timed-out tests.

## Files

- `scripts/agents/unit.sh`
- `tests/agent-unit-timeout.test.ts`

## Done when

- A test runs `unit.sh` on a temp test file that never settles, with `ASE_UNIT_TIMEOUT_MS=500`, and sees it fail fast, naming the test.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
