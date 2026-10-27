---
title: An OpenCode path in kit review
type: task (AFK)
status: open
assignee: ke-16
builder: claude
blocked_by: [15-machine-wide-state]
---

## Goal

`kit review` can ask a free OpenCode model for a review, read-only, the same way it asks Claude or Grok today; ticket 01 needs it for the second look ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 4: "`kit review` has no OpenCode path yet; adding one is a build ticket").

## Decided behaviour

- **`ASE_REVIEW_MODEL=opencode/<model>`** (for example `opencode/deepseek-v4.1-flash-free`) picks the OpenCode CLI (`opencode run`, installed at `~/.local/bin/opencode`); `agent.sh` and `agent-run.mjs` gain an `opencode` adapter beside `codex`, `claude` and `grok`, for reviews only, like Grok.
- **Read-only:** the review session cannot edit files or run commands that write (OpenCode's read-only agent or a permission setting that denies edits; the slice picks the one `opencode run --help` offers and a test checks the arguments).
- **Same evidence as every review:** the brief, `findings.json`, the severity line and declined findings in `.scratch/reviews/<owner>/<time>/`; the model check confirms the model that answered; a run that ends without a complete review gets the same one retry as Grok.
- **Not counted:** free OpenCode models use no weekly budget. A usage or rate-limit refusal prints `problem: opencode usage limit …` like the others.

## Files

- `scripts/agents/agent-run.mjs`, `scripts/agents/agent.sh`
- `scripts/agents/kit.d/review`
- `tests/agent-scripts.test.ts`, `tests/kit-review.test.ts`
- `docs/agents/agent-scripts.md` (the `kit review` line)

## Done when

- Tests with a fake `opencode` CLI prove: `opencode/…` selects the adapter; the arguments make the session read-only; a full answer writes `findings.json` with severities; an incomplete answer gets one retry; a refusal prints the `problem:` line; the Grok count is untouched.
- One real review of a small docs change with the free model (`ASE_REVIEW_MODEL=opencode/deepseek-v4.1-flash-free scripts/agents/kit review --base origin/dev`) writes its evidence folder; paste its `RESULT:` line.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke16 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/16-opencode-review-path.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke16 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the real OpenCode review's `RESULT:` line and evidence path, review decisions, PR and merge SHA.
