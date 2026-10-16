---
title: "Specs reuse the shared scenario helpers"
type: task (AFK)
status: closed
assignee: ak-22
blocked_by: [06-kit-shots-core]
builder: sol
---

## What

- Replace hand-rolled copies of "open the editor and wait", "open Media", "pick a picture", "switch site mid-upload" in the media specs with `tests/support/scenarios.ts` helpers, adding helpers there as needed (kit shots uses the same file).
- No test meaning changes; same assertions.

## Files

- `tests/support/scenarios.ts`
- media browser specs under tests/native-save/ that hand-roll opening Media, picking a picture or switching sites (list them before editing)

Listed by ak-22 before editing (2026-10-16), from a grep of tests/native-save for the
hand-rolled "Up to date with main" wait, the explorer-toggle + Media tab click, the
`.hero img` pick and the `location.hash` branch switch:

- `tests/native-save/native-media-tab.spec.ts` (open, reopen Media, branch switch → `switchSiteMidUpload`)
- `tests/native-save/native-media-collections.spec.ts`
- `tests/native-save/native-media-library.spec.ts`
- `tests/native-save/native-media-newest.spec.ts`
- `tests/native-save/native-media-tiles.spec.ts`
- `tests/native-save/native-media-pane.spec.ts`
- `tests/native-save/native-media-rename.spec.ts`
- `tests/native-save/native-media-transaction.spec.ts`
- `tests/native-save/native-media-touch-contrast.spec.ts`
- `tests/native-save/native-media-cleanup.spec.ts`
- `tests/native-save/native-improve-images.spec.ts`
- `tests/native-save/native-media-screen.spec.ts`
- `tests/native-save/native-media-video.spec.ts`
- `tests/native-save/native-image-popup.spec.ts`
- `tests/native-save/native-media-picker.spec.ts`
- `tests/native-save/native-upload.spec.ts`

Not touched: `native-add-card.spec.ts` (ticket 32), `scripts/agents/shots/` (ticket 31).

## Done when

- The touched specs pass (twice), and `kit shots media-gallery` still works.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- 16 media specs now open the editor, Media, a picture and the image picker through
  `tests/support/scenarios.ts`; the branch switch in native-media-tab uses the new
  `switchSiteMidUpload`. `openEditor` takes an optional file, `pickPicture` and
  `openImagePicker` an optional selector; defaults unchanged, so kit shots keeps working.
- Same assertions. Built by Sol (d4836c51 before landing).
- Checks: `npm run check`, `npm run lint`, unit (3920 pass); `kit specs` on the 16 specs
  passed twice (16/16 each); `kit shots media-gallery --width 390` ok (6 files, 0 failed;
  its two publish-menu tap-target notes predate this ticket).
- Sol review: no defects (`.scratch/reviews/ak-22/20261016T154051Z`).
