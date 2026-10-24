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

- **P1.** A page or file command (or a text write) that starts on the branch shown, whose branch is left and shown again before its step is kept, now runs on show again, once. `editorOrElsewhere` takes an `again` attempt: when the editor attempt fails unkept and its branch was left meanwhile, the away finish runs first; when that leaves it to the editor (its branch is shown), `again` runs a new on-show attempt on a new session stamp. "Left meanwhile" is `holdWorkspace` (`src/agent-site.ts`): another workspace or the overview is shown, or loaded between its own loads; a reload alone still refuses as before. `applyAgentSiteCommand` (`src/main.ts`) wraps its on-show part as `onShow`, passed as `again` only while the attempt's branch is the one shown; left and not shown again (or the away finish declining for another reason), the attempt's own refusal stands, as before. A page or file command runs on show again only while its branch's drafts are as they were when it began (`retryProof`, taken in `applyAgentSiteCommand` before its first wait), else it refuses with "<branch> changed in the editor meanwhile. Read it again. Nothing was changed; your drafts are as they were."; with no branch known for it, it refuses the same way. A text write is proved by its own `expectedHash`, as away. Its first run away keeps the proof taken as that run begins (ticket 34), so a command begun on show whose branch is left while Lex has other drafts there still lands away. Opening an earlier version and closing it again is not leaving the branch: the attempt refuses as reloaded, as before.
- **P2.** `applyStructural` runs what follows a kept step (labels, the count where it landed) once, after the step, outside the `try`: its throw no longer reaches `recover()` or runs it twice, and the receipt answers.
- Tests (`tests/agent-text-commit.test.ts`): "an agent command's editor path left and shown again before it is kept runs on show again, once" (left for a branch, twice, for the overview, not shown again, a reload and an earlier version opened and closed, which refuse) and "a kept page command whose count or labels throw answers with its receipt, runs them once and recovers nothing" fail on the old code. "an agent text write's editor path left and shown again…" runs write_file through `applySiteCommand`: written once on show, or refused by the editor's own "changed in the editor since it was read"; "…on-show attempts left and shown again at any wait keep it once or nothing" covers every await (`forEachAwait`). "a page command's editor path left and shown again refuses when its branch's drafts changed meanwhile" runs set_page_details through `applyStructural` and fails without the proof; "an on-show retry's proof…" covers `retryProof`; "a page command begun on show, other drafts there changed, then left before it is kept, lands away once" pins the away proof's timing. "a workspace hold is left once another workspace or none loads…" covers `holdWorkspace`. The set_page_details site-switch cell in `native-invisible-multiplayer-pages.spec.ts` now checks repository 540 is left without drafts after Undo.
- In the browser today, the agent connection is pinned to the branch it was turned on on: opening that branch again turns it off and on (`src/components/agent-menu.ts` `changed`), which cancels a command still under way there (its status: cancelled, nothing kept) before the on-show attempt runs. So the retry is proved by the unit cells above; a browser cell for it waits on the connection carrying such a command across that return.
- Commits: cc952d6a (both findings), 596290a4 (review round 1: `again` only on show, the extra cells), 23d535b4 (review round 2: the drafts proof), then review round 3 (the proof for the on-show retry only, a refusal with no branch known).
- Evidence (review round 3): `kit unit --affected` RESULT: ok unit 594/594 (21 files); `kit specs --affected` RESULT: fail specs 1 of 63 failed (native-mcp.spec.ts "Ask agent history stays in this browser…" timed out at 120 s; it does not run an agent command), then `kit specs native-mcp.spec.ts` RESULT: ok specs 1/1 passed (19 tests); `npm run check` and `npm run lint` exit 0.
- After rebasing onto dev: `onShow`'s check that the command's repository (when it names one) and branch are the ones shown asks the Workspace session's `sameBranch` instead of comparing fields by hand, which ends `tests/workspace-session-guard.test.ts`'s allowlisted follow-up for `applyAgentSiteCommand` (entry removed). Evidence: `kit unit tests/workspace-session-guard.test.ts` RESULT: ok unit 6/6; `kit unit --affected` RESULT: ok unit 617/617 (24 files); `kit specs native-invisible-multiplayer-pages.spec.ts` RESULT: ok specs 1/1 passed (10 tests); `kit specs native-mcp.spec.ts` RESULT: ok specs 1/1 passed (19 tests); `npm run check` and `npm run lint` exit 0.
- `src/main.ts` was 3,870 lines (from 3,866; ceiling 3870) before the rebase onto dev; after it, 3,109 lines under dev's ceiling of 3110.

### Follow-ups

- Keep an agent command alive across a return to its pinned branch: `src/components/agent-menu.ts` `changed` turns the connection off and on (`turnOff`) when the branch it was turned on on is shown again, which cancels a command still under way there. Until then the on-show retry above does not run in the browser.
- Then a browser cell for the on-show retry in `tests/native-save/native-invisible-multiplayer-pages.spec.ts`: `delete_file` begun on main shown, held inside its editor attempt (`/src/controllers/file-operations-controller.ts` loads there), feature opened and main again, released once main is opening: one deletion on main, none on feature, no finished note, Undo there takes it back.
- Grok's validation gaps outside this ticket's files: `agent-site-host.test.ts` (an edit's context built from a media pin with a page and outline source while the scope switches), `parked-steps.test.ts` (`adopt` when `record` is false: count stays 1, the upload key stays held), `native-invisible-multiplayer.spec.ts` (Undo on the arrival page in the picker Use and image-popup trim cells).
- Grok's nits: pinned `exists` treats a folder path as missing (`src/agent-site-host.ts`), and `tests/fakes/background-site-ports.ts` lets a new nested port field through without a compile error.
