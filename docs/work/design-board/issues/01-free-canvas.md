---
title: "Design board: drag cards by their titles, snap, nudge and remember their places"
status: closed
assignee: fleet-lead
blocked_by: []
---
# Design board 01: the canvas arranges freely (Orbit TOOLS-215, slice 1)

Lex (2026-11-12): "I want a full real experience of the designs we already have and use, and be able to, like in Figma, drag things around." Approved sketch: fleet inbox `editor-TOOLS-215-design-canvas-sketch-approved-2026-11-12.html` (copy: [design-board-canvas.html](../../../wayfinder/atomic-catalogue/prototypes/design-board-canvas.html)).

## What
On the catalogue board (catalogue.html, preview editor only), every card is dragged by its title to wherever suits; it snaps to the edges and centres of the other cards with a guide; Escape during a drag puts it back; the arrow keys nudge the selected card (Shift: 10); the right panel's Place section shows and types its X and Y; places are remembered in this browser. Fit covers moved cards. Each card names its files (`data-files`) and stylesheet (`data-css`) and is an article named by its title, and a frame's stage names its files, so a T3 Code preview annotation names the exact part and its CSS file.

Slice 2 (separate PR) adds the real editor screens (1280 and 390) as frames.

## Done when
- A card dragged by its title moves and snaps; Escape puts a drag back; arrows nudge; Place X/Y type a place; a reload keeps it.
- Nothing else on the board moves when one card does; pan, zoom, pinch, taps and live cells work as before.
- Cards and frame stages carry `data-part`, `data-files` and (cards) `data-css`.

## Done (2026-11-12)
- Feature list: no change (the catalogue board is a preview-only design tool, not an editor feature; docs/agents/features.md lists editor features only, in fixed areas)
- Tests: tests/catalogue-places.test.ts (new, failed before places.ts existed); tests/native-save/native-catalogue-board.spec.ts (two new tests).

### Follow-ups

- Validation gaps (gap): R1-7 still open: there is still no test of snapping to a card that was already moved (`others` built from `cardBox`, `board.ts:954`).
- Validation gaps (gap): R1-5 still open: there is still no test that Space held over a title pans the board instead of moving the card (`board.ts:1061`).
- Validation gaps (gap): R1-4 still open: there is still no test that a lost pointer capture puts the card back (now `board.ts:1112`).
- Validation gaps (gap): R1-3 still open: there is still no test that Fit covers moved cards. The since-last patch adds only the pinch test.
- Previous findings (P3): R1-2 still open: 9ab71b76f only changed the order of `files`, so `data-css` now names `repository-menu.css`. Both side effects are still there. The two CSS files are fed to `untraced(entry.files)` (`board.ts:213`). `scripts/agents/one-offs.json:35,41` has counts for both, so the sharing panel card gets new "Untraced…
- Validation gaps (gap): R1-3: in `native-catalogue-board.spec.ts`, select Button and type X = current + 4000 in the Place field. Press Shift+1 on the canvas, then `expectInView(page, "button")`.
- Validation gaps (gap): R1-4: mid-drag on the Button title, run `canvas.releasePointerCapture(1)` (via `page.evaluate`). Then expect `#card-button` to have no `translate`, and its saved place in localStorage to be unchanged.
- Validation gaps (gap): R1-5: `keyboard.down("Space")`, drag the Button title 80 px, then expect `#card-button`'s `style.translate` to stay empty while the camera moved. Then `keyboard.up("Space")`.
- Validation gaps (gap): R1-7: move Badge with Shift+ArrowRight ×5, then drag Button so its left edge lands 3 px from Badge's new right edge. Expect Button's X to equal Badge's moved right edge exactly, and a `.cat-guide[data-axis="x"]` to be shown during the drag.
- Validation gaps (gap): New, from the R1-1 fix: the pinch test only covers a first finger that has already moved more than 4 px (`move.moved` true). Add a case where the second finger joins before the first one moves (touchStart a, then touchStart a+b with no move between). Expect no `is-moving` class, no tap selection or fly-to, and the zoom to change after the two fingers spread. This covers the `!moved` early return in `endMove` (`board.ts:991`), which drops the tap only when the outcome is `cancel`.

