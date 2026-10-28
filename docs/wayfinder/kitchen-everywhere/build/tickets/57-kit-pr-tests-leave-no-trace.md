---
title: "The `kit pr` tests always clean up their temp folders (flake after 29)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [29-pr-ci-filters-and-claim-owner, 35-follow-ups-line-endings-and-old-cuts]
---

## Goal

On PR #236 (slice 56, 2026-10-28) the first CI run failed in "Kit tests leave no trace": `tests/kit-pr.test.ts` left two `kit-pr-*` temp folders behind; the rerun passed. Slice 56 does not touch that code; slice 29 (PR #235) had just changed those tests. A flaky trace check makes every slice's `kit pr` fail at random.

## Decided behaviour

- Every `tests/kit-pr.test.ts` case removes its temp folder even when the case fails or times out, and any child process it starts (fake `gh`, `kit wait`, background jobs) has exited before the folder is removed.
- Reproduce first: run `tests/kit-pr.test.ts` repeatedly (and under load) until the leftover shows, name the case, then fix it.

## Files

- `tests/kit-pr.test.ts` (and its shared fixture helpers, if the leak is there)

## Done when

- The leaking case is named in the Done with how it leaked; 20 repeated runs of `tests/kit-pr.test.ts` leave no `kit-pr-*` folder; `npm run test:kit-clean` passes.
- `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
