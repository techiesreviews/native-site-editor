---
title: "The `kit pr` tests always clean up their temp folders (flake after 29)"
type: task (AFK)
status: open
assignee: ke-57
builder: claude
blocked_by: [29-pr-ci-filters-and-claim-owner, 35-follow-ups-line-endings-and-old-cuts]
---

## Goal

On PR #236 (slice 56, 2026-10-28) the first CI run failed in "Kit tests leave no trace": `tests/kit-pr.test.ts` left two `kit-pr-*` temp folders behind; the rerun passed. PRs #239 (slice 22) and #240 (slice 58) then failed the same way, twice each. Found on #239: this is no random leak. `tests/kit-tests-clean.test.ts` runs the whole kit suite under one time limit (230 s; the last green run took 219.7 s), and the failing runs were cut off at that limit mid-run, before the running `kit-pr` cases removed their folders. Slice 22 raised the limit to 480 s (test 500 s), as the lead decided. What stays open: a run cut off at the limit still leaves folders, and the check then reports a leftover instead of the time-out.

## Decided behaviour

- When the clean guard's suite run hits its time limit, the check says so first (the run was cut off after N s) instead of only listing the folders it left.
- A cut-off run still cleans up: the guard's private temp folder and any `kit-pr-*` folder in it are removed after the child suite and its children have exited.

## Files

- `tests/kit-tests-clean.test.ts` (and `tests/kit-pr.test.ts`' shared fixture helpers, if cleanup belongs there)

## Done when

- A guard run with a small limit forced (an env override or a test-only seam) fails with the time-out named, and leaves no folder in the system temp folder.
- `npm run test:kit-clean` passes; `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
