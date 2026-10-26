---
title: "llms.txt made automatically"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [23-sitemap-and-robots, 22-description-from-page]
---

## Goal

An `llms.txt` made from the sitemap and page descriptions, kept current on save ([ticket 07](../../tickets/07-grill-geo-choices.md#resolution-2026-10-26)). No per-page text copies. Size: S.

## Decided behaviour

- The site name and description, then one line per page that can be found: title, full address, description; in the llmstxt.org shape.
- Rewritten whole by the site-output step; the editor owns this file.

## Files

Expected: `src/site-output/llms.ts`, tests.

## Done when

- Lighthouse's `llms-txt` audit passes on the new site; the matching `kit site-rules` rule is enforced.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-25 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-25 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
