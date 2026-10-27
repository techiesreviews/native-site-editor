---
title: One Grok count for the computer, its weekly use in the sweep
type: task (AFK)
status: closed
assignee: ke-15
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

Grok reviews are counted once for the whole computer, whatever project asks, and the Tuesday sweep shows how many were used that week, so Lex can set the cap from real use ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 4). Today each project would keep its own count in its main folder's `.scratch/review-budget.json`.

## Decided behaviour

- **Machine-wide state lives in `~/.local/state/agent-kit/`** (`$XDG_STATE_HOME/agent-kit` when set): the review budget (`review-budget.json`) and the project list (`projects.json`, written by `kit init` in ticket 22; this slice adds this editor by hand in the test and a one-time step). Research 04 names this folder.
- **One count for the computer.** `kit review` reserves and releases its Grok slot in the machine ledger; the existing rules stay (usage-limit refusal gives the slot back). The first run moves this editor's existing `.scratch/review-budget.json` count into the machine ledger, once. The cap stays at 8 a week (`ASE_REVIEW_BUDGET_GROK`) until Lex sets it from real use (README helper decision 5).
- **Scoreboards and feedback logs do not move** (ticket 05 point 5): they stay in each project's main folder and `build/` files.
- **The Tuesday sweep shows the week's Grok use:** `kit sweep` adds a short section "Grok reviews this week: N of 8, by project" read from the ledger. It runs only in this editor's sweep (README helper decision 12).

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

## Done (2026-10-27)

- **One count for the computer.** `kit review` now counts GPT and Grok reviews in `review-budget.json` in the kit's state folder (`$XDG_STATE_HOME/agent-kit` when that is an absolute path, else `~/.local/state/agent-kit`; `kitStateDir` in `kit-lib.mjs`, `kit_state_dir` in `kit-lib.sh`), as `{ week: { family: { project: count } } }`. The limit applies to the sum over projects; the rules are unchanged (Claude not counted, an empty diff or a usage-limit refusal gives the slot back). The ledger keeps this week and last (the sweep runs on Tuesdays) and drops older weeks.
- **The old count moves once.** The first counted review in a project moves its main folder's `.scratch/review-budget.json` into the machine ledger under that project's name and deletes the old file, both under their locks. A refusal at the limit still saves what moved. A broken old file (bad JSON, a week that is not an object, a count that is not a whole number) stops the review, is named and is kept; nothing merges. The ledger's weeks are saved in date order. If an older kit writes the old file again, only those new counts move next time. A Claude review leaves the old file alone.
- **The sweep shows the week's Grok use.** `kit sweep` adds "Grok reviews this week": this ISO week's total against `ASE_REVIEW_BUDGET_GROK`, a line per project (projects in `projects.json` show 0), and last week's total. Until a counted review moves the old file in, the sweep reads it too: once per real folder (symlinks followed), with the machine ledger, under the ledger's lock, so a review moving it in at the same time is counted once; with no state folder yet it locks nothing and creates nothing. A broken old file gets its own `old ledger unreadable` line and the other counts stay. A broken ledger or project list shows one `unreadable` line and the rest of the bundle still comes out. The section is in every `kit sweep`, with no check for the project: only this editor runs a sweep (README helper decision 12), so another project gets these lines only if Lex later asks for a sweep there.
- **Project list.** `projects.json` in the state folder is `{ "<project>": { "root": "<main folder>" } }` (`kitProjects` reads it; `kit init` will write it in ticket 22). The one-time step added this editor by hand: `~/.local/state/agent-kit/projects.json` lists `native-site-editor` at `/home/ubulex/Projects/native-site-editor`. The old `.scratch/review-budget.json` (5 Grok reviews in 2026-W44) was left in place, so older checkouts keep counting against it until this lands; the first Grok review after that moves it in.
- **Tests** (temp `XDG_STATE_HOME`): `tests/agent-scripts.test.ts`: two projects share one count, the old file moves once and is not counted twice, a held lock on the old file moves nothing, an old-shape count is named, a broken old file (bad JSON, wrong-shaped week or count) is named and kept with the ledger untouched, and the state folder agrees in Node and bash. `tests/kit-review.test.ts`: two temp projects share one Grok count end to end, a usage-limit refusal gives the shared slot back, the first counted review moves the old count once, a refusal right after the move keeps the moved count, and every existing budget test now reads the machine ledger. `tests/kit-sweep.test.ts`: the section with no ledger, with two projects plus a listed one at 0, with unmoved old files counted once, with a listed root that is this repository through a symlink, with a broken old file, a broken project list and a broken ledger, and that a fresh state home stays empty.
- **Real run:** `scripts/agents/kit sweep` printed `## Grok reviews this week (113 bytes)`, and the bundle reads `- 5 of 8 in 2026-W44, whole computer` / `- native-site-editor: 5` / `- last week, 2026-W43: 0`.
- **Docs:** `docs/agents/agent-scripts.md` (`kit review` budgets, `kit sweep` section) and `docs/agents/kitchen.md` (the per-week counts line under Who cooks).
- Validation: `RESULT: ok unit 301/301 (13 files)` from `scripts/agents/kit unit --affected`; `npm run check` and `npm run lint` pass.
- Feature list: no change (kit and docs only, nothing in the editor).
