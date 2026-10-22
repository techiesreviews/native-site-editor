---
title: "Media refresh redraws only changed tiles"
type: task (AFK)
status: closed
assignee: lead-92
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

## Done when

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

## Done (2026-10-22)

- A Media redraw (refresh, filter, search, selection) keeps each tile by path (online videos by key) while its look is the same: name, type, still, length, Always keep, By agent, layout, picker or pane, and its picture's version and cache stamp. Kept tiles keep their element and loaded picture; changed ones are rebuilt, gone ones removed, new ones added, and tiles move only when out of the list's order (behind any tiles of files being added).
- Selection rounds, the picker's choice, usage badges and the list's size repaint in place on kept tiles, so a checkbox keeps focus when ticked; a size learned from a loaded picture survives a refresh. Only new or rebuilt tiles get a picture observer; a dropped tile's observer is disconnected.
- The view stamps each file when the byte cache drops it or is cleared (Replace, Optimise, rename: every tile still redraws there), so those tiles load their picture again. Adding files no longer clears the cache (new files take free names): the tiles already shown keep their pictures. Each refresh drops cached bytes for paths that newly appear, so a removed file's name taken again never shows the old picture. The new-file ring is removed once it has played, so a kept tile that moves later does not replay it. A focused control (thumbnail, round or usage) on a tile that moves keeps focus without scrolling.
- Measured with a throwaway browser probe through `kit specs` (deleted after; old and new grid alternating in one run, 3 × 5 redraws each, two animation frames included): 1,000 tiles, refresh with one changed file: before median 114 ms (100–218 ms), after median 25 ms (19–47 ms).
- Tests: new `tests/native-save/native-media-tiles-in-place.spec.ts` (one changed file rebuilds one card and adds one observer; reorder keeps every card and adds no observer; tiles of files being added stay first; selection and the picker's choice repaint in place; a dropped cache entry rebuilds; list layout redraws; the empty message shows once and goes). `native-media-library.spec.ts`: a refresh keeps the same cards, the focused tile and the scroll position.
- Review round 1: `native-media-tiles-in-place.spec.ts` types its fakes (`satisfies LibraryGridShell`, `LibraryGridHost`, `LibraryGridState`; the grid now takes only the frame parts it draws into) and adds a moved tile keeping focus on its thumbnail and its round, a loaded size kept through a refresh, and online video tiles kept, then rebuilt when their uses change. `native-media-library.spec.ts` adds: adding a file in Media keeps every earlier tile and its picture (fails with the old cache clear), and the new file's ring is gone on a redraw after it played.
- `native-media-tab.spec.ts` (two tests): their sign that a refresh ran was the first tile leaving the page, which no longer happens; they now wait for the file count's text to be written anew, which every draw does.
- Validation: `kit doctor` 7/7; `npm run check` and `npm run lint` pass; `kit unit --affected` 1275/1275 and `kit unit` 4953/4953; `kit specs --affected` 40/41 before the `native-media-tab.spec.ts` change (only those two tests failed), then `kit specs native-media-tab.spec.ts native-media-library.spec.ts native-media-library-keys.spec.ts native-media-tiles-in-place.spec.ts` 4/4 (44 tests); `kit shots media-gallery media-select --compare dev`: no layout findings.
- No `main.ts` change.
- Review round 1 validation: `kit doctor` 7/7; `npm run check` and `npm run lint` pass; `kit unit --affected` 1275/1275; `kit specs native-media-tiles-in-place.spec.ts native-media-library.spec.ts native-media-library-keys.spec.ts native-media-tab.spec.ts native-media-adding.spec.ts native-media-newest.spec.ts native-media-pane.spec.ts` 7/7 (91 tests).
- Review round 2: a ring still playing on a kept tile keeps its place through a redraw (its delay is set from the time it has already played); a new or moved tile's ring starts at its age. Tests: `native-media-library.spec.ts` checks the ring's position after a redraw 600 ms in matches the time shown (failed with the old delay); `native-media-tiles-in-place.spec.ts` adds a removed file's name taken again by other bytes (no version) loading the new picture on a new tile (failed without the drop), a picker refresh keeping a held file's tile first with focus on its Cancel, and newer usage repainting a kept tile's badge.
- Review round 2 validation: `kit doctor` 7/7; `npm run check` and `npm run lint` pass; `kit unit --affected` 1275/1275; `kit specs native-media-tiles-in-place.spec.ts native-media-library.spec.ts native-media-library-keys.spec.ts native-media-tab.spec.ts native-media-adding.spec.ts native-media-newest.spec.ts native-media-pane.spec.ts` 7/7 (93 tests).
- Commits (subjects; SHAs change when the PR rebases): "Media refresh redraws only changed tiles" (1ceba480), "Review fixes round 1" (8f209a7c), "Review fixes round 2".
- Review decisions: round 1 P1 (adding redrew every picture), P2 (focus on a moved round), P2 (untyped fakes) and P3 (fixture group) fixed, with the five validation gaps covered. Declined: a longest-increasing-subsequence ordering pass (a moved tile keeps focus and its ring, so fewer moves change nothing visible); repainting an online video's usage in place (rare, and its rebuild is tested). Round 2 P2 (ring ran ahead on kept tiles) fixed, with the four validation gaps covered; the `onlineTile` comment nit taken. Declined: a test-only draw counter for `native-media-tab.spec.ts` (the count line's text node is written on every draw; a counter would be a port only tests use).
