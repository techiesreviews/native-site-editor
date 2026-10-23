---
title: "Controllers, agent menu and media ask the session; guard test"
type: task (AFK)
status: closed
assignee: lead-22
builder: claude
blocked_by: [21-workspace-session-main]
---

## Goal

Candidate #1, slice c (research 01 §1). The rest of the 66 guards and 58 predicates go: controllers, `agent-menu.ts`'s pinned-repository checks, media modules' own load counters, the agent tab checks. A guard test bans hand-written workspace checks outside the session.

## Decided behaviour

- [Ticket 05, item 6](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): one account rule. `save-publish-controller.ts` compares the repository one way (by id; by name only when no id is known).
- No other visible change.

## Files

- `src/controllers/{setup-entry,history,command-palette,media-usage,save-publish,boot}-controller.ts`, `src/setup-actions.ts`, `src/media-batch.ts`, `src/components/agent-menu.ts`, `src/controllers/agent-controller.ts`
- `src/agent-tools-edit.ts`, `src/agent-tools-read.ts`, `src/agent-tools-media.ts` (their repo/branch/commit compares)
- Media place modules with their own "still current?" predicates (`src/page-builder/media-*.ts`, as found)
- The agent owner's receiving-tab "generation" (`src/agent-owner.ts`, `src/agent-transport.ts`, `src/agent-records.ts`) is renamed `fence` (lead decision), so "generation" means one thing
- `tests/workspace-session-guard.test.ts` (new; TypeScript API like `tests/guarded-edit-reads.test.ts`): fails on a load-counter or scope compare, or a hand-written same-workspace compare, outside `src/workspace-session.ts`; allowlist entries carry file, function, reason and count
- Affected unit tests; `tests/guarded-edit-reads.test.ts` (its allowlist shrinks)

## Done when

