---
title: "Boot and snapshot leave main.ts; boot-memory limits 2 and 3"
type: task (AFK)
status: open
assignee:
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
