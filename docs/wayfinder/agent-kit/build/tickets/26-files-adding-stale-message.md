---
title: "Files adding: no \"Added …\" message after a repo or branch switch mid-save"
type: task (AFK)
status: closed
assignee: ak-26
blocked_by: [17-media-kinds]
builder: sol
---

## What

Found by ticket 21's await-race helper. `createFilesAdding` in
`src/page-builder/media-files-adding-runs.ts` does not re-check its proof
(`host.live()` or the captured repo/branch scope) after the save settles, so a
repo or branch switch during the save still shows "Added …" in the new view.

- Capture the proof before the first await and re-check that same proof after
  every await and before every write or message (CODING_STANDARDS "Proofs
  survive awaits").
- Turn the `todo` race test from ticket 21 into a passing test.

## Files

- `src/page-builder/media-files-adding-runs.ts`
- the ticket-21 race test file for Files adding under `tests/` (turn its `todo` on)

## Done when

- The race test passes at every await point; check, unit, lint and the Files browser specs pass.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behaviour.** `createFilesAdding` names one proof before its first await (`host.live()` plus the context's `assertLive()`) and re-checks it after every await (context, settings, each prepare, save) and before every write, paint and message. A switch during preparation still drops the addition with "Nothing was added". A save that finished before a switch now leaves quietly: no "added" rows, no "Added …" in the new view, and no false "Nothing was added". A save that failed after a switch keeps its own reason (Sol's build made it silent; corrected before commit).
- **Commits.** a5c5b56d (build, Sol, with the save-failure correction), 53f966d4 (review fix: test for a save that fails after a switch).
- **Tests.** The ticket-21 race test's `todo` is a passing test; new test for a save rejected after a switch (fails on the silent-drop version). Check, lint, unit (3,733, 0 todo) pass; Files specs `native-files-tab`, `native-upload`, `native-media-adding` run by name (`kit specs --affected` selected none: the module is reached only through main.ts's lazy `import()`): files-tab 4/4, upload 5/5, media-adding 28/28 on rerun (first run: "Keep original saves a full-size JPEG…", Media's own upload, failed once with "Execution context was destroyed" after a reload).
- **Flake (lead scope).** Not a real flake. No recorded run failed the race file: every full-suite log had `fail 0` and listed the race file only as the expected todo under Node's red "✖ failing tests:" heading. The test and `tests/support/await-race.ts` use only promise ordering (no timers, clocks or cross-file state), so load cannot change them; the helper is unchanged. Proof: 10 runs beside a full unit suite before the fix (1 pass + 1 todo each) and after (2 pass, 0 todo each; `.scratch/stress/` in the worktree). In the "after" run the suite's one failure was `tests/kit-wait.test.ts` ("waits for a producer that closes the file and appends again"), which passes alone 24/24: a separate timing flake on real time.
- **Review.** Sol (`.scratch/reviews/ak-26/20261016T130843Z`): no defects; 1 validation gap accepted and fixed (53f966d4). None rejected.
