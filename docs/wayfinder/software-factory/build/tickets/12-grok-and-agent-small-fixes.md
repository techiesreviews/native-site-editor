---
title: Grok and agent.sh small fixes
type: task (AFK)
status: open
assignee:
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

The P3 follow-ups of clean-up slice 95 (PR #119), listed in its ticket's `### Follow-ups`: case, session id, usage line and a budget slot spent on a refusal.

## Decided behaviour

- **Model case:** the Grok model check in `scripts/agents/agent-run.mjs` compares case-insensitively, so `ASE_REVIEW_MODEL=GROK-4.7` that selects Grok (`inferCli` is already `/^grok-/i`) passes against `grok-4.7-build`. Same for the env-name case noted there.
- **Session id:** the Grok completeness retry and `agent.sh --resume` use the session id the runner assigned with `-s` when the JSON result carries none.
- **Usage line:** `scripts/agents/agent.sh` line 2 reads `[--cli codex|claude|grok]`.
- **Usage-limit refusal:** when a review fails with `problem: <family> usage limit until …` (the provider refused; no review happened), `kit review` gives the weekly budget slot back. Other started reviews still count (decided in slice 95).

## Files

- `scripts/agents/agent-run.mjs`
- `scripts/agents/agent.sh`
- `scripts/agents/kit.d/review` (the refund only)
- `tests/agent-scripts.test.ts`
- `tests/kit-review.test.ts`

## Done when

- Tests prove: `GROK-4.7` passes the model check against `grok-4.7-build` and `grok-4.70` still fails; a retry without a JSON session id resumes the `-s` id; a fake Codex printing the usage-limit message leaves the ledger count unchanged; a fake Grok that times out still counts.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; may run before the clean-up lands, beside 10 and 11; not beside 13 (`agent-run.mjs`) or 20 (`kit.d/review`).

- Free worker through T3 `delegate_task` (OpenCode `deepseek-v4.1-flash-free`) in `build/sf-12-grok-small-fixes` (`ASE_OWNER=sf-12`); brief names this ticket, its Files, `scripts/agents/kit doctor` and `scripts/agents/kit unit --affected`. One attempt plus one correction; then Claude.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket docs/wayfinder/software-factory/build/tickets/12-grok-and-agent-small-fixes.md`; land: `ASE_OWNER=sf-12 scripts/agents/kit pr --ticket <same>`.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.
