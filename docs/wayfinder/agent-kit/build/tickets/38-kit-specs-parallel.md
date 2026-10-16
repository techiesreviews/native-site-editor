---
title: "kit specs runs large selections in parallel across free port slots"
type: task (AFK)
status: open
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
