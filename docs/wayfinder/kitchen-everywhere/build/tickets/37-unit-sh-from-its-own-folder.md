---
title: unit.sh works when run from its own folder
type: task (AFK)
status: closed
assignee: ke-37
builder: claude
blocked_by: [26-settings-messages-and-tests]
---

## Goal

The OpenCode second look on [ticket 14](14-settings-for-other-projects.md#done-2026-10-27) (P2, evidence `.scratch/reviews/ke14-second-look/20261027T150235Z` in the main checkout) found that `unit.sh` with no files `cd`s to the project's top folder (`scripts/agents/unit.sh:19`) before it runs `$(dirname "${BASH_SOURCE[0]}")/kit.d/unit`, and does the same for `unit-summary.mjs` (`:35`). Run as `./unit.sh` or `bash unit.sh` from `scripts/agents`, both paths then point at the top folder and the full suite fails; by absolute path (as `kit unit` calls it) it works.

## Decided behaviour

- `unit.sh` takes its own folder as an absolute path once, before any `cd`, and uses it for `kit-lib.sh`, `kit.d/unit` and `unit-summary.mjs`.

## Files

- `scripts/agents/unit.sh`
- `tests/kit-unit.test.ts` (or `tests/agent-unit-timeout.test.ts`)

## Done when

- A test runs `./unit.sh` with no files from `scripts/agents` of a fixture project and gets the same file list and summary as the absolute-path run; it fails before the fix.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke37 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/37-unit-sh-from-its-own-folder.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke37 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, how the new case failed before the fix, review decisions, PR and merge SHA.

## Comments

- Lead, 2026-10-27 (from slice 26's decide line): one rule for `kit unit` usage mistakes. A mistyped option, a mistyped `--base` and a named test file that does not exist all exit 2 (usage error) with a `problem:` line naming the input; a test run that fails stays exit 1. Bring the `--base` case in line here and add its test.

## Done (2026-10-27)

- `scripts/agents/unit.sh` takes its own folder as an absolute path once, before the full suite's `cd` to the project's top folder, and uses it for `kit-lib.sh`, `kit.d/unit` and `unit-summary.mjs`. It clears `CDPATH` for that `cd`, so an exported `CDPATH` cannot make `cd` print the folder into the path. `./unit.sh` and `bash unit.sh` from `scripts/agents` now run the same full suite as the absolute-path run. The printed `log:` path stays relative to the project's top folder.
- `kit unit --affected --base REF` with a REF git cannot find now exits 2 with `problem: base not found: REF` and the usage text, like a mistyped option or a missing named test file (`scripts/agents/kit.d/unit`). A failing test run still exits 1.
- Tests (`tests/kit-unit.test.ts`): a new case copies `unit.sh` and its helpers into a fixture project, then runs it with no files five ways, with no `KIT_ROOT` or `KIT_LIB`: by absolute path from the top folder, as `./unit.sh` and as `bash unit.sh` from `scripts/agents`, as `bash ../scripts/agents/unit.sh` from `tests/`, and as `bash scripts/agents/unit.sh` from the top folder with `CDPATH` exported. All five run the same three files with the same summary. Before the fix the `./unit.sh` run failed with `unit.sh: kit unit --list failed`. The invalid-options case now expects exit 2 and `base not found: missing` for a missing `--base`.
- Validation: `kit unit --affected` RESULT: ok unit 12/12 (1 files); `kit unit tests/agent-unit-timeout.test.ts` RESULT: ok unit 2/2; `npm run check` and `npm run lint` exit 0.
- Feature list: no change (agent tooling only; nothing in the editor changes).

### Follow-ups

- Validation gaps (gap): `scripts/agents/kit.d/unit:123`: no test covers the branch that rethrows when git fails for a reason other than "ref not found", which keeps that case at exit 1 with no usage text. Test to add in `tests/kit-unit.test.ts`: in a fixture, remove `.git` (`rmSync(join(f.root, ".git"), { recursive: true })`), run `f.run("--affected", "--base", "HEAD")`, and assert exit 1, a `^problem: ` line, no `Usage:` on stderr and `f.executed() === 0`. Without this, a later change from `error.status !== 1` to a bare `catch` would quietly turn repo failures into usage errors.

