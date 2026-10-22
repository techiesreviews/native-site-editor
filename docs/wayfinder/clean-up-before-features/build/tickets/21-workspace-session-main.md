---
title: "main.ts guards and the editorWorkspace adapter ask the session"
type: task (AFK)
status: open
assignee: lead-21 (this session)
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
