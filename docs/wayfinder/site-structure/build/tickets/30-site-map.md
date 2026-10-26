---
title: "The site map: open from Pages, zoom from the whole site to a page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-shared-board, 12-page-pictures]
---

## Goal

A full-screen map of every page, opened from the Pages part of the left panel ([ticket 04](../../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26), [ticket 08](../../../tickets/08-prototype-site-map.md#resolution-2026-10-26); the [prototype](../../prototypes/08-site-map.html) is the reference). Size: L.

## Decided behaviour

- **Open and close:** a **Map** button next to the panel's search field opens the map over the work area; Esc or × closes it and returns where you were. The map is a lazy module (`lazyModule()`), 0 KB at boot.
- **Layout (the prototype's):** home on top, its pages in a row, deeper pages stacked in a column under their parent. Same-size tiles showing each page's top screen. Order within a level is alphabetical, as in the Pages tree (`buildNativePagesTree`, `src/native-pages.ts`).
- **Zoom levels** by the tile's on-screen width, switched on settle: under about 48 px a name block; then the page's picture (slice 12) with its name at a steady screen size, the score ring (site-quality slice 63's part, when built) and the menu mark (slice 33). Pictures are decoded ahead (`img.decode()`) and switched a few at a time, so the first switch at 500 pages doesn't stall.
- **Moving around:** drag the background to pan, wheel or pinch to zoom, and **−**, **+** and **fit** in a floating toolbar. The lowest zoom comes from the content.
- **Open a page:** double-click (or Enter on a focused tile) opens it in the editor and closes the map, with the page picker showing it.
- **The outline is the accessible list:** every page reachable by keyboard, culled ones included.
- Phone and other browsers: see the README's lead decisions.

## Files

Expected: `src/site-map/` (new: map module, tree layout, tiles), the panel's Map button, CSS, a spec `tests/native-save/native-site-map.spec.ts`, `docs/agents/code-map.md`.

## Done when

- A spec opens the map on the starter, zooms from fit to a page's picture, double-clicks it and lands in the editor on that page.
- On a generated 500-page fixture the map stays above 50 frames a second while zooming (a rough `requestAnimationFrame` measure in Done) and memory stays under 0.5 GB.
- `docs/agents/features.md` gains the site map.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-30 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-30 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
