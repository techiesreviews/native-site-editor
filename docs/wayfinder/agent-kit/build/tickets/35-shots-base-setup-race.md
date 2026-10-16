---
title: "kit shots --compare: concurrent base setup races on CI"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
---

## What

CI on PR #14 (2026-10-16, run 38962979222) failed in `tests/kit-shots-compare.test.ts:226`, "ensureBase
serializes concurrent setup and removes stale locks": the second of two concurrent `ensureBase` calls ran
`git worktree add` and got `fatal: '<main>/.scratch/shots-base/<sha>' already exists`
(`scripts/agents/shots/compare.mjs:147`, called from `:210`). So two runners comparing against the same
ref at once can still collide; the lock does not cover the whole check-then-create step, or a stale-lock
removal lets the second caller in early.

- Make base setup atomic per sha: hold the lock across "exists and valid?" → `worktree add` → mark ready,
  and have a waiter re-check readiness after it gets the lock. Stale-lock removal must not free a lock
  whose holder is alive.
- Prove it: the test passes 50/50 (`--test-concurrency` or a loop of the single test) on a loaded machine.

## Files

- `scripts/agents/shots/compare.mjs`
- `tests/kit-shots-compare.test.ts`

## Done when

- The race test is deterministic; Sol review on the PR; merged into `dev` through `kit pr`.
