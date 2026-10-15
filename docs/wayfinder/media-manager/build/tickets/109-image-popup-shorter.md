---
title: Image popup and Social image: shorter, closer to Brizy
type: task (AFK)
status: closed
assignee: claude (mm-109 runner)
blocked_by: [106-touch-dark-fixes]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#image-button-and-image-popup-b-19-to-b-23): the popup measures about 328 × 630 px at 1280 against Brizy's about 325 × 490 (Image and Zoom about 265 px of that; three switch rows the rest). Target: about 450 px for a fixed shape. Look only; ticket 39's rules stay (both messages, previews, Done, Escape).

- The helper line under the picture shows only the first time a shape is chosen, then stays as the dot's accessible name; Replace stays on that line.
- "Only changes this spot" and "Saves a new picture for this spot" become one 13 px muted line with a 14 px icon (amber icon for the second), beside Done on computer and above the buttons on phone. No box, no stripe.
- Turn's two 44 px icons join the end of the Zoom row; the Turn row goes.
- Previews capped at 72 px tall.
- Phone sheet: labels above their controls (12 px muted), the picture gets the full width, and every row fits an 85 dvh sheet.
- Free trim handles: 12 px circles with a 1 px blue ring and a 44 px invisible grab area (WordPress media editor).
- The "Image" tab above the edit bar hides when the bar's first button already says Image.
- Social image: opens as its own centred layer above the Site settings dialog, on the dialog's surface, never covering the form; its trigger becomes the 64 px thumbnail plus a secondary "Change…" button.

## Done when

- The popup at 1280 is at most about 450 px tall for a fixed shape; on 390 Done and the previews are visible without scrolling.
- The popup spec's 44 px target and Escape/Done checks still pass.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.** The image popup is about Brizy's size. At 768 and 1280 it is now 328 × 447 px for a fixed shape when opened again (it was 635). Brizy's is about 325 × 490. The phone sheet is 635 of 844 px, with Done and the preview in view. The Social image popup is 503 px tall (it was 618).
- The popup lives in a shared frame, `src/page-builder/media-popup-frame.ts`: head, notes line, rows, a bottom strip with one message line and Done, placement and dismissal. Ticket 119's video and audio popups can reuse it. The edit bar button was not renamed.
- The hint under the picture shows the first time each hint applies in this browser (`ase.image-popup.hints`, read by `seenHints`). After that it is screen-reader only and stays the dot's and the trim area's description. Replace stays at the end of that line.
- "Only changes this spot" and "Saves a new picture for this spot" are one 13 px muted line with a 14 px icon (amber for the second), with no box or stripe. On computer the line sits beside Done; on phones it sits above the buttons. To make room on that line at 328 px, **Open large editor is now an icon in the head**, next to ✕.
- The two Turn buttons end the Zoom row. The current turn shows in their tooltips and in the group's name ("Turn, now 90°"). The Turn row is gone.
- Previews are at most 72 px tall: the phone preview is 40 × 72 and the computer preview 128 × 72.
- Phone sheet: up to 85 dvh, with labels above their controls (12 px muted) and the picture at full width (196 px tall).
- Free trim corners are 12 px white circles with a 1 px blue ring and a 44 px grab area. The picture and its wash clip in a shade layer, and the corners stand in an unclipped handles layer, so a press past the picture's edge still takes a corner.
- Lead's addition: see-through pictures sit on slice 106's light checkerboard in the popup, its previews and the Social link card. This is one `--checkerboard` theme token, now shared with `media-picker.css`.
- Edit bar: when the first button already says the selection's name, the plain name tab above the bar hides. A page image's tab is also its drag handle, so for a block that drags, the handle becomes a grip icon ("Move image", "Drag to move", Up/Down keys) at the bar's start. Component names, context chips and slot chips are unchanged.
- Social image: it opens as its own modal layer (`dialog.image-popup-layer`), centred above Site settings. It uses the dialog's surface, line and backdrop. Escape or a press on the backdrop closes it unchanged. The trigger is now the 64 px picture plus a secondary "Change…" button ("Choose…" when the field is empty; it is named "Change default social image" or "Change social image"). `placeUnder` was removed because nothing used it any more. The thumbnail and the page share card share one in-flight preview load per picture (`src/components/settings-preview.ts`); two loads at once left the first without its picture.

