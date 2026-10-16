---
title: "native-media-newest spec: tile detaches during scrollIntoViewIfNeeded (flaky)"
type: task (AFK)
status: open
assignee:
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
