---
title: "`kit unit` with named files says which setting is wrong, and its untested paths get tests (second looks on 26 and 37)"
type: task (AFK)
status: closed
assignee: ke-51
builder: claude
blocked_by: [27-doctor-commands-on-broken-settings, 37-unit-sh-from-its-own-folder]
---

## Goal

The OpenCode second look on [ticket 26](26-settings-messages-and-tests.md#done-2026-10-27) (evidence `.scratch/reviews/unknown/20261027T200940Z` in the main checkout) found:

1. **Named files hide the settings problem** (P2 fault): `kit unit tests/a.test.ts` does not read `unit.run` itself. When the settings are wrong (no `unit.run`, a missing or broken `scripts/agents/kit.json`, no `jq`), `unit.sh` stops before it writes a log, and `scripts/agents/kit.d/unit:156` throws, so the last line is `RESULT: fail unit unit.sh returned no log path`. Ticket 26 promised these cases end on a `problem:` line naming the cause; the cause only shows on stderr above it. The test at `tests/kit-settings.test.ts:174-176` checks only stderr and status, so it passes.
2. **Untested paths** (gaps, same look and the look on [ticket 37](37-unit-sh-from-its-own-folder.md#done-2026-10-27), evidence `.scratch/reviews/unknown/20261027T203432Z`): doctor's "project folder skipped (jq is not installed)" line never runs in tests (the fixture always sets `KIT_COMMANDS_DIR`); doctor's no-jq `RESULT` regex is not anchored at the end; no test runs a shared command through the front door without jq; no test covers the `--base` rethrow in `kit.d/unit:123` for a git failure other than "ref not found".

## Decided behaviour

- When `unit.sh` exits without a `log:` line, `kit unit` ends with the problem `unit.sh` printed (its last stderr line, without the `unit.sh: ` prefix if present), e.g. `RESULT: fail unit unit.sh needs unit.run in scripts/agents/kit.json`; only when `unit.sh` printed nothing does it keep `unit.sh returned no log path`. Exit status stays 1.

## Files

- `scripts/agents/kit.d/unit`
- `tests/kit-unit.test.ts`, `tests/kit-settings.test.ts`, `tests/kit-doctor.test.ts`

## Done when

- Tests, the first failing before the fix: `kit unit <file>` with no `unit.run`, with a broken `kit.json` and without `jq` each end with a `RESULT: fail unit` line naming that cause.
- From the gaps: doctor without jq, with `KIT_COMMANDS_DIR: ""` and a settings `commands` folder, prints `✓ commands: <n> shared, project folder skipped (jq is not installed)` and that line does not name `scripts/agents/kit.json`; the no-jq doctor test asserts its whole last line (or that `✓ kit home` passed); `kit version` through the front door without jq exits 0 with `RESULT: ok version …` and stderr `jq is not installed; install jq`; with `.git` removed, `kit unit --affected --base HEAD` exits 1 with a `problem:` line, no `Usage:`, and runs no test.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and tests only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke51 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/51-kit-unit-names-settings-problem.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke51 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the last line before and after, review decisions, PR and merge SHA.

## Done (2026-10-28)

- `kit unit` now reads `unit.sh`'s stderr while still showing it. When `unit.sh` prints no `log:` line, `kit unit` ends with `problem:` and `RESULT: fail unit <cause>`, where the cause is the last line `unit.sh` wrote to stderr, minus any `unit.sh: ` prefix. Examples: `RESULT: fail unit unit.sh needs unit.run in scripts/agents/kit.json`, `RESULT: fail unit jq is not installed; install jq`, `RESULT: fail unit scripts/agents/kit.json is unreadable: …`. `unit.sh returned no log path` now shows only when `unit.sh` printed nothing. The exit status is still 1 (`scripts/agents/kit.d/unit`).
- Tests that failed before the fix: `kit unit <file>` without `unit.run` (`tests/kit-settings.test.ts`, and in `tests/kit-unit.test.ts` for named files and for none), with a broken `kit.json`, and without jq. Each checks the `problem:` line and the whole `RESULT` line. For the broken file, the expected text is the line `unit.sh` printed in the same test.
- Gap tests:
  - Doctor without jq, with `KIT_COMMANDS_DIR: ""` and a settings `commands` folder, prints `✓ commands: <n> shared, project folder skipped (jq is not installed)` exactly. `✓ kit home` passes.
  - The no-jq doctor test now checks the whole last line, `RESULT: fail doctor 2 failed: settings,hooks live`. The old unanchored check had hidden that `hooks live` fails too: bash-guard reads its input with jq.
  - `kit version` through the front door without jq exits 0 with `RESULT: ok version …`, and its only stderr is `jq is not installed; install jq`.
  - With `.git` removed, `kit unit --affected --base HEAD` exits 1, prints no `Usage:` and runs no test. `GIT_CEILING_DIRECTORIES` keeps git from finding a repository around the temporary folder. A failing git call in `kit unit` now gives a one-line problem with git's own complaint, `problem: git rev-parse failed: fatal: not a git repository …`. Before, it gave a `Command failed: …` line with the cause on the next line.
  - If `ASE_UNIT_TIMEOUT_MS` is not a positive integer, `unit.sh` exits 2 before writing a log. `kit unit` now refuses a named path that is not a regular file, such as a folder, before `unit.sh` starts: it exits 2 with `problem: not a test file: <path>` and the kit usage. So the only usage exit left from `unit.sh` is the timeout, and `kit unit` treats that as a failure: it exits 1, ends with `RESULT: fail unit ASE_UNIT_TIMEOUT_MS must be a positive integer (ms)`, and prints neither usage text.
  - If `origin/dev` is missing, `kit unit --affected` ends with `RESULT: fail unit git merge-base failed: fatal: …` and shows one `problem:` line.
  - When `unit.sh` is killed and prints nothing (a `unit.run` that runs `kill -9 $PPID`), the result is still `RESULT: fail unit unit.sh returned no log path`, with exit 143.
- Validation: `kit unit tests/a.test.ts` without `unit.run` used to end with `RESULT: fail unit unit.sh returned no log path`. It now ends with `RESULT: fail unit unit.sh needs unit.run in scripts/agents/kit.json`. `scripts/agents/kit unit --affected`: `RESULT: ok unit 92/92 (3 files)`.
- Feature list: no change (agent kit messages only, nothing in the editor).
