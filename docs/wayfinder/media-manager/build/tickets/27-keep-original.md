---
title: Keep original
type: task (AFK)
status: open
assignee: claude (mm-27 runner)
blocked_by: [24-media-folders-and-names, 25-image-recipe]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Originals".

- Off by default. When on, a changed file's original goes to `media/originals/` with a matching base, even when the website file went to another Files folder. Unchanged files need no duplicate.
- Hidden personal details (location, camera data) are removed from the kept original; SVG originals lose executable content.
- If the original is over the cap but the website file fits, ask whether to continue without it; never drop it silently or bypass the cap.
- Details link to the original; it is part of the Image family and never used on pages.

## Done when

- `tests/media-originals.test.ts`: path and base, personal details removed, unchanged file not duplicated, over-cap question.
- Nightly in `native-media-adding.spec.ts`: Keep original on, the original appears in details and in `media/originals/`.