- The guard test is green, with a broken fixture showing each rule fires.
- `guarded-edit-reads` allowlist entries for load epochs the session now covers are gone.
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-22 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/22-workspace-session-callers.md --builder claude-opus-5-5`; `kit wait job slice-22 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` (agent, media and save specs), `kit size` if `main.ts` imports change.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: guards and predicates left (count, each allowlisted with a reason), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling if changed.

## Done (2026-10-23)

Controllers, the agent menu and tools, and the media history ask the workspace session (`src/workspace-session.ts`):

- One repository rule in the session: `same` and the new `sameBranch` compare the repository by id, and by name (ignoring capitals) only when an id is not known; a repository known only by name has no keys. `sameBranch` is the account-free part, for work within one account (grants, approvals, the agent tab).
- `save-publish-controller.ts` compares the repository one way: the head check and the refresh after a save ask `same` (by id; capitals in the login ignored). Before, the refresh compared the name, so a renamed repository skipped its refreshed snapshot. `checkDeleted` and `findDeletedUpstream` take a stamp; the `generation` port is gone.
- `boot-controller.ts` and `setup-actions.ts` hold a stamp (`begin()` port) instead of a load number; `loadRepositories`' `onStarted` hands over the stamp.
- The agent menu's pinned-repository checks (moves, grants, approvals, `live`, Move agents here, Connect) and its workspace checks (history reads and their follow-up, kept requests, startup marks, the request watch, Ask agent, answers, export) ask `sameBranch` and `same`; the workspace key is left only as a storage and BroadcastChannel name. `agent-controller.ts`'s approval check asks `sameBranch` (approvals carry no id, so by name).
- Agent tools: the edit, read and media checks rely on the stamp for the repository and branch and keep the commit check; the file reader and the transport's command admission ask `sameBranch`; the transport's workspace move and socket-message checks and the agent owner's command checks ask `same`.
- The media history home holds each step's stamp instead of `mediaIdentity()`; `media-batch.ts` lost its `mediaIdentity` port.
- The agent owner's receiving-tab fence is `fence` in the tab's code (`createAgentOwner({ fence })`, `owner.fence`, `AgentCommit.fence`, `records.setFence`, the transport's ports). Its stored and wire name stays `generation` (IndexedDB workspace records and receipts, the localStorage owner hint, the relay's `generation` parameter and the shared `ownerGeneration`), as renaming those needs a data migration and Worker changes.
- Counters that are a controller's own lifetime, not the workspace load, are named so: `mounts` (setup wizard, palette, agent controller), `openings` (History panel), `checks` (media usage), `historyReads` (agent menu).

Guard: `tests/workspace-session-guard.test.ts` fails on a load-counter compare (`generation` in any spelling, `currentLoad`, a stamp's `load`, a port's `epoch()`), a scope-key compare (`setupScope`, `draftScope`, `mediaIdentity`, `scopeKey`, `setupKeyOf`, `workspaceKey`, a port's `scope()` or `identity()`) or two workspaces compared field by field (the same `repoId`, `branch`, `account`, `full_name`, `fullName` or `repo` on both sides, a repository name against another spelling of it, or an `id` against a `repoId`) outside the session module; a repository list looked up by `id` against `id` is not flagged. Fixtures show each rule fire and not fire, and that an allowlist entry covers exactly its count. 57 entries (80 compares), each with file, function, reason and count: 32 entries (43 compares) are not the workspace load or a workspace compare (the fence's stored name, agent records kept under their workspace key in IndexedDB, `fileGeneration`'s file selections, the preview frame's load count, agent recovery's counter, the guarded edit's own stamp and commit, the boot plan's lookup of a remembered repository id in the listing); 25 entries (37 compares) are follow-ups outside this ticket's files: `files-tree-controller.ts`, `preview-selection-controller.ts`, `setup-checklist-controller.ts`, `media-actions.ts` (`mediaIdentity` caches), `drafts.ts`, `publish-menu.ts`, `boot-memory.ts` (its name rule beside `same`), `shared/agent-requests.ts`, and in `main.ts` the `stampOf` bridge and the agent-command, new-draft and boot-guess compares. Media proofs still carry a load number to `restoreFile` (no compare).

`tests/guarded-edit-reads.test.ts`: the 13 stale-compare entries for these controllers' load epochs and lifetimes are gone; preview selection's 3 stay.

Tests: `tests/workspace-session.test.ts` covers the by-name rule; `tests/save-publish-controller.test.ts` proves a renamed repository and a login in other capitals refresh after a save, and a re-created repository of the same name does not; `tests/media-history-home.test.ts` drops steps of an earlier load or another branch; `tests/boot-controller.test.ts` and `tests/setup-actions.test.ts` run on a real session; the agent tests use the `fence` names.


Checks: `kit unit --affected` `RESULT: ok unit 2530/2530 (160 files)`; `kit unit tests/workspace-session-guard.test.ts` `RESULT: ok unit 6/6`; `npm test` 5056 tests, 5056 pass; `npm run check` and `npm run lint` green; `kit specs --affected` `RESULT: ok specs 152/152 passed`. `main.ts`: 5699 lines (ceiling 5700).

Review round 1: the agent menu's remaining workspace-key checks and the transport's and owner's ask the session; the guard also flags `workspaceKey` compares and repository fields under different names. Tests added: a re-created repository gets no head (`tests/save-publish-controller.test.ts`); the agent menu's repository checks in its shapes (renamed repository stays pinned and keeps its grants, an approval matches by name in any capitals) in `tests/workspace-session.test.ts`; a command without the repository id is refused even when it names the repository (`tests/agent-transport.test.ts`). Checks: `kit unit --affected` `RESULT: ok unit 2531/2531 (160 files)`; `npm run check` and `npm run lint` green; `kit specs` (the six native-agent specs) `RESULT: ok specs 6/6 passed`; `kit size` `RESULT: ok size boot 342 KB (±0 KB) vs dev@398776b, budget 355 KB`.
