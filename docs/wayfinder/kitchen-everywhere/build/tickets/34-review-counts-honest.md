---
title: Review counts cannot be dodged, doubled or lifted
type: task (AFK)
status: open
assignee: ke-34
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

The second looks on slices 15 and 16 (OpenCode, evidence `.scratch/reviews/ke15-second-look/20261027T151736Z` and `.scratch/reviews/ke16-second-look/20261027T144848Z` in the main checkout) and Claude's final review of PR #211 found ways the weekly review counts (ticket 15) stop meaning what they say, and one way a review reaches OpenAI although no OpenAI models review (ticket 01 point 4):

- **Uncounted paid models (P2, both reviews of 16):** `families` has no `opencode` entry (`scripts/agents/agent-run.mjs:29`), so any `provider/model` on the OpenCode path runs with no `budget:` line: `ASE_AGENT_CLI=opencode ASE_REVIEW_MODEL=openai/gpt-6.1` or a paid `opencode/<model>`. Ticket 16 meant only free models to go uncounted.
- **Unknown names go to Codex (found running these second looks):** `inferCli` (`agent-run.mjs:25`) sends every name that is not `grok-*`, `opencode/…` or a Claude name to Codex. The kit at 8b79d3039 (before slice 16) sent `opencode/deepseek-v4.1-flash-free` to Codex: the brief reached OpenAI, which answered `400 model_not_found`, and two GPT reviews were counted (`gpt 2/12 in 2026-W44`, evidence `.scratch/reviews/ke14-second-look/20261027T144220Z`, `ke15-second-look/20261027T144223Z`). Today a typo such as `opencod/…` or `deepseek-v4.1` does the same.
- **Counted twice (P2, second look on 15; Claude's P3):** `withReviewLock`'s `finally { rmSync(lock) }` (`agent-run.mjs:225`) can throw after `renameSync` saved the machine ledger; `reserveReviewBudget`'s catch (`:349`) then restores the old per-project file, so its counts sit in both files and the next review moves them in again.
- **Cap lifted by a bad count (P2, second look on 15; Claude's P3):** `projectCounts` (`:260`) checks week and family shapes but not counts, and `??=` quietly replaces a `null` week or family; `familyUse` reads `"3"` as 0, and the move writes `"3" + 5 = "35"`.

## Decided behaviour

- **Only named models run, and only the free OpenCode ones go uncounted:** `inferCli` picks Codex only for `gpt-*`, `o<digit>…` and `codex*` names or an explicit `ASE_AGENT_CLI=codex`; any other name is refused before any call (`problem: unknown review model <name>; use claude-*, grok-*, gpt-* or opencode/<provider>/<model>`). On the OpenCode path a model whose name ends in `-free` is not counted; `openai/…` counts as `gpt`, `xai/…` as `grok`, any other paid model is refused with a problem line naming the rule. `kit.d/review`'s usage text and `docs/agents/agent-scripts.md` say this.
- **A saved count is never restored:** `withLedger` sets a `written` flag right after `renameSync`; the old file is restored only when it is still false, and a failed lock removal after a write is a warning, not a failure. The restore runs inside the machine lock and writes through a temp file and rename (Claude's P3s on 15: `agent-run.mjs:306`, `:348`).
- **Counts are checked:** a week, family or count in the machine ledger that is not an object or a non-negative safe integer stops the review with the same "fix or delete it" message the old-file check uses, naming the file, week and family; validation does not change the ledger it reads. `kit sweep` shows a bad old-file count as `- <name>: old ledger unreadable (<file>)` instead of skipping it (`kit.d/sweep:322`, `:339`).
- The fake `renameSync` in `tests/agent-scripts.test.ts:342`, `:352` is typed with `satisfies`, not `as` (CODING_STANDARDS.md "Test fixtures").

## Files

- `scripts/agents/agent-run.mjs`, `scripts/agents/kit.d/review`, `scripts/agents/kit.d/sweep`
- `tests/agent-scripts.test.ts`, `tests/kit-review.test.ts`, `tests/kit-sweep.test.ts`
- `docs/agents/agent-scripts.md` (`kit review` models and budgets)

## Done when

- `kit review` with `ASE_REVIEW_MODEL=deepseek-v4.1` and with `opencod/x` is refused with no CLI call and no count; `ASE_AGENT_CLI=opencode ASE_REVIEW_MODEL=openai/gpt-6.1 ASE_REVIEW_BUDGET_GPT=0` is refused at the GPT limit; `opencode/deepseek-v4.1-flash-free` still runs uncounted.
- A fake `rmSync` that throws only for `${path}.lock` after a good write leaves the moved counts only in the machine ledger and no old file.
- A machine ledger `{ [week]: { grok: { a: "3" } } }` stops the review naming the file and leaves it unchanged; an old file `{ [week]: { grok: "3" } }` shows its `old ledger unreadable` line in `kit sweep`.
- The three other gaps from [ticket 15](15-machine-wide-state.md#follow-ups) have cases: a restore that itself fails, the sweep's second read, and a second review in the gap before the restore.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke34 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/34-review-counts-honest.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke34 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, each new case's result, review decisions, PR and merge SHA.

## Comments

- Lead, 2026-10-28: `tests/kit-sweep.test.ts` failed in CI on PR #232 when the run crossed 00:00 UTC, and passed on rerun and locally. You touch `kit.d/sweep` and its tests here, so make that test independent of the clock (pass a fixed "now", or derive the week from the same instant on both sides).
