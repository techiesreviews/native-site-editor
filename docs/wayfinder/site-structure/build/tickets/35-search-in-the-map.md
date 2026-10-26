---
title: "Search lights up pages in the map"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map, 11-one-search-matcher]
---

## Goal

The same search, on the map ([ticket 06](../../../tickets/06-grill-search.md#resolution-2026-10-26)). Size: S.

## Decided behaviour

- A search field in the map's toolbar (the same field part as the panel's). Typing lights matching pages and fades the rest, using the shared matcher over page titles and addresses; Enter flies to the first match; Esc clears.

## Files

`src/site-map/`, tests.

## Done when

- A spec types part of a page title, sees the other tiles faded, presses Enter and the camera lands on the page.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-35 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-35 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
