---
title: Newest first, and you can see what you just added
type: task (AFK)
status: closed
assignee: claude (mm-103 runner)
blocked_by: []
builder: claude
phase: 6
---

## What

Fix from Lex's iPhone (Safari, preview editor): "When I upload an image, the image appears to disappear, even though it says it has been added. It may be added elsewhere in the media folder, so I'm not sure where to look. It would be nice if the images were ordered by date by default, with the most recent first, so you can verify that the added image's date is correct."

1. Find out why an added picture seems to vanish (default order in Media and the picker, active filter/collection/kind, family tiles with a different name, grid scroll) at phone width (390x844) and desktop.
2. Newest first is the default order everywhere media is listed (Media screen, the picker, Files-tab media if it lists them). Files without a date go after dated ones, then by name. The date shows in file details.
3. After adding (drop, Choose file, inside the picker, inside Replace) the new file(s) appear at the top, are scrolled into view and get a brief highlight. If a filter or collection would hide them, clear it or say "Added to ... - Show" with one tap. In the picker, the just-added file is selected so Use is one tap.

## Done when

- Unit tests cover the sort rule.
- Browser cases (phone and desktop): add, then the file is visible at the top and highlighted.
- Existing specs keep passing (order assumptions updated deliberately).
- New code is lazy; boot stays within budget.
- Before/after shots at 390 and 1280.

## Done (2026-10-15)

- **Why the picture seemed to vanish.** Media and the picker listed files in alphabetical order of their full path, so a new upload (always in `media/images/`, after every `images/…` file) was drawn last. On a phone that is below the fold, and preparation also renames it (`IMG_4021.JPG` becomes `img-4021.webp`). Its "Adding…" tile showed at the top, then vanished as the saved tile took its alphabetical place. No filter or collection was involved in the reproduction (390 × 844 and 1280, real starter plus 14 pictures).
- **What "date" means.** `.editor/media.json` `files[path].added` (an ISO time), written by the editor when it adds a file (drop, Choose file, the picker, Replace's picker, Files-tab uploads), when Replace everywhere gives a file a new picture, and for a trimmed copy. One addition shares one time. Optimise's lighter version keeps the original's date. An unsaved upload's time is the fallback; files with no date (the site's own, or added outside the editor) follow the dated ones by file name (numbers in order), then folder. Online videos stay after files. The Files tab is a folder tree and keeps name order.
- **Behaviour.** Newest first in Media, the picker and search results (`mediaNewestFirst` in `media-library-filter.ts`); no new control. File details shows "Added" with date and time after Size. Adding scrolls its tiles into view; a saved file leads the grid, comes into view and wears a 2.4 s ring (kept through redraws); hidden by search or kind, the tray's existing Show new files brings it in, ringed. In the picker the latest addition leads the held files, is chosen (Use is one tap) and gets the ring once Ready.
- **Deliberate change.** Adding under All collections now writes `.editor/media.json` (the date), so the Save panel lists it; earlier specs asserting untouched records were updated. Discarding an unsaved upload leaves its date entry in the records draft (invisible; overwritten if a file is added at that path again), as collections already do.
- **Commits.** `72be0a0d` claim, `e62cd2d8` behaviour, `58c39f32` spec order, `0ad94892` review fixes.
- **Tests.** Unit: sort rule, `mediaAddedTime`, date fact and formatting, workspace date on add, shared batch time, Optimise keeps the date, Replace and trim dated; clock frozen in the agent-trim and all-entrances comparisons. New `native-media-newest.spec.ts`: desktop and phone (grid scrolled far down) add → first, in view, ringed, dated record and details; hidden by kind → Show new files; picker A then B → B leads, chosen, ringed. Updated `native-media-collections`, `native-media-tab` (undated files by name), `native-upload` (records in the Save list). `npm run check`, `npm run lint`, unit 3385/3385; media, upload, image, fades, social, structure, text and MCP-media specs 227/230 then the 3 updated upload cases and the changed files 51/51; after the review fixes newest, picker and upload 16/16.
- **Review (GPT-6.1 Sol, read-only).** Evidence `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-103/`. 2 P2 fixed: successive picker additions kept oldest first; picker files never got the ring. Validation gaps added (picker A/B, ring expiry, Optimise date). Nothing rejected; no re-review (small, covered fixes).
- **Bytes.** Boot 354 KB of 355 KB, no measurable change (one line in the media controller; the rest is in lazy media chunks).
- **Shots.** Before/after at 390 and 1280 in `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-103/`.
