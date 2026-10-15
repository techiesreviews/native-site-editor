---
title: File details redesign: a modern asset detail view
type: task (AFK)
status: open
assignee: claude (mm-123 runner)
blocked_by: [108-file-details-calm]
builder: claude
phase: 9
---

## What

Lex opened a file's details on the preview editor (dark, 1600 px window) and said: "The design when a media file is open can be improved. this looks horrible. use mobbin MCP for inspiration, heck you could use wordpress for that as well".

Today: a big preview with a black band on the right; Replace everywhere… / Optimise… / ⋯ under it; a right column with the File name input, the facts line, a collapsible Usage row, four collection checkboxes and a New collection input, a Description textarea with two helper lines, Decorative and Always keep checkboxes, Cancel / Save details at the bottom, and a lot of empty space under the preview.

Redesign it as a modern asset detail view, after real research (Mobbin: Google Drive/Photos info pane, Dropbox, Shopify Files, Framer/Webflow asset panels, Squarespace, Canva, Figma; WordPress Attachment details). Direction, to adjust from the research:

- The preview fills the left with no black bands, on the checkerboard for see-through files.
- The right column is a calm inspector: the name as the heading (editable in place), the facts line, then grouped sections with small headings and dividers: Description (alt-text help in one short line), Usage list, Collections as compact chips instead of a checkbox list plus a New collection field, Settings (Decorative, Always keep as switches).
- Actions in one place: Replace…, Optimise…, ⋯ with Copy path / Download / Remove in red.
- Simpler saving if possible (autosave per field with the toast and Undo, or a Save bar only when something changed); Undo keeps working.
- Every existing ability stays: rename with the taken-name check and keep-old-address, Replace everywhere, video still and subtitles, the online-video Vimeo switch, PDF and audio, the copies list, Always keep, Decorative per page rules, and slice 108's facts line.

## Done when

- A design note (below) written before coding: layout, hierarchy, spacing, type sizes, control heights, and the reference each choice follows. Third-party screens saved outside the repo in `native-site-editor-private/audit-references/mobbin/123-*`.
- Works at 390, 768, 1280 and 1600, light and dark; theme tokens and existing components reused; new code in the lazy media chunk.
- Before and after shots of details for a picture, a video, a PDF and an online video at those widths, light and dark.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
