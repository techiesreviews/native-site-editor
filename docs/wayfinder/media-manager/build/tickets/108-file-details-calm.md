---
title: File details: one fact line, a calm preview, actions in order
type: task (AFK)
status: closed
assignee: claude (mm-108 runner)
blocked_by: [105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#file-details-picture-b-01-to-b-03-video-b-08-b-09-audio-b-10-pdf-b-11-vimeo-b-12), file details for every kind, the usage popup and Rename.

- Facts become one 13 px muted line, "WebP · 2000 × 1125 · 47 KB · media/images", plus "Added 14 Oct" when dated (Shopify, Squarespace), replacing the 2×2 card.
- The preview takes the file's own aspect ratio up to `max-block-size: 50dvh`; no empty bands.
- Actions: Replace everywhere… and Optimise… as secondary buttons; a ⋯ menu holds Copy path, then Remove… last in red text. Picture, video, audio, PDF and Online video all say "Remove…" (no "Remove from Media…").
- Usage: an empty "Other uses · 0" group is hidden; page names are links in both themes.
- Usage popup: no Close button (✕ and Escape close it); File details is its one secondary action.
- Copies and original: two-line rows (name, then "Smaller copy · 1600 px"), size aligned to the first line.
- Decorative and Always keep: 44 px rows with the helper as the row's second line.
- Rename's "is taken" message gets a ⚠ glyph, so it is not colour only.

## Done when

- Also shot (not in the audit's sets): details of a generic download (ZIP or DOCX).
- Specs updated for the moved actions (Copy path and Remove in the ⋯ menu) and the one-line facts.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

- **Behaviour.** File details for every kind show the facts as one muted line ("WebP · 2000 × 1125 · 12 KB · media/images"; a video's adds its size and length from the player, "MP4 · 320 × 180 · 0:01 · 6 KB · media/videos") with "Added 14 Oct" under it (year only when not this year); Made from is its own muted line. The preview has the file's own shape up to `max-block-size: 50dvh`, sized before it loads, with no empty bands; files without a picture (audio, ZIP, a PDF without a still) get a short surface instead of a 430 px box. Under the preview: Replace everywhere… and Optimise… as secondary pills beside a ⋯ button ("More for this file") whose menu holds Copy path, then Remove… last in red (`MenuItem.danger`, `row-menu__danger`); Online video has Choose picture… and the same ⋯ with Remove…, so no "Remove from Media…" remains. Usage hides "Other uses · 0" once the check has finished; page names are underlined so they read as links in both themes (slice 106 owns `--link`). The usage popup lost Close: ✕ and Escape close it, File details is its one action. Copies and original are two-line rows (name with the size on its line, then "Smaller copy · 1600 px"); the kept original's download link has a 44 px tap area. Always keep, Keep the old address working and Vimeo's bar carry their helper as the row's second line (`aria-describedby`); Decorative and Always keep are adjacent 44 px rows. Problem lines (a taken name, a collection name) start with a ⚠ glyph hidden from screen readers.
- **Commits.** 1aca2951 claim; 70391eda the slice (rebased over slices 104 and 106; conflicts in the preview image, the facts CSS and one spec resolved keeping both).
- **Tests.** Units: one-line facts per kind, format names, "Added" with and without the year and in the reader's time zone, "Smaller copy · N px", Made from; Copy path goes through the ⋯ menu (Copy path, Remove…). Browser: native-media-screen (facts line, own-shape preview ≤ half the screen with no bands, menu order and red Remove…, Always keep's description, no empty Other uses, popup has File details only, ✕ closes), native-media-rename (⚠ before "is taken"), native-media-video (Vimeo Remove… in red), and the moved actions in -library, -pane, -cleanup, -tab (busy lock blocks ⋯), -numbers (Length fact), -newest (Added line). `npm run check`, `npm run lint`, touched units 28/28; touched browser specs 110/110 after the rebase (native-media-screen also 18/18 under CI fonts).
- **Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-108/`): REVIEW_STATUS complete, no defects, no validation gaps, no nits.
- **Bytes.** Boot +46 B gzip (index.js +32 B for the red menu item, index.css +14 B); budget 348 KB of 355 KB. Everything else is in the lazy media chunk.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-108/{before,after}/` (main checkout, not committed): picture top, ⋯ menu (after only), usage and copies, bottom, rename taken, usage popup, video, audio (WAV), PDF, ZIP download and Vimeo, at 390, 768 and 1280, light and dark, on the real starter with seeded media.
- **Follow-up.** None for this slice. Slice 119 (one Media button in the edit bar) is untouched.
