---
title: "Scores on project cards and rows"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-project-overview]
---

## Goal

Each project shows how its site scores ([ticket 07](../../tickets/07-grill-project-overview.md#resolution-2026-10-26); research 03, section 3). Size: S–M.

**Waits for** [site-quality build slices 63 and 65](../../../site-quality/build/README.md) (the ring part and the site averages) to be released.

## Decided behaviour

- One ring per list row, grid card and project selector row: site-quality's ring part, filled to the site's lowest average, same colours (faint when perfect, amber below 90, red below 50); hover or focus shows the five numbers.
- The large last-project card shows the five site rings with numbers; clicking them opens the project on Site health.
- Scores come from the project record (slice 40), "from the last visit"; a project never scored shows no ring. No "as of" date and no "estimated" mark.
- In the grid the ring comes and goes with the name (on hover, focus, selection).

## Files

`src/projects/overview.ts`, the project selector rows, tests.

## Done when

- A spec with a stored score record sees the ring on the row and the five rings on the large card; clicking them opens Site health.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-44 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-44 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
