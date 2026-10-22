---
title: "Media refresh redraws only changed tiles"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [91-media-search-pause]
---

## Goal

Research 02 (media follow-up): `drawLibraryGrid` (`src/page-builder/media-library-grid.ts:48`) disconnects every observer, empties the grid (`grid.replaceChildren()`) and builds every card again on each library refresh, filter and selection change. About 100 ms per 1,000 tiles, 268 ms for 3,000.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **a refresh redraws only changed tiles.** Tiles are kept by path; a tile whose file, usage, marks, selection and picture are unchanged keeps its element (and its loaded picture); new ones are added and gone ones removed, in order. Visible result: no blink of pictures already shown, keyboard focus stays on the tile it was on, scroll position stays.

## Files

- `src/page-builder/media-library-grid.ts` (keyed update), `src/page-builder/media-library-view.ts` (calls), the tile builder module it uses
- Tests: unit tests on a DOM fake or a browser probe (a refresh with one changed file rebuilds one card; order follows the new list; observers are reconnected only for new tiles); `tests/native-save/native-media-library.spec.ts` (focus and scroll kept across a refresh)

## Acceptance checks

- A measurement in the Done section: 1,000 tiles, refresh with one change, before and after (the research's probe method, through `kit specs`, deleted after).
- Selection, filter, list or grid layout and the picker's choose mode still draw correctly.
- No `main.ts` change. `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-92 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/92-media-tiles-in-place.md --builder sol`; `kit wait job slice-92 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-media-library.spec.ts native-media-library-keys.spec.ts`.
- `kit shots media-gallery media-select --compare dev` (nothing should look different).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: the timing before and after, shots contact sheet, unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
