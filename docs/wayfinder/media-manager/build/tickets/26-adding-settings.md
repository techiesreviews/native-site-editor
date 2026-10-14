---
title: Adding settings in More, remembered per site
type: task (AFK)
status: closed
assignee: claude (mm-26 runner)
blocked_by: [25-image-recipe]
builder: claude
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Adding and settings"; the Klaviyo-style before/after from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11).

- More → **Adding settings** ★: quality for images (Smaller files, Balanced, Higher quality, Smallest files (slower)), video (Smaller, Balanced, Higher) and audio (Balanced, Higher quality, Speech), and **Keep original**. No Advanced section.
- Changed choices are remembered for this site in `.editor/media.json` (slice 05) and apply to future additions only; **Reset to defaults**.
- Video and audio choices are shown now and take effect in phase 5.
- Replaces the old Optimise sheet's `localStorage` defaults.

## Done when

- `tests/media-settings.test.ts`: defaults, remembered per site, reset, per-kind quality kept apart.
- Nightly in `native-media-adding.spec.ts`: choose Smaller files, add an image, it is at most 1,600 px; reload, the choice stays.

## Done (2026-10-14)

- **Behaviour.** More → **Adding settings** (Media pane and picker, right after Add new file) opens its own screen with Back, like To check: one group each for **Images** (Smaller files, Balanced, Higher quality, Smallest files (slower)), **Video** (Smaller files, Balanced, Higher quality) and **Audio** (Balanced, Higher quality, Speech), each choice a 44 px row with a short plain hint ("Up to 1,600 pixels wide", "About 0.5 MB a minute, in mono"); **Keep original** (off); **Reset to defaults** (off while everything is default); then **Repository size** from slice 30's `repoSizeStatus` (label, a meter against 1 GB, and its warning from 500 MB; hidden for local folders). No Advanced section; PDFs and downloads have no setting.
  - **Remembered per site.** Each change saves at once into `.editor/media.json` `adding` as one Undo step ("Change adding settings" / "Reset adding settings"); only changed choices are stored, so a choice back at its default leaves the file, and Reset keeps keys another editor wrote. Quality is kept apart per kind. The open screen repaints from the site after every refresh, so Undo, Redo and a refused change show what is really remembered.
  - **Applied to future additions.** The image choice reaches preparation (slice 25's recipe) from every way of adding: the Media pane and picker read it from the loaded library when an addition starts; Files drops and Upload files… read it once per addition through the drop's workspace context. An unreadable records file prepares with the defaults (its save still refuses as before).
  - **Shown now, acting later (decision recorded).** Video and audio choices are shown and remembered now and take effect when slices 57/58 prepare video and audio; Keep original is remembered now and acts when slice 27 lands. Showing them now follows this ticket.
  - **Optimise sheet.** Its localStorage defaults are gone (`readMediaOptimiseDefaults`/`writeMediaOptimiseDefaults` removed). It starts from the site's image choice and Keep original (`mediaOptimiseStart`); an empty width means full size (Higher quality), and AVIF is offered when Smallest files is chosen. Changes there are for its files only.
  - **Code.** Pure rules in `src/page-builder/media-settings.ts`; the screen in `media-adding-settings.ts` + `.css`, loaded by dynamic import from More; `adding()` on the media workspace; `repoSize` passes from `appStore.repository` through the media controller's snapshot into the workspace context and `load()`.
- **Commits.** 65803ed1 claim; 0d6bc79d build; 28aa2924 review follow-ups (coverage, `mediaOptimiseStart`); close.
- **Tests.** New `tests/media-settings.test.ts`: defaults (nothing written for them), the choices per kind (AVIF images only, Speech audio only, invalid choices refused), remembered and read back, per-kind kept apart, Reset keeps unknown keys, each site reads its own file (malformed → defaults, a changed repository still throws), the workspace saves a change and a reset as one batch and loads `adding` and `repoSize`, an unchanged choice writes nothing, Files adding reads quality once per addition. `tests/media-library-optimise-rules.test.ts`: localStorage cases replaced by `mediaOptimiseStart` per choice. Nightly in `native-media-adding.spec.ts`: choose Smaller files, reload, the choice stays; add a 3000 px JPEG in Media, publish, the main is 1,600 px wide with only -480/-960 copies; and each change and Reset undo/redo as one step with the open screen repainting, then a 3000 px JPEG dropped on the Files folder `about` becomes `about/wide.webp` with -480/-960 copies. Ran: `npm run check`, `npm run lint`, unit 2619/2619; browser media adding, tab, pane, upload, picker, collections, library 92/92, then adding, library and upload 30/30 after the follow-ups. Scratch screenshots at 390 and 1280 (More, the screen, changed choices, repository size with a 635 MB warning) in the main checkout's `.scratch/shots/mm-26/`.
- **Review (GPT-6.1 Sol), 1 round.** Evidence: `.scratch/reviews/mm-26/round-1/` (result.md, run.log) in the main checkout. No spec or standards defects. Three validation gaps, all closed in 28aa2924: real Undo/Redo and Reset in the browser; the Optimise sheet's site-derived start values (now a tested pure function); a Files folder drop using the remembered choice. Nothing rejected; no re-review (tests and a small extraction only).
- **Bytes.** `test:budget`: 344 KB gzip before first preview paint of 355 KB. Same-sitting `build:ui`: boot entry JS 237,117 → 237,134 B gzip (+17 B, the repo size hand-off); boot CSS ±0. The screen and its CSS are a lazy chunk loaded from More; the rules sit in the lazy media chunks.
- **Follow-ups.** Slice 27: read `mediaAddingSettings(records.adding).keepOriginal` when adding. Slices 57/58: read `video`/`audio` the same way. Slice 28: the AVIF encoder (Smallest files still falls back to Balanced WebP with a note). Slice 31's summary could link to Adding settings. Slice 82: document the screen in `docs/page-builder/media.md`.
