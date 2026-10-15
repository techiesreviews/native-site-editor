---
title: Large editor: fits at every width, one shape menu, labelled phone tools
type: task (AFK)
status: closed
assignee: claude (mm-110 runner)
blocked_by: [109-image-popup-shorter]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#large-editor-b-24-b-25).

- Shape uses the popup's shape menu (current shape as the button's label, "16:9 ▾"), not a native `<select>`.
- Previews sit in a two-column `minmax(0, 1fr)` grid with `object-fit: contain`; nothing is clipped at 768.
- Phone tool row: icon over an 11 px label (Turn, Turn, Flip, Flip, Zoom −, Zoom +, Shape), 56 px tall; the Shape button shows the current shape (Apple Photos, Google Photos).
- Ruler degree labels in `--muted` (4.5:1), the current value bold `--text`.
- "Saves a new picture for this spot" as the same quiet line as the popup (slice 109).

## Done when

- At 768, both previews are inside the dialog in light and dark.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.**
- **Shape** in the large editor is now the popup's shape menu, not a native select. The menu lives in one shared module, `src/page-builder/shape-menu.ts`, which the popup uses too. In the side panel the button looks like a field and names the current shape ("16:9 ▾"); its menu is at least as wide as the button. The menu offers the component's shape first, a hand-written ratio ("Custom (3 / 2)") while the place has it (the popup now offers it too), and Free. Each menu sets its own anchor name, because the popup stays mounted under the large editor. Escape or a press outside closes the menu first. A press on the picture or the ruler that closes it does nothing else.
- **Phones**: the tool row is seven tools, each an icon over an 11 px label (Turn, Turn, Flip, Flip, Zoom −, Zoom +, and the current shape under the crop icon), 56 px tall. Accessible names stay "Turn left", "Zoom out", "Shape: 16:9". The shape menu opens upward from the Shape tool with 44 px items.
- **Previews**: two `minmax(0, 1fr)` columns. Each screen is at most its device's size (the large editor keeps its larger 92 × 184 and 196 × 122 previews, not the popup's 72 px ones) and scales down whole. `mountPreviews` now sizes the picture spot in shares of its screen, so the popup's previews look as before. At 768 the Computer preview now ends at 736 px inside the 752 px dialog (it ran to 772 before).
- **Ruler**: the degree labels left the fading mask (only the ticks fade). A label shows only where it fits whole (`rulerLabelShown`), at 11 px in `--muted`: 6.8:1 light, 7.5:1 dark on the picture area. The current value stays bold `--text`.
- **Message**: the popup's quiet line (slice 109): 13 px muted text with a 14 px icon, amber for "Saves a new picture for this spot", no box. One line by Cancel and Done on computer, above the buttons on phones. The two old boxed copies are gone.
- **See-through pictures** sit on slice 106's checkerboard in the large editor too. `isSeeThrough` was taken out of `markTransparency` for the drawn picture.

**Commits.** df3c1bbc (claim); 14853f69 (build); 88f4c9c0 (menu width); fb7b9b04 and the closing commit (review-gap tests). SHAs as before landing.

**Tests.**
- Unit: `rulerLabelShown` (`tests/image-large-rules.test.ts`). Full unit run: 3459 pass.
- `native-image-popup.spec.ts`:
  - The phone test now checks the seven labels, 56 px, 11 px, Shape through the menu at 390 and 320, the message above the buttons with no box, and the previews sheet in view.
  - New 768 test: both previews inside the dialog in light and dark, ruler labels whole inside the ruler and unmasked, the message on Done's line with no box, and the checkerboard for a see-through logo but not a photo.
  - New test from the review: a hand-written 3 / 2 ratio is named and checked in the popup and the large editor, choosing it keeps it, Square hides it and Undo brings it back. Presses on the ruler and the picture with the menu open only close it; the next drag straightens.
  - The large-editor and component tests use the menu instead of the select.
- Runs: popup, Social image and media touch/contrast specs, 35 passed before the review tests. After rebasing on 91ce88a0: 35 passed. The new ratio test failed once because the page is briefly unmounted while it refreshes from GitHub; it now polls the raw source and passed 3 of 3 with `--repeat-each=3`. `npm run check` and `npm run lint` are clean.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-110/{before,after}/`, on the real starter at 390, 768 and 1280, light and dark: the large editor on a photo (16:9, straightened 4°, flipped), its shape menu, the phone's preview sheet (390), and a see-through logo. The "before" shape-menu shots show the native select focused (390 has none: Escape there cancelled the old editor).

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-110/review-1`). No Spec or Standards defects. Sol accepted all seven author decisions: the shared menu with per-instance anchors, the custom ratio in the popup too, the larger large-editor previews, labels that hide rather than fade, short visible tool labels, outside presses that only close, and `isSeeThrough`. Its two coverage gaps (outside presses, the hand-written ratio) were covered in fb7b9b04. Those were test-only changes, so there was no second review.

**Byte budget.** Boot is 349 KB on origin/dev and on this branch (budget 355 KB). The new code is in the lazy popup and large-editor chunks.
