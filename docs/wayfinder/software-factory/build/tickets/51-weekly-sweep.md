---
title: "The weekly sweep, Mondays 09:00"
type: task (AFK)
status: open
assignee: sf-51 (this session)
builder: claude
blocked_by: [21-kit-records-every-piece, 22-one-feedback-log]
---

## Goal

A weekly sweep that **lists bad patterns only and changes nothing**; the lead brings Lex the **top 3, each with a recommended fix**, and he picks which become tickets; Mondays 09:00 Amsterdam ([sweeps resolution](../../tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22) items 1 and 4). Poteto's "gardening" (research 00, idea 7). Today tech-debt notes are written by hand and only when someone notices.

## Decided behaviour

- **Scripted half, `kit sweep [--since 7d]`**, gathers numbers so the model reads a small bundle: biggest source files and their growth since last week; `src/main.ts` lines; hand-typed values from research 09 (raw px spacing, raw radii, bespoke shadows, hand-timed transitions) and their change; tests that failed then passed during the week's `kit pr` runs (from `.scratch/kit-specs/` and unit logs) and `tests/known-failures.json` entries; review findings by kind for the week (scoreboard records, slice 21); Lex's corrections for the week (feedback logs, slice 22); open tech-debt issues untouched for 30 days. Output `.scratch/sweep/<date>/bundle.md` (under 40 KB) and `RESULT: ok sweep bundle <path>`.
- **Judgment half, a routine prompt** in `docs/agents/routines/sweep.md`: the scheduled session runs `kit sweep`, applies `improve-codebase-architecture` in list-only mode plus guardrail candidates ([guardrails.md](../../../../agents/guardrails.md): a mistake seen twice → hook, lint rule or kit check), writes `docs/work/sweeps/YYYY-MM-DD.md` (the full list, each item with evidence and a recommended fix), commits it through `kit pr` (docs tier), and posts Lex one short message: top 3 in plain words with the recommended fix each, asking which become tickets. It never edits code and never opens tickets itself.
- **Schedule:** one T3 `schedule_task`, Mondays 09:00 Europe/Amsterdam, in the native-site-editor project, with the prompt "Follow docs/agents/routines/sweep.md, then docs/agents/routines/learning.md if this is an even ISO week" (slice 52 adds the second file). Creating the schedule is the lead's step after this slice lands (a T3 tool), and Lex is told when it first runs.
- Kitchen "Weekly routines" loses its planned mark for the sweep.

## Files

- `scripts/agents/kit.d/sweep` (new), `tests/kit-sweep.test.ts` (new)
- `docs/agents/routines/sweep.md` (new)
- `docs/work/sweeps/README.md` (new: what the folder holds)
- `docs/agents/kitchen.md` (Weekly routines), `docs/agents/agent-scripts.md` (new line)

## Done when

- Tests with fixture records, logs and a temp repo prove each number in the bundle and the size limit.
- One real `scripts/agents/kit sweep` run on `dev`: paste the RESULT line and the bundle's headings with sizes.
- `scripts/agents/kit unit --affected` green.
- The lead (not the builder) creates the schedule after landing and notes its id in the Done section.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf51 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/51-weekly-sweep.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf51 --timeout 2h`.
- Report: unit `RESULT:` lines, real sweep RESULT and bundle headings, review decisions, PR and merge SHA; the lead adds the schedule id.
