---
title: "main.ts guards and the editorWorkspace adapter ask the session"
type: task (AFK)
status: closed
assignee: lead-21
builder: claude
blocked_by: [20-workspace-session-module, 11-lazy-media-and-pages]
---

## Goal

Candidate #1, slice b (research 01 §1). `main.ts`'s `let generation`, its four bumps, `draftScope()`, `setupScope()`, `mediaIdentity()` and its 32 `epoch !== generation` guards become the session; `WorkspaceHost.generation/setupScope/draftScope` become one `session` port.

## Decided behaviour

- [Ticket 05, item 6](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): one account rule. The case-sensitive account comparisons in `main.ts` (about lines 2558, 4472 and 5540 at `89ac5e0e`) now ignore capitals, so drafts and the setup checklist are never hidden by a login's capitals.
- Otherwise no change: work a switch stops today still stops (slice 23 changes that).

## Files

- `src/main.ts` (every region; the guards concentrate in 1046–1800, 3600–4416 and 4836–5650 at `89ac5e0e`)
- `src/editor-workspace.ts`, `src/guarded-edit.ts`, `src/draft-store.ts` (the `:974` rule), `src/boot-memory.ts` (the `:92` rule)
- Affected unit tests (`tests/editor-workspace.test.ts`, `tests/guarded-edit.test.ts`, `tests/boot-memory.test.ts`, draft-store tests); `tests/main-ts-ceiling.test.ts`; `docs/agents/code-map.md`

## Done when

- No `generation` variable or `epoch !== generation` compare left in `main.ts`; the lazy setup adapters (about 5622–5650) ask the session.
- A test proves a login differing only in capitals keeps its drafts and its setup checklist.
- `kit size` at or under 355 KB.
- `npm run check`, `npm test`, `kit specs --affected` green; shared plumbing, so land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Runs alone in `main.ts`.

- `kit doctor`; `kit bg slice-21 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/21-workspace-session-main.md --builder claude-opus-5-5`; `kit wait job slice-21 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` (expect boot, save, media and agent specs), `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: guards removed (count), `kit size` KB, unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and new ceiling.

## Done (2026-10-23)

`src/main.ts` asks the workspace session (`src/workspace-session.ts`) whether work still holds:

- `let generation` is gone. `workspaceSession` owns the load counter; signing out, `loadRepositories`, `chooseRepository` and `loadSnapshot` each start the next load through `nextLoad(scope)`; `loadSnapshot` names the account, repository and branch it opens.
- All 58 load compares (`epoch !== generation` and its spellings) became stamps (`workspaceSession.begin()`, `holds()`), and the 13 `setupScope()` compares beside them went: within one load the scope only goes from none to the loaded one. `restoreFile`, `openEntry`, `mountSource`, `activateNativeSite` and `startNativeTextIndex` take a stamp; controllers keep their load number (`currentLoad`, `stampOf`) until slice 22. The history aliases, shares and add points hold a stamp. The lazy setup adapters (`writeSiteSettings`, `writeStartingPoint`) ask the session.
- `draftScope()` and `setupScope()` derive from the session's scope once its snapshot is on show (`shownScope()`); `mediaIdentity()` reads the session's load. New helpers in the session module: `githubScope` and `draftScopeOf`.
- One account rule: the six account compares in `main.ts` (history capture, `adoptNativeBaseSources`, Site actions tracking, `awaitNativeResync`, the agent text refresh, the drafts baseline) use `same`, so "Lex" and "lex" are one account. The draft store's unsaved-drafts rule (`drafts`) and boot memory's `memoryMatches` use `same` too.
- `WorkspaceHost.generation/setupScope/draftScope` are one `session` port; `restore` takes a stamp.
- `main.ts`: 5700 lines (ceiling lowered from 5730 to 5700).

Tests: `tests/editor-workspace.test.ts` runs on a real session and proves a login differing only in capitals has the same draft keys and setup key; `tests/draft-store.test.ts` and `tests/boot-memory.test.ts` add capitals cases; `tests/workspace-session.test.ts` covers `githubScope`/`draftScopeOf`. `kit unit --affected`: `RESULT: ok unit 2297/2297 (146 files)`; `npm run check` green; `kit size`: `RESULT: ok size boot 342 KB (±0 KB) vs dev@dfc8714, budget 355 KB`.
`kit specs --affected` (146 files): `RESULT: fail specs 1 of 146 failed: native-agent-quiet.spec.ts` (the live Watch test saw no `wait_for_requests` frame under four shards); alone, `kit specs tests/native-save/native-agent-quiet.spec.ts`: `RESULT: ok specs 1/1 passed` (9 passed).
