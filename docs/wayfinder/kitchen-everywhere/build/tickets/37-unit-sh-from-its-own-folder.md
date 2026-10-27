---
title: unit.sh works when run from its own folder
type: task (AFK)
status: open
assignee:
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
