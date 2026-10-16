---
title: "kit shots --compare: concurrent base setup races on CI"
type: task (AFK)
status: closed
assignee: ak-35
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

## Done (2026-10-17)

**Cause.** `setupLock` broke a stale lock with stat-then-remove. Two waiters that both saw the
same stale lock could each remove it; the second removed the lock the first had just taken, so
both entered `ensureBase` and the second `git worktree add` failed with `already exists`.

**Behaviour.** A lock folder records its holder (`owner`: `pid-uuid`). It is stale only when older
than 10 minutes and without a live holder (no or unreadable owner, or a finished pid); a live
holder is never broken. Breaking runs under a guard named after the stale instance it saw (owner
token, or inode and time for owner-less folders), re-checks that the lock is still that instance
and still stale, then removes it; a dead breaker's guard is recovered the same way, never by age
alone. `release()` frees a lock only while its caller still holds it. `ensureBase` still holds
the lock from the readiness check through `worktree add` and the symlinks, so a waiter re-checks
a finished base and reuses it. `saveCache` shares the same lock.

**Commits.** 0ecd187a (owner-aware lock), 872a731d (instance-named guards after review).

**Tests.** `tests/kit-shots-compare.test.ts`: race test now runs four concurrent `ensureBase`
callers on a stale lock (one creates, three reuse, no lock or guard left); new tests for mutual
exclusion of six waiters over five rounds, live/dead/owner-less/fresh lock rules, release only by
the holder, a late waiter with an outdated view never removing a replacement, and recovery of a
dead breaker's guard while a live breaker's guard survives.

**Evidence (loaded machine: two full unit suites looping beside each run).**
- Original code, stress harness (300 rounds of concurrent `ensureBase` on a stale lock):
  2 callers 299/300, 4 callers 299/300; each failure was `fatal: '<base>' already exists`.
- Final code: single race test 50/50; stress harness 4 callers 300/300; full unit suite 3937/0;
  `npm run check` and `npm run lint` clean.
- Two real `kit shots media-gallery --width 390 --compare dev` runs started together (owners
  ak-35a, ak-35b): both `RESULT: ok` against dev@d465a1f, both shot and published the same base
  cache entries, no lock or guard folders left in `.scratch/shots-base`.

**Review (Sol, gpt-6.1-sol).** Round 1: one P2, fixed in 872a731d (an old `.lock.break` guard was
expired by age, which reopened the race one level up). Round 2: no defects; its validation note
(record 50/50 evidence) is answered by the loop above rather than a 50-round in-suite test, which
the ticket allows and which would slow the unit suite.
