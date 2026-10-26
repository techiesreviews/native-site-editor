---
title: "First visit: names first, then pictures"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map]
---

## Goal

On a browser that has no pictures yet, the map shows every page's name at once and fills in pictures, nearest to the view first ([ticket 04](../../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26)). Size: S–M.

## Decided behaviour

- Missing or stale pictures (fingerprint changed) are queued through slice 12's helper frame, ordered by distance from the view centre, re-ordered as you pan.
- Tiles without a picture show their name block at every level until theirs arrives, then it fades in. No progress bar, no count.
- The queue stops when the map closes and resumes next time.

## Files

`src/site-map/`, `src/page-pictures/` (queue order), tests.

## Done when

- A spec clears the picture store, opens the map and sees name blocks, then pictures arriving for the tiles in view first.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
