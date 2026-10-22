---
title: Commit credit names the model, also after a builder switch
type: task (AFK)
status: open
assignee: lead-sf11 (free worker build)
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

Clean-up follow-ups (slice 90, slice 96 P2): `builderAuthor` in `scripts/agents/kit-lib.mjs` (about line 174) credits fix-round commits with the raw id (`claude-opus-5-5 <noreply@anthropic.com>`) instead of "Claude Opus 5.5"; and when a slice switches builder after its build phase finished but before its commit, `kit slice` credits the new model for the old model's work (`scripts/agents/kit.d/slice` about line 61 and 210).

## Decided behaviour

- `builderAuthor(model)` returns a display name: `gpt-6.1-sol` → `GPT-6.1-Sol <noreply@openai.com>` (as today); `claude-<family>-<major>-<minor>` (optionally with a date suffix or `[1m]`) → `Claude <Family> <major>.<minor> <noreply@anthropic.com>` (so `claude-opus-5-5` → `Claude Opus 5.5`), matching [runner.md](../../../../agents/runner.md#build-and-tests); bare aliases `opus`/`sonnet`/`haiku`/`fable` → `Claude <Alias>`; `gpt-*` → upper-case `GPT-…` at openai.com; anything else unchanged at its vendor as today.
- The build commit is credited to the model that produced the build phase (saved in the slice state), not to the model named on the resume. Fix rounds keep crediting their own round's model.

## Files

- `scripts/agents/kit-lib.mjs`
- `scripts/agents/kit.d/slice`
- `tests/kit-commit.test.ts`
- `tests/kit-slice.test.ts`

## Done when

- `tests/kit-commit.test.ts` covers each mapping above; `tests/kit-slice.test.ts` proves a slice whose build finished under model A and resumed with `--builder B` before its commit credits A on the build commit and B on the next fix round.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; may run before the clean-up lands, beside 10 and 12; not beside 13 or 21 (`kit.d/slice`).

- Free worker through T3 `delegate_task` (OpenCode `deepseek-v4.1-flash-free`) in `build/sf-11-commit-credit` (`ASE_OWNER=sf-11`); brief names this ticket, its Files, `scripts/agents/kit doctor` and `scripts/agents/kit unit --affected`. One attempt plus one correction; then Claude.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket docs/wayfinder/software-factory/build/tickets/11-commit-credit-model-name.md`; land: `ASE_OWNER=sf-11 scripts/agents/kit pr --ticket <same>`.
- Report: unit `RESULT:` lines, one sample `git log --format='%an <%ae>'` line from the test repo, review decisions, PR and merge SHA.

## Done (2026-10-22)

- `builderAuthor` now names the model instead of echoing its id: `claude-opus-5-5` → `Claude Opus 5.5`, Claude families with an optional date or `[1m]` suffix → `Claude <Family> <major>.<minor>`, bare `opus`/`sonnet`/`haiku`/`fable` → `Claude <Alias>`, and `gpt-*` → upper-case `GPT-…`; every other id keeps its current name and vendor.
- A slice now saves the model that ran its build phase and credits the build commit with that model, so a switch before the commit no longer credits the incoming builder; fix rounds keep crediting their own round's model.
- `tests/kit-commit.test.ts` covers each mapping and that a build under `gpt-6.1-sol` resumed with `gpt-6-luna` keeps the Sol build credit while the next fix round is credited to Luna; the suite passed via `kit unit` (66/66 focused, 125/125 affected) and `npm run check`.
