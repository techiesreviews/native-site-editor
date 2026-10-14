---
title: Trimmed copies
type: task (AFK)
status: in-progress
assignee: claude (mm-40 runner)
blocked_by: [24-media-folders-and-names, 25-image-recipe, 05-media-records]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Trimmed copies" and "Replacing and re-cropping".

- In the worker: free trim, zoom, turn, straighten and flip make a **Trimmed copy** for one place, prepared with the site's image recipe and given its own responsive copies.
- Named from the original with `-crop` (`studio-lights-crop.webp`), numbered on conflict. **Every re-crop writes a fresh name** and removes the old one; never overwrite an address (build check).
- `.editor/media.json` records the source and the trim, so re-cropping starts from the full original with the earlier trim restored; details show "Made from <original>".
- On Done, the old trimmed copy is removed if no other place uses it; otherwise a new copy is made so the other place does not change. Until phase 4, removal is today's removal; slice 48 sends it to Recently removed ★.
- The original is never changed.

## Done when

- `tests/trimmed-copies.test.ts`: naming and conflicts, fresh name on re-crop, record of source and trim, shared copy kept for the other place, turn and flip geometry.
