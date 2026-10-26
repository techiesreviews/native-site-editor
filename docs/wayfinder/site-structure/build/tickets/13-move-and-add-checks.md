---
title: "Moving and adding pages: exact checks and staying in place"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Small changes to the existing move and add code so the site map can use it as it is ([ticket 05](../../../tickets/05-grill-rearranging.md#resolution-2026-10-26); research 02, section 1, "What the map needs from this code"). Size: S–M.

## Decided behaviour

- **Exact drag check:** `nativeDropProblem` (`src/controllers/pages-controller.ts:301`) calls the pure `planPageMove` (`src/native-page-moves.ts`, 0.3 ms or less on 500 pages), so file clashes, busy folders and the address rule are refused while dragging, not after the drop. The Pages tab gains this too.
- **Stay in place:** `createNew` (`createNativeNew` in the pages controller) gets an option not to open the new page; the caller focuses it instead. The Pages tab keeps opening it.
- **Who links to whom:** one helper over the text index (`src/site-text-index.ts`, `linkRoute` and `filesLinkingTo` in `src/native-files.ts`) returns each page's outgoing and incoming page links, worked out once per change and cached; plus the header menu's pages from `readNavigation` (`src/page-builder/site-navigation.ts`). Links are complete once the text index is done; relative links are left out, as today.
- **Forwarding pages** from [site-quality build slice 31](../../../site-quality/build/tickets/31-github-pages-moved-pages.md) are left out of the site's page list where it is made (`deriveNativeRoutes`, `shared/native-routes.ts`), so a move back onto an old address replaces its forwarding page instead of being refused. If slice 31 already did this, this slice only adds the test.

## Files

Expected: `src/controllers/pages-controller.ts`, `src/native-page-moves.ts`, `src/native-files.ts` or a new `src/page-links.ts`, `shared/native-routes.ts`, unit tests.

## Done when

- Unit tests: a drop that `planPageMove` refuses is refused by `dropProblem` with the same reason; `createNew` with the stay option doesn't open; the link helper finds menu pages and in-text links on a fixture; moving a page back over its forwarding page works.
- The Pages tab's specs pass.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-13 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-13 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
