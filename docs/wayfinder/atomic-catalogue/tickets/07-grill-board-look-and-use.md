---
title: Decide how the board looks and how Lex uses it
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-research-board-on-a-canvas, 05-grill-parts-and-approval]
---

## Question

How the board is laid out:

- grouped by atoms, molecules and organisms, or by screen;
- zoom and pan, search, light and dark side by side, phone width;
- how each part shows its states and options.

How Lex reaches it (`?catalogue` on the preview editor) and moves around on his iPhone. How a mock-up for a new feature is put together from board parts.

## Comments

- 2026-10-25, Lex: "Let's make sure to create a nice paper.design like canvas and organise things around."

## Resolution (2026-10-25)

Decided with Lex ("I think so", all as recommended):

1. **A Paper-like endless canvas** organised in labelled areas from left to right:
   - shared values (colour swatches, spacing ruler, type sizes, corners, shadows, playable motion timings);
   - atoms;
   - molecules;
   - organisms;
   - mock-ups.

   Each part is a frame: options in rows, states (normal, hover, pressed, focus, disabled, busy) in columns, light and dark side by side.
2. **Panels:**
   - left: an outline of areas and parts, where a click flies there and approved parts show a tick;
   - right: the selected part's options as live controls, plus **Approve** / **Needs change** with a note.
3. **Moving around:** scroll or pinch to zoom, drag to pan, double-click a frame to fit it, `/` to search. On the iPhone: pinch and drag, with the panels as sheets.
4. **Address:** `preview-editor.techies.tools/catalogue.html`, a separate page with 0 boot bytes.
5. **First step:** dark mode moves to `light-dark()` in `src/theme.css` and three other CSS files, with no visible change.
6. **Mock-ups for future features** live in the canvas's Mock-ups area, made from approved parts and approved the same way. They replace separate HTML mock-ups (kitchen station 3).
