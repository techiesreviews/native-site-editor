---
title: "kit specs runs large selections in parallel across free port slots"
type: task (AFK)
status: closed
assignee: ak-38
blocked_by: []
builder: sol
---

## What

On 2026-10-16, `kit pr` ran 1,035 affected specs one after another for ticket 27 and ~1,100 for
tickets 18 and 20 — about an hour each (one run hit the 1-hour background limit). `kit specs`
(`scripts/agents/kit.d/specs` + `scripts/agents/specs-affected.mjs`) should split a large
default-group selection into shards and run them in parallel, each shard on its own `port.sh` slot
(like `scripts/agents/full-suite.sh` does with `--shard`), capped by currently free slots and the port
pool's memory/load gate (at least one shard), then merge the results into the same one-line-per-spec
output and RESULT line, using `scripts/agents/suite-summary.mjs`. Small selections (say under 40
specs) stay single-run. Tagged groups (`@actual`, `@native-static`, native-preview) keep their own
runs. `ASE_SPEC_SHARDS` overrides the shard count.

## Files

- `scripts/agents/kit.d/specs`
- `scripts/agents/specs-affected.mjs` (only if selection output must change)
- `tests/kit-specs.test.ts`

## Done when

- Unit tests for shard planning and result merging (fake runner).
- A real `kit specs` run of ~200 specs finishes in under half the serial time on this machine, with
  the same pass/fail summary.
- Sol review on the PR; merged through `kit pr`.

## Done (2026-10-17)

- **Behaviour.** A default-group selection of 40+ spec files splits into shards balanced by estimated
  test count (`test(`/`test.only|skip|fixme|fail(` calls; greedy largest-first, deterministic), each a
  normal run through its own `port.sh` call with its own `--output=<run>/artifacts-<i>` (the config's
  shared `outputDir` is wiped by Playwright at start). Shard count: `ASE_SPEC_SHARDS` (capped only by
  file count), else min(4, free slots, memory cap, load cap), at least 1; free slots are probed through
  `port-common.sh` as `full-suite.sh` does. Shards run in parallel, tagged groups and native-preview
  after them as before. Outcomes merge through `combineOutcomes` into the usual one line per spec and
  RESULT line. Shards run in their own process groups; SIGINT/SIGTERM/SIGHUP are forwarded to every
  group (the old code signalled only the `port.sh` child). Smaller selections keep today's single command.
- **Commits.** 0a573c3a (Sol build; lead fixes: tighter test-count regex, SIGHUP forwarding).
- **Tests.** `tests/kit-specs.test.ts` 22/22: shard planning, shard-count caps, routing, and fake-runner
  runs (12 overlapping shards, per-shard reports, known-failure merge in selection order, a missing
  report failing only its shard, signal forwarding). `npm run check`, `npm run lint` clean.
- **Timing** (72 default files / 222 tests, other runners ak-34, ak-35, ak-40, ak-41 sharing the pool;
  load 15-30 on 16 cores): serial (`ASE_SPEC_SHARDS=1`) 1,159 s; 4 shards 420 s and 395 s (34-36 % of
  serial). Shards 51-60 tests, 5.9-6.7 min each. Auto mode at load 20.9 chose 1 shard (load cap -5), so
  the timing runs forced 4.
- **Pass/fail.** Each run: 71/72 files passed. Serial failed `native-add-panel` (History case);
  both parallel runs failed `native-code-folding` "a cursor placed before the folding ranges load"
  (the head was already folded). Both pass on rerun, the code-folding spec also alone on a cold port and
  with shard 1's exact file prefix in one run: it is a load race in that spec (its own comment names it),
  seen only with 4 forced shards above the load gate. Follow-up for the lead, outside this ticket's files.
- **Review.** Sol (`kit review`, evidence in the main root `.scratch/reviews/ak-38/20261016T222154Z`):
  no defects; one validation gap (differing flakes), answered by the reruns above.
