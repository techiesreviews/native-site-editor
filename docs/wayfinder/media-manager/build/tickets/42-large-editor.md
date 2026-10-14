---
title: The large editor
type: task (AFK)
status: closed
assignee: claude (mm-42 runner)
blocked_by: [41-popup-trim-zoom-turn]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Large editor"; the large window in [crop-wordpress-style.html](../../prototype/crop-wordpress-style.html) and the WordPress 7.1 references.

- **Open large editor** carries the popup's state into a large window: picture with handles and a straighten ruler; side panel with Turn, Flip, Zoom, Shape, the live message and previews; Reset, Undo, Redo; Cancel (back to the popup as it was) and Done.
- Differs from WordPress on purpose: a shape alone saves no file, re-cropping starts from the original, there is a focus point, components open on their own shape, descriptions stay in the edit bar.
- On phones: WordPress's single icon row and shape menu, the preview behind a Preview button.
- Loaded on demand.

## Done when

- Nightly in `native-image-popup.spec.ts`: open the large editor, straighten and flip, Done saves a trimmed copy; Cancel returns to the popup unchanged.
- Byte budget: boot delta zero.

## Done (2026-10-15)

- **Behaviour.** For a picture that can be trimmed, the image popup's footer has **Open large editor** beside Done. It opens a large window ("Edit image", the picture's name under it; crop-wordpress-style.html's layout in the editor's light or dark colours) on the popup's own state: the shape, focus, zoom, turn and trim carry over. The picture moves under a frame fitted in the middle of a grey area (dragging the picture moves what stays in view, which for a shape is its focus; the wheel zooms), with four round handles on a shape (a ratio-kept resize, which is a zoom) or eight on Free; a thirds grid shows while dragging and the frame settles back into the middle after a resize. Under it the **straighten ruler** (−45° to 45° in half degrees, dragged or with the arrow keys, catching at 0). The side panel has **Turn**, **Flip** (side to side, upside down), **Zoom** (out, in), **Shape** (the popup's shapes and Free), the popup's own blue or yellow message and live Phone/Computer previews. Footer: **Reset** (the whole original in the place's shape when the popup opened), **Undo**, **Redo** (the window's own steps; Ctrl+Z, Ctrl+Shift+Z), **Cancel** and **Done**. Keys: arrows move what stays in view (Shift: further; Alt on Free: its size), + and − zoom, R / Shift+R turn, H and V flip. Cancel, ✕ and Escape put the popup back exactly as it was (focus on Open large editor); Done is the popup's Done, which saves (a trimmed copy through slice 45's `trimPlace`, else the place's shape and focus) and closes both. A shape change alone saves no file; re-cropping starts from the original; alt text stays in the edit bar. Phones (≤ 700 px): full screen, one row of icons (Turn ×2, Flip ×2, Zoom ×2, a shape icon over the native shape menu), the message under it, and the previews in a sheet behind **Preview**; 44 px targets.
  - **Straighten without empty corners.** A straightened picture is shown enlarged just enough to fill its frame, in the popup too; the popup's rectangle and focus are on that picture. `popupTrim` converts to the trim's frame (trim-geometry.ts straightens without enlarging) and `restoreCut` back, so a straightened trim never has empty corners; an agent's trim reaching into them re-opens clamped onto the picture.
  - **Flip** mirrors what is shown: a turned picture flips its other source axis, the straighten mirrors (a levelled horizon stays level), and the frame and focus mirror so the same part stays in view.
  - A re-opened trim left untouched saves nothing even where converting it back is not exact (the popup compares with its opening state too).
- **Differs from the ticket on purpose (★).** No Details tab, keyboard shortcuts box or side panel toggle (the ticket lists none of them; Lex asked for minimal UX). Shortcuts are in the buttons' tooltips.
- **Code.** New lazy `src/page-builder/image-large-editor.ts` + `.css` (the window) and `image-large-rules.ts` (pure: `chooseShape`, `fitView`, `moveArea`, `resizeArea`, `zoomArea`, `flipEdit`, `straightenEdit`, `rulerValue`, `resetEdit`, `editKey`). `image-popup-trim.ts`: `coverScale`, `shownTrim`, the conversion in `popupTrim`/`restoreCut`. `image-popup.ts`: Open large editor (dynamic import), Cancel's snapshot, `redraw` of both windows. `image-popup-view.ts`: the button, `mountPreviews` shared with the large window, the straightened picture drawn enlarged.
- **Commits.** 603ad8d7 claim; 5fe19e4f build; e29cb534 review fix; then this close.
- **Tests.** New `tests/image-large-rules.test.ts` (10: cover scale and no empty corners checked through the trim's matrix, straightened and flipped round trips, an outside trim clamped, shape choice, fit, pan, ratio-kept resize and its limits, zoom, Flip pixel for pixel for every turn and both axes, straighten and ruler, Reset and edit keys). `tests/image-popup-trim.test.ts`: the kept-trim case no longer straightens (its fractions are now of the enlarged picture; covered in the new file). Nightly `native-image-popup.spec.ts`: an SVG has no Open large editor; the popup's 16:9 carries into the window; Flip turns the message yellow and both previews change at once; Undo, Redo, Reset and Undo again; Cancel returns to the popup unchanged (16:9, 0°, blue, focus on Open large editor); straighten 4° with the keys, Flip, Done saves `level-crop.webp` with `straighten: -4, flipX: true` and a 16:9 trim, both windows closed, one Undo. The preview check fails with the review fix reverted. Ran `npm run check`, `npm run lint`, unit 2942/2942; native-image-popup 8/8. Scratch screenshots at 390/768/1280, light and dark, in `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-42/` (default fixture: the real starter's pages have no images).
- **Review (GPT-6.1 Sol).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-42/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`). Fixed 1 (P2: the large editor's previews stayed one edit behind) and its two validation gaps (one Flip updates both previews; Reset, Undo, Redo). Rejected 0. Not re-reviewed: a small fix, browser-tested both ways.
- **Bytes.** `test:budget` 347 KB gzip before first preview paint (budget 355 KB), as on dev; boot +0 (nothing in `index-*.js`). Lazy gzip: `image-large-editor` 4.8 KB JS + 2.4 KB CSS, loaded on Open large editor; `image-popup` 8.7 → 10.2 KB.
- **Follow-ups.** Slice 43 (component shapes): the window's shape menu lists `POPUP_SHAPES` and Reset goes back to the place's own shape, so a "Card's shape" entry there shows up here too. Slice 44 (social image): the window could open locked to the sharing shape. Not validated: Safari, real touch and pinch zoom.
