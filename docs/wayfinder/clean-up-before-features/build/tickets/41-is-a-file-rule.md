---
title: "One \"is a file\" rule everywhere"
type: task (AFK)
status: closed
assignee: lead-41
builder: sol
blocked_by: [40-page-address-and-component-rules]
---

## Goal

Candidate #3, slice b (research 01 §3). "X is a file, so nothing can go in it" is decided at 11 code sites, and path validity runs three times for an agent edit. One rule in slice 40's module answers both, with one wording.

## Decided behaviour

Research 01 §3 (listed so the wording change is no surprise; ticket 05 kept it): every place says it the same way, **"X is a file, so nothing can go in it."** Media's variant ("…cannot contain uploaded files") uses the same words. No other change.

## Files

- `shared/site-rules.ts` (from slice 40): `parentProblem(path, isFile)`; `writablePathProblem` moves here from `shared/site-files.ts:233` or is re-exported
- Call sites: `src/main.ts` (3725, 3774, 4524 at `89ac5e0e`), `src/controllers/file-operation-checks.ts:56`, `src/native-page-moves.ts:131`, `shared/agent-edit.ts:120`, `src/setup-actions.ts:344`, `src/page-builder/media-workspace.ts` (421, 462, 545, 712), `src/page-builder/replace-everywhere.ts:154`
- Tests: `tests/site-rules.test.ts`, affected unit tests; `tests/main-ts-ceiling.test.ts`

## Done when

- A `grep` for the old wordings finds nothing outside `shared/site-rules.ts`.
- Unit tests cover a file in the way at each depth (direct parent, grandparent).
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Last slice of #3.

- `kit doctor`; `kit bg slice-41 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/41-is-a-file-rule.md --builder sol`; `kit wait job slice-41 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: sites replaced (count), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Done (2026-10-24)

- `shared/site-rules.ts` holds the one rule: `fileInTheWay(file)` is the wording, "X is a file, so nothing can go in it."; `foldersAbove(path)` lists the folders a path sits in; `parentProblem(path, isFile)` and `folderProblem(folder, isFile)` return the refusal for the first file in the way. `writablePathProblem` moved here; `shared/site-files.ts` re-exports it for the Worker.
- 12 sites use it: `src/main.ts` (new file or folder, `branchPathProblem`, new drafts' `checkPath`), `src/controllers/file-operation-checks.ts`, `src/native-page-moves.ts`, `shared/agent-edit.ts` (write_file), `src/setup-actions.ts` (skipped starter files), `src/page-builder/media-workspace.ts` (4) and `src/page-builder/replace-everywhere.ts`.
- Wording changes: media's "…so it cannot contain uploaded files" and "…cannot contain originals", and the starting point's "…is a file here, so…", now read "X is a file, so nothing can go in it." Nothing else changes.
- Follow-up, left to [51](51-one-agent-command-path.md): the Goal's "path validity runs three times for an agent edit" is not answered here. `worker/mcp.ts` still runs `writablePathProblem` (and write_file's `isMediaUploadWrite` and content check) before `prepareAgentEdit` runs them again; `worker/mcp.ts` is outside this slice's Files, and 51 owns the three layers.
- Tests: `tests/site-rules.test.ts` covers a file as the direct parent and as the grandparent, a folder that is a file or sits in one, and paths with no folder.
- The new wording is pinned at its sites: Files move under a file (direct parent and grandparent, also before the chunk loads) in `tests/file-operations-controller.test.ts`; skipped starter files ("was" and "were") in `tests/setup-actions.test.ts`; the kept original, trimmed copy and sharing copy in `tests/media-originals.test.ts` and `tests/media-workspace.test.ts`; Replace everywhere in `tests/replace-everywhere.test.ts`, with a top-level picture no longer checked against a cut-off name of itself; agent write_file at each depth in `tests/agent-tools-edit.test.ts`; an upload into a folder that is a file, or sits in one, in `tests/media-workspace.test.ts`; and the Files tab's New file field in `tests/native-save/native-create.spec.ts`.

### Follow-ups

- Spec (P2): 16c339e0:docs/wayfinder/clean-up-before-features/build/tickets/41-is-a-file-rule.md:39 — P2: The ticket's `## Done (2026-10-24)` section lists behaviour and tes
- Validation gaps (gap): `src/main.ts:3492`: no test covers the agent new-draft `checkPath` path, where `parentProblem` runs before `branchPathProblem`. Add a test, in `tests/agent-site
- Validation gaps (gap): `src/main.ts:2955` (`branchPathProblem`, without the whole-commit tree): no test pins the `fileInTheWay(at)` wording. Add a case with a snapshot that has `entri
- Validation gaps (gap): `src/native-page-moves.ts:290-293`: the existing tests (`tests/native-page-moves.test.ts:96-97`) only cover a file as the direct parent. Add a grandparent case,

