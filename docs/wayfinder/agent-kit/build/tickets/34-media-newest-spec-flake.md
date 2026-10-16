---
title: "native-media-newest spec: tile detaches during scrollIntoViewIfNeeded (flaky)"
type: task (AFK)
status: closed
assignee: ak-34
blocked_by: []
builder: sol
---

## What

`tests/native-save/native-media-newest.spec.ts:50`, "a file added on a desktop leads Media, wears a
ring and shows when it was added", fails about 1 run in 3 on plain dev (2026-10-16, found during
ticket 20's `kit pr`): `locator.scrollIntoViewIfNeeded: Element is not attached to the DOM`. The tile
is probably re-rendered after the add (newest-first reorder or the "added" ring) between locating and
scrolling.

- Find which re-render detaches the tile; wait on the settled state (for example the ring or the
  "added" time on the new tile) through a locator that re-resolves, instead of holding an element.
- If the product re-renders the whole grid when one tile changes, say so in the Done notes (that may be
  a performance follow-up), but fix only the test unless the product is wrong.
- No fixed waits, no raised timeouts, no known-failures entry.

## Files

- `tests/native-save/native-media-newest.spec.ts`

## Done when

- The test passes 10/10 (`--repeat-each=10`) through `port.sh`, also beside another suite.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-17)

- **Cause.** After an addition the tray paints "Added 14 files" when the files are saved, *before*
  `await h.refresh()` redraws the grid (`media-library-adding.ts`). The test then resolved
  `cards().last()` to the pre-refresh `images/studio-desk.svg` card; Playwright holds that element for
  `scrollIntoViewIfNeeded`, and the refresh's `drawLibraryGrid` (`grid.replaceChildren()`) detached it.
  The trace shows the locator resolving to the old card 45 ms after the status turned "Added".
- **Fix (test only).** Before scrolling, wait for the 14 ringed tiles
  (`.media-library__card.is-new` count 14): the ring is set by `added()` → `showFresh()` only after the
  refresh redraw, so the grid is settled. No fixed waits, no raised timeouts, no known-failures entry.
- **Product note.** Any library refresh redraws every tile (`drawLibraryGrid` rebuilds the grid),
  so one change re-renders all cards. Not wrong, but a possible performance follow-up for big libraries.
- **Tests.** Repro on dev: 3/10 failed at line 29 (detached). With the fix, whole spec x10 alone: 40/40;
  beside `native-media-adding/library/tiles/pane` (x3): first run 37/40, the 3 failures were
  "Adding 14 files" still preparing after 15 s (screenshot: 12 Ready, 1 Preparing, 1 Waiting) at a
  machine load of 35–130 from other runners, not the detach; rerun beside the same suite 40/40,
  neighbour 189/189. The detach did not recur in 120 runs.
- **Review.** Sol (`kit review`): no defects, no gaps, no nits.
- **Commits.** 005ce2ea (spec fix), plus this close.
