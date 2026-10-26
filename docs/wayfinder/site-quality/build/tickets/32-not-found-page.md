---
title: "A 404 page on every site"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

Every site has a proper `404.html` ([ticket 08](../../tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26)). Size: S.

## Decided behaviour

- When a site has no `404.html`, the site-output step makes one from the site's own layout once, the same way Site settings' Create 404 page does today (`src/native-settings.ts:211-225`), with `noindex`. After that it is a normal page.
- The Create 404 page row in Site settings goes, since there is nothing left to create.

## Files

`src/site-output/`, `src/native-settings.ts`, `src/components/site-settings.ts`, tests.

## Done when

- Saving a site without `404.html` adds one in the same commit; saving again leaves it alone.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
