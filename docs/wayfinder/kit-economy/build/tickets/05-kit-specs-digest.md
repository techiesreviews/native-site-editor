---
title: "kit specs: a short failure digest instead of results files"
type: task (AFK)
status: closed
assignee: ke-05
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

## Done (2026-10-19)

- Behaviour: added the pure `specsDigest()` report formatter and printed it after spec outcomes only
  on failure. Each failed test gets at most 10 lines: ANSI-free message, expected/received values
  capped at 160 characters, first app/test frame, known-failure label, and log/context/trace paths.
  Output stops after 10 failed tests with a remaining count across runs. Flaky retries and expected
  failures are excluded; successful output and the existing RESULT line remain unchanged.
- Coverage: five small JSON fixtures cover text assertions, timeouts, dependency/internal stack
  frames, retries, known labels, attachments and 12 failures. Fake-runner integration verifies
  failure output ordering, artifact paths and unchanged successful output.
- Tests: `scripts/agents/unit.sh tests/kit-specs.test.ts` passed 33/33
  (`.scratch/unit/20261019T101039-2.log`); agent documentation guards passed 15/15
  (`.scratch/unit/20261019T101140-2.log`). `npm run check`, `npm test` (4,754/4,754;
  `.scratch/ke-05-npm-test.log`) and `npm run lint` passed. No browser specs were affected.
- Kit evidence: `RESULT: ok doctor 7/7 checks passed`;
  `RESULT: ok specs none affected` (both selection and execution).
- Commits: none in this build turn. All changes remain unstaged under the build contract;
  the outer runner owns the commit, Sol review, CI and `kit pr --ticket` landing into `dev`.
- Review decisions: no external review or finding decisions in this build turn. The build contract
  forbids spawning agents; the runner must complete the independent Sol review before landing.
- Dogfood: this builder was launched by `kit slice --ticket` with Sol/high. Its saved brief and state
  under `.scratch/kit-slice/05-kit-specs-digest/` supplied the scope and separated the build from
  runner-owned commit/review/landing. Nested `kit bg` validation jobs died without exit records in
  this execution environment (`RESULT: fail job ke-05-check died without exit status`, and the same
  for `ke-05-test`, `ke-05-lint`, `ke-05-doc-tests`); foreground sessions completed all checks instead.
- Review follow-up: accepted the P2 truncation defect at `3f37d22b:scripts/agents/specs-digest.mjs:25`
  and its validation gap. Expected/received values are now capped before both the message excerpt
  and extracted fields render them. The regression uses 10,000-character values, checks all four
  rendered values and the first three message lines, and rejects the original long strings anywhere
  in the digest. It failed before the fix (32 passed, 1 failed;
  `.scratch/unit/20261019T101856-2.log`) and passed afterward (33/33;
  `.scratch/unit/20261019T102003-2.log`). Follow-up `npm run check`, `npm test` (4,754/4,754;
  `.scratch/ke-05-review-npm-test.log`) and `npm run lint` passed. Kit doctor again reported
  `RESULT: ok doctor 7/7 checks passed`; affected specs reported `RESULT: ok specs none affected`.
  Declined: none. Follow-up changes remain unstaged for the runner's commit and independent re-review.
