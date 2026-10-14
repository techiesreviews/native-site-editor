---
title: The large editor
type: task (AFK)
status: open
assignee: claude (mm-42 runner)
blocked_by: [41-popup-trim-zoom-turn]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Large editor"; the large window in [crop-wordpress-style.html](../../prototype/crop-wordpress-style.html) and the WordPress 7.1 references.

- **Open large editor** carries the popup's state into a large window: picture with handles and a straighten ruler; side panel with Turn, Flip, Zoom, Shape, the live message and previews; Reset, Undo, Redo; Cancel (back to the popup as it was) and Done.
- Differs from WordPress on purpose: a shape alone saves no file, re-cropping starts from the original, there is a focus point, components open on their own shape, descriptions stay in the edit bar.
- On phones: WordPress's single icon row and shape menu, the preview behind a Preview button.
- Loaded on demand.

## Done when

- Nightly in `native-image-popup.spec.ts`: open the large editor, straighten and flip, Done saves a trimmed copy; Cancel returns to the popup unchanged.
- Byte budget: boot delta zero.
