---
title: "Workspace session module, memory adapter and suite (no callers)"
type: task (AFK)
status: closed
assignee: runner-20
builder: claude
landed: "PR #115 (2d6f33b)"
blocked_by: []
---

## Goal

Candidate #1, slice a (Strong; research 01 §1). Build the one owner of "is the editor still on the same workspace and load as when this work began?", with no callers yet. Today: 66 generation guards in 6 files, 58 hand-written "still current?" predicates, three spellings of scope (`draftScope`, `setupScope`, `mediaIdentity`) and six same-workspace comparisons that differ.

## Decided behaviour

- [Ticket 05, item 6](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **one account rule, in the session.** GitHub logins compare ignoring capitals ("Lex" and "lex" are one account). **A local-folder project is a separate workspace kind with no account name**; the session tells the two kinds apart, so folders slot in later without a second rule.
- No user-visible change in this slice.

## Shape (lead's design, from research 01)

`src/workspace-session.ts` owns the load counter, the scope (kind; for GitHub: account, repository id and name, branch, version view) and one `same(a, b)`. Interface: `current()`; `begin()` → a stamp with `holds()` and `changed()` (the guarded edit's `Stamp` becomes, or wraps, this stamp); `next(scope)` to start a new load; derived keys for drafts, setup and media. Nothing else. A memory adapter for tests. Add "Workspace session" to `CONTEXT.md` (user-facing text keeps "project").

## Files

- `src/workspace-session.ts` (new), `tests/workspace-session.test.ts` (new), `tests/fakes/memory-workspace.ts` (optional session field)
- `CONTEXT.md` (one entry), `docs/agents/code-map.md` (one entry)

## Done when

- The suite covers: one account with different capitals; same repository name with a different id (a re-created repository) and the reverse (a renamed one); empty branch; version view; GitHub and local-folder kinds never equal; a stamp's `holds()` is false after `next()`; derived keys equal for `same` scopes.
- Not imported by `src/main.ts` yet (no boot bytes).
- `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-20 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/20-workspace-session-module.md --builder claude-opus-5-5`; `kit wait job slice-20 --timeout 2h`.
- `kit unit tests/workspace-session.test.ts`, then `kit unit --affected`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only), plus the lead's read of the interface. Land: `kit pr --ticket <this ticket>`.
- Report: unit `RESULT:` lines, the interface as landed (one line per member), review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

`src/workspace-session.ts`, no callers yet (not imported by `src/main.ts`):

- `WorkspaceScope`: `{ kind: "github"; account; repoId; repo; branch; view? }` or `{ kind: "folder"; folderId; view? }`.
- `same(a, b)`: account ignoring capitals, repository by id (renamed: same; re-created: not), branch, version view; a folder never equals a GitHub scope; an empty branch (or folder id) equals nothing, itself included.
- `workspaceKeys(scope)`: `drafts`, `setup`, `media` strings, equal whenever `same` holds and across version views of one branch; none for an empty branch.
- `createWorkspaceSession(scope?)`: `current()` (load and scope), `begin()` (a stamp: the `load` and `scope` it began on, so work can finish there after a switch (slices 22/23); `holds()` until the next load; `changed()` says `scope`, `version-view` or `generation`), `next(scope)` (a new load), `keys(scope?)`.
- The session keeps frozen copies of scopes, so a caller changing its own scope object later cannot move a stamp's scope (review round 1, P2).
- `SessionStamp` is assignable to the guarded edit's `Stamp`, so slice 21 can hand it over as is.
- `tests/fakes/memory-workspace.ts`: optional `session`; when given, its load and setup key stand for the generation and scope, and `bumpGeneration` is a reload.

Tests: `tests/workspace-session.test.ts` covers every case in Done when, plus a stamp keeping its load and scope, and a guarded edit stamp on the memory workspace going stale after the session's next load. `kit unit tests/workspace-session.test.ts`: `RESULT: ok unit 10/10` (after review round 1); `kit unit --affected`: `RESULT: ok unit 783/783 (27 files)`; `npm run check` green.

Build route: `kit slice --builder claude-opus-5-5` drafted the files but failed its build step: the Claude builder runs with `--permission-mode acceptEdits`, so every Bash command (doctor, unit, check) was denied, and the model check rejects the run because Claude Code also reports a small `claude-haiku-5-5` call in `modelUsage` (`scripts/agents/agent-run.mjs:132`). Per runner.md's manual fallback for `builder: claude`, the runner (Claude Opus 5.5) checked the draft, added the stamp's `load` and `scope`, ran the checks and committed; review and landing go through `kit review` and `kit pr`.

Design calls for the lead: the version view is part of `same` (switching to an older version is a new scope) but not of the keys; the media key leaves out the load number that `mediaIdentity()` has today (slice 21 adds it where needed); an empty branch is no workspace (equals nothing, no keys); the repository id is always required (the by-name fallback is slice 22's).

Review (`kit review`, GPT-6.1 Sol): round 1 (`.scratch/reviews/runner-20/20261022T080638Z` in the main checkout) found one P2, a stamp sharing the caller's scope object; fixed in the follow-up commit. Round 2 (`20261022T080741Z`): no findings. Rejected: none.
