---
title: Settings problems say the right thing, and the untested settings paths get tests
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [15-machine-wide-state, 19-doctor-gate-and-fix-builder, 21-launcher-and-update]
---

## Goal

Claude's PR review of [ticket 11](11-project-settings-file.md#done-2026-10-27) (evidence `.scratch/reviews/build/ke-11-project-settings-file/20261027T073718Z` in the main checkout) and Grok's second look (P2, evidence `.scratch/reviews/review/ke11-second-look/20261027T080225Z`) found settings problems that point the user at the wrong fix or exit as usage errors, plus six settings paths no test covers. Each is small; together they make a settings problem name its real cause and keep the settings readers from breaking unnoticed.

## Decided behaviour

- **A missing setting is a failure, not a usage error (`unit.sh:15`, `:18`):** no `unit.run`, or no `unit.files` for a full run, exits 1, as other settings problems do since ticket 11's round 3.
- **`kit unit --affected` too (P2, Grok, `kit.d/unit:47`):** a missing or broken settings file exits 1 with a `problem:` line naming `scripts/agents/kit.json` and no `Usage:` text, like `kit review` and `unit.sh`; set `status = 1` before `affected()` and keep the usage text for `options()` errors only.
- **Missing `jq` is named (`kit-lib.sh:18`, `:29`):** `kit_settings_problems` checks `command -v jq` first and prints `jq is not installed; install jq`, so doctor no longer says `scripts/agents/kit.json is unreadable` and tells the user to edit a good file. `kit_setting` fails the same way instead of returning an empty value.
- **Doctor names the shared folder (`kit.d/doctor:116`, `:120`):** the `node_modules` lines name `sharedNodeModules` and its path (`shared <path> is missing or dangling; restore it or fix sharedNodeModules`, `node_modules differs from sharedNodeModules (<path>)`), not "the dev worktree".

## Files

- `scripts/agents/unit.sh`, `scripts/agents/kit.d/unit`, `scripts/agents/kit-lib.sh`, `scripts/agents/kit.d/doctor`
- `tests/kit-settings.test.ts`, `tests/kit-unit.test.ts`, `tests/kit-doctor.test.ts`, `tests/kit-status.test.ts`, `tests/kit-feedback.test.ts`
- `docs/agents/agent-scripts.md` (only if an exit code it lists changes)

## Done when

- Tests for the messages and exit codes: `unit.sh` with no `unit.run` and with no `unit.files` asserts `status === 1`; `kit unit --affected` against `{ "project": ` exits 1 with a `problem:` line naming `scripts/agents/kit.json` and no `Usage:` on stderr (extend the case in `tests/kit-settings.test.ts`); a `PATH` without `jq` gives the `jq is not installed` line in `kit doctor`; doctor with a missing and a different shared folder names `sharedNodeModules` and its path.
- Tests for the six gaps the review listed:
  - `worktree.sh` with `sharedNodeModules` set to a symlink links the realpath (`readlinkSync(<wt>/node_modules)`); pointed at a missing path it exits 1 and makes no worktree.
  - `kit status` with a broken file (`'{ "project": '`) exits 1 with a `RESULT: fail` line naming the problem.
  - `kit feedback <map>` with no `maps` prints `no "maps" folder in scripts/agents/kit.json` and its exit code is asserted.
  - `unit.sh` with no file arguments runs the test its `unit.files` glob matches.
  - Doctor with no `sharedNodeModules` and an installed `node_modules` passes with `(not shared: no sharedNodeModules in scripts/agents/kit.json)`.
  - (The seventh gap, `kit pr` refusing a release branch that is not `main`, is in [ticket 25](25-editor-values-left-after-11.md).)
- `scripts/agents/kit unit tests/kit*.test.ts` green; one real `kit doctor` on this editor prints what it printed before.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; touches shared plumbing, so `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke26 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/26-settings-messages-and-tests.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke26 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then `scripts/agents/kit unit tests/kit*.test.ts`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, before-and-after `doctor` lines, review decisions, PR and merge SHA.
