---
title: "Fix Grok's second-opinion findings on invisible multiplayer part 2"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [34-invisible-multiplayer-pages-and-undo]
---

## Goal

Slice 34 (PR #153) landed after five Claude review rounds; Grok's second opinion on the merged change (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/lead-34/20261024T084841Z/result.md`) found two more:

1. **P1** (`src/main.ts` ~3572–3582, `src/agent-site.ts:1054` `editorOrElsewhere`): a page or file command that starts on the branch being shown, then that branch is left and shown again before the step is kept, is not run on show: the editor attempt closes over a stale stamp. It must land correctly (on show when its branch is shown again, elsewhere otherwise), exactly once.
2. **P2** (`src/agent-site.ts:1075` `applyStructural`): `applied()` runs inside the `try`, so a throw from it is treated as the follow-up failing: `recover()` runs and `applied()` runs twice. A kept page command whose follow-up fails answers with its receipt and is counted once.

Fix both and every other Spec/Standards item in that review.

## Files

`src/main.ts` (wiring only; ceiling per the README), `src/agent-site.ts`, their unit tests, `tests/native-save/native-invisible-multiplayer-pages.spec.ts`.

## Done when

- A test per finding that fails before the fix.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Counts as one `src/main.ts` slot. `kit bg slice-36 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
