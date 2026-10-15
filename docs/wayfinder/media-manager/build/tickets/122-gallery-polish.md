---
title: Gallery polish from Lex's review
type: task (AFK)
status: open
assignee: claude (mm-122 runner)
blocked_by: [121-count-and-flip]
builder: claude
phase: 9
---

## What

Lex reviewed the preview editor (dark theme, 1600 px window) on 2026-10-15 and annotated six things in the Media gallery and the top bar:

1. The Media tab's number ("156"): "remove this". The Media tab shows no number. Clean up and Improve images keep their counts inside More. This reverses the badge agreed in map ticket 11 and slices 49, 74 and 121.
2. The Page button's blue dot: "remove the blue indicator". Remove it, with its screen-reader note.
3. A gallery tile: "show on hover". On devices with hover, a tile is just the picture; the name band, the usage number and the select circle appear on hover, on keyboard focus, when the tile is selected, and on every tile while any selection is active. On touch devices (no hover) the select circle and number stay but the name band goes. Slice 103's ring stays.
4. The One bar: "add more spacing between the searchbar and the images." More room under the bar, on the panel's own spacing rhythm.
5. The Filter button showing "All": "Give the title of a filter a better distinction". It reads as a filter with its current value (a muted "Filter" label and the value), the same at 390, 768 and 1280.
6. The selection bar: "improve the design for this, it's too thick". A slimmer bar (about 44–48 px), a quieter background, text-style actions, Remove files as a quiet destructive action; one row at every width.

## Done when

- Specs that asserted the badge or the dot are updated on purpose; specs for the hover tile, the Filter label and the slimmer selection bar.
- Shots at 390, 768, 1280 and 1600, light and dark, before and after.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
