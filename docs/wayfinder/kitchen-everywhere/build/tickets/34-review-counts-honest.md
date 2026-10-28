---
title: Review counts cannot be dodged, doubled or lifted
type: task (AFK)
status: closed
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

## Done (2026-10-28)

- **Only named models review.** `inferCli` picks Codex only for `gpt-*`, `o<digit>…` and `codex…`; any other review model is refused before any call or count: `problem: unknown review model <name>; use claude-*, grok-*, gpt-* or opencode/<model>` (the decided text said `opencode/<provider>/<model>`, which would point at a wrong name: the OpenCode model is `opencode/deepseek-v4.1-flash-free`, provider `opencode`). `--cli codex` or `ASE_AGENT_CLI=codex` still runs such a name on Codex. A build model no rule knows still selects Codex, as before: Codex builds are allowed, and the `kit fix` and `kit slice` tests build with placeholder names such as `other-model`.
- **OpenCode is counted unless free.** On the OpenCode path `openai/…` counts as `gpt` and `xai/…` as `grok` (`reviewFamily(cli, model)`); a model ending in `-free` is not counted; any other is refused before any call: `problem: OpenCode model <model> is paid and has no weekly count; use a -free model, openai/… (counted as gpt) or xai/… (counted as grok)`. `reserveReviewBudget` now takes the run as `{ cli, model }`.
- **A saved count is never restored.** `withLedger` marks the ledger written right after the rename; only a failure before that runs the restore, and it runs while the machine lock is still held, so no second review can start in the gap. The restore writes the old file through a temporary file and a rename. A lock folder that cannot be removed after its action is a `warning: review budget lock <lock> could not be removed: …; remove it if no review is starting` line, never a failure; the next writer names the leftover lock as before.
- **Counts are checked.** Every week, family and count in the machine ledger is checked before anything changes (`checkReviewLedger`; also on giving a count back): a count that is not a whole number of 0 or more stops the review with `review budget ledger <file> <week> <family> <project> is not a count; fix or delete it`, and a null week or family is named instead of replaced. The check changes nothing. `kit sweep` uses the same check for the ledger and the old-file check (`checkOldReviewLedger`) for each old file, so an old file with `{ grok: "3" }` shows `- <name>: old ledger unreadable (<file>)` and adds none of its counts.
- **Tests.** `tests/agent-scripts.test.ts`: unknown review names (`deepseek-v4.1`, `opencod/x`, `custom-model`, `omni`) are refused and an explicit Codex CLI still runs them; OpenCode free, `openai/…`, `xai/…` and refused paid models; string, negative, fractional and null counts, and null weeks or families, in the machine ledger stop both reserving and giving back with the file unchanged; a second review in the gap before the restore is refused at the held machine lock and each count stays once; a restore that fails itself names `the moved counts could not be put back in <old file>` with the machine ledger unchanged; a fake `rmSync` that throws only for `${path}.lock` after a good write leaves the moved counts only in the machine ledger, no old file, and one warning. The fake `renameSync` and `rmSync` are typed with `satisfies`. `tests/kit-review.test.ts`: `deepseek-v4.1`, `opencod/x` and `opencode/big-pickle` are refused with no CLI call and no ledger; `ASE_AGENT_CLI=opencode ASE_REVIEW_MODEL=openai/gpt-6.1 ASE_REVIEW_BUDGET_GPT=0` is refused at the GPT limit with no call, and with room it runs and counts `gpt 1/1`; the existing `opencode/deepseek-v4.1-flash-free` test still runs uncounted. `tests/kit-sweep.test.ts`: an old file with a string, negative or week-shaped count gets its `old ledger unreadable` line; a machine-ledger count that is not a whole number is named and left unchanged; the second read is covered by a stubbed `readFileSync` that moves the old file in during the unlocked first read (counted once: 3, not 2 or 5; it fails when the second read is removed).
- **Midnight flake.** The CI failure on PR #232 was `tests/kit-sweep.test.ts:190`: the "last week" commit sat at exactly `now − 8 days`, on the `--since <date>` window's midnight edge when the run started just after 00:00. It now sits at noon of its day; the bundle's date is checked against the clock before and after the run; the Grok section's cases run in process at a fixed instant (`grokSection(env, now, …)`), and the one end-to-end run accepts the week of either side of the run.
- **Docs:** `docs/agents/agent-scripts.md` (`kit review` models, budgets and ledger checks; CLI inference under Defaults; `kit sweep`'s old-file line); `kit review --help`.
- Validation: `RESULT: ok unit 128/128 (3 files)` from `scripts/agents/kit unit --affected`; `RESULT: ok unit 249/249 (4 files)` for `agent-scripts`, `kit-fix`, `kit-slice` and `kit-review`; `npm run check` and `npm run lint` pass.
- Feature list: no change (kit and docs only, nothing in the editor).
