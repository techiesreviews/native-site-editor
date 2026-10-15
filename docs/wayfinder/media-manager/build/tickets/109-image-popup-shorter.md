---
title: Image popup and Social image: shorter, closer to Brizy
type: task (AFK)
status: open
assignee:
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
