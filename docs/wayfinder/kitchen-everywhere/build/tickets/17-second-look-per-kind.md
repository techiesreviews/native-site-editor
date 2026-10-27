---
title: A second look on every change, per review kind
type: task (AFK)
status: open
assignee: ke-17
builder: claude
blocked_by: [14-settings-for-other-projects, 16-opencode-review-path, 25-editor-values-left-after-11, 33-out-of-credit-and-last-problem]
---

## Goal

Every change gets a second look after Claude's review, in addition to it, from whichever model is newest and fit for that kind of review (code, UX, DX, agent setup): Grok or a free OpenCode model ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 4). Today the lead runs it by hand.

## Decided behaviour

- **One table in the kit**, `scripts/agents/second-look.json`: for each kind (`code`, `ux`, `dx`, `agent`) the model to ask, the other family as fallback, and the date the pick was last checked. One place for every project; the lead updates it when new models appear (README helper decision 4). The first picks are made in this slice from `grok models` and `opencode models`, newest fit model per kind, and written in the Done with how they were chosen.
- **The kind comes from the changed paths**, through settings `paths` (ticket 11): agent setup (`scripts/agents/`, `.claude/`, `.codex/`, `AGENTS.md`, `docs/agents/`) first, then UX (`paths.visible`), then DX (build, scripts, docs for developers), else code. One second look per change.
- **`kit review --second-look`** runs it; `kit slice` and `kit pr` run it once after Claude's review passes. Its findings are weighed like Claude's (same severities, same fix rounds).
- **If it cannot run:** Grok's weekly count used up, out of credit (ticket 33's `out of credit` result) or OpenCode down → the fallback family takes it; if both fail, the change lands and the report says `second look: skipped (<reason>)`. It never blocks on availability.
- **The kitchen's pins table** says this in its "Second look" row. After it lands, the lead drops the "lead runs it by hand" note from this build's README.

## Files

- `scripts/agents/second-look.json` (new)
- `scripts/agents/kit.d/review`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/pr`, `scripts/agents/pr-tier.mjs` (the kind)
- `scripts/agents/kit.d/fix` (the skip reason only, see Comments)
- `tests/kit-review.test.ts`, `tests/kit-slice.test.ts`, `tests/kit-pr.test.ts`, `tests/kit-fix.test.ts`
- `docs/agents/kitchen.md` (Who cooks), `docs/agents/agent-scripts.md`, `docs/agents/runner.md` (one line in Review and close)

## Done when

- Tests with fake CLIs prove: each kind picks its table model; a mixed change picks by the order above; a Grok cap at its limit falls back to OpenCode; both failing lands with the `skipped` line; a second-look P1 blocks like Claude's.
- One real `kit pr --dry-run` on a docs change shows the second look's kind and model.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke17 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/17-second-look-per-kind.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke17 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: the lead runs it by hand one last time on this slice (README).
- Report: the first table with how each pick was made, unit `RESULT:` lines, review decisions, PR and merge SHA.

## Comments

**Lead, 2026-10-27 (hand-out):**

- Grok has no paid credit today. When Grok's review ends `RESULT: skip review out of credit (…)` (ticket 33, exit 3) or its weekly count is used up, the second look falls back to the free OpenCode model (`opencode/deepseek-v4.1-flash-free`). Only when both cannot run does the report say `second look: skipped (<reason>)` (README "Builders and review"). It never falls back to Codex or any OpenAI model (no OpenAI reviews); the table holds no OpenAI model, and a test proves an `opencode/…` or `grok-…` pick never reaches Codex.
- Ticket 33's follow-up fits here: `kit slice` (`requireSuccess`) and `kit fix` show only `command exited 3` / `review failed (3)` instead of the skip reason. Both read `^RESULT: (?:fail|skip) (.+)$` and name it (for example "skip review out of credit"); a `tests/kit-slice.test.ts` and a `tests/kit-fix.test.ts` case prove it. `kit.d/fix` is added to Files for this only.
- Slice 26 runs beside this one (`unit.sh`, `kit.d/unit`, `kit-lib.sh`, `kit.d/doctor` and their tests): leave those files alone. Both may add lines to `docs/agents/agent-scripts.md`; the later to land rebases onto the earlier.
- The editor works the same after the slice: one real `kit doctor` and `kit status` run go in the Done as evidence.
