---
title: Find how a zoomable map can show real pages
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

How can the site map show every page as the real page, from a dot on the map down to the full page you can read, smoothly, on sites of 10, 100 and 500 pages?

- **Pictures of pages:** live sandboxed frames at every zoom level, snapshots taken from the preview (canvas or image), or a mix (snapshots far away, a live frame up close). Measure memory and frame rate in Chromium for each.
- **Zoom levels:** what shows at each level (a dot or title, a small picture with its ring, a readable page). Look at Figma, Paper, tldraw, Relume's sitemap builder, Octopus.do and Miro for patterns.
- **The canvas:** what the atomic catalogue's board (build slice 05, `src/catalogue/`) gives, and what it needs to serve both.
- **Where snapshots live:** memory only, IndexedDB, or files in the repo. The project overview's pictures (local-folders ticket 12) use the same thing.
- **Boot size:** everything loads lazily, outside the boot budget (355 KB goal).

Findings on branch `research/ss-01-zoomable-map`, in `docs/wayfinder/site-structure/research/01-zoomable-map.md`.
