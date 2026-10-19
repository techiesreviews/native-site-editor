---
title: "kit tests leave no trace in real worktrees"
type: task (AFK)
status: ready-for-agent
assignee:
blocked_by: [04-kit-slice]
builder: sol
---

## What

kit's own tests write into the worktree that runs them. Example: `tests/kit-doctor.test.ts`
(`gateFixture()`; "agent.sh test bypass reaches runner validation …", "agent.sh silently consumes
successful doctor output") and `tests/agent-scripts.test.ts` (line ~229) run
`agent.sh build <real repo> /tmp/kit-doctor-*/missing.md`. `startRun()` in
`scripts/agents/agent-run.mjs` creates `<worktree>/.scratch/agent/build-<time>-<pid>-*/status.json`
before the brief is read, so each run leaves a "failed, exit 2" build-status folder in the real
worktree, where a later `agent.sh --resume` or `kit fix` (ticket 03) could pick it up.

- Every kit test points each run at a temp worktree or `--out` dir and removes its temp dirs
  (`t.after`). Find all offenders by running the guard below, not only the two named files.
- `agent-run.mjs` validates the brief (exists, readable) before creating the out dir, so a run that
  cannot start leaves no status folder anywhere (exit 2 as today).
- **Guard test** `tests/kit-tests-clean.test.ts`: lists the real worktree's `.scratch/agent`,
  runs the kit test files (`tests/kit*.test.ts`, `tests/agent-scripts.test.ts`,
  `tests/agent-resume.test.ts`) in a child `tsx --test`, and asserts no new folder appeared there and
  no `kit-doctor-*` / test temp dirs were left in `os.tmpdir()` by that run. It must not recurse
  into itself.
- **Lead addition (2026-10-19).** Ticket 04's runner saw `kit fix` pick a builder folder that
  unit tests run inside `kit pr` had left in `.scratch/agent`. The guard must cover every test
  file that `kit pr` runs and that calls `agent.sh` or `kit`: at least `tests/kit-fix*.test.ts`,
  `tests/kit-slice*.test.ts`, `tests/agent-resume.test.ts`, `tests/agent-run*.test.ts` and any
  other test that spawns `agent.sh`/`kit`, not only `kit doctor`.
- **One-off cleanup** of existing leftovers, documented in Done, not automated: list folders under
  `.scratch/agent/` of the live worktrees whose `status.json` has `"state": "failed"`, `"exitCode": 2`
  and a `brief` under `/tmp/kit-doctor-*` (or another test temp path); delete only those, and list
  them in Done. Never delete other people's runs. (On 2026-10-19 the ticket writer found no
  `.scratch/agent` folders in the five checkouts present; record what you find.)

## Files

- `tests/kit-doctor.test.ts`
- `tests/agent-scripts.test.ts`
- other kit test files the guard test flags
- `scripts/agents/agent-run.mjs` (brief check before the out dir), `scripts/agents/agent.sh` if needed
- `tests/kit-tests-clean.test.ts` (new; also holds the missing-brief case below)

## Done when

- `tests/kit-tests-clean.test.ts` passes, and fails when one offending case is put back (say how you
  checked in Done).
- A unit test in `tests/kit-tests-clean.test.ts` proves `agent.sh build <worktree> <missing brief>` exits 2 and creates no
  `.scratch/agent` folder.
- The guard test runs every test file that `kit pr` runs and that calls `agent.sh` or `kit`
  (kit-fix, kit-slice, agent-resume, agent-run and the rest), and none of them leaves a folder
  in the real worktree's `.scratch/agent` (lead addition).
- Done lists the leftover folders found and deleted (or "none").
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-tests-clean.test.ts tests/kit-doctor.test.ts tests/agent-scripts.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
