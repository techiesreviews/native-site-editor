---
title: "The site's own overview on the map"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map]
---

## Goal

A quiet card in the map's corner with the site at a glance (map destination (b); [ticket 04](../../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- The card shows the site's five scores (performance, accessibility, best practices, SEO, Agents) as rings, the number of pages in words ("14 pages", not a badge), and the last three recent changes from the History list (`src/controllers/history-controller.ts`).
- Clicking a score ring lights the pages below 90 in that score and fades the rest; clicking again clears.
- The scores are site-quality's site rings ([build slice 65](../../../site-quality/build/tickets/65-site-health.md), each the pages' average) and reuse its ring part. **If site-quality stage 6 isn't built yet,** the card shows the page count and recent changes only, with no empty ring slots; the rings appear when the scores exist.
- The "Let AI fix it" button is not on this card; Site health holds it.

## Files

`src/site-map/` (overview card), tests.

## Done when

- A spec on a fixture with one weak page clicks the speed ring and sees only that page lit.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-36 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-36 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
