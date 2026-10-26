---
title: "Rearranging and adding pages in the map"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map, 13-move-and-add-checks]
---

## Goal

Drag a page onto another to move it under it, and add pages in place ([ticket 05](../../tickets/05-grill-rearranging.md#resolution-2026-10-26); [prototype](../../prototypes/08-site-map.html)). Size: M–L.

## Decided behaviour

- **Move:** dragging a page onto another highlights the drop target; the drop calls the Pages tab's own `dropProblem` and `confirmMove` (`src/controllers/pages-controller.ts`, through the pages host) with the dragged page as `NativePagesTarget`. Subpages and the folder go along, links and menus are updated, old addresses keep working (`_redirects`, and forwarding pages on GitHub Pages), one Undo in the top bar reverses it.
- **The result shows on the tile:** "Now /about/team/ · the old address keeps working" for a moment; Save shows the change count (catalogue slice 66).
- **Refusals** shake the tile and give the reason on it, from `dropProblem`: "Home stays at the top", "Can't go inside itself", "A page named … is already there". No toast.
- **Order stays alphabetical;** dropping between two pages means "at that level".
- **Add a page here:** a **+** on hover adds "Untitled" under that page with its name field ready in place (`createNew` with slice 13's stay option); you stay in the map and the new tile is focused. The Pages tab's "add to menu" choice stays available.
- The move confirmation is today's (it says what moves along and offers "Keep the old URL working").

## Files

`src/site-map/` (drag and add), `src/pages-and-files-host.ts` (exposing the same functions to the map), tests.

## Done when

- A spec drags Team onto About, sees the result line and the new address, presses Undo and sees it back; a drag of Home is refused with its reason; + adds a named page under Blog and the map stays open.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-34 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-34 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
