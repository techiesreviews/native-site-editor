---
title: "Design board: the Mock-ups and Screens groups, and each screen, move like the other cards"
status: closed
assignee: fleet-lead
blocked_by: [02-real-editor-screens]
---
# Design board 03: everything on the board moves (Orbit TOOLS-215, follow-up)

Lex (2026-11-12), after trying the free canvas: "only missing is that I can't move Mock-ups, screens, etc." Cards already moved by their titles; the groups (Shared values, Atoms, Molecules, Organisms, Screens, Mock-ups) and the screens inside a card (the Editor's four, a Mock-up's frames) did not.

## What
On the catalogue board (catalogue.html, preview editor only), an area is dragged by its name (Screens, Mock-ups and the others), cards and all, and each screen frame is dragged by its own label ("1280 px · Light"). They behave as a card does: they snap to the edges and centres of the cards and screens around them with a guide; Escape during a drag puts it back; the arrow keys nudge the one picked (Shift: 10); the right panel's Place section shows and types its X and Y (a screen's Place names it); places are remembered in this browser (`area:<id>`, `screen:<card>:<width>:<theme>` beside the cards' ids). Clicks, hover, typing and drags inside a screen still use the screen: only the label moves it. Fit and Zoom to a card cover what was moved, and a card moved off screen with its screens hides only when none of them is in view.

## Done when
- A group dragged by its name moves with its cards and nothing else; a screen dragged by its label moves alone; both snap, go back on Escape, nudge with the arrows, type a place and keep it over a reload.
- A press or drag inside a screen never moves it.
- The editor's boot stays within 355 KB.

## Done (2026-11-12)
- Feature list: no change (the catalogue board is a preview-only design tool, not an editor feature; docs/agents/features.md lists editor features only, in fixed areas)
- Tests: tests/native-save/native-catalogue-board.spec.ts (two new tests, red before: a label drag panned the board).
