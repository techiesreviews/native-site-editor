---
title: The Pages tab looks better (Mobbin-led redesign)
type: task (AFK)
status: open
assignee: claude (mm-125 runner)
blocked_by: [104-media-panel-size]
builder: claude
phase: 9
---

## What

Lex looked at the editor's Pages tab (the page tree with subpages) on the preview editor, dark, 1600 px window, and said: "make pages look better, use mobbin for inspiration".

Research page and site trees on Mobbin first (Framer, Webflow, Squarespace/Wix pages, Notion/Linear/Craft sidebars, Shopify navigation); write a short design note here; then restyle the Pages tab:

- a calm header; clear home, page and folder icons;
- consistent rows, about 32–36 px on desktop and 44 px on touch;
- a clear current page, gentle hover and selected states;
- actions (add subpage, ⋯) on hover on desktop, through ⋯ on touch;
- readable in light and dark; theme tokens and shared components reused (DRY); share row/tree styles with the Files tab (slice 124) where sensible.

Every ability stays: open a page, add page and subpage, Change URL with redirects and the GitHub Pages note, move/reorder/drag, delete with the protected home page, draft/unpublished marks, keyboard tree navigation, screen-reader tree roles, and the explorer size from slice 104.

## Done when

- Design note below names, per decision, the Mobbin reference it follows; references saved outside the repo (`native-site-editor-private/audit-references/mobbin/125-*`).
- Before and after shots of the Pages tab (several pages and subpages, current page, hover, a draft, Change URL open) at 390, 768, 1280 and 1600, light and dark.
- Existing Pages specs pass; a browser spec checks row height (desktop and touch), the current page mark and hover actions.
- `npm run check`, `npm run lint`, unit tests; boot stays within budget (~350/355 KB).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Design note

(written after the Mobbin research)
