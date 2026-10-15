---
title: The Files tab, redesigned
type: task (AFK)
status: open
assignee: claude (mm-124 runner)
blocked_by: [104-media-panel-size]
builder: claude
phase: 9
---

## What

Lex looked at the editor's Files tab (`#explorer-files`) on the preview editor (dark, 1600 px window) and said: "make the file section look better, use mobbin for inspiration". Look only; every existing ability stays.

- Research current file browsers and project file trees on Mobbin first (Google Drive, Dropbox, iCloud Drive, GitHub/VS Code-style explorers in web apps, Framer/Webflow asset panels, Linear/Notion sidebars). References are saved outside the repo in `native-site-editor-private/audit-references/mobbin/124-*`.
- A calm header: title-case heading, a quiet count.
- Clear icons by file type; a consistent row height (about 32–36 px on desktop, 44 px on touch); aligned names; a gentle hover and selected state; actions on hover (desktop) or a ⋯ button (touch); readable in light and dark.
- Keep: dragging a row into the code (slice 111's fade), uploads and the adding tray, rename / move / delete, keyboard use, Recently removed, and the explorer's size from slice 104.
- Share the row and tree styles with the Pages tab (slice 125) where that is sensible, without duplicating.

## Design note

(Written after the Mobbin research, before the build.)

## Done when

- The Files tab follows the design note at 390, 768, 1280 and 1600, light and dark.
- Every existing Files ability still works; the touched browser specs pass.
- Before/after shots (normal, folder open, hover/selected, empty, adding) at 390, 768, 1280, 1600, light and dark.
- `npm run check`, `npm run lint`, unit tests; boot stays within budget.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
