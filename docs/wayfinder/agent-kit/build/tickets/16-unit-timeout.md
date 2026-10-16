---
title: "unit.sh: a per-test timeout"
type: task (AFK)
status: closed
assignee: ak-16 (free worker LongCat 2.5 + lead)
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

## Done (2026-10-16)

- **Built by** the free worker (OpenCode `longcat-2.5-preview-free`, first attempt, no correction); the lead moved the change into this branch.
- `unit.sh` passes `--test-timeout=${ASE_UNIT_TIMEOUT_MS:-120000}` to both runs; the full run calls `tsx --test tests/*.test.ts` directly. An invalid value exits 2. A hung test now fails with `test timed out after <ms>` and its name.
- **Tests:** `tests/agent-unit-timeout.test.ts` covers the hung test (selected-file run), invalid values, and the no-argument run's exact `tsx` arguments (fake tsx).
- **Review (GPT-6.1 Sol, read-only):** no defects; two validation gaps (no-argument path, assert the timeout text) fixed by the lead. Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-16/`.
