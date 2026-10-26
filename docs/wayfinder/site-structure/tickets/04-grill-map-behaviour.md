---
title: Decide how the site map looks and behaves
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-zoomable-map, 02-research-structure-and-search]
---

## Question

With research 01 and 02: the zoom levels and what shows at each, lines between linked pages or only the tree, the site's own overview inside the map (pages, scores, recent changes), opening a page from the map, and very large sites.

## Resolution (2026-10-26)

Lex, after trying the [site map prototype](../prototypes/08-site-map.html) (also at `am-typing-together-poc.lexvd.workers.dev/mockups/site-map.html`) and being asked for his round 1 answers: "looks good". Taken as yes to the prototype and to every round 1 recommendation (Q1–Q11).

- **Tiles:** same size, showing each page's top screen. The whole page shows when you zoom in.
- **Layout:** home on top, its pages in a row, and deeper pages stacked in a column under their parent (the prototype's layout).
- **Zoom levels** (research 01):
  1. a name block below about 48 px;
  2. then a picture with its name, score ring and menu mark;
  3. from about 600 px, the live readable page, at most 3 at once;
  4. double-click opens the page in the editor.
- **Lines:** only the selected page's links. Pages in the header menu get a small mark.
- **First visit:** names at once, then pictures fill in, nearest to view first. Pictures are kept in IndexedDB, keyed by project, page and a fingerprint of the sources.
- **Picture tool:** snapdom now (loaded only in the picture frame), switching to the browser's HTML-in-Canvas once it ships everywhere.
- **The site's own overview:** a corner card on the map with the five site scores, the number of pages in words, and recent changes. Clicking a score lights up the pages below 90 in it.
- **Canvas:** the catalogue board becomes a shared, lazily loaded  module that serves both (research 01's list of needs).
- **Not in the prototype, for the build:** scrolling inside a live page up close (the wheel zooms today); a phone layout; Safari and Firefox checks.
