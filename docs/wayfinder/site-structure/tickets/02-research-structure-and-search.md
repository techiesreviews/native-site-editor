---
title: Find what rearranging and search need from today's code
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

- **Rearranging:** how pages, subpages and Change URL work today (`src/native-page-moves.ts`, `src/native-pages.ts`, `src/pages-and-files-explorer.ts`). What does "drag a page under another" and "add a page here" in a map need? Name the edge cases: the home page, moving a page with subpages, a name already taken, unsaved changes on the moved page, menus that link to the moved page (do links get updated?).
- **Links between pages:** can the editor cheaply find which page links to which (menus, in-text links) for drawing lines on the map? Cost on a 100-page site.
- **Search:** what Pages, Media and Files hold in memory today (titles, addresses, file names, picture names and descriptions). Is filtering as you type over all of it instant without an index? What search does the editor already have (Media search, palette)? Can one search module serve all three, DRY?

Findings on branch `research/ss-02-structure-and-search`, in `docs/wayfinder/site-structure/research/02-structure-and-search.md`.

## Resolution (2026-10-26)

Findings: `docs/wayfinder/site-structure/research/02-structure-and-search.md` on branch `research/ss-02-structure-and-search` (commit `e7e3a4852`, never merged; `kit doctor` 7/7).

- **Rearranging is mostly built:** dragging in the Pages tab already moves a page through Change URL, with its subpages and folder. Links and menus are updated, `_redirects` is offered, and one Undo takes it back. The map calls the same `dropProblem` and `confirmMove` (`src/controllers/pages-controller.ts:301-348`).
- **Gaps for the map:**
  - sibling order is alphabetical and never stored, so a drop means "at this level";
  - `createNew` opens the new page, so the map needs a "stay in the map" option;
  - the drag check should use the full `planPageMove` (0.3 ms or less);
  - slice 31's forwarding pages must be hidden from the site's page list itself.
- **Edge cases:**
  - the home page can't move;
  - a page with subpages takes its folder along;
  - a name already taken is refused;
  - unsaved changes travel with the page.
- **Links not updated on a move:** relative links, full addresses to the site's own domain, links in `.js`, `.json`, `.md` and `.xml` files, and a moved page's own relative stylesheet link. The starter uses root links only, so this hits imported sites only.
- **Links between pages are cheap to find:** about 1 ms for 100 pages and 4 ms for 500, over text already in memory. But that is 1,000–8,000 lines. Recommendation: show one page's links when it is focused, and mark pages that are in the menu instead of drawing lines.
- **Search needs no index:**
  - ranked search takes 1–2 ms per key at 100 pages and 3–14 ms at 500;
  - picture descriptions need `.editor/media.json` read on the first key press if Media was never opened.
- **One search module (DRY):** there are six matchers today. Make the palette's (`src/page-builder/palette-search.ts`) the shared rule, with "best first" and "keep the order" modes, plus small adapters for pages, files and pictures.
- **Open for Lex:**
  - reordering: leave the order alone (recommended), or let a drop also reorder the header menu;
  - Media search: use the shared rule (`gp` finds `garden-photo`, but middle-of-word letters no longer match), or keep "contains" for Media.
