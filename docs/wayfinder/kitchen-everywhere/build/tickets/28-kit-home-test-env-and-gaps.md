---
title: Kit tests ignore a person's KIT_HOME, and KIT_HOME's untested paths get tests
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

Claude's review and Grok's second look on [ticket 13](13-helpers-through-kit-home.md#done-2026-10-27) (P2 in both, evidence `.scratch/reviews/ke-13/20261027T095114Z` and `.scratch/reviews/review/ke13-second-look/20261027T102559Z` in the main checkout) found that the kit tests break exactly when ticket 01 point 3's gate is used: `KIT_HOME=<kit checkout> scripts/agents/kit unit`. The doctor fixture (`tests/kit-doctor.test.ts:69`) spreads `process.env` without dropping `KIT_HOME` or `KIT_HOME_DEFAULT`; the front door unsets `KIT_HOME_DEFAULT` for a person's `KIT_HOME`, so that home reaches doctor, `kit_home` returns the other checkout, and the `✓ kit home: a copy of ${join(repo, "scripts/agents")}` assertion at `:102` fails or checks the wrong kit. `tests/kit.test.ts:169` sets `KIT_HOME` but keeps an inherited `KIT_HOME_DEFAULT`. Both reviews also named three paths of slice 13 no test observes.

## Decided behaviour

- **Kit fixtures start clean of the kit's own names:** every fixture in `tests/kit*.test.ts` that spreads `process.env` into a front door or a `kit.d` command drops `KIT_HOME` and `KIT_HOME_DEFAULT` (as `tests/kit-settings.test.ts:26` does), or sets `KIT_HOME` itself; one shared helper if more than two files need it. The doctor `kit home` assertion expects the real path of the sourced library (`realpathSync`), so a symlinked checkout passes.
- **`kit pr` with an outside home runs that home's `tickets.mjs`:** a docs-tier case in `tests/kit-pr.test.ts` (beside the outside-home case near line 461) touches a ticket file, and asserts the recorded `tickets.mjs` call is `["check"]` from `join(home, "tickets.mjs")` and the PR body shows that absolute path.
- **`kit card` works through a person's `KIT_HOME`:** in `tests/kit.test.ts`, after the copy is built, `context-card.mjs` is in that home and `front("card")` with a memory fixture exits 0 with one `RESULT: ok card` line.
- **Doctor's `kit home` check moves the project's commands folder:** a `tests/kit-doctor.test.ts` case with real settings (`commands: "scripts/agents/project.d"`, no `KIT_COMMANDS_DIR`) and a `project.d/marker`; the copy's fake front door shows no marker under `KIT_HOME` and the commands folder under `KIT_ROOT`, and the line is `✓ kit home`.

## Files

- `tests/kit-doctor.test.ts`, `tests/kit.test.ts`, `tests/kit-pr.test.ts`, and any other `tests/kit*.test.ts` fixture that spreads `process.env`
- no kit file changes; if one looks needed, stop and say so in the PR

## Done when

- `KIT_HOME=<a copy of scripts/agents> scripts/agents/kit unit tests/kit*.test.ts` and the plain `scripts/agents/kit unit tests/kit*.test.ts` are both green.
- The three new cases above fail when their path is broken (each Done line names how it was tried: `tickets.mjs` run from the project, `context-card.mjs` missing from the home, the commands folder left in the copy).
- `grep -n "\.\.\.process\.env" tests/kit*.test.ts` lines each drop or set `KIT_HOME`; the Done lists any left on purpose.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit tests only; `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke28 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/28-kit-home-test-env-and-gaps.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke28 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then both `kit unit tests/kit*.test.ts` runs above.
- Second look: as the README says.
- Report: both unit `RESULT:` lines, how each new case was made to fail, review decisions, PR and merge SHA.
