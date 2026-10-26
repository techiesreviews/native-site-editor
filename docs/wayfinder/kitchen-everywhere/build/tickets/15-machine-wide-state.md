---
title: One Grok count for the computer, its weekly use in the sweep
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

Grok reviews are counted once for the whole computer, whatever project asks, and the Monday sweep shows how many were used that week, so Lex can set the cap from real use ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 4). Today each project would keep its own count in its main folder's `.scratch/review-budget.json`.

## Decided behaviour

- **Machine-wide state lives in `~/.local/state/agent-kit/`** (`$XDG_STATE_HOME/agent-kit` when set): the review budget (`review-budget.json`) and the project list (`projects.json`, written by `kit init` in ticket 22; this slice adds this editor by hand in the test and a one-time step). Research 04 names this folder.
- **One count for the computer.** `kit review` reserves and releases its Grok slot in the machine ledger; the existing rules stay (usage-limit refusal gives the slot back). The first run moves this editor's existing `.scratch/review-budget.json` count into the machine ledger, once. The cap stays at 8 a week (`ASE_REVIEW_BUDGET_GROK`) until Lex sets it from real use (README helper decision 5).
- **Scoreboards and feedback logs do not move** (ticket 05 point 5): they stay in each project's main folder and `build/` files.
- **The Monday sweep shows the week's Grok use:** `kit sweep` adds a short section "Grok reviews this week: N of 8, by project" read from the ledger. It runs only in this editor's sweep (README helper decision 12).

## Files

- `scripts/agents/kit-lib.mjs`, `scripts/agents/kit-lib.sh` (the state folder)
- `scripts/agents/kit.d/review`, `scripts/agents/agent-run.mjs` (budget reserve and release)
- `scripts/agents/kit.d/sweep`
- `tests/kit-review.test.ts`, `tests/kit-sweep.test.ts`, `tests/agent-scripts.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/kitchen.md` (the "counts … per week" line under Who cooks)

## Done when

- Tests with `XDG_STATE_HOME` in a temp folder prove: two temp projects share one Grok count; the old per-project file is moved once and not counted twice; the refusal refund still works; the sweep bundle shows the week's count by project.
- `scripts/agents/kit unit --affected` green; one real `kit sweep` run prints the new section.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; no real Grok call in tests.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke15 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/15-machine-wide-state.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke15 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the sweep section as printed, review decisions, PR and merge SHA.
