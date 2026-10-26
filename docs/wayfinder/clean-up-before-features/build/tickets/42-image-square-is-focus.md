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
- Dragging the square moves the focus point: the `object-position` written is the one that shows exactly the square, so the page matches the frame.
- Keyboard moves (arrow keys) move the square the same way; Undo restores the previous position in one step.
- Nothing else in the image bar changes.

## Files

The image framing UI and its controller, `src/page-builder/place-frame.ts` if the focus is computed there, their tests and specs.

## Done when

- A spec drags the square and the saved `object-position` is the one that shows exactly the square; no focus-dot element exists.
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
- A square as tall as the picture lets a vertical swipe on it scroll the phone sheet (`touch-action: pan-y`), because it can't move up or down anyway; a square that can move both ways takes the finger.
- More tests: a desktop press beside the square centres the square there; a phone tap at a tenth across moves it to the left edge (`0% across`); a swipe up on a full-height square scrolls the sheet without moving it; a unit case for a square filling both axes. The slider's value attributes are no longer removed and re-added on every redraw.
- Arrow keys follow the drag's rule: an axis the square fills keeps its focus, so on a full-height square Up and Down neither move it nor change the value read out or the `object-position` written. Specs check this on Tall 4:5, that the square keeps keyboard focus between moves, that the frame changes part (slider, Free's trim area, slider, hidden under Original) without stray value attributes, and that a zoomed drag keeps the focus matching where the square sits.
- Decided behaviour reworded; the lead (ticket author) confirmed it on 2026-10-26, since Lex asked for the square itself to be the focus point. It first said the square's "centre is the `object-position` written, as the dot's position is today". Both halves can't hold: the frame shows what the page shows only when it sits at (room × focus) (`cutArea`, `src/page-builder/image-popup-trim.ts`), so a square centred on the focus value would show a different part from the page, except in the middle. The build writes the `object-position` that shows exactly the square, and the Decided behaviour and Done-when lines were changed to say that. If Lex wanted the square's centre written as a raw percentage, the page would no longer match the frame.
- A square that fills the picture both ways (16:9 on the 320 × 180 picture) stays a focusable slider, but keys change nothing and Close writes no `object-position`; arrow keys that change nothing no longer redraw. Specs cover this, a phone swipe on a zoomed Original square (it moves the square, not the sheet), and a drag in the Social image popup up past the top (`0% down`; the copy is cut from the top).
- Commits: c11e6723c (first build), dca09703d (review fixes round 1), 9c345eff0 (round 2), 32bee3132 (round 3).
- `kit size`: `RESULT: ok size boot 358 KB (±0 KB) vs dev@56a2e6e, budget 362 KB`.
- `kit ux --features F-media-17 --no-review`: `RESULT: ok ux 1 features tried, 2 scripted findings`. The try passed (its steps now choose Square). One finding is the "Only changes this spot" tooltip, which was already this long and now says "square" (90 characters); the other matched a line of code. The reviewer's F-media-17 verdict runs through agent.sh, so it is left to the slice.
- Feature list: F-media-17 updated (Try, Good, Files, Steps).

### UX follow-ups

- UX (looks off): F-media-17 at 390 px the popup opens as a bottom sheet and the blue square is the only focus mark, with no separate dot, but a line under the controls reads "Only changes this spot", which explains the edit (S1) (seen in the F-media-18 strip: .scratch/ux/lead-42/20261025-222625-HZR5pv/image-popup-F-media-18-bug-popup-flicker-390-light-move-strip.webp)
- UX (looks off): F-media-18 the page never shows through while the square moves, but the Preview thumbnail jumps in size between frames: it is large in frame 1 and tiny from frame 2 on in the light strip, and frame 2 is bigger than the rest in the dark strip, so moving does not draw smoothly (U3). Free, zoom and turn are not shown (.scratch/ux/lead-42/20261025-222625-HZR5pv/image-popup-F-media-18-bug-popup-flicker-390-light-move-strip.webp)

### Follow-ups

- Spec (P2): d79fd51fd:docs/wayfinder/clean-up-before-features/build/tickets/42-image-square-is-focus.md:51 — P2 ticket: runner.md:67 says the `## Done` section must record 
- Spec (P3): c9e71098e:docs/wayfinder/clean-up-before-features/build/tickets/42-image-square-is-focus.md:53 — P3 ticket: under "Kit commands and evidence" the ticket asks fo
- Validation gaps (gap): `nudgeFocus` has no unit case for a square that fills only the width (for example `{ w: 1, h: 0.4 }`, with ArrowLeft keeping x and ArrowDown moving y). Only the
- Validation gaps (gap): No spec checks that, after arrow keys on a zoomed Original square, the square's drawn position still matches the focus. Existing specs check this for drags only
- Validation gaps (gap): At high zoom the square can get smaller than the 44 px phone target that F-media-17's "Good" line requires (U4). The old dot had a fixed 44 px grab area. No spe

