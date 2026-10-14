---
title: The wide use scanner, checked on open
type: task (AFK)
status: open
assignee: claude (mm-46 runner)
blocked_by: [11-usage-records]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "What counts as used"; research 04 §4 and 05 §5. Today Delete unused reads `.html` and `.css` only (`src/page-builder/media-workspace.ts:81`, `media-references.ts:132-170`).

- A file counts as used if its name or address appears in any text file: pages, styles, component templates, sharing tags (full addresses on the site's own domain), scripts, `sitemap.xml`, feeds, JSON and other data files, `_redirects`/`_headers`, notes such as `AGENTS.md`; also `srcset`, `data-src`, `imagesrcset`. Template-relative addresses resolve as the browser does.
- Details list where each mention was found.
- The editor checks by itself when a site opens; files not yet reached show **Not checked yet** and are never suggested; any unreadable file stops all suggestions.
- Feeds slice 11's usage records, so badges get the wider reach.

## Done when

- `tests/media-references.test.ts` extended: each file kind, full own-domain addresses, a sitemap and feed, JSON-LD, a script string, `_redirects`, unreadable file.
- `native-asset-references.spec.ts` updated: an image used only as a full `og:image` address is not unused.
- Full suite green.
