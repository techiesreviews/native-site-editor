---
title: "Pictures: sizes, lazy loading and the main picture first"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

Every picture gets what the Media manager already gives the pictures it places ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 3; research 01, "What the editor does today": `src/page-builder/media-page-markup.ts`). Size: M.

## Decided behaviour

- In the site-output step, for pictures the Media manager did not place (template pictures, existing sites, agents): `width`/`height` from the file, `loading="lazy"` below the first screen.
- The first large picture on the first screen gets `fetchpriority="high"` and no lazy loading; when blocks move or are added, this follows on save (research 03: the added Split block became the LCP element without it).
- Responsive copies stay the Media manager's job; this slice only reuses its markup rules, never copies them.

## Files

Expected: `src/site-output/pictures.ts`, `src/page-builder/media-page-markup.ts` (shared rules), tests.

## Done when

- `kit lighthouse --site edited` shows no `lcp-discovery-insight` and no unsized pictures.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-27 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-27 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
