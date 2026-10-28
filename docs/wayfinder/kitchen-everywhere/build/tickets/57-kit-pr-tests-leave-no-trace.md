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

- The clean guard in `tests/kit-tests-clean.test.ts` now runs the kit suite as its own process group. At the limit it sends the whole group SIGTERM. It sends SIGKILL 5 s later, or at once if the leader has already exited. Once a scan finds the group empty, it stops looking up that group ID, because the ID may then belong to another process. The process checks read /proc, so they need Linux. It also stops any process whose TMPDIR is the guard's private folder or a folder inside it, such as `kit bg` jobs that start their own session. Only after all of these have exited does it remove the private temp folder, `kit-pr-*` folders included. It waits for the suite's output to close, not just for the process to exit, so the TAP summary is never cut short.
- A cut-off run fails first with `kit suite run was cut off after N s (limit L s)`, followed by the temp paths it is removing, instead of `test temp paths left behind`.
- A run that ends in time but leaves a process behind (in the group or still using the TMPDIR after a 2 s grace) fails with `processes left running: …`; those processes are then killed so the folder can still go. A process that outlives even SIGKILL fails the guard with `processes still running after SIGKILL: …`.
- `ASE_KIT_CLEAN_LIMIT_MS` overrides the 480 s limit and is only meant for tests. The guard's test time-out follows the limit (limit + 60 s).
- New test `a guard run cut off at its limit names the time-out and leaves no temp folder`: runs the guard with an 8 s limit under its own private temp folder. It checks that the run fails with the time-out named, that no `test temp paths left behind` line appears, that the folder is empty apart from tsx's empty runtime folder, that the outer run found no process from the cut-off suite still running, and that no new folder appeared in `.scratch/agent`.
- Six `runGroup` tests use small `node -e` stand-ins for the suite:
  - A detached `sleep 60` with a nested TMPDIR is reported and killed.
  - On a cut-off run, that same process is killed without being reported; the test checks that it had started.
  - On a cut-off run, a detached process that keeps rewriting `kit-pr-cutoff/file` has stopped by the time the run returns: the file stays unchanged for 500 ms, and once the temp folder is removed, it and the `kit-pr-*` folder stay gone.
  - A cut-off suite that ignores SIGTERM ends by SIGKILL within 8 s, and nothing survives it.
  - A leftover group member with another TMPDIR is reported in under 8 s.
  - 256 KiB of output plus a final marker line arrives in full.
- Checks: `npm run test:kit-clean` passed 15/15 (the guard ran 1532 tests from 41 files). `npm run check` and `npm run lint` passed.
  - `kit unit --affected`: `RESULT: ok unit 15/15 (1 files)`
  - `kit doctor`: `RESULT: ok doctor 11/11 checks passed`
  - `kit status`: `RESULT: ok status all 778 tickets, 609 closed, 0 open PRs`
- Feature list: no change (test-only guard; nothing a user sees).
