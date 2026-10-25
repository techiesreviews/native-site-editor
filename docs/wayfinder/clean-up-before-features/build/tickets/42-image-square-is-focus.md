---
title: "Image framing: the square is the focus point, no separate dot"
type: task (AFK)
status: closed
assignee: lead-42
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-25): "For the image drag, the dot feels not needed, can we remove that, and just use the square, and have that as the focus point?" When placing or framing an image (`src/page-builder/place-frame.ts`, the image edit bar's framing), the separate focus dot goes; dragging the square sets the focus point.

## Decided behaviour

- The framing view shows only the square; there is no focus dot.
- Dragging the square moves the focus point: its centre is the `object-position` written, as the dot's position is today.
- Keyboard moves (arrow keys) move the square the same way; Undo restores the previous position in one step.
- Nothing else in the image bar changes.

## Files

The image framing UI and its controller, `src/page-builder/place-frame.ts` if the focus is computed there, their tests and specs.

## Done when

- A spec drags the square and the saved `object-position` follows its centre; no focus-dot element exists.
- `kit shots --compare` of the image framing view (light, dark, 390 and 1280 px) shows the dot gone and nothing else moved.
- `npm run check`, `kit unit --affected`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-42 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/42-image-square-is-focus.md --builder claude-opus-5-5`; `kit wait job slice-42 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size` (at or under 362 KB), `kit ux --ticket <this ticket>` for the visible change.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5`. Land: `kit pr --ticket <this ticket>`.

## Done (2026-10-25)

- The image popup (and Settings' Social image popup, which shares it) has no focus dot. When a shape crops the picture, or Original is zoomed in, the frame on the picture is the focus square: a keyboard slider named "Focus point" with the same "N% across, M% down" value text and hint ("Drag the square to what matters most.").
- Dragging the square moves it from where it was held. A press on the picture beside it centres the square there; on a phone a tap does this on release, so a swipe beside the square still scrolls the sheet. The `object-position` written is the one that shows exactly the square, so the page matches the frame (`squareFocus` in `src/page-builder/image-popup-rules.ts`). An axis the square fills keeps its value.
- Arrow keys (Shift for bigger steps) move the focus as before, with the square keeping keyboard focus between moves; Close or Escape keeps the change as one Undo step. Free trimming, Zoom, Turn, Replace and the previews are unchanged. `dotApplies` is now `squareApplies`.
- Tests: unit `squareFocus` cases (`tests/image-popup-rules.test.ts`); `tests/native-save/native-image-popup.spec.ts` drags the square, checks that no `.image-popup__dot` exists and that the saved `object-position` matches the square's position, and moves the zoomed square in steps within its room. The keyboard, touch and social-image specs now use the "Focus point" slider.
- Shots: `kit shots --steps .scratch/shots-42-square.json --compare dev --width 390,1280` (light and dark): the dot is gone and the popup layout is unchanged, with no layout findings.
- Feature list: F-media-17 updated (Try, Good, Files).

