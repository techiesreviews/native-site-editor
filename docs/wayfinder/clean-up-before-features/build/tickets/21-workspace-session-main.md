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
- One account rule: the six account compares in `main.ts` ask the session, so "Lex" and "lex" are one account. `adoptNativeBaseSources`, Site actions tracking, the agent text refresh and the drafts baseline use `holdsDraftScope` (the session's `same`). History capture and `awaitNativeResync` use the stamp (`holds()`, `changed()`), whose scope compares the session's lowercased identity. The draft store's unsaved-drafts rule (`drafts`) and boot memory's `memoryMatches` use `same` too.
- `WorkspaceHost.generation/setupScope/draftScope` are one `session` port; `restore` takes a stamp.
- `main.ts`: 5700 lines (ceiling lowered from 5730 to 5700).
- Two more compares the one-load rule covers went too: `startNativeTextIndex`'s repository name and the starter banner's branch. `awaitNativeResync` is a little stricter: work begun before a load's snapshot showed now refuses on a branch change (the old check let it through), so work a switch stops still stops.
- The shown scope's branch is the one the load asked for: the Worker's snapshot answers with the requested branch, the empty-repository one included (`worker/github.ts:868`). `native-onboarding.spec.ts` saves an empty repository's first commit and then a second save after the snapshot `adopt` ("a second save works after the snapshot refresh of the first one failed"). `kit specs tests/native-save/native-onboarding.spec.ts`: `RESULT: ok specs 1/1 passed` (20 passed).

Tests: `tests/editor-workspace.test.ts` runs on a real session and proves a login differing only in capitals has the same draft keys and setup key; `tests/draft-store.test.ts` and `tests/boot-memory.test.ts` add capitals cases; `tests/workspace-session.test.ts` covers `githubScope`/`draftScopeOf`. `kit unit --affected`: `RESULT: ok unit 2297/2297 (146 files)`; `npm run check` green; `kit size`: `RESULT: ok size boot 342 KB (±0 KB) vs dev@dfc8714, budget 355 KB`.
Review fixes: the stand-in stamp for a controller's stale load number says the scope changed (its scope is unknown); `setupKeyOf` and `holdsDraftScope` in the session module are the one setup key and the one "this draft scope is on show" rule, used by `main.ts` and the editor workspace; `activateNativeSite` reads `draftScope()`. Tests added: `tests/drafts.test.ts` installs the baseline rule for "Lex" and proves a draft saved as lex with GitHub's text is dropped (the old case-sensitive rule kept it); `tests/workspace-session.test.ts` pins that a stamp begun while a load runs holds once its snapshot shows, until the next load, and that work begun with nothing open sees a later load as another scope (so `awaitNativeResync` refuses then).

Checks on the final code: `kit size` `RESULT: ok size boot 342 KB (±0 KB) vs dev@dfc8714, budget 355 KB` (on `725ce545`); `kit unit --affected` `RESULT: ok unit 2310/2310 (147 files)`; `npm test` 5046 tests, 5046 pass, 0 fail; `npm run check` and `npm run lint` green; `kit specs --affected` `RESULT: ok specs 146/146 passed`. An earlier `kit specs --affected` run gave `RESULT: fail specs 1 of 146 failed: native-agent-quiet.spec.ts` (the live Watch test saw no `wait_for_requests` frame under four shards), and it passed alone (`RESULT: ok specs 1/1 passed`). Ticket 93, which does not touch `main.ts`, recorded the same failure under shards and the same pass alone.

Round 3 tests: `tests/setup-checklist-controller.test.ts` signs in as "Lex" over setup memory saved as lex and sees the name ticked, with the view's key equal to lex's; `tests/editor-workspace.test.ts` takes a stamp through `open` while the snapshot is not shown, shows it without a load (the stamp holds), then loads again (it stops). `kit unit --affected` `RESULT: ok unit 2317/2317 (148 files)`.

Commits: `95346ceb` (main.ts guards and the editor workspace ask the session), `725ce545` (review fixes round 1), `b4532e1a` (round 2 record), and round 3's tests.

### Follow-ups

- Spec (P3): 95346ceb:src/main.ts:1316 — P3: The goal says `draftScope()` should come from the session. `openSecondary` still builds its own draft scope from live state (`in
- Validation gaps (gap): `stampOf` (`src/main.ts:210`) has no test. It turns a controller's stale load number into a stand-in stamp that never holds and reports `changed() === "scope"`.
- Validation gaps (gap): The stricter `awaitNativeResync` (`src/main.ts:4527`) is only proven at session level (`tests/workspace-session.test.ts`, "work begun with nothing open…"). An a
- Validation gaps (gap): `memoryMatches` (`src/boot-memory.ts:93`) changed for an empty branch. `branch === ""` with `memory.branch === ""` used to match; now it does not, because an em
- Validation gaps (gap): The new stamps follow the Async writers rule (CODING_STANDARDS.md, "Tests prove it with `tests/support/await-race.ts` (`forEachAwait`)"), but `forEachAwait` was

