---
title: "kit specs: a short failure digest instead of results files"
type: task (AFK)
status: ready-for-agent
assignee:
blocked_by: [04-kit-slice]
builder: sol
---

## What

Today `kit specs` (`scripts/agents/kit.d/specs`) prints one `✗ <spec>: <title> — <first error line>`
per failing spec (`summarizeRun()` / `combineOutcomes()` in `scripts/agents/specs-affected.mjs`) and
keeps logs and Playwright JSON under `.scratch/kit-specs/run-*/`. To learn more, agents opened whole
results JSON and `error-context.md` files (up to 300 KB) to find one assertion.

- **Digest** (pure function over Playwright JSON results, own module e.g.
  `scripts/agents/specs-digest.mjs`): for each failing test (not each spec), at most 10 lines:
  1. `<spec file>:<line> <title>` (project name when not the default);
  2. the assertion or error message (ANSI stripped, first 3 lines);
  3. `expected: …` / `received: …` when present (from the error message), each cut to 160 characters;
  4. the first stack frame in app or test code (`src/`, `tests/`, `shared/`, `worker/`, `scripts/`),
     skipping `node_modules`, Playwright internals and `node:` frames;
  5. the path of its log and, when Playwright wrote one, its `error-context.md` or trace attachment
     (path only; never its contents).
  Known-failure labels (`knownFailure()` from `scripts/agents/suite-summary.mjs`) stay. More than
  10 failing tests → the first 10 digests and `… and N more failing tests (<log dir>)`.
- `kit specs` prints the digest after the ✓/✗ lines on failure; the RESULT line is unchanged.
  It never prints whole files.
- Docs: the `kit specs` line in `docs/agents/agent-scripts.md#kit` mentions the digest;
  `docs/agents/runner.md` (Build and tests) says "read the digest; don't open results or
  error-context files".

## Files

- `scripts/agents/kit.d/specs`
- `scripts/agents/specs-digest.mjs` (new; or in `scripts/agents/suite-summary.mjs`)
- `tests/kit-specs.test.ts`
- `tests/fixtures/specs-digest/*.json` (new; small hand-made Playwright reports)
- `docs/agents/agent-scripts.md`
- `docs/agents/runner.md`

## Done when

- The digest is unit-tested with fixture JSON: a `toHaveText` failure with expected/received, a
  timeout without expected/received, a thrown error whose top frames are in `node_modules` and
  Playwright (the first app/test frame is chosen), a retried flaky test (not a failure), a known
  failure label, attachments present and absent, 12 failures (cap and "… and 2 more"), and a check
  that no digest exceeds 10 lines.
- A `kit specs` test with a fake runner (`KIT_SPECS_RUNNER`) prints the digest on failure and nothing
  extra on success.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-specs.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
