---
title: "Design board: the Mock-ups and Screens groups, and each screen, move like the other cards"
status: closed
assignee: fleet-lead
blocked_by: [02-real-editor-screens]
---
# Design board 03: everything on the board moves (Orbit TOOLS-215, follow-up)

Lex (2026-11-12), after trying the free canvas: "only missing is that I can't move Mock-ups, screens, etc." Cards already moved by their titles; the groups (Shared values, Atoms, Molecules, Organisms, Screens, Mock-ups) and the screens inside a card (the Editor's four, a Mock-up's frames) did not.

## What
On the catalogue board (catalogue.html, preview editor only), an area is dragged by its name (Screens, Mock-ups and the others), cards and all, and each screen frame is dragged by its own label ("1280 px · Light"). They behave as a card does: they snap to the edges and centres of the cards and screens around them with a guide; Escape during a drag puts it back; the arrow keys nudge the one picked (Shift: 10); the right panel's Place section shows and types its X and Y (a screen's Place names it); places are remembered in this browser (`area:<id>`, `screen:<card>:<width>:<theme>` beside the cards' ids). Clicks, hover, typing and drags inside a screen still use the screen: only the label moves it. The keyboard reaches a screen too: its label takes focus, which picks it (Enter picks it and opens its options on a narrow board), and the arrows then nudge it; the Outline's area rows pick their area. Fit and Zoom to a card cover what was moved, and a card moved off screen with its screens hides only when none of them is in view.

## Done when
- A group dragged by its name moves with its cards and nothing else; a screen dragged by its label moves alone; both snap, go back on Escape, nudge with the arrows, type a place and keep it over a reload.
- A press or drag inside a screen never moves it.
- The editor's boot stays within 355 KB.

## Done (2026-11-12)
- Feature list: no change (the catalogue board is a preview-only design tool, not an editor feature; docs/agents/features.md lists editor features only, in fixed areas)
- Tests: tests/native-save/native-catalogue-board.spec.ts (two new tests, red before: a label drag panned the board).
- Review: three Opus rounds (round 2 only nits; round 3 one P2, fixed: below wide widths a screen label opens the Options sheet) and one GPT second look (fixed: quick taps on two screens, the Outline mark for a picked area, keyboard access to screens). Declined: no test of drawing order across a moved area (the rule is checked through its computed layer; rare layout).
- Evidence: kit size boot 355 KB (±0 KB); kit shots catalogue --compare dev shows no layout findings.

### Follow-ups

- Spec (P3): 068469586:src/catalogue/board.ts:526 — P3 ticket: the hiding check measures one box around a card and all its moved screens. A card stays drawn when only the empty gap between it and a far-moved screen is in view. The ticket's rule ("hides only when none of them is in view") still holds; the cost is extra drawing, not wrong behaviour. Fix if wanted: hide the card when every one of its boxes (the card and each moved screen) is out of view, instead of using one box around all of them.
- Validation gaps (gap): Snapping: no test shows that an area or a screen snaps. Add one to the screen test: drag the 390 px Light screen so its left edge lands within 3 px of the Dark screen's left edge. Then check that its X equals the Dark screen's X, and that a `.cat-guide` element is drawn during the drag.
- Validation gaps (gap): Zoom to a card: the comment at `tests/native-save/native-catalogue-board.spec.ts:735` says "the card's Zoom to fit", but the test clicks the board-wide Fit button. Nothing tests that Zoom to a card covers a moved screen. Add: after moving `screen:editor:1280:dark` 400 px to the right, double-tap the Editor card's title (or pick Editor in the Outline). Then check that the moved screen's box lies inside the canvas.
- Validation gaps (gap): Hiding with a moved screen: nothing tests that a card stays drawn while one of its moved screens is in view. Add: move a Mock-up screen far right, pan until only that screen is on the canvas, then check that `#card-sharing-panel` has no `is-culled` class. Pan until nothing is on the canvas and check that it has the class.
- Validation gaps (gap): Outline mark: nothing tests that a picked area is marked in the Outline. Add: after clicking the "Mock-ups" Outline row, check that it has `aria-current="true"`. After clicking a card's title, check that the mark is gone.

