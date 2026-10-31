---
title: "What the panel writes keeps good-css and the Lighthouse targets"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [31-fields-and-values, 32-selector-chips]
---

## Goal

The panel's output stays inside site quality's rules (map 4; map Notes, Inputs). Size: M.

**Waits for** site-quality slices 10 and 11 (`kit lighthouse`, `kit site-rules`), released.

## Decided behaviour

- The writer writes logical properties (`padding-inline`, not `padding-left`), colours in `oklch()` from the picker, guarded hover, `:focus-visible` with `outline`, never `outline: none`, and reduced-motion guards for transitions that move or scale.
- **Contrast:** when a colour change drops text contrast below AA, the colour field shows it in place (catalogue in-place notice), and the page's Accessibility ring updates (site-quality stage 6, when built). The change is still allowed.
- A fixture page styled through the panel (one of each target) passes `kit site-rules` and `kit lighthouse` at the site-quality targets.

## Files

Expected: `src/page-builder/css-write.ts`, `src/style-panel/fields.ts`, a styled fixture, the budget list.

## Done when

- The styled fixture scores the site-quality targets in `kit lighthouse`, quoted in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-41 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-41 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
