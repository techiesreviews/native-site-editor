---
title: Numbers that agree, a double-click that always opens, tidy dates
type: task (AFK)
status: closed
assignee: claude (mm-114 runner)
blocked_by: [89-ux-ui-audit]
builder: sol
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#improve-images-a-20-to-a-22) and the lead's notes 1 and 5. Logic only.

- Improve images' More count (`media-badge.ts:42`) equals the rows the screen lists (A-07 says 2, A-20 lists 4).
- A video's and an audio's Length in details rounds the same way as the player's time (0:02 against 0:01; 0:42 against 0:41).
- A double-click right after selecting a picture always opens the picker: the gesture becomes an editor action instead of being dropped as stale (slice 39 follow-up, `image-edit` render freshness).
- Discarding an unsaved upload also removes its date entry (and its collection entries) from the `.editor/media.json` draft (slice 103's note).

## Done when

- Shots at 390, 768 and 1280, light and dark, of More beside Improve images and of video and audio details, showing the numbers agree.
- Unit tests for the count and the rounding; a browser spec double-clicks immediately after selecting, 20 times, and the picker opens every time, with no retry helper; a spec discards an upload and the records draft has no entry for it.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

- **Behaviour.** (1) More's "Improve images (N)" and the Media badge now count the rows the screen lists: the lazy usage check reads picture widths the same way the screen does (`planWithPictureSizes`), after Clean up has published, cached per Git blob SHA so each check reads only new bytes; an open More menu updates when the count arrives; Fix and Undo keep them equal. Cause: the count judged pictures by bytes alone until the screen had been opened (A-07 "2" against A-20 "4"). (2) Lengths: uploads and GIF conversions store the exact duration (they rounded to 2 decimals, so 1.963 s became 2.00 and read 0:02 against the player's 0:01); details show the loaded player's duration and refresh the tile; every length floors to whole seconds like the player, including 0:00 under a second. (3) `image-edit` is an `action`: the link hands the host the source the double-click was painted from, and the host opens the picker only if the same `<img>` start tag still sits at that node; the specs' retry helper is gone. (4) Discarding an unsaved upload (Save panel or its preview) also removes its per-file records (date, collections, everything) from the `.editor/media.json` draft, restoring the saved file's exact text, or dropping a records draft that only the upload created; Media's Remove of an unsaved upload does the same.
- **Commits.** f7c1530f claim; ee5602ac build (Sol, plus a per-version width cache and a trimmed spec); c98cb806 review fixes.
- **Tests.** Units: count equals the screen's rows before it opens and after Fix/Undo; widths read once per version; a width read across a replacement is never cached under the old version (red before the fix); rounding (0.2 → 0:00, 1.6 → 0:01, 41.9 → 0:41, 59.99 → 0:59, 3600 → 1:00:00); `sameImageTarget`; preview-link delivers `image-edit` with its painted source; `recordsAfterDiscard`/`discardUploadDraft`. Browser: new `native-media-numbers.spec.ts` (More = rows = "N to improve"; Length = player for an MP4 and a 41.9 s WAV with stale stored lengths); `native-image-popup.spec.ts` selects then double-clicks 20 times, picker every time, no retry; `native-upload.spec.ts` Discard leaves no records draft; `native-improve-images.spec.ts` More equals rows after Fix and Undo; `open-picker.ts` is one double-click. `npm run check`, `npm run lint`, unit 3434/3434; browser 153/153 (every touched spec and all 11 users of `open-picker`), then numbers, video, tab and library (55/55) again after the review fixes.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-114/` (main checkout, not committed): More, Improve images, video and audio details at 390, 768 and 1280, light and dark, on the real starter with a seeded page of two 4000 px pictures, `clip.mp4` (1.96 s) and a 41.9 s WAV: "Improve images (1)" / 1 row / "1 to improve"; Length 0:01 by "0:00 / 0:01", 0:41 by 41.9 s. The starter has no audio or video of its own and the audit's MP3 is not on disk, hence the WAV.
- **Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-114/`). Fixed 2: sub-second lengths read 0:01 against the player's 0:00 (the at-least-one-second floor is gone); a width read across a replacement could be cached under the old SHA (now kept only while the check and the file's version still hold). Rejected 0. The fixes were small, so no second review.
- **Bytes.** 347 / 355 KB before first preview paint; boot entry about +0.25 KB (the protocol table, the async discard hook and the `version` port); the count, discard and length logic live in lazy chunks.
- **Follow-up.** Lengths already stored rounded (before this slice) can still read one second high on a tile (for example 0:02 for 1.96 s) until the file's details are opened in that visit; the stored value is not rewritten. A later slice could correct stored lengths when a player loads.
