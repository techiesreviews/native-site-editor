---
title: Trim, zoom and turn in the popup
type: task (AFK)
status: closed
assignee: claude (mm-41 runner)
blocked_by: [39-image-button-and-popup, 40-trimmed-copies]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13); [crop-popup.html](../../prototype/crop-popup.html).

- **Free** shows four corner handles; **Zoom** and **Turn left/right** in the popup.
- The message turns yellow whenever the result saves a Trimmed copy; previews update live.
- Done makes the copy (slice 40) and places it in this spot, one Undo step; other places keep the original.
- Re-opening a trimmed place starts from the original with the trim restored.

## Done when

- Nightly in `native-image-popup.spec.ts`: Free-trim an image, Done; a `-crop` file is placed only here; re-open shows the trim on the original; re-trim writes a new name.

## Done (2026-10-15)

- **Behaviour.** For a raster picture in the site, the image popup (crop-popup.html) adds **Free** to the shape menu (the frame becomes the trim: four corner handles, drag to move, arrow keys move it 2 % / Shift 10 %, Alt + arrows move its right or bottom edge), a **Zoom** slider (100–500 %; zoomed in, Original shows the dot too) and **Turn left/right** with a reading ("90°", plus "straightened" or "flipped" for a trim made elsewhere, which the popup keeps). The picture in the popup is drawn turned. Whenever the result saves a Trimmed copy the message turns yellow, "Saves a new picture for this spot" ("Updates this spot's trimmed picture" when the spot is already trimmed); the page and the Phone/Computer previews show the trimmed picture live (drawn in the editor, at most 1200 px, once a frame; the measurement waits for a pause). Turning starts zoom, focus and trim again; Replace keeps the shape (Free leaves Original), centres, and drops a trim or turn. SVGs and pictures outside the site get no Zoom, Turn or Free.
  - **Done** with a trim calls slice 45's `trimPlace` (slice 40's engine): the copy is prepared from the full original with the site's recipe and responsive copies, placed in this spot only with the place's shape and a centred focus (its copy is that shape), one Undo step ("Picture trimmed"); the earlier trimmed copy goes to Recently removed when nothing else uses it (slices 40/48), else stays for the other place. Other places keep the original.
  - **Re-opening** a trimmed spot starts from the full original (named in the header) with the trim put back: the place's shape with its zoom and focus when the trim is that shape and more than its crop, else Free with the trim's rectangle, keeping the place's own shape and focus around it. Done left as it was writes nothing; taking the trim away (100 %, unturned) puts the original back in the spot (the old copy stays in Media); a new trim writes a fresh `-crop-N` name.
  - **Proofs.** The popup reads the picture's revision before its bytes; Done trims that revision or refuses with nothing saved.
- **Code.** New `src/page-builder/image-popup-trim.ts` (pure: the area a shape and zoom keep on the turned picture, Free resizing/moving/keys, `popupTrim`, `restoreCut`, `sameTrim`, `placeShape`, `trimmable`). `image-popup-rules.ts`: Free in `PopupShape`, `placeShapeOf`, hints. `image-popup.ts`/`image-popup-view.ts`/`image-popup.css`: the rows, corners (44 px on phones), slider, turn buttons, canvas, `paintTrim`. `place-trim.ts` (slice 45's, landed meanwhile): optional `source` (a picture chosen with Replace; the place's own trimmed copy is then the previous one) and `sourceVersion` (the popup's revision; another refuses).
- **Commits.** 83b2b3c4 claim; 578f1b40 build; 37fffc0b review round 1; 2b9921aa review round 2; f57d780c the rebase onto slice 45 (its `trimPlace` and `mediaPlaceSwap` replace this slice's own copies); then this close.
- **Tests.** New `tests/image-popup-trim.test.ts` (areas, new-picture rule, trims made, restore round trips for each shape and turn, Free with the place's shape around it, a shape-crop trim restored as Free, zoom, turn, corners and keys, trimmable, same trim) and `tests/place-trim.test.ts` (a changed or unknown revision refuses before reading bytes); `image-popup-rules.test.ts` extended. Nightly `native-image-popup.spec.ts`: SVG has no trim controls; upload a JPEG via Replace; Free-trim, Done: `quarters-crop.webp` in this spot only with its `trimmedFrom` record, the original unchanged, badge Trimmed; re-open untouched + Done writes nothing; re-open shows Free on the original with the trim's frame; re-trim writes `quarters-crop-2.webp`, the old copy leaves the records for Recently removed; one Undo. Second case: Zoom 200 % and Turn show yellow, back to 100 %/0° blue; Turn + Zoom + Done saves a 200 × 400 copy with `turn: 90`; one Undo. The slice-35 image-markup spec's stale "Choose image…" click was fixed the same way on dev (ad5c4946). Ran `npm run check`, `npm run lint`, unit 2932/2932; browser native-image-popup, -mcp-media, -media-picker, -image-markup 29/29 after the rebase. Scratch screenshots 390/768/1280 light and dark in `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-41/` (the default fixture: the real starter's pages have no images).
- **Review (GPT-6.1 Sol), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-41/round-{1,2}/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` REVIEW_STATUS complete). Round 1, fixed: a re-opened trim with another shape than the place's dropped the place's shape (P2); the revision was read at Done, not before the preview (P2); added a saving Zoom + Turn browser case. Round 2, fixed: a trim that is exactly a shape's crop re-opened as no trim, so an untouched Done put the original back (P2); the place's focus was lost around a re-opened Free trim (P2); added the untouched re-open browser check. Rejected (validation gap): a browser spec holding `host.picture()` while the asset changes; the revision is read on the line before the picture read and `trimPlace`'s refusal is unit-tested, and the fake server has no cheap way to change an asset mid-popup. The rebase onto slice 45 (merging into its `trimPlace`) was not re-reviewed: the added fields are small and covered by unit and browser tests.
- **Bytes.** `test:budget` 347 KB gzip before first preview paint (budget 355 KB); boot entry +0 (no new code in `index-*.js`). Lazy: `image-popup` 4.8 → 8.7 KB gzip, its CSS 2.0 → 2.4 KB.
- **Follow-ups.** Slice 42 (large editor): straighten and flip; the popup already keeps them and its reading shows them. The restored-trim choice (shape vs Free) lives in `restoreCut` for slice 42 to reuse.