**Commits.** 3c776c33, 2dbc68fa (claim); 465ae1b1 (build); 77eb3ad8 (review fixes); 5dc21f04 (re-review coverage). SHAs as before landing.

**Tests.**
- Unit: `seenHints` (`tests/image-popup-rules.test.ts`) and `tests/site-settings-preview.test.ts` (2). The `placeUnder` test was removed. Full unit run: 3443 pass.
- `native-image-popup.spec.ts`:
  - The phone sheet stays within 85 % of the screen, with labels above, a full-width picture, the previews and Done shown without scrolling, and the message above the buttons.
  - On computer, Turn is in the Zoom row, the message shares Done's line and Open large editor is in the head. The hint shows the first time, then is only the dot's description. Opened again, Square is at most 450 px.
  - A new test: Replace with a see-through PNG puts the picture and both previews on the checkerboard, and Replace with a JPEG takes them off. All four corners take a press 15 px past the picture, and the NW and SE corners resize the trim from outside it.
  - Turn checks now use the group's name.
- `native-social-image.spec.ts`: the 64 px thumbnail and Change…; the layer is centred on the dialog's surface. A new test checks that a backdrop press closes the layer unchanged with the settings still usable, and that the picture and card sit on the checkerboard.
- Pre-existing dev failure fixed: in the large-editor test, the editor toast's Undo (slice 105) also matched "Undo" inside "Edit image". The locator is now scoped. It failed on unchanged dev 52ef812f as well.
- Runs:
  - Touched default specs: popup, social, edit-bar label, edit bar, make-component, block move, components, section drag, media touch/contrast, link, site settings, editor toast. 108 passed. Two timeouts while the machine was at load 20–33 passed on rerun.
  - The same popup, social, edit-bar label and link specs with CI fonts: 45 passed.
  - `@actual` edit-bar label, component mode, slot chip (2) and structure badges: 58 passed.
  - `npm run check` and `npm run lint` are clean.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-109/{before,after}/` hold 48 each: 8 screens at 390, 768 and 1280, light and dark, on the real starter. The screens are the edit bar, the popup (Original, Square with the dot, Free, 16:9 at 170 %, a see-through logo) and the Social trigger and popup. `side/side-by-side-brizy-1280.png` sets the popup beside Brizy's reference at the same scale (this file stays local, as Brizy's image is third-party).

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-109/review-1`, `review-2`).
- Review 1 found two P2s, both fixed in 77eb3ad8. First, Replace sampled the previous picture for transparency. Second, the 44 px corners were clipped by the picture box. Its gaps (Replace both ways, presses past the edge, the Social backdrop, preview loads per handler) were covered.
- Review 2 found no defects. Its two gaps (every corner, the Social popup's checkerboard) were covered in 5dc21f04.
- Sol accepted all seven author decisions: the head icon, the grip, remembered hints, the nested layer, measuring a reopened popup, shared preview loads and the scoped Undo. Nothing was rejected.

**Byte budget.** Boot is 348 KB on dev 52ef812f and on this branch (budget 355 KB). The popup code stays in its lazy chunk. The edit bar change and the theme token are a few hundred bytes.

**Follow-ups.**
- Slice 110: the large editor shares `.image-popup__previews` (now 72 px previews with a 2 px phone bezel). It can reuse the quiet message line and `showPicture`'s checkerboard.
- Ticket 119: reuse `mountMediaPopupFrame` (opener class, title, rows, message, foot).
- The first opening, with a Replace note or a first-time hint, is a line or two taller than 447 px.
