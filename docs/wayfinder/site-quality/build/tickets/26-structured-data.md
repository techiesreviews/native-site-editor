---
title: "Structured data on every page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [20-full-addresses]
---

## Goal

Machine-readable facts from Site settings and page details on every page ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 5; [research 02](../../tickets/02-research-geo.md#resolution-2026-10-25): structured data is on the home page only today). Size: M.

## Decided behaviour

- In the site-output step: `WebSite` and the site's organisation on the home page, `WebPage` and `BreadcrumbList` on every page, from the site name, address, logo, language and each page's title, description and dates.
- A JSON-LD block the site already has is merged, not duplicated: hand-written facts (for example the starter's business details) stay, and the editor only fills its own fields.
- Create page still drops the home page's own JSON-LD (`withoutStructuredData`, `src/native-create.ts:131`); the next save writes the new page's own.
- No FAQ sections or AI summaries ([ticket 07](../../tickets/07-grill-geo-choices.md#resolution-2026-10-26)).

## Files

Expected: `src/site-output/structured-data.ts`, `src/native-create.ts`, tests.

## Done when

- Every page of the saved new site has JSON-LD that parses and has the right types; the starter's home details are kept.
- The matching `kit site-rules` rules are enforced.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-26 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-26 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
