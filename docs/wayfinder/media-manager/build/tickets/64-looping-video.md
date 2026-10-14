---
title: Looping video per place, and section backgrounds
type: task (AFK)
status: closed
assignee: claude (mm-64 runner)
blocked_by: [62-player-markup, 38-place-shape-and-focus]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "Looping videos".

- Any video can be set, per place, to loop silently and play by itself (`muted loop playsinline autoplay` plus the player's corner button); a checkbox in the video's edit bar ★. Videos made from GIFs start with it on.
- Looping videos may fill picture spots (a card's photo, a component's hero), taking the spot's shape and focus point (slice 38).
- A section's background can be a Looping video; its still shows for reduced motion and save-data.

## Done when

- `tests/looping-video.test.ts`: the attributes, GIF videos on by default, picture-spot shape and focus, background markup.
- Nightly in `native-media-video.spec.ts`: switch looping on and off for a place; set a section background video.

## Done (2026-10-15)

- **Behaviour.** New lazy, DOM-free `src/page-builder/looping-video.ts` (writers and rules) and lazy `src/page-builder/media-video-place.ts` (edit-bar controls and one-Undo transactions); boot gets only a port and one line in the edit bar.
  - **Looping video** markup follows the starter's contract: `<video src poster controls muted loop playsinline width height aria-label>`, **never `autoplay`** (slice 60: the player starts it, so reduced motion holds without JavaScript). `writeLooping(tag, on)` switches a placed video, keeping every other attribute byte for byte; off returns to slice 62's `controls playsinline preload="none"`. A subtitles track stays, so switching back loses nothing.
  - **Videos made from GIFs** start looping: `loopsFromStart(record)` reads slice 57's `fromGif`; `placedVideoMarkup` picks looping or slice 62's ordinary markup (for slices 63 and 69).
  - **Picture spots** (an element with a `slot`): `canFillPictureSpot` allows pictures and looping videos only, never ordinary videos with sound; `pictureSpotVideo` turns a spot's `<img>`/`<picture>` into a looping video keeping slot, id, class, style (the shape and focus point), size and the alt as its name. `place-frame.ts` reads and writes shape and focus on a looping video too (images unchanged). Turning looping off in a picture spot is refused.
  - **Section background**: `<video data-background src poster muted loop playsinline preload="none">` as the section's first child (`sectionBackgroundEdits` inserts, replaces or removes it, keeping indentation and line endings).
  - **Edit bar**: a selected video has a **Looping video** checkbox (disabled with a plain note in a picture spot); a selected section has **Background video** (the Media picker, listing only videos) and, when it has one, **Remove background video**. Each is one Undo step that also adds the site's player once (`mediaPlayerPlan`, creating the player files only when missing). The canvas keeps videos still and selectable (no controls, no autoplay, `preload="none"` in the preview runtime).
- **Commits.** 78c0f852 claim; e2e77134 build (GPT-6.1 Sol; runner: only the background picker lists videos, so Media stays images-only until slice 59; subtitles kept when toggling; `openMediaPicker` takes its own listing); 68ce693d review fix; 57d30474 edit-bar order (full-suite finding); this close.
- **Tests.** New `tests/looping-video.test.ts` (attributes, GIF default, picture-spot shape and focus, background markup, refusals, player plan), `tests/media-video-place.test.ts` (a chosen video removed or replaced while placing is refused with nothing written; an unchanged one is one guarded batch), `tests/place-frame.test.ts` extended. Nightly `tests/native-save/native-media-video.spec.ts` (new; slice 63 adds its `@smoke` case): switch looping on and off for a place (Undo removes the created player files; track kept); set and remove a section background video. `npm run check`, `npm run lint`, unit 2,933/2,933. Full suite (3 shards, preview runtime touched): 1,003 passed, 6 failed: `native-canvas:203` known flaky; `native-edit-bar-label:329` mine (fixed in 57d30474, passes); `native-media-policy:4` and `native-media-cleanup:29` pass on rerun (load); `native-image-markup:371` (slice 35) and `native-media-adding:697` (slice 57) fail on dev already: they click the edit bar's "Choose image…" button, which slice 39 replaced with Image.
- **Review (GPT-6.1 Sol, read-only).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-64/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` `REVIEW_STATUS: complete`). Fixed 1 (P2: a background video removed while being placed passed the save's guard; its revision is now taken right after the first read and kept, also when other held files are saved with it). Rejected 1 (P2: no picker yet fills a picture spot with a looping video): slice 63 owns the picture spot's picker ("offers only pictures and Looping videos"), which also needs videos listed in Media (slice 59); this slice supplies `pictureSpotVideo` and `canFillPictureSpot` for it. Not re-reviewed: small, unit-tested fix.
- **After landing (82fc2639).** `native-edit-bar-label:271` failed 1 in 4: the first selected section redrew the bar once its lazy controls loaded. The edit bar now decides the Looping video and Background video controls from the page source (the controller), and only their presses load the lazy module, so the bar never redraws for them; 8/8 repeats, the video, edit-bar and image-popup specs 21/21, unit 2,962/2,962.
- **Bytes.** `test:budget` 347 KB gzip of 355 KB (348 KB after the redraw fix, cold-median noise); boot JavaScript +344 B gzip (Sol's static measure: the port, the edit-bar line, the checkbox's `disabled`/`title`).
- **Follow-ups.** Slice 63: a picture spot's picker lists pictures and looping videos and places with `pictureSpotVideo` (+ `mediaPlayerPlan` kind `looping-video`); placement uses `placedVideoMarkup` for the GIF default. Slice 65: the canvas strips `controls`/`autoplay` from videos (preview runtime); its play button starts them. Slice 69: agents loop through `writeLooping` and backgrounds through `sectionBackgroundEdits`. Dev: `native-image-markup:371` and `native-media-adding:697` need the Image popup's Replace instead of "Choose image…".
