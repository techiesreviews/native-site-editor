---
title: "Image framing: the square is the focus point, no separate dot"
type: task (AFK)
status: open
assignee: lead-42 (this session)
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
