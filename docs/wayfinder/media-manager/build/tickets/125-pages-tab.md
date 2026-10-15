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

References (Mobbin, saved outside the repo in `native-site-editor-private/audit-references/mobbin/125-*.webp`): Framer's Pages panel (`framer-pages-draft`, `framer-pages-add-menu`, `framer-pages-home-selected`), Squarespace pages on the web and on iOS (`squarespace-pages-guides`, `squarespace-ios-pages`), Wix Site Menu (`wix-site-menu-more`), Coda's page ⋯ menu (`coda-page-more-menu`), Gamma's pages list (`gamma-pages-url-line`), hilos' dark doc tree (`hilos-dark-tree`) and Shopify's admin sidebar (`shopify-sidebar-guides`).

What the Pages tab looked like before (preview, 1280 and 1600 dark): every row spans the 1040 px box with its URL right-aligned 600–800 px away from the title; an all-caps "PAGES" repeats the tab's name; every row has the same page icon (the Work folder a dashed page); no nesting lines; each title repeats " · Larkspur Studio"; on a phone every row carries a 44 px + and ⋯, so names shrink to "Spring …".

| Decision | Follows |
| --- | --- |
| **Header.** "Pages" in sentence case, small and muted, with the page count beside it; a quiet "+ New page" button with a plus icon at the end. No capitals. | Framer's "Pages +" section head; Evernote/Uvodo "Files 26" / "Pages 6" counts |
| **Rows.** 32 px on desktop (`--size-control`), 44 px on touch; 2 px apart; rounded pill tint, inset from the box edge. | Framer, Notion (32 px); Squarespace iOS (44 px) |
| **Indentation and nesting.** 20 px per level, and a 1 px guide line under each open parent, centred on its chevron, in the faint control-line colour. | Squarespace web, Shopify sidebar, hilos |
| **Icons.** Home a house; a page a page; a URL with subpages but no page of its own a folder (open while shown open); Page not found a broken link. Icons muted, 14 px; the current page's icon takes the link colour. | Framer (home, page, folder icons), hilos |
| **Title and URL.** The site's name shared by the titles (" · Larkspur Studio") is left off the row; the full title stays in the tooltip and for screen readers. URLs line up in one left-aligned column (from min(28rem, half the list)), muted, monospace, small; still a button that opens Change URL. In a narrow list (under 30rem: phones) the URL column is hidden; ⋯ → Change URL… still shows it. | Framer and Webflow show page names, not `<title>`s; Google Drive / Gamma show the path quietly; Squarespace iOS names only |
| **Current page.** The accent tint (`--current`), semibold title, icon in the link colour. | Framer, Wix |
| **Hover and focus.** A gentle `--hover` tint; on desktop + (add subpage) and ⋯ fade in at the row end on hover or keyboard focus (the shared row-action bar). | Notion, Coda |
| **Touch.** Only ⋯ (44 px) on each row; Add subpage is in the ⋯ menu, New page in the header. | Wix, Coda (one ⋯ per row) |
| **Drafts.** The green "New" badge stays (shared with Files), right after the title; a URL with no page shows a calm, non-italic "(no page)". | Framer's quiet "Draft" mark |
| **Change URL and New page forms.** A card under the row aligned with the titles, 1 px line, up to 40rem wide, instead of a full-width wash. | Gamma's rename/URL panel, Wix |
| **Light and dark.** Only theme tokens (`--hover`, `--current`, `--control-line`, `--muted`, `--link`); no new colours. | — |
