---
title: Online video stills join their video
type: task (AFK)
status: closed
assignee: claude (mm-100 runner)
blocked_by: [68-online-videos-in-picker]
builder: sol
phase: 5
---

## What

Follow-up left open by slices [59](59-every-kind-in-media.md), [67](67-online-video-records.md) and [68](68-online-videos-in-picker.md).

When an Online video (YouTube or Vimeo) is placed, its still picture is copied into the site. That copy currently shows in Media as a separate picture tile, and Clean up may count it as unused. It should belong to the online video's family, the same way a local video's still does (slices [59](59-every-kind-in-media.md) and [66](66-video-details.md)):

- Not its own tile in Media; it shows with the online video.
- Never counted unused while the online video's record or uses exist.
- Removed and restored together with the online video.

Reuse the existing media family mechanism; no parallel one.

## Done when

- Unit tests cover the family rule (online still belongs to its online video) and Clean up (the still is not unused while the video's record or uses exist).
- The nightly online-video case in `native-media-video.spec.ts` also checks that Media shows no separate still tile.

## Done (2026-10-15)

- **Behaviour.** A YouTube or Vimeo still the editor copied (`onlineVideos[].stillCopied`), with its responsive copies and original, now belongs to its Online video, through the existing family rule (`familyMembers` of the still's own family):
  - **Media**: no picture tile of its own under All, Images or Video, in pickers (pictures pickers too) or in collection counts and the "N of M files" summary; the online tile already shows it.
  - **Clean up**: never suggested while the video's record exists (like a use or Always keep on a member). Once the record is removed, the still family leaves with it.
  - **Remove and restore** were already whole (slice 67's `removeOnlineVideo` moves the copied still's family to Recently removed carrying the record; restore brings it back). Unchanged.
  - Lex's own picture swapped in as still (no `stillCopied`) stays its own tile and file, as slice 66 does for a local video's still chosen from Media.
- **Code.** `onlineStillMembers(paths, videos)` in `media-families.ts`; `mediaLibraryTiles(items, onlineVideos?)` in `media-library-filter.ts`, used by `media-library-grid.ts` and `mediaCollectionSizes`; `mediaCleanUpSuggestions` skips those families; `MediaOnlineVideo.stillCopied` from `mediaOnlineVideos`.
- **Commits.** 34b27caf claim; a7460800 build (GPT-6.1 Sol; runner checked the diff unchanged); this close.
- **Tests.** Unit: `media-families` (copied still with copies and original belongs; own still, absent still, no videos give nothing), `media-library-filter` (tiles leave out the copied family, keep own still and other pictures), `media-collection-choices` (counts), `media-clean-up` (copied still never suggested while recorded; own still suggested when unused; suggested once the record is gone), `online-video-place` (`stillCopied` reported). Nightly `native-media-video.spec.ts` slice 68 case: Media shows no tile for `media/videos/stub-film.webp` under All and Video; confirmed red with the grid change reverted (1 still tile), green with it. Ran `npm run check`, `npm run lint`, unit 3,256/3,256, browser `native-media-video` + `native-media-screen` 30/30.
- **Review (GPT-6.1 Sol, read-only, 1 round).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-100/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). No defects, no validation gaps; nothing fixed or rejected.
- **Bytes.** `test:budget` 351 KB gzip of 355 KB before first preview paint. Same-sitting builds: boot entry 243,068 → 243,113 B gzip (+45 B: the rule, used by the boot Clean up controller).
- **Follow-ups.** Slice 69 (agents): `list_media` and agent removal still see a copied still as its own image; they can use `onlineStillMembers` with `onlineVideos`. Deleting or renaming the copied still from the Files tab still treats it as a lone picture (the record then shows the video without its still, already handled by slice 68).
