---
title: "Boot and snapshot leave main.ts; boot-memory limits 2 and 3"
type: task (AFK)
status: closed
assignee: lead-25
builder: claude
blocked_by: [22-workspace-session-callers]
---

## Goal

Shrink `main.ts` (about −400) and close two boot-memory limits ([TD 06](../../../../work/tech-debt/issues/06-boot-memory-limits.md)). `loadSnapshot`, the boot guess (`dropBootGuess`, `startBootGuess`, `takeBootGuess`), `chooseRepository` and `restoreFile` (about lines 4769–5164 at `89ac5e0e`) move into a boot module that takes the session as a port.

## Decided behaviour

- [Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): remembering the last site until sign-out stays as it is.
- TD 06 limit 2: a guess taken before the repository selection is cleared is abandoned (the session's `next()` makes the stamp stale; its snapshot then writes nothing, not even the clean-source cache).
- TD 06 limit 3: sign-out clearing the memory gets a browser test; `sessionTag()` gets a unit test.
- No other change; TD 06 limits 4–7 are accepted design.

## Files

- `src/main.ts` (4769–5164), new `src/workspace-boot.ts` (name is the builder's; one entry in `docs/agents/code-map.md`)
- `src/controllers/boot-controller.ts`, `src/boot-memory.ts`
- `tests/workspace-session-guard.test.ts`: its allowlist entries for the moved functions name the new file (added while building; the guard fails otherwise)
- Tests: `tests/boot-controller.test.ts` (`sessionTag`), `tests/boot-memory.test.ts`, new unit tests for the boot module; `tests/native-save/native-boot-memory.spec.ts` (guess abandoned when `loadRepositories` clears the selection; sign-out posts `/auth/logout` and the memory is gone); `tests/main-ts-ceiling.test.ts`

## Done when

- CODING_STANDARDS "Racing and speculative reads": the moved code keeps its settle matrix; each row still has its spec.
- A moved function keeps its body (CODING_STANDARDS); any change is named in the commit message.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 23.

- `kit doctor`; `kit bg slice-25 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/25-boot-and-snapshot.md --builder claude-opus-5-5`; `kit wait job slice-25 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-boot-memory.spec.ts native-boot-parallel.spec.ts native-boot-requests.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-23)

- `restoreFile`, `loadSnapshot`, the boot guess and `chooseRepository` moved to `src/workspace-boot.ts` (`createWorkspaceBoot`); `src/main.ts` hands in the session, DOM and native-site state as live ports (getters) and keeps the three names. `main.ts` 5699 → 5345 lines; ceiling 5350. Boot bundle 342 → 343 KB (budget 355).
- Bodies kept; changes beyond `ports.` prefixes: `info.user` reads `ports.user`; `location.origin + location.pathname` reads `ports.source()`; `boot.draftsReady()`/`boot.sessionTag()` are ports; the DOM helper `node` is a port (node tests cannot load `src/ui/dom.ts`); `GUESS_AFTER_FAILED_LIST_MS` is exported for the unit test; the boot port's `bootGuess = undefined` is `workspaceBoot.forgetGuess()`.
- TD 06 limit 2: `loadRepositories` abandons a taken guess before its next load (`abandonGuess`, split out of `dropBootGuess`), so a guess that lands after a new listing cleared the selection seeds nothing, not even the clean-source cache. A guess fed to its own snapshot load (branch list first) still seeds, as before.
- TD 06 limit 3: `sessionTag()` unit test (`tests/boot-controller.test.ts`); browser test: sign-out posts `/auth/logout` and no `ase:boot-memory:` record is left.
- Tests: `tests/workspace-boot.test.ts` (proven guess, cleared selection, branch list first, dropped guess, other session tag, no tag, failed branch list at the bound); `native-boot-memory.spec.ts` gains the cleared-selection row (fails without the fix) and the sign-out row. Decision: `tests/workspace-session-guard.test.ts` joined Files, since its allowlist names each moved function's file; its four entries now name `src/workspace-boot.ts`.
- A file batch from a guess abandoned after its snapshot won is not cached: the file is read afresh. Unit rows: that ordering, and `dropGuess` (sign-out) while a taken guess is held. Browser row (`native-boot-memory.spec.ts`): the guessed batch and the first branch list held, the guess wins, a new listing clears the selection, the batch is released; reopened, the page is read afresh with no guessed content (fails without the fix). `dropGuess` has no browser row: sign-out leaves the page (`location.assign`), and so does signing in again after the only other in-page `renderLogin` (401, expired), so the page's cache cannot outlive either.
- Pinned as it was before this slice (unit row): another branch picked while a taken guess is held does not abandon it, so its proven files still seed the cache (correct content, keyed by SHA); the superseded load installs nothing.
- Not done: a stamp check in place of the abandon flag. `chooseRepository`'s stamp stops holding when its own `loadSnapshot` starts, so a guess still landing behind a branch list that came first would no longer seed.
