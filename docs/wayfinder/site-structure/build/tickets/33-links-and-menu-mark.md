---
title: "Selecting a page shows its links; menu pages get a mark"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map, 13-move-and-add-checks]
---

## Goal

Lines only where they help ([ticket 04](../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26); research 02, section 2: 1,000 to 8,000 links would be noise). Size: S–M.

## Decided behaviour

- The parent-child tree is always drawn (the board's lines layer).
- Selecting a page draws dashed lines to the pages it links to and from, using slice 13's link helper; its address shows on the tile. Deselecting removes them.
- Pages in the header menu get a small mark on their tile, never lines.

## Files

`src/site-map/`, tests.

## Done when

- A spec selects a page on the starter and sees lines to the pages it links to; menu pages carry the mark.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-33 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-33 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
