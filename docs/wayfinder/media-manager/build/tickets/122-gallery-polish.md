---
title: Gallery polish from Lex's review
type: task (AFK)
status: closed
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

## Done (2026-10-16)

**Lex reversed the agreed badge.** Map ticket 11 and slices 49, 74 and 121 put a count on the Media tab (Clean up + Improve images) and a dot on the page button. Lex asked on 2026-10-15 to remove both. The Media tab now has no number, the page button has no dot, and nothing is announced to screen readers either. Clean up and Improve images keep their counts in More ("Clean up (2)", "Improve images (1)"), still from one settled check (slice 121). Clean up's Dismiss button only hid that number, so it went too, with the remembered dismissals. The spec and map record the change.

**Behaviour.**
- Tiles (with a mouse): just the picture. The top band, usage number, select circle and name come in on hover, on keyboard focus, when the tile is selected, and on every tile while anything is selected. This includes a selected file that search or Filter hides, because the rule follows the selection bar. Touch keeps the number and circle and drops the name band; keyboard focus still shows it. The list view, Clean up's review grid and the picker's chosen tile are unchanged. Slice 103's just-added ring, the Always keep and By agent marks, and a video's length stay.
- One bar: 16 px between search and the tiles, the same as the picker. The bar's own bottom padding had been overridden to 0, so the gap was 4 px.
- Filter: a muted "Filter", then the current choice in the text colour at normal weight ("Filter All", "Filter Garden · Video") at 390, 768 and 1280. The funnel icon went. Phones give Filter, + and More up to 60 % of the bar (it was 55 %), so search keeps at least 45 %.
- Selection bar: about 46 px (it was 61) and one row at every width. It sits on the panel's surface with a hairline edge. The actions are text buttons with 44 px targets. Remove files comes last, set apart, in the danger colour. Phones keep "✕ 2", Add to collection and ⋯, which holds Take out and Remove.
- References: Mobbin, Savee, Krea, Higgsfield and Grok for slim selection bars; Dropbox's "Sort by: Most relevant" for a label and its value.

**Commits.** a531d829 claim; c6d0aa7c the slice; 4f423402 Filter at every width (review round 1); 9e5260a5 controls while a hidden file is selected (review round 2). Rebased onto slices 123 and 125. Both added a Phase 9 table, now merged into one.

**Tests.**
- Unit: `media-badge.test.ts` became `media-clean-up-menu.test.ts` (the More items). `media-clean-up-controller.test.ts` drops the badge and Dismiss cases and checks More's counts.
- Browser:
  - `native-media-badge-sum.spec.ts` became `native-media-more-counts.spec.ts`: More's counts hold on every Media screen, and no count mark is ever added.
  - `native-media-cleanup`: counts come from More, the tab and page button show none, and there is no Dismiss.
  - `native-explorer-size`: no dot.
  - `native-media-tab`: the band, number, circle and name hide and show for hover, focus, selection, selection elsewhere and a search-hidden selection. Touch keeps the number and circle and drops the name. At 390, 768 and 1280, Filter shows its label and value whole in distinct colours, and the gap under the bar is 16 px.
  - `native-media-tiles`: selection bar at most 48 px; on wide screens it is on the panel surface with plain buttons, 44 px targets, and Remove last in the danger colour.
  - `native-media-picker`: the phone picker's Filter label.
  - `native-media-screen`: the tile marks.
- Results:
  - After the rebase, `npm run check` and `npm run lint` pass; unit 3488/3488.
  - Browser:
    - Media tab, tiles, screen, picker, Clean up, More counts, explorer size, collections and touch-contrast specs: 92/92 after the rebase.
    - Library, pane, keys, numbers, Improve images and adding: 104 passed in one run. The two failures were the phone Filter, fixed and rerun green.
    - A first parallel run failed only because two runs shared one results folder.

**Review (GPT-6.1 Sol, read-only, evidence `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-122/round-1` and `round-2`).**
- Round 1: hiding "Filter" on phones broke "the same at 390, 768 and 1280". Fixed, with the coverage gaps it named: Filter at three widths and the 16 px gap.
- Round 2: a selected file hidden by search left other tiles without circles. Fixed with the test it named.
- Nothing rejected.

**Bytes.** Boot is 350 KB gzip before and after (budget 355); the total cold transfer is 2 KB less. The badge view and its CSS chunk are gone.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-122/before/` and `after/` cover 390 (touch), 768, 1280 and 1600 in light and dark: the top bar, the gallery at rest, a hovered tile, the One bar and Filter, two selected, and the selection bar (46 each).
