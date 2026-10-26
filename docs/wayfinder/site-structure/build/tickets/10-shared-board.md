---
title: "A shared board: the catalogue canvas, usable by the site map"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Turn the catalogue board's canvas into one shared module, `src/board/`, that the catalogue uses and the editor can load lazily for the site map ([ticket 04](../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26); research `git show origin/research/ss-01-zoomable-map:docs/wayfinder/site-structure/research/01-zoomable-map.md`, section "What the catalogue board must offer"). Size: L.

**Waits for** [atomic-catalogue build slice 05](../../../atomic-catalogue/build/tickets/05-catalogue-board.md) (the board itself) to be released; written here because `blocked_by` can't point to another map.

## Decided behaviour

- `src/board/` holds the camera and tile code; `src/catalogue/` keeps its own parts, layout and approvals and imports the board.
- What the board offers, from research 01's list:
  1. a camera module apart from the catalogue's parts (pan, pinch, wheel, keys, fit, fly to a rectangle, 100%), importable through `lazyModule()` (`src/lazy-module.ts`) without pulling in `parts.ts`;
  2. camera change events, every frame and on settle, with the visible world rectangle and the zoom;
  3. culling: off-screen tiles get `display: none`;
  4. zoom levels per tile, chosen by on-screen width, switched on settle (debounced);
  5. a tile content slot that doesn't assume same origin (a sandboxed `srcdoc` frame or an `<img>`);
  6. a minimum zoom from the content (fit-all), not a fixed one;
  7. selection, drag to move and drop targets in world coordinates;
  8. a lines layer in world coordinates (SVG);
  9. an accessible outline: every tile reachable by keyboard and screen reader, culled ones included.
- Zoom stays a CSS transform with `will-change` only while moving (research ac-02); after the camera stops, the layer is redrawn sharp (the prototype's fix for blurry close-ups).
- The catalogue board looks and behaves exactly as before; its specs stay green.
- The board ships in the production editor as a lazy chunk; `catalogue.html` stays preview-only (`CATALOGUE=1`).

## Files

Expected: `src/board/` (new: camera, tiles, culling, levels, lines, outline), `src/catalogue/board.ts` (uses it), `docs/agents/code-map.md`, unit tests for the camera maths and culling, the catalogue board spec.

## Done when

- A unit test places 500 tiles and checks culling and levels for three camera positions.
- The catalogue board spec passes unchanged; `kit size` shows the editor boot at ±0 KB and a new lazy board chunk.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
