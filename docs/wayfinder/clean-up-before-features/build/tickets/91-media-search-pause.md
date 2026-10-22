---
title: "Media search waits for a pause in typing"
type: task (AFK)
status: open
assignee: claude runner (lead: this session)
builder: sol
blocked_by: []
---

## Goal

Research 02 (media follow-up): every search keystroke redraws every Media tile (`drawLibraryGrid`, `src/page-builder/media-library-grid.ts`; called from `media-library-input.ts:17` with no pause), about 100 ms per 1,000 tiles.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **Media search waits for a pause in typing.** Lead decision: the grid redraws about 150 ms after the last keystroke; Enter, clearing the search and leaving the field redraw at once; the "N of M files" count follows the redraw. Focus and the caret stay in the search field.

## Files

- `src/page-builder/media-library-input.ts`, `tests/media-library-input.test.ts` (fake timers: three quick keystrokes, one redraw; Enter redraws at once; the timer is cleared when Media closes)
- `src/page-builder/media-library-view.ts` only if the timer must be cleared on close there

## Acceptance checks

- `native-media-library.spec.ts` and `native-media-library-keys.spec.ts` green unchanged (they wait on observable state).
- No `main.ts` change. `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Free-model candidate once T3 lists a verified zero-cost model; until then Sol.

- `kit doctor`; `kit bg slice-91 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/91-media-search-pause.md --builder sol`; `kit wait job slice-91 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-media-library.spec.ts native-media-library-keys.spec.ts`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
