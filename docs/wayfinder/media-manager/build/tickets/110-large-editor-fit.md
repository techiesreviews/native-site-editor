---
title: Large editor: fits at every width, one shape menu, labelled phone tools
type: task (AFK)
status: open
assignee:
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
