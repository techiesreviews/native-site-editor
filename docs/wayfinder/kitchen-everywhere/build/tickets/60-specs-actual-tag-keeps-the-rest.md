---
title: "A spec file with an `@actual` test still runs its other tests (from agents-and-multiplayer 45)"
type: task (AFK)
status: closed
assignee: ke-60
builder: claude
blocked_by: [30-kit-repo-and-move]
---

## Goal

On agents-and-multiplayer slice 45 (PR #259) the builder found that the test runner skips the normal tests in any spec file that also holds an `@actual` test (the selection in `scripts/agents/specs-affected.mjs`), so the other pin tests in that file silently stopped running until the eyebrow test moved to its own file. Ticket 59's follow-ups also list two P2s on resuming a build (a Claude build that dies at launch still records a session; switching the builder after a timeout blocks the resume with a misleading message): take them here too.

## Decided behaviour

- Selecting a spec file runs all its tests; `@actual` only adds the tests that need the real browser setup, it never drops the rest.
- Ticket 59's two P2 follow-ups are fixed as their ticket text says.

## Files

- `scripts/agents/specs-affected.mjs` (or wherever it lives after ticket 30), its tests
- `scripts/agents/kit.d/slice`, `tests/kit-slice.test.ts` (ticket 59's follow-ups)

## Done when

- A test: a spec file with one `@actual` test and two normal ones runs all three when selected; fails before the fix.
- Ticket 59's two P2 cases have tests that fail before the fix.
- `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
- Lead, 2026-10-30: also take this here: the `kit ux` reviewer returned no verdict for one feature three times on agents-and-multiplayer slice 14 (F-canvas-13), stopping the slice each time until a rerun. A missing verdict should be retried once by `kit ux` itself, then reported as "no verdict" without stopping the slice.
- Lead, 2026-10-30: also here: a free OpenCode second look that opened a session but never finished ran for 72+ minutes on agents-and-multiplayer slice 15 (the 300 s silence check only covers a session that never starts). Give the second look an overall time limit (about 25 minutes), after which it ends as "skipped (timed out)" and the slice goes on.

## Done (2026-10-31)

Both halves merged, each through its own repo's `kit pr`, with Claude review (claude-opus-5-5) and CI.

- **Editor half:** [native-site-editor#289](https://github.com/techiesreviews/native-site-editor/pull/289) → `RESULT: ok merged #289 3aaf8f0 (flaky under load: tests/native-save/native-edit-bar.spec.ts)` (merge commit `3aaf8f0d1`; head `d358f40fc`, rebased from `304b60d14`). A spec file with an `@actual` test now keeps its other tests: spec groups come from each parsed test's own tag (`scripts/spec-groups.mjs`), the default run leaves out only the tagged tests, and `scripts/check-specs.mjs` keeps fixture checks out of a mixed file's top level.
  - It could not land earlier: of nine full browser runs on a busy machine, only three passed, each failure in a file the change does not touch. It landed on the kit from ticket 88 (agent-kit `ab13d2b`): the run waited for am-24's full browser run, then 207 spec files were selected; `native-edit-bar.spec.ts` failed in the full run at load 33.86 and passed alone, so it counted as flaky under load (logged in the kit's `flaky.jsonl`); the timing specs `native-edit-latency` and `native-boot-memory` ran last, each alone, and passed.
  - Landed with the lead's waiver after three fix rounds (`P2/P3 after three rounds, follow-ups in ticket 60`). The last review's P1 was this ticket's missing Done (the kit items below, which are in the kit half); this section answers it.
- **Kit half:** [agent-kit#9](https://github.com/techiesreviews/agent-kit/pull/9) → merged `3611045` ("Resume after a launch failure or builder switch, kit ux retries a missing verdict, second look time limit"): ticket 59's two P2 resume cases (a Claude build that dies at launch no longer records a session; a builder switch after a timeout resumes with a clear message), `kit ux` asks once more for a missing verdict and then reports "no verdict" without stopping the slice, and the second look ends as skipped (timed out) after about 25 minutes. `docs/agents/agent-scripts.md` describes that kit behaviour (this close PR).
- **Files beyond the list** (from the last review, P3): `scripts/spec-groups.mjs` (new, the tag parser), `scripts/native-browser-tests.mjs` and `tests/native-browser-launcher.test.ts` (the launcher builds the grep from the groups), `scripts/check-specs.mjs` (the mixed-file check), `CODING_STANDARDS.md`, `docs/agents/agent-scripts.md` and `docs/agents/local-testing.md` (the rule and commands that changed with it). Each follows from the fix.
- **Second look:** skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model gave no session within 300 s).
- **Feature list:** no change (test tooling only, nothing in the editor).
- **Follow-ups** (waived P2s and test gaps from the last review of #289, for a later ticket):
  - P2: the tag parser reads only string-literal `tag` options on a call whose body is an inline function. A tag in a variable, options in a variable, a named body function, or `@actual` in a title put the test in the default group, where the default run's `--grep-invert` then drops it. No spec uses those shapes today. Fix: `check-specs.mjs` refuses them, or the parser falls back to the old text match.
  - P2: the mixed-file check covers only the file's top level: a top-level `test.beforeAll`/`beforeEach` calling `requireActualFixture`, a `test.skip` inside an untagged `describe`, or `if (…) test.skip()` slip past it. Fix: walk untagged describes and top-level hooks, or narrow `CODING_STANDARDS.md`'s wording.
  - Test gap: a Playwright `--list` test that the three-test file lists the two plain tests in the default run and only the tagged one with `--grep @actual`.
  - Test gaps: `fileLevelFixtureChecks` on the two shapes above, and `specTestGroups` on a tag the parser cannot read.

