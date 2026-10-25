---
title: "Motion, layer and shadow tokens"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [02-framework-shared-values]
---

## Goal

Add the shared values the Framework lacks, as editor tokens for now ([ticket 06, item 2](../../tickets/06-grill-shared-values.md#resolution-2026-10-25)).

## Decided behaviour

- Motion: durations and easings, including a defined `--ease-out` (used today, defined nowhere). The board prototype's proposals (press 150 ms, hover 120, tooltip 180, menu 200, sheet 300, fly 600) are the starting point; Lex sees them on the board's Shared values area.
- Layers: named z-index steps replacing the 68 raw z-index values over time.
- Shadows: a small set of elevation tokens, theme-aware.
- Tokens only; copies switch to them in the replacement slices.

## Files

- `src/theme.css` (outside the generated block), `docs/editor-colors.md`

## Done when

- The tokens exist and are documented; `--ease-out` is defined; nothing changes look (`kit shots --compare dev`).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-03 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-03 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
