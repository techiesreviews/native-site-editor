---
title: "Fix Grok's second-opinion findings on invisible multiplayer part 2"
type: task (AFK)
status: closed
assignee: lead-36
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

## Done (2026-10-24)

- **P1.** A page or file command (or a text write) that starts on the branch shown, whose branch is left and shown again before its step is kept, now runs on show again, once. `editorOrElsewhere` takes an `again` attempt: when the editor attempt fails unkept and its branch was left meanwhile, the away finish runs first; when that leaves it to the editor (its branch is shown), `again` runs a new on-show attempt on a new session stamp. "Left meanwhile" is `holdWorkspace` (`src/agent-site.ts`): another workspace or the overview is shown, or loaded between its own loads; a reload alone still refuses as before. `applyAgentSiteCommand` (`src/main.ts`) wraps its on-show part as `onShow`, passed as `again`.
- **P2.** `applyStructural` runs what follows a kept step (labels, the count where it landed) once, after the step, outside the `try`: its throw no longer reaches `recover()` or runs it twice, and the receipt answers.
- Tests (`tests/agent-text-commit.test.ts`): "an agent command's editor path left and shown again before it is kept runs on show again, once" (left for a branch, left for the overview, and a reload that still refuses) and "a kept page command whose count or labels throw answers with its receipt, runs them once and recovers nothing" both fail on the old code; "a workspace hold is left once another workspace or none loads…" covers `holdWorkspace`. The set_page_details site-switch cell in `native-invisible-multiplayer-pages.spec.ts` now checks repository 540 is left without drafts after Undo.
- `src/main.ts` is 3,870 lines (was 3,866); the ceiling stays 3870.
- Left for another ticket (outside this ticket's files): Grok's validation gaps in `agent-site-host.test.ts` (media pin context), `parked-steps.test.ts` (`adopt` when `record` is false) and `native-invisible-multiplayer.spec.ts` (Undo in the picker and trim cells), and the nits on pinned `exists` for folders and the background-site ports fake.
