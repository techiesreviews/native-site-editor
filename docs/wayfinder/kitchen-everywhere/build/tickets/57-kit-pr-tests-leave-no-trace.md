---
title: "The `kit pr` tests always clean up their temp folders (flake after 29)"
type: task (AFK)
status: closed
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

## Done (2026-10-28)

- The clean guard in `tests/kit-tests-clean.test.ts` now runs the kit suite as its own process group. At the limit it stops the whole group (SIGTERM, then SIGKILL after 5 s). It also stops any process still using the guard's private TMPDIR, such as `kit bg` jobs that start their own session. Only after all of these have exited does it remove the private temp folder, `kit-pr-*` folders included.
- A cut-off run fails first with `kit suite run was cut off after N s (limit L s)`, followed by the temp paths it is removing, instead of `test temp paths left behind`.
- `ASE_KIT_CLEAN_LIMIT_MS` overrides the 480 s limit and is only meant for tests. The guard's test time-out follows the limit (limit + 60 s).
- New test `a guard run cut off at its limit names the time-out and leaves no temp folder`: runs the guard with an 8 s limit under its own private temp folder. It checks that the run fails with the time-out named, that no `test temp paths left behind` line appears, that the folder is empty apart from tsx's empty runtime folder, and that no process from the cut-off suite is still running.
- Checks: `npm run test:kit-clean` passed 9/9 (the guard ran 1532 tests from 41 files in 185 s), `kit unit --affected` gave `RESULT: ok unit 9/9`, `npm run check` passed and eslint was clean.
- Feature list: no change (test-only guard; nothing a user sees).
