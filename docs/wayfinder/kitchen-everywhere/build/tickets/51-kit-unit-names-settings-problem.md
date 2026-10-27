---
title: "`kit unit` with named files says which setting is wrong, and its untested paths get tests (second looks on 26 and 37)"
type: task (AFK)
status: open
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
