---
title: The Image button and the image popup
type: task (AFK)
status: closed
assignee: claude (mm-39 runner)
blocked_by: [38-place-shape-and-focus, 18-media-picker]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Entry point and popup"; design [crop-popup.html](../../prototype/crop-popup.html) and its validation notes.

- One **Image** button with an image icon in the edit bar, where Choose image… is today, with a small state badge ("Square", "Card's shape", "Trimmed"). No separate Crop or Focus button.
- The popup: the whole picture with the shape menu (Original, Square, 4:3, 16:9, Tall 4:5, Free) and a draggable focus dot with the place's frame drawn over it; **Replace** under the picture (opens the picker); small live phone and computer previews; the one-line message: blue "Only changes this spot" or yellow "Saves a new picture for this spot"; **Done**.
- Nothing is kept until Done; ✕ or Escape cancels everything, a replacement included. Done is one Undo step.
- Beside the picture on wide screens, below the bar when there is no room; a bottom sheet with 44 px targets on phones. Follows the editor's light or dark look. Arrow keys move the dot.
- Replace keeps the shape, resets the focus to the middle and drops a trim with a short note.

## Done when

- `@smoke` `tests/native-save/native-image-popup.spec.ts`: select a starter image, Image → Square, move the focus dot, Done; the page has the shape and `object-position`; Undo restores.
- Nightly: Escape cancels a Replace; arrow keys move the dot; phone width shows a bottom sheet.

## Done (2026-10-14)

- **Behaviour.** The edit bar's Choose image… is now one **Image** button (image icon) with a state badge read by `readPlaceFrame` (Original, Square, 4:3, 16:9, Tall 4:5, Custom for a hand-written ratio, Trimmed for a trimmed copy). It opens the **image popup** (crop-popup.html, light or dark with the editor's own colours): the whole picture with the shape menu over it (Original, Square, 4:3, 16:9, Tall 4:5), the place's frame with a pale wash outside it and a draggable focus dot (a press on the picture moves it there; arrow keys 2 %, Shift 10 %; no dot on Original, which shows the whole picture), **Replace** (the Media picker; the shape stays, the focus goes to the middle, a note says so and that a trim was dropped), small Phone and Computer previews drawn from the place's measured boxes at 390 and 1280 px (re-measured with the new shape or picture standing in), the blue "Only changes this spot" message, and **Done**. The page shows every change at once through a new `image-look` frame message (style and picture, kept across renders, put back on close); nothing is written until Done, one Undo step: `framePlace` for shape/focus, `placeMediaImage` with the frame for a replacement ("Image replaced"). ✕, Escape, a press elsewhere or another selection put everything back, a replacement included; focus returns to the Image button. Pressing Image again closes it. Beside the picture on wide screens, level with the bar, with a nub (left, else right, else below the bar); a bottom sheet (≤ 700 px, at most 56 % high, message and Done pinned, 44 px targets, computer preview only) on phones. A component template's own image still opens the picker. Double-click on a canvas image still opens the picker directly.
- **Left out on purpose.** Zoom, Turn, Free and Open large editor (slices 41/42): disabled controls would only confuse, so the rows are not shown; the message rule already has the yellow "Saves a new picture for this spot" state for them.
- **Assumptions (★).** Files added inside the picker from Replace are saved to Media at the picker's Use (the picker already keeps added files on Cancel); the spot itself changes only at Done. Escape after such a Replace keeps the file in Media but not on the spot.
- **Commits** (after rebasing over slices 34, 36 and 50). 3e5c81a4 claim; ad1bea9a build; d063fe0a review fixes and icon alignment; ec8db05e close; 3e870528 slice 34's new picture clean-up spec ported to the double-click.
- **Tests.** New `tests/image-popup-rules.test.ts` (11: shapes, ratios, badge incl. Trimmed via records, visible area under cover, arrow keys, pointer focus, message, Replace note, what Done writes, placement, phone sheet scroll); `preview-wire` lists `image-look`. New `tests/native-save/native-image-popup.spec.ts`: `@smoke` Image → Square, drag the dot, Done, page has shape and `object-position`, badge Square, one Undo; nightly Escape cancels a Replace (page picture and source back); Replace + 16:9 + Done is one Undo; arrow keys and ✕; phone bottom sheet with 44 px targets. Specs that opened the picker from the bar now double-click the selected image (`tests/native-save/open-picker.ts`, which retries a double-click the frame dropped as stale: see follow-ups): block-bars, fields-host, image-alt-refusal, image-markup, media-adding, media-library, media-pane, media-picker, media-tab, structure, upload. `npm run check`, `npm run lint`, unit 2797/2797; touched browser specs 122/122 (after the helper; before it 188/197 with 9 dropped double-clicks), popup spec 5/5 after review fixes. After the rebase: unit 2830/2830; touched specs plus `native-social-image` 128/128. Scratch screenshots at 390/768/1280, light and dark, in `.scratch/shots/mm-39/` of the main checkout.
- **Review (GPT-6.1 Sol).** Log: `.scratch/review/run.log` in the slice worktree, copied to `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-39/round-1/` (model gpt-6.1-sol, sandbox read-only, `REVIEW_STATUS: complete`). Fixed 2 (P2): a pending Done could still write after ✕/Escape (cancel now waits while Done writes); popup openings had no ownership until loaded (a press now owns it at once; later presses, repository or page changes supersede it). Rejected 1 (P2, uploads in Replace saved before Done): the picker keeps added files in Media even on Cancel, by design since slice 18; the spot changes only on Done (★ above). Not re-reviewed: small fixes, browser-tested.
- **Bytes.** `test:budget` 346 KB gzip before first preview paint (budget 355 KB; 345 KB on dev before the slice). Same-sitting gzip -9: entry JS +812 B (Image button, badge/popup entry in the media controller, edit bar badge, preview `imageLook`/`selectionBox`, the image-square icon, host ports), entry CSS +50 B, frame runtime +215 B (`image-look`): about +1.1 KB boot. Lazy: `image-popups` 2.3 KB (badge and rules), `image-popup` 4.8 KB, its CSS 2.0 KB.
- **Follow-ups.** A canvas double-click reported against a render the editor has since replaced is dropped (`image-edit` has render freshness), so a quick double-click right after selecting sometimes does nothing; the specs retry, a later slice could make the gesture an `action`. Slice 41 adds Zoom/Turn/Free rows and the yellow message; slice 42 the large editor; slice 43 "Card's shape"; slice 44 the social image popup.
