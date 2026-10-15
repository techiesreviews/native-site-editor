---
title: Tiles, list view, selection bar and the phone One bar
type: task (AFK)
status: open
assignee:
blocked_by: [104-media-panel-size]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#media-tiles-gallery-and-one-bar-a-01-to-a-08): Media gallery, list view, selection, picker tiles.

- Heavy pictures (over the preview limit, such as the 2.1 MB JPEGs) show a downscaled picture on their tile and list row, not a grey "JPG" document icon.
- The tile's top shade shrinks to a 36 px band at about 35 % strength (number keeps 4.5:1). Tiles read as photos first (Google Photos / Apple Photos: white glyphs, no chip).
- Phone One bar: the Collections trigger shows the short name ("All", "Garden") with `max-inline-size: 40%`; search takes the rest, so typed words are not cut.
- The by-agent mark on a tile gets the To check icon and the label "Written by an agent – check in To check".
- List view: a fixed 48 px thumbnail column (icon on `--surface-subtle` when there is no picture) so every name lines up; the count shows once, as words ("Used on 1 page", "Not used").
- Phone selection bar: one 56 px row: "✕ 3" (clear and count), Add to collection, ⋯ (Remove files… last). Wider screens keep their one row.
- Pictures with transparency and pictures wider than 2:1 show whole (`object-fit: contain`) on the checkerboard from slice 106; photos stay cropped.

## Done when

- Specs: a heavy JPEG tile has an `<img>`; list rows' name columns share one x position; the phone search field is at least 55 % of the bar.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
