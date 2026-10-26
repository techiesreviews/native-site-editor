---
title: Find how a zoomable map can show real pages
type: research (AFK)
status: closed
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

## Resolution (2026-10-26)

Findings: `docs/wayfinder/site-structure/research/01-zoomable-map.md` on branch `research/ss-01-zoomable-map` (commit `e817b830f`, never merged; `kit doctor` 7/7). Measured in Chromium 153 on starter pages repeated to 10, 100 and 500.

- **Live frames don't scale:** about 3–4.5 MB each. At 500 pages that is 1.5–2.3 GB and 34 frames a second.
- **Pictures do:** pictures with off-screen culling use 0.34 GB at 57 frames a second. A mix (pictures, plus up to 3 live pages up close) costs the same. The editor's section thumbnails (`thumbnail.ts`) are no cheaper than live frames.
- **Four zoom levels** by a page's width on screen:
  1. under about 48 px, a name block;
  2. then a picture with its ring;
  3. from about 600 px, the live page fades in over its picture;
  4. double-click opens it in the editor.
- **Taking pictures:** they must be taken inside the page's own sandboxed frame. One reused, visible frame takes them all (a hidden frame is throttled to about 2 s a page). snapdom takes about 89 ms a page (99 KB gzip, loaded only in that frame). The browser's own HTML-in-Canvas takes about 67 ms; it is behind a flag in Chrome 153 and planned for 157.
- **Storage:** IndexedDB, keyed by project, page and a fingerprint of the sources, never in the repo. About 14 KB a picture (7 MB for 500 pages). The project overview's pictures use the same store.
- **Boot cost:** 0 KB, because everything loads lazily.
- **The catalogue board (slice 05) must be a shared, lazily loaded `src/board/` module.** The doc lists what it needs: camera events, culling, zoom levels per tile, a slot for a sandboxed frame, a content-based minimum zoom, drag and drop, and a lines layer.
- **Not checked:** Safari and Firefox (WebKit failed to start), heavy real pages, phone memory.
- **Open for Lex:** tile shape (top screen or whole page), first-visit fill-in, snapdom now or wait for HTML-in-Canvas.
