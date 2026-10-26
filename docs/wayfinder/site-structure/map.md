---
label: wayfinder:map
title: Site structure
charted: 2026-10-26
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A build plan for a new way to see and shape a site:

- **Site map:** a zoomable map of all pages that you zoom into until you see the real page, and where you rearrange and add pages;
- **Search:** in Pages and files;
- **Project overview:** a home screen of all your sites, each with a picture and its scores. One site's own overview (pages, scores, recent changes) lives inside the site map.

## Notes

- **Planning only.** Fifth in Lex's order of 2026-10-23 ("a sitemap overview you zoom into until you see the actual page; a different way to structure a site", plus search and the project overview).
- **Charting answers (Lex, 2026-10-26, all as recommended):**
  - the destination above;
  - **where:** a full-screen canvas opened from the Pages part of the new left panel (top bar version B, catalogue slice 66). It reuses the catalogue board's canvas ([atomic-catalogue build slice 05](../atomic-catalogue/build/tickets/05-catalogue-board.md)): built once, DRY;
  - **rearranging:** dragging a page under another moves it through Change URL, so old addresses keep working (redirects, and forwarding pages on GitHub Pages per [site-quality build slice 31](../site-quality/build/tickets/31-github-pages-moved-pages.md)). Adding a page in the map puts it in place right away;
  - **search:** names and addresses (page titles, file names, URLs), filtering as you type (decided 2026-10-16), **plus picture names and descriptions in Media**. Text inside pages stays out for now. The search field slot is in the new left panel (catalogue slice 66);
  - **project overview:** (a) a home screen of all sites with a picture and scores; (b) one site's overview inside the site map.
- **Inputs:**
  - **The project overview is already designed** in the local-folders map ([ticket 12](../local-folders/tickets/12-prototype-project-overview.md#resolution-2026-10-14), list and grid views, the project selector, problem states). That map's hand-off (ticket 11) is still open and nothing is built. This map adds scores to the cards and decides the order against local folders.
  - **Page scores** come from the site-quality build (stage 6: rings, Site health, "Let AI fix it").
  - **Pages and files today:** `src/pages-and-files-explorer.ts`, Change URL and subpages (`src/native-page-moves.ts`, `src/native-pages.ts`); (shipped 2026-09-25).
  - **The preview** renders pages from strings into a sandboxed `srcdoc` frame (`src/components/native-preview.ts`).
- **UX rules:** no toasts, feedback in place; no counts; `docs/agents/ux-rulebook.md`.
- **Skills:** `grilling` with `domain-modeling`; `research` (branches `research/ss-NN-<slug>`); `good-css` for CSS; prototypes in `prototypes/`, served online from the PoC Worker's `/mockups/` (Lex is remote).
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier site-structure`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Hand off the site structure build plan](tickets/09-task-hand-off-build-plan.md#resolution-2026-10-26): 19 slices in four stages (foundations, search, site map, project overview), three releases; after site quality; waits in text on catalogue 05 and 66 and site-quality 31, 63, 65
- [Decide how the site map looks and behaves](tickets/04-grill-map-behaviour.md#resolution-2026-10-26): same-size top-screen tiles, four zoom levels, only the selected page's links, names then pictures, snapdom now; a site overview card with score filters
- [Decide how pages are rearranged and added in the map](tickets/05-grill-rearranging.md#resolution-2026-10-26): drag onto a page moves it through Change URL with Undo; reasons on the tile; alphabetical order; add in place and stay in the map
- [Decide how search in Pages and files works](tickets/06-grill-search.md#resolution-2026-10-26): one grouped list across Pages, Media and Files; lights up pages in the map; one shared matcher, word starts first, middle letters too
- [Decide the project overview's scope and order](tickets/07-grill-project-overview.md#resolution-2026-10-26): GitHub first, list in IndexedDB keyed like WorkspaceScope; every visit starts there; hidden after Sign out; Not opened yet cards; one ring per card
- [Prototype the site map](tickets/08-prototype-site-map.md#resolution-2026-10-26): Lex: "looks good"; the prototype is the build's reference
- [Find how a zoomable map can show real pages](tickets/01-research-zoomable-map.md#resolution-2026-10-26): pictures, not live frames (0.34 GB vs 2.3 GB at 500 pages); four zoom levels, live page only up close (max 3); pictures taken in the page's own frame, stored in IndexedDB; the catalogue board becomes a shared lazy `src/board/`
- [Find what rearranging and search need from today's code](tickets/02-research-structure-and-search.md#resolution-2026-10-26): moving is built (Pages drag via Change URL); map needs stay-in-map add and full move check; links cheap but too many to draw; search needs no index, one shared matcher
- [Find what building the project overview takes now](tickets/03-research-project-overview.md#resolution-2026-10-26): build for GitHub first, project list in IndexedDB keyed like WorkspaceScope; pictures from the preview frame; one ring per card; 16 local-folders details overtaken

## Not yet specified

- **Very large sites:** how the map behaves with hundreds of pages, or blog posts in bulk.

## Out of scope

- **Text inside pages in search:** later (Lex, 2026-10-16 and 2026-10-26).
- **Scores themselves:** the site-quality map. This map only shows them.
