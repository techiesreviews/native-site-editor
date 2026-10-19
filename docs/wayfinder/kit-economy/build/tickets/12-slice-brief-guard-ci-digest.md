---
title: "Slice brief keeps landing out of the builder; clean-guard runs once; CI digest names the failing test"
type: task (AFK)
status: closed
assignee: ke-12
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

## Done (2026-10-19)

- Behaviour: the slice builder brief forbids nested build and landing commands, requires
  focused unit checks and type checks when types move, and reserves review and landing
  records for the slice. The builder describes behaviour, tests and commits only.
- Behaviour: `npm test` excludes the clean-guard; `npm run test:kit-clean` runs it separately
  in CI. The PR full tier adds that check only for agent scripts or `tests/kit-*.test.ts`.
  The rule lives in `pr-tier.mjs`; `kit.d/pr` adds only its command entry because the existing
  step dispatcher accepts named commands only.
- Behaviour: CI failure digests print up to ten test lines with available source locations
  and first errors before the existing tail. Pure fixtures cover nested TAP, Node spec,
  Playwright, gh prefixes, ANSI/CRLF, duplicate names, empty logs and the limit.
- Commits: changes left unstaged for the runner; the builder made no commits.
- Tests: `RESULT: ok doctor 7/7 checks passed`;
  `RESULT: ok unit 127/127 (5 files) log .scratch/unit/20261019T115847-31.log`.
  The clean-guard passed, running 704 child tests from 23 files without leftovers.
  After the duplicate-name fixture was added:
  `RESULT: ok unit 49/49 (2 files) log .scratch/unit/20261019T120012-21.log`.
  `RESULT: ok specs none affected`; `npm run check`, `npm run lint` and
  `git diff --check` passed. The default glob selects every unit file except the guard;
  the runner owns the tier's full checks.
- Review decisions: no independent review is claimed by the builder. The parent slice
  records its Sol review and landing after committing these changes.
- Dogfood: built by the existing `kit slice --ticket` run, recorded under
  `.scratch/kit-slice/12-slice-brief-guard-ci-digest/` (Sol, high). It supplied the brief and
  preserved phase state. Its old brief copied landing requirements into the builder task;
  the explicit build contract prevented recursive commands here, and generated-brief
  coverage now checks the permanent restriction. `kit unit --affected` selected the five
  relevant unit files; `kit specs --affected` correctly selected none.
