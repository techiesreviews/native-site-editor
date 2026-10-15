---
title: One Media button for every media spot
type: task (AFK)
status: closed
assignee: claude (mm-119 runner)
blocked_by: [109-image-popup-shorter, 115-placed-media-editor]
builder: claude
phase: 8
---

## What

Lex's answers to the audit's [Q5 and Q6](../ux-ui-audit.md#questions-for-lex) (2026-10-15). Lex: "Instead of thinking about an image button, it is a media button. So a way to add, change media."

- The edit bar's **Image** button becomes **Media** on every media spot: pictures, picture spots holding a looping video, videos, audio, downloads and online videos. On an empty spot it adds media; on a filled one it changes it.
- It opens one popup, shaped by what the spot holds:
  - picture: today's framing popup (slice 109's shorter version) with Replace;
  - video (including a looping video in a picture spot): still picture (Use this moment / Choose…), Loop silently, Subtitles, and **Replace** with a picture or another video (Q5: today a video can't be replaced at all);
  - audio and downloads: title and Replace; online video: Vimeo's own bar switch and Replace.
- The video's three address fields leave the edit bar; their jobs live in the popup.
- Agents: replacing a video in a picture spot becomes possible for agents too, writing exactly what the editor writes (map ticket 13).

## Done when

- Specs: Media button on a picture, a looping video in a picture spot (replace with another video, then with a picture; component layout kept), a video, audio, a download, an online video, and an empty spot.
- `tests/mcp-runtime.test.ts`: an agent replaces a video in a picture spot.
- Shots of each popup at 390, 768 and 1280, light and dark, before and after.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code lazy (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.**
- **One Media button.** The edit bar's Image button is now **Media** on pictures, videos (a picture spot's looping video too; a section's background video keeps its own controls), audio, download cards and Online videos. It leads the controls, and as slice 109 did for Image, the plain name tab above the bar hides (a new `names` flag on button controls; a draggable block keeps its grip). The grip now leads the first control group instead of standing in a group of its own, so on a phone the bar wraps beside it: "Media" is a little wider than "Image", and a lone grip line had made a picture's bar three rows tall at 390, covering the picture. A picture's button keeps its shape badge. On an **empty picture** (no `src`/`srcset`) it opens the Media picker to add (pictures, and videos in a picture spot).
- **One popup per kind**, all in slice 109's frame (`mountMediaPopupFrame`), in the new lazy `src/page-builder/media-spot-popup.ts` (+ `media-spot-popup.css`). A picture keeps today's Image popup. The others:
  - **Video** (a picture spot's looping video too): the video to pause at a moment, with **Replace** under it; **Still picture** (thumbnail, **Use this moment**, **Choose…**); **Loop silently** (fixed on, with slice 64's note, in a picture spot); **Subtitles** (None yet / name, Add…, Replace…, Remove); **Title**.
  - **Audio**: the player, Replace, Title. **Download**: the file, Replace, Title (the card's visible name). **Online video**: its still, Replace, and for Vimeo **Vimeo's own bar**.
  - Each change applies at once as one Undo step, as File details does: the still and subtitles everywhere the file is used (slice 66's workspace calls), Loop silently through slice 64's `toggleLooping`, Vimeo's bar through slice 68's `onlineVideoServiceBar`, Title as one guarded page edit (`aria-label` for players). Results show on the popup's message line; Done and ✕ ("Close") just close. Focus moves into the popup when it opens.
- **The video's three address fields** (Video file, Still picture, Title) and the **Looping video** checkbox left the edit bar; Play stays. `nativeElementFields` keeps the video fields (its tests use video as the general attribute host).
- **Replace** closes the popup and opens a picker:
  - A **picture spot's video** (Q5): the spot's own picker (`chooseImage`, now also accepting a spot's video), pictures and videos. Another video keeps the spot's `slot`, `id`, `class`, `style` (shape and focus) and size and its name (`pictureSpotVideo` / `spotVideoPage` now start from a video too). A picture goes through `placeMediaImage` with a stand-in `<img>` (`spotPictureTag`: the same attributes, the video's `aria-label` as `alt`), by the placed-image rules, as one batch.
  - **Any other spot**: Add → Media's picker (every kind, Online videos too); the chosen media takes the element's own place (`MediaInsertPlace.replaces`), with the site's player linked when needed, one Undo step.
  - The Image popup's Replace in a picture spot also lists videos: choosing one closes the popup and places the looping video at once.
  - Shared picker rules moved to `media-spot-pick.ts` (accept list, video routing), used by the bar's picker and both popups.
- **Agents.** `place_media` on a picture spot showing a looping video takes another video or a picture, through the same code the editor's Replace uses, so both write the same bytes. The tool description and `docs/mcp.md` say so. The starter's AGENTS.md Media chapter is unchanged (no starter refresh).

**Commits.** 8f8e58d2 claim; 8205d4de build; 5c2dcf65 Media's file filter and specs; 757d0d22 popup focus; c4727a8c review 1 fix; 9c02d18a review 2 fix and spec ports; 0cc5f62f settings-layout locator (failed on dev too); the Done section; the grip in the first group (after rebasing). SHAs as before landing.

**Tests.**
- Unit: new `tests/media-spot-rules.test.ts` (7 tests): kinds, file addresses (own `src`, first `<source>`, card link, site prefix), titles added, changed and removed, the download name and its refusals, a spot video replaced by a video or a picture stand-in, Replace in place, and the repository-switch guard. `tests/mcp-runtime.test.ts`: **an agent replaces a video in a picture spot with another video, then with a picture, equal to the editor's picker path**, the spot's layout kept, one Undo each. `tests/looping-video.test.ts` changed: a slotted video now counts as a spot. Full unit run 3465/3465 (before the review fixes); touched files again after.
- Browser: new `tests/native-save/native-media-button.spec.ts` (4 tests): Media on a picture (Image popup, name tab hidden) and on an empty picture spot (picker adds); a looping video in a picture spot replaced by another video, then by a picture, with the component layout kept and one Undo; a video's Loop silently, Title, Use this moment and Subtitles, with no address fields in the bar; audio's Title, a download's name, Vimeo's own bar, Replace on audio (a PDF card), and Replace on a download with a recorded Online video in its own place with one Undo. Ported: `native-media-video` (Looping through the popup), `native-fields-host` (a video's title in the popup; the detached-field test uses the embed's Title), `native-placed-media`, `native-image-popup` (Media texts, a spot's Replace picker), `native-mcp-media`.
- Full suite (`full-suite.sh 3`): shards 1 and 3 passed 359 each with one failure each: `native-fields-host:55` (ported), `native-settings-layout:83` (failed on unchanged dev 91ce88a0: slice 109's "Choose default social image" also matched the label; fixed with an exact name). Shard 2 stopped at 268/386 by the runner's time limit with five `native-image-popup` failures (the rename, ported) and `native-media-newest:52` (stale element during edits); rerun on 9c02d18a: 381 passed, 4 skipped, 1 failed, `native-media-newest:72` (twice; it failed on dev 91ce88a0 too: at 390 the pinned bar covered the hero picture its double-click needs). After rebasing onto dev 8de4a8c0: check, lint, unit 3476/3476; touched specs 80/81, the one failure `native-media-picker:61` (slice 113's new phone test, the same covered picture, passing on dev). With the grip in the first group: the bar, block-move, section-drag, components, make-component, picker, newest, placed-media, image-popup and Media button specs 97/98 (`native-media-newest:56`, a stale element, passed 4/4 on rerun), `native-media-picker:61` and `native-media-newest:72` included. Touched specs after the fixes: 39/40, then `native-settings-layout` 5/5.
- `native-image-popup.spec.ts:462` ("Undo" matching the toast's): passes (slice 109 fixed it).
- `npm run check` and `npm run lint` clean.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-119/{before,after}/`, 36 each: the picture spot, the looping video in a picture spot, a video, audio, a download and an Online video, at 390, 768 and 1280, light and dark, on the real starter (`origin/dev` c597698, with a seeded page). Before: the Image popup and the old bars ("Video file", "Still picture", "Title", "Looping video"). After: each spot's Media popup.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-119/review-1`, `review-2`; run.log: model gpt-6.1-sol, sandbox read-only).
- Review 1: no spec defects; seven of eight author decisions accepted. One P1, fixed in c4727a8c: the popup's workspace took a fresh repository context without the popup's own proof. `provedWorkspace` now checks it after the import, the context and the library load. Both suggested tests were added (the switch guard, Online-video replacement).
- Review 2 confirmed the fix and found the same pattern in Loop silently (the proof checked before the lazy import only), fixed in 9c02d18a, also for Replace's picker load. Rejected 1 validation gap: a browser test that holds the `media-video-place` import while switching repositories. It is a synchronous handoff right after the import, the pattern of the controller's `prepareLoop`, and module loading cannot be held reliably in a browser test.

**Bytes.** `test:budget` 349 KB gzip before first preview paint (budget 355 KB). Same-sitting builds against dev 91ce88a0: boot entry 231,009 → 231,129 B gzip (+120 B: the Media button, the `names` flag), CSS +1 B. The Media popup is its own lazy chunk (5.5 KB JS, 0.7 KB CSS); `media-spot-pick` 1.1 KB.

**Follow-ups.**
- Measuring a new picture placed into a spot that held a video falls back to default sizes (the preview's measure needs an `<img>`); Improve images measures it later.
- A download card's and an Online video's link Address fields are still in the bar (not in this ticket).
- Slice 110's large editor and slice 116's bar may want the `names` flag for their own first buttons.
