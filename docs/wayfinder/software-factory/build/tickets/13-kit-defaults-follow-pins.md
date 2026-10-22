---
title: Kit defaults follow the kitchen pins
type: task (AFK)
status: open
assignee:
builder: opencode/deepseek-v4.1-flash-free
blocked_by: [11-commit-credit-model-name, 12-grok-and-agent-small-fixes]
---

## Goal

The kitchen's pins (Lex, 2026-10-22: Claude builds and reviews, Sol never builds) are passed by hand today because the kit's defaults still say Sol ([kitchen.md](../../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22)). A forgotten `ASE_REVIEW_MODEL` spends the weekly GPT budget (slice 95 follow-up). The builder brief also makes builders write "changes remain unstaged" into the ticket's Done, which the lead removes by hand (clean-up follow-up, tickets 10, 20, 94).

## Decided behaviour

- With no `ASE_REVIEW_MODEL`, `kit review` (and `agent-run.mjs` review mode) uses `claude-opus-5-5`; with no `ASE_BUILD_MODEL`, `agent.sh build` uses `claude-opus-5-5`. A fresh `kit fix` builder without `--builder` and without slice state uses `claude-opus-5-5`, effort `high`. `sol` still expands to `gpt-6.1-sol` when named.
- The `kit slice` builder brief adds: "Do not mention staging, committing or unstaged changes in the ticket."
- Usage texts and `docs/agents/agent-scripts.md` (the `kit review`, `kit fix`, Agent runner lines) and the kitchen's sentence "The kit's built-in defaults still say Sol" change to match.

## Files

- `scripts/agents/agent-run.mjs`
- `scripts/agents/kit.d/review`
- `scripts/agents/kit.d/fix`
- `scripts/agents/kit.d/slice`
- `tests/agent-scripts.test.ts`, `tests/kit-review.test.ts`, `tests/kit-fix.test.ts`, `tests/kit-slice.test.ts` (default-model cases only)
- `docs/agents/agent-scripts.md`, `docs/agents/kitchen.md`

## Done when

- Tests prove each default above and that an explicit `ASE_REVIEW_MODEL=gpt-6.1-sol` or `--builder sol` still selects Sol; the brief text contains the new line.
- `grep -n "gpt-6.1-sol" scripts/agents/kit.d/* scripts/agents/agent-run.mjs` shows only the `sol` alias and budget-family lines (report it).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; may run before the clean-up lands, alone in `kit.d/slice`, `kit.d/fix` and `kit.d/review`.

- Free worker through T3 `delegate_task` (OpenCode `deepseek-v4.1-flash-free`) in `build/sf-13-kit-defaults` (`ASE_OWNER=sf-13`); brief names this ticket, its Files, `scripts/agents/kit doctor` and `scripts/agents/kit unit --affected`. One attempt plus one correction; then Claude.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket docs/wayfinder/software-factory/build/tickets/13-kit-defaults-follow-pins.md`; land: `ASE_OWNER=sf-13 scripts/agents/kit pr --ticket <same>`.
- Report: unit `RESULT:` lines, the grep output, review decisions, PR and merge SHA.
