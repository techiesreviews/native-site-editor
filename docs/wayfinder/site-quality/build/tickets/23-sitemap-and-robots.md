---
title: "sitemap.xml and robots.txt kept current"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step, 20-full-addresses]
---

## Goal

The site's `sitemap.xml` and `robots.txt` are always right ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 2; [ticket 07](../../tickets/07-grill-geo-choices.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- **sitemap.xml:** every page that can be found (no `noindex`, not `404.html`), with full addresses, written by the site-output step when the site has an address. `lastmod` is the date of the last saved change to that page: pages in this save get today's date; others keep theirs. A page with no entry yet takes the date of its last commit from GitHub, once.
- **robots.txt:** the editor keeps its own lines and leaves any other lines as written:
  - AI search robots always allowed: OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Googlebot, Bingbot;
  - AI training robots per the Site settings switch (slice 24; blocked by default): GPTBot, ClaudeBot, Google-Extended, CCBot and the like;
  - a `Sitemap:` line with the full address.
- The robot lists live in one data file (`shared/ai-crawlers.ts`) that the monthly check (slice 51) keeps current.

## Files

Expected: `src/site-output/sitemap.ts`, `src/site-output/robots.ts`, `shared/ai-crawlers.ts`, tests.

## Done when

- Saving a new site writes both files; moving, hiding or deleting a page updates the sitemap in the same commit.
- The matching `kit site-rules` rules are enforced.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-23 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-23 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
