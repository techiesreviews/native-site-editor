---
title: The Pages tab looks better (Mobbin-led redesign)
type: task (AFK)
status: closed
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

## Done (2026-10-16)

- **Behaviour (look only; every ability kept).** The Pages tab follows the design note above. Head: "Pages 11" in sentence case with the page count, and a quiet bordered "+ New page" (44 px on touch). Rows: 32 px on desktop, 44 px on every touch screen (before, tablets got 32 px), 20 px per level with a thin guide line under each open row's chevron. Icons: house for Home, page for pages, folder / open folder for a URL with no page of its own, broken link for Page not found; the current page is tinted, bold, with its icon in the link colour. Titles drop the site's name they share (" · Larkspur Studio"; rule `sharedTitleEnding` in `src/components/page-title-ending.ts`, from native-create's `TITLE_SEPARATORS`); the tree item's accessible name and the tooltip keep the full title, and Rename edits the full title. URLs line up in one left-aligned column (`clamp(14rem, 50cqi, 28rem)` from the row's start) on wide lists, desktop and touch; the URL button is only as wide as its text, so the rest of the row still opens the page. Narrow lists (under 30rem, phones) show names only; ⋯ → Change URL… shows the URL. Desktop: + and ⋯ fade in on hover or keyboard focus (shared row-action bar). Touch: only ⋯ at the row's end; Add subpage is in it. Change URL and New page open as a card (1 px line, up to 40rem) aligned with the titles. Only theme tokens; light and dark checked. Drafts keep the shared green "New" badge; "(no page)" is no longer italic.
- **Commits.** 34a4340a claim; 83296fd2 design note; 5daebfee build; 71842f0e review fixes (separators, touch-tablet column, text-wide URL button, 44 px touch rows).
- **Tests.** Unit: `tests/page-title-ending.test.ts` (shared ending, every separator, under half or one title is none, hyphenated words and colons are not endings). Browser: new `native-pages-look.spec.ts` (desktop head and count, 32 px rows, trimmed names with full accessible names, current-page mark, guide line under the chevron, one URL column, hover + and ⋯; phone 44 px rows, names only, one ⋯ at the end, Add subpage and Change URL from ⋯; 768 touch: URL column clear of ⋯; a click beside the URL opens the page). Updated `native-manager-action-fades.spec.ts` (touch rows skip the hidden + and URL; the fade test lengthens the URLs so text still runs beneath the actions). `npm run check`, `npm run lint`, unit 3494/3494; 13 Pages-related specs (create, page URLs, title refresh, conventions, explorer size, palette, boot requests, media transaction, subfolder URLs, move host, page sections, pages look, action fades) 96/96.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-125/before/` and `.../after/` (main checkout, not committed): the tree with subpages, the current page and a draft; hover; the ⋯ menu; Change URL open; a new subpage being typed, at 390 (touch), 768, 1280 and 1600, light and dark; `geometry.json` has row heights. Scenario: `.../mm-125/shots125.spec.ts`. Mobbin references: `native-site-editor-private/audit-references/mobbin/125-*.webp` (10 screens).
- **Review.** GPT-6.1 Sol, read-only, twice (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-125/review-1/`, `review-2/`). Fixed 2: the separator list now comes from native-create (adds " • " and " :: "); wide touch lists keep the URL column clear of ⋯ (with a 768 touch spec). Found while testing and fixed: the URL button had stretched to the row's end, so a click mid-row opened Change URL (caught by `native-page-sections`). Second review: no findings. Rejected: none.
- **Bytes.** 351 / 355 KB before first preview paint; boot CSS about +0.37 KB gzip (`pages-tree.css`); the title rule and icon choices live in the lazy `pages-tree` chunk.
- **Follow-ups for the lead.** The page button in the top bar still shows the full title ("Fern & Kettle · Larkspur Studio"); it could use the same shortening. The Files tab heading is still "FILES" in capitals: slice 124 may want the same calm head and can reuse `--pages-indent`-style guide lines and the URL-column pattern.
