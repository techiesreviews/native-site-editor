---
title: "Site health: an Inbox item for the whole site"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [40-inbox, 64-page-details-scores]
---

## Goal

Site health is an item in the Inbox, not a button, and opens a whole-site view that looks like page details ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26): "make it look like the page overview for the whole site, filtering everything per topic to improve, and allow for a full site prompt there, and a page prompt per page"). Size: M–L.

## Decided behaviour

- The item sits at the top of the Inbox while anything on the site can be improved, and goes when nothing can.
- The view: four site rings (each the average of the pages' scores in that category), then findings grouped by topic ("Pictures without a description · 3 pages"), then every page with its four scores, lowest first; clicking a column sorts by it.
- Clicking a ring filters the topics and pages to that category, as on a page.
- **Copy site prompt** covers everything (or the filtered category); each page row has its own **Copy prompt**. Both use slice 64's builder.
- Clicking a page opens its details (slice 64); clicking a topic lists its spots.
- Also reachable from the project menu.

## Files

Expected: `src/site-score/site-health.ts` (+ CSS), `src/inbox/` (the item), the project menu, tests.

## Done when

- On a fixture site with problems on three pages, the item shows, the view groups them by topic, the filter and both prompts work, and fixing the last problem removes the item.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-65 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-65 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
