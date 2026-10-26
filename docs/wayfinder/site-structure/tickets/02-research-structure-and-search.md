---
title: Find what rearranging and search need from today's code
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

- **Rearranging:** how pages, subpages and Change URL work today (`src/native-page-moves.ts`, `src/native-pages.ts`, `src/pages-and-files-explorer.ts`). What does "drag a page under another" and "add a page here" in a map need? Name the edge cases: the home page, moving a page with subpages, a name already taken, unsaved changes on the moved page, menus that link to the moved page (do links get updated?).
- **Links between pages:** can the editor cheaply find which page links to which (menus, in-text links) for drawing lines on the map? Cost on a 100-page site.
- **Search:** what Pages, Media and Files hold in memory today (titles, addresses, file names, picture names and descriptions). Is filtering as you type over all of it instant without an index? What search does the editor already have (Media search, palette)? Can one search module serve all three, DRY?

Findings on branch `research/ss-02-structure-and-search`, in `docs/wayfinder/site-structure/research/02-structure-and-search.md`.
