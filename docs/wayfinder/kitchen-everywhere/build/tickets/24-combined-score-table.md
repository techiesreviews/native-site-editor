---
title: One table across projects, and a kit-problem line per project
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [15-machine-wide-state, 22-kit-init]
---

## Goal

Scoreboards and feedback logs stay in each project, and `kit score` can also show one table across all projects, so builders are chosen from every project's numbers; the weekly sweep adds one line per project with a kit problem ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 5).

## Decided behaviour

- **`kit score --all`** reads every project in the machine-wide `projects.json` (ticket 15), each project's records where they already are (its main folder's `.scratch/scoreboard/` and its `build/feedback.md` files), and prints one table: one row per project and builder with pieces, review rounds, findings by kind, Lex's corrections and landings. Nothing is copied or moved. A project that cannot be read gets one line saying why.
- **`kit score --all --html`** makes the same table as a page, like `kit score <map> --html`.
- **The sweep's kit-problem lines:** `kit sweep` adds a section "Kit problems" with one line per registered project whose `kit doctor` fails or whose machine copy is stale (more than a day old, ticket 21); no line when all is well. With every project on the newest kit there is no "versions behind" (ticket 05 point 5).

## Files

- `scripts/agents/kit.d/score`, `scripts/agents/score-page.mjs`
- `scripts/agents/kit.d/sweep`
- `tests/kit-score.test.ts`, `tests/kit-sweep.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/kitchen.md` (station 10, one line)

## Done when

- Tests with two temp projects in a temp `projects.json` prove: one table with both, records untouched, an unreadable project named; the sweep lists a project whose fake `doctor` fails and stays quiet otherwise.
- One real `kit score --all` on this machine (only this editor is registered yet) prints this editor's numbers.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke24 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/24-combined-score-table.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke24 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Report: unit `RESULT:` lines, the real `kit score --all` output, review decisions, PR and merge SHA.
