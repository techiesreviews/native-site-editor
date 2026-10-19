---
title: "Slice brief keeps landing out of the builder; clean-guard runs once; CI digest names the failing test"
type: task (AFK)
status: ready-for-agent
blocked_by: [04-kit-slice, 09-kit-tests-leave-no-trace]
builder: sol
---

## What

Three lead decisions, found while dogfooding on 2026-10-19.

### a. The slice builder runs no kit landing commands

Ticket 10's Sol builder ran `kit review`, `kit slice` and `kit pr` itself inside its sandbox
(they failed there) and wrote false "unlanded" Done text.

- The brief that `kit slice` writes for the builder says: do not run `kit review`, `kit fix`,
  `kit slice`, `kit pr`, `kit bg` or `agent.sh`; the slice does those.
- It says to validate with `scripts/agents/kit unit --affected` (and `npm run check` when types
  moved).
- It says the Done section describes only behaviour, tests and commits; the slice records
  landing.
- Test the generated brief (it contains these rules).

### b. The clean-guard runs once, not inside every `npm test`

`tests/kit-tests-clean.test.ts` (ticket 09) reruns ~680 kit tests inside the full `npm test`, so
time-sensitive tests run under double load (kit-bg "stopping group's identity",
`tests/kit-bg.test.ts:170`, failed once that way).

- Move it out of the default unit glob into its own script (e.g. `npm run test:kit-clean`).
- Run that script as a separate step in `.github/workflows/ci.yml`.
- In `kit pr`'s full tier, run it only when the diff touches `scripts/agents/**` or kit tests
  (`tests/kit-*.test.ts`). Prefer putting the rule in `scripts/agents/pr-tier.mjs`; touch
  `kit.d/pr` only if the tier result cannot carry it (runner ke-11 is editing `kit.d/pr` in
  parallel).
- Keep the guard passing.

### c. The CI digest names the failing test

`kit wait ci` prints only the last 20 log lines, so ticket 09's runner had to grep the gh run log
for the failing child test.

- On CI failure, print the failing test lines before the tail: node:test `not ok` / `✖` lines
  with their file and first error line, Playwright `✘` lines; at most ~10 lines.
- Write it as a pure parser with fixture tests.

## Files

- `scripts/agents/kit.d/slice`
- `scripts/agents/kit.d/wait` (or `scripts/agents/ci-summary.mjs`, whichever holds the CI digest)
- `scripts/agents/pr-tier.mjs` (or `scripts/agents/kit.d/pr`, tier rule in b only)
- `package.json` (scripts and test glob)
- `.github/workflows/ci.yml`
- `tests/kit-tests-clean.test.ts`
- `tests/kit-slice.test.ts`
- `tests/kit-wait.test.ts`
- `docs/agents/agent-scripts.md` (the slice and wait lines only)
- this ticket

## Done when

- Tests for a–c pass.
- Full `npm test` no longer includes the clean-guard, and CI runs it as its own step.
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
