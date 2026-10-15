---
title: One visible confirmation: a toast for the whole editor
type: task (AFK)
status: open
assignee: claude (mm-105 runner)
blocked_by: [89-ux-ui-audit]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#c2-one-visible-confirmation-leads-note-6), finding C2, and the lead's note 6 (slices 80 and 81 left their results screen-reader only).

- One toast for the editor: one line, past tense, naming the thing, with at most one action (Undo or Show). About 44 px tall, 8 px radius, inverse surface (dark on light, light on dark), 13–14 px text, 16 px side padding. It sits bottom-centre 16 px from the edge on computer and tablet, and full width minus 8 px on phone, always above any pinned action row. It stays 6 s, longer while hovered or focused, and a new toast replaces the old one. References: Fibery, Linear and Google Photos snackbars (audit, Mobbin notes part 10).
- `announce()` (`src/main.ts:3840`) shows its text as this toast and keeps the `#status` live region for screen readers. Site settings results ("Updated 95 links in 13 files…", "Added the .nojekyll file…") become visible.
- Media's result lines (Replace everywhere, Remove, Restore, Vimeo bar, Improve images, Adding settings) use the toast instead of a status line at the bottom of the screen; no success text in a warning colour.
- A screen's own status line is cleared when you leave that screen (no "Removed 3 files" under Improve images, no Vimeo line under the Replace confirm).
- Errors stay inline next to their field.

## Done when

- A spec: Site settings → change the address → Update links shows a visible toast naming the count; Undo in the toast works; the live region still gets the text.
- A spec: a Media status line does not carry over to the next screen.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
