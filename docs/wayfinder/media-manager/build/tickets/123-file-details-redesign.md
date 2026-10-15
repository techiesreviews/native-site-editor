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

## Design note (2026-10-15, before coding)

References: Mobbin — [Air asset info pane](https://mobbin.com/screens/72feaeac-0389-4da8-b7bd-4426c6ccfcc2) (and [dark](https://mobbin.com/screens/b40bdd70-2944-4a16-afe0-843684bd7e4b)), [Shopify file detail](https://mobbin.com/screens/723a5658-3c31-428c-8822-5b4985149bef), [Squarespace File Details](https://mobbin.com/screens/5d410b4c-57e9-4fe6-8d6e-1bb7b88deea4), [Midday tag chips](https://mobbin.com/screens/20d1e422-c8df-4dc8-9531-8c1cea563ddc), [Frame.io switch sections](https://mobbin.com/screens/7b9e0067-f27c-49cb-8bb8-b4bbce49ed47), [Magnific actions in the inspector](https://mobbin.com/screens/fb00d495-1bfd-4e02-9386-bff519ce9e16), [mymind title and tags](https://mobbin.com/screens/62938eb6-28f9-4383-b799-a784c2157d69); WordPress Edit media → Details. Saved (outside the repo) as `native-site-editor-private/audit-references/mobbin/123-*.webp`.

What they agree on: the file sits whole on a calm stage that fills the left; the right is a narrow inspector whose heading is the file's name, then one line of facts, then short sections with small headings and thin dividers; tags are pills; on/off settings are switches; the quieter actions sit in one ⋯ with the destructive one last.

**Layout.**
- Wide (the details area at least 720 px, so the 768 pane and up): two columns, the stage `minmax(0, 1fr)` and the inspector `clamp(300px, 34cqi, 400px)`, 24 px apart. *(Air, Shopify, WordPress)*
- The stage: one rounded (12 px) `--surface-subtle` panel, pinned while the inspector scrolls, `clamp(320px, 100dvh − 240px, 860px)` tall, 24 px inside. The file is shown whole and centred, never enlarged past its own size; letterboxing is the calm stage colour, never black; a see-through picture keeps the checkerboard right behind it (slice 106). This also removes the empty space under the preview. *(Shopify, Air)*
- Files without a picture (audio, ZIP, a PDF without its first page) show their type picture and format in the middle of the same stage, the audio player under it. *(Dropbox, Google Drive)*
- Phone (under 720 px): one column; the preview keeps its own shape up to half the screen, no bands (slice 108), then the inspector.

**Inspector, top to bottom.**
1. **Name as the heading**: the File name field drawn as a 15 px semibold title, 36 px tall, with no box until hovered or focused; the rename notes (taken ⚠, Use …, Saved as …, Keep the old address working) under it. *(Air, mymind; Figma's asset name)*
2. **Facts**: slice 108's one 13 px muted line, then Added / Made from in 12 px. *(Shopify)*
3. **Actions in one row**, right under the facts: Replace everywhere… first, then Optimise…, then ⋯ (Copy path, Download, Remove… last in red). 36 px pills, 44 px targets. *(Magnific/Bloom put the file's actions at the inspector's top; Apple Photos' red-last menu)*
4. **Sections**, each under a 1 px `--line`, 16 px above and below, headed in 13 px semibold with an optional muted value at the end. *(Air "Boards", "Custom metadata")*
   - *Description* (pictures): the box grows with its words (3 to 8 lines); "Not described yet" sits muted at the heading's end; one 12 px help line, "For people who can't see the picture. Places with their own words keep them."; then the *Decorative* switch, since it empties and locks this box. *(WordPress "Describe the purpose… Leave empty if decorative")*
   - *Usage* and *Copies and original*: one 44 px row each with the count at the end and a chevron; opens to the list. *(Air "Boards ›", Shopify "Used in")*
   - *Still picture* and *Subtitles* (video, audio): moved from under the player into the inspector as sections.
   - *Collections*: every collection as a 32 px pill (44 px target), the file's own filled with ✓, then a pill-shaped "New collection" field. Still tick boxes underneath, so keyboards and screen readers are unchanged. *(Air "+ Add", Midday chips, Material filter chips)*
   - *Settings*: *Always keep* as a switch with its helper as the row's second line; an online Vimeo video's *Player* section uses the same switch. *(Frame.io)*
5. **Saving** ★: no Cancel / Save details row at rest. Once a field differs from what is saved, a bar pinned to the bottom shows "Unsaved changes", Discard and Save details. Saving is still one step and one Undo, as before. *(Shopify admin's contextual save bar)*

**Type and sizes.** 15 px title; 13 px body, section headings and facts; 12 px help and notes (theme `--type-*`). Controls 36 px, 44 px targets on touch. Spacing 8 / 12 / 16 / 24. Colours, radii and the switch come from the theme and the existing Adding settings switch (one shared `.media-switch`). New CSS lives in `media-detail.css`, loaded with the Media screen (lazy chunk).
