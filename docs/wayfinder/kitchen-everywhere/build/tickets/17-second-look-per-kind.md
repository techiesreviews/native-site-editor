---
title: A second look on every change, per review kind
type: task (AFK)
status: closed
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

## Done (2026-10-27)

**The first table** (`scripts/agents/second-look.json`, checked 2026-10-27): every kind (`code`, `ux`, `dx`, `agent`) asks `grok-4.7`, with `opencode/deepseek-v4.1-flash-free` as fallback. How: `grok models` listed `grok-4.7` (default), `grok-4.7-build-fast`, `grok-4.6` and `grok-4.5`; `grok-4.7` is the newest full model and the build-fast variant is the quicker, lighter one, so it is the pick for every kind. `opencode models` listed one free model, `opencode/deepseek-v4.1-flash-free`, so it is every kind's fallback. Neither family has a model aimed at one kind yet, so the rows match; the lead changes a row when one appears.

- **`kit review --second-look`**: the changed paths of the scope give the kind, the first any path reaches of agent setup (`paths.agent`, default `scripts/agents/`, `.claude/`, `.codex/`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/`, plus `paths.kit`), UX (`paths.visible`), DX (`paths.dx`, default `scripts/`, `.github/`, `package.json`, `tsconfig*.json`, `*.config.*`, `wrangler.json(c)`, plus `paths.docs`), else code (`reviewKind` and `secondLookPick` in `pr-tier.mjs`). It prints `second look: <kind> (<path>) <model>` and runs that model; a failed or out-of-credit run (a used-up Grok count, an empty account, a CLI that is down) hands it to the fallback (`second look: <fallback> takes it (<why>)`); when both fail it prints `second look: skipped (<both reasons>)` and `RESULT: skip second look (…)`, exit 3. The table only takes `grok-…` and `opencode/…` models of different families, and the second look sets its own CLI, so `ASE_AGENT_CLI` or `ASE_REVIEW_MODEL` cannot send it to Codex. Each run's evidence folder is marked `second-look.json` (`{ kind, model, ok }`).
- **`kit slice`**: a new `second` phase after the fix rounds and before the UX gate runs it; open findings get a `kit fix --review <second look>` round, then Claude's review gets the usual rounds; with no rounds left, or blocking findings after them, the slice stops. A skipped second look prints its line and the slice goes on. Claude's review lookups skip marked folders.
- **`kit pr`**: after Claude's review (none in the docs tier) every change gets the second look, reused when a saved one that ran covers this HEAD; its findings block or become follow-ups like Claude's; a skipped one lands with `second look: skipped (<reason>)`. `--dry-run` prints `second look: <kind> (<path>) <model>, else <fallback>` and the command.
- **Skip reasons** (ticket 33 follow-up): `kit slice` and `kit fix` name a child's last `RESULT: fail|skip` line, a skip with its word: `command exited 3: skip review out of credit (grok-4.7)`, `review failed (3): skip review out of credit (grok-4.7)`.
- Docs: kitchen.md "Second look" pin row, agent-scripts.md (`kit review`, `slice`, `fix`, `pr`, exit 3), runner.md Review and close.
- Tests with fake CLIs: `tests/kit-review.test.ts` (each kind picks its table row; mixed changes pick agent, then UX, then DX, else code; a Grok count at its limit hands it to OpenCode and the Grok count stays put; both failing ends exit 3 with the skipped line and a marked failed folder; `ASE_AGENT_CLI=codex` never reaches Codex; OpenAI or same-family rows are refused; the kit's own table is valid), `tests/kit-pr.test.ts` (dry run shows kind, path, model and fallback for dx, agent, ux and code; a second-look P1 blocks the merge after Claude's clean review; a skipped one lands; only a second look that ran is reused, never as Claude's review; the docs tier gets one), `tests/kit-slice.test.ts` (second phase order, skipped lands, a second-look P1 gets a fix round, no rounds left stops before `kit pr`, the exit-3 skip reason), `tests/kit-fix.test.ts` (the skip reason).
- Picks for real paths (`secondLookPick` with this editor's settings): `docs/wayfinder/…/README.md` → `dx grok-4.7`; `docs/agents/kitchen.md` + `docs/work/x.md` → `agent grok-4.7`; `src/ui/panel.ts` + `docs/x.md` → `ux grok-4.7`; `src/main.ts` → `code grok-4.7`. The real `kit pr --dry-run` on a docs change is left to the slice, which runs `kit pr`.
- Validation: `RESULT: ok unit 321/321 (6 files)`; `npm run lint` and `npm run check` exit 0; `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok status all 770 tickets, 588 closed, 1 open PRs`. One earlier `kit unit --affected` run had `kit-tests-clean` find a leftover `kit-pr-*` temp folder with every child test passing; it passed on its own rerun and in the full rerun above.
- Feature list: no change (kit and docs only; nothing in the editor changes)
