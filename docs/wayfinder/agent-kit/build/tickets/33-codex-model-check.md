---
title: "Codex model check reads only the run's header blocks"
type: task (AFK)
status: closed
assignee: ak-33 (lead)
blocked_by: []
builder: claude
---

## What

Ticket 20's second `kit review` printed `RESULT: fail run.log does not name requested model
gpt-6.1-sol` although the review completed. `codexModelMatches` scanned the whole run.log for
`model:` lines, and the log echoed a file Sol read (`  model: monaco.editor.ITextModel;`).

- Look for `model:` only inside Codex's header blocks (`OpenAI Codex v…`, `--------`, settings,
  `--------`), one per run or resume; fall back to the whole log when there is no header (old tests).

## Files

- `scripts/agents/agent-run.mjs`
- `tests/agent-scripts.test.ts`

## Done when

- The ticket-20 run.log passes the check; a mismatched model in any header still fails.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-16)

- `codexHeaders(log)` collects the header blocks; `codexModelMatches` reads `model:` only there.
- Tests: an echoed `model: monaco.editor.ITextModel;` line passes; two headers with the same model
  pass; a resume header naming another model fails; an echoed model line can't rescue a wrong header.
  The real failing log (`.scratch/reviews/ak-20/20261016T180335Z/run.log`) now passes.
