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

- **P1.** A page or file command (or a text write) that starts on the branch shown, whose branch is left and shown again before its step is kept, now runs on show again, once. `editorOrElsewhere` takes an `again` attempt: when the editor attempt fails unkept and its branch was left meanwhile, the away finish runs first; when that leaves it to the editor (its branch is shown), `again` runs a new on-show attempt on a new session stamp. "Left meanwhile" is `holdWorkspace` (`src/agent-site.ts`): another workspace or the overview is shown, or loaded between its own loads; a reload alone still refuses as before. `applyAgentSiteCommand` (`src/main.ts`) wraps its on-show part as `onShow`, passed as `again` only while the attempt's branch is the one shown; left and not shown again (or the away finish declining for another reason), the attempt's own refusal stands, as before. A page or file command runs again, on show or away, only while its branch's drafts are as they were when it began (`draftsProof`, taken in `applyAgentSiteCommand` before its first wait and carried in `AgentAwayPorts.unchanged`), else it refuses with "<branch> changed in the editor meanwhile. Read it again. Nothing was changed; your drafts are as they were."; a text write is proved by its own `expectedHash`, as away. Opening an earlier version and closing it again is not leaving the branch: the attempt refuses as reloaded, as before.
- **P2.** `applyStructural` runs what follows a kept step (labels, the count where it landed) once, after the step, outside the `try`: its throw no longer reaches `recover()` or runs it twice, and the receipt answers.
- Tests (`tests/agent-text-commit.test.ts`): "an agent command's editor path left and shown again before it is kept runs on show again, once" (left for a branch, left for the overview, and a reload that still refuses) and "a kept page command whose count or labels throw answers with its receipt, runs them once and recovers nothing" both fail on the old code; the first also covers two leave-and-return cycles (three attempts, one kept) and a branch left and not shown again (its own refusal, which failed before the review fix). "an agent text write's editor path left and shown again…" runs a write_file through it: written once on show, or refused with the editor's "changed in the editor since it was read" when its text changed meanwhile. "a workspace hold is left once another workspace or none loads…" covers `holdWorkspace`, an earlier version opened and closed included. "an agent command's editor path left and shown again refuses when its branch's drafts changed meanwhile; nothing is kept" fails without the drafts proof. The set_page_details site-switch cell in `native-invisible-multiplayer-pages.spec.ts` now checks repository 540 is left without drafts after Undo.
- In the browser today, the agent connection is pinned to the branch it was turned on on: opening that branch again turns it off and on (`src/components/agent-menu.ts` `changed`), which cancels a command still under way there (its status: cancelled, nothing kept) before the on-show attempt runs. So the retry is proved by the unit cells above; a browser cell for it waits on the connection carrying such a command across that return.
- Commits: cc952d6a (both findings), 596290a4 (review round 1: `again` only on show, the extra cells), then review round 2 (the drafts proof).
- Evidence (review round 2): `kit unit --affected` RESULT: ok unit 591/591 (21 files); `kit specs --affected` RESULT: ok specs 58/58 passed; `npm run check` and `npm run lint` exit 0.
- `src/main.ts` is 3,870 lines (was 3,866); the ceiling stays 3870.

### Follow-ups

- Keep an agent command alive across a return to its pinned branch: `src/components/agent-menu.ts` `changed` turns the connection off and on (`turnOff`) when the branch it was turned on on is shown again, which cancels a command still under way there. Until then the on-show retry above does not run in the browser.
- Then a browser cell for the on-show retry in `tests/native-save/native-invisible-multiplayer-pages.spec.ts`: `delete_file` begun on main shown, held inside its editor attempt (`/src/controllers/file-operations-controller.ts` loads there), feature opened and main again, released once main is opening: one deletion on main, none on feature, no finished note, Undo there takes it back.
- Grok's validation gaps outside this ticket's files: `agent-site-host.test.ts` (an edit's context built from a media pin with a page and outline source while the scope switches), `parked-steps.test.ts` (`adopt` when `record` is false: count stays 1, the upload key stays held), `native-invisible-multiplayer.spec.ts` (Undo on the arrival page in the picker Use and image-popup trim cells).
- Grok's nits: pinned `exists` treats a folder path as missing (`src/agent-site-host.ts`), and `tests/fakes/background-site-ports.ts` lets a new nested port field through without a compile error.
