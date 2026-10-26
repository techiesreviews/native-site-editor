---
title: "Full page and share addresses from Site settings"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

Every page that can be found carries its full address in `canonical`, `og:url` and `og:image` ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 1; [research 03](../../tickets/03-research-lighthouse-today.md#resolution-2026-10-25): a new site scores SEO 92 from `href="/"`). Size: M.

## Decided behaviour

- In the site-output step: when the site has a public address (Site settings), every page that can be found gets `canonical` and `og:url` set to the address plus its route, and `og:image` as a full address. Changing the address or moving a page updates them on the next save.
- With no address yet, `canonical` and `og:url` are left out rather than written relative; `og:image` stays relative.
- Pages marked Hide from search engines (`noindex`) get no canonical.
- Template start (`prepareStarterFiles`, `shared/starting-point.ts:192`) still strips the test address; the next save fills in the real one.
- Written through the existing head writer (`src/page-builder/site-head.ts` `upsertHeadTag`), so hand-written head order is kept.
- Switches on the SEO budget's canonical rule in `kit lighthouse` and the matching rules in `kit site-rules`.

## Files

Expected: `src/site-output/addresses.ts`, `src/page-builder/site-head.ts`, `src/native-settings.ts` (address source), `shared/starting-point.ts` (comment only, if any), tests.

## Done when

- A new site with an address set saves with full canonicals on every page; `kit lighthouse --site new` shows the canonical audit passing.
- A moved page's canonical follows it.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
