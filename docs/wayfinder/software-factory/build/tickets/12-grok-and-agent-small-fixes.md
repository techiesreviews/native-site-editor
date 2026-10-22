---
title: Grok and agent.sh small fixes
type: task (AFK)
status: closed
assignee: lead-sf12
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

## Done (2026-10-22)

- Behaviour: Grok's model check compares case-insensitively, so `ASE_REVIEW_MODEL=GROK-4.7` accepts `grok-4.7-build` and still rejects `grok-4.70`; `scripts/agents/agent.sh` line 2 reads `[--cli codex|claude|grok]`. A Grok result with no `sessionId` falls back to the id the runner passed with `-s` for the completeness retry, and `status.json` keeps that id for `agent.sh --resume`; Claude's missing session still opens no fresh retry. `kit review` returns the weekly budget slot only when the provider refuses the first call with `problem: <family> usage limit until …`; a started review that times out, or a completed first call whose completeness retry is refused, still counts.
- Tests: `tests/agent-scripts.test.ts` (uppercase model against a build variant, `grok-4.70` rejection, retry and `--resume` using the `-s` id when JSON names none), `tests/kit-review.test.ts` (fake Codex usage limit leaves the ledger at its prior count, first call ends and retry is refused keeps the count, Grok refusal on stdout returns the slot, uppercase `GROK-4.7` selects Grok end to end). No real Grok call was made.
- Commits: `9f63b8f0` (case-insensitive model check, assigned-session retry, usage-limit refund) and `5c84d8a9` (Done section); review correction round fixes the refund's first-call rule and adds the retry-refused, Grok-stdout and uppercase end-to-end tests in this branch's correction commit.
- Review decisions: accepted the finding that a completed first call whose retry is refused is still a spent review; the runner now records `refused: true` (first call only) in `status.json` and `kit review` reads it instead of scanning the last `problem:` line. Accepted the three validation gaps above and both optional nits (session-id fallback order, no second stderr scan). No findings rejected.
- Checks: `ASE_OWNER=lead-sf12 scripts/agents/kit doctor` gave `RESULT: ok doctor 7/7 checks passed`; `ASE_OWNER=lead-sf12 scripts/agents/kit unit tests/agent-scripts.test.ts tests/kit-review.test.ts` and `ASE_OWNER=lead-sf12 scripts/agents/kit unit --affected` gave `RESULT: ok unit 50/50 (2 files)`; `npm run check` exited 0.

- Lead note (2026-10-22): three Claude fix rounds followed the free worker's correction (commits fadab8fc, 63be444c, b8ec6359): Grok refusals are judged on the whole log slice, a resumed run never refunds, `-m` is sent lowercased, and the warning match is narrowed to `/^warning: `/`. `docs/agents/agent-scripts.md` now states the refund rule. See `git log` on PR #127 for the full commit list.
