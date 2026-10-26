---
title: "The Site styles chip: every site-wide rule, findable"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [32-selector-chips]
---

## Goal

Find everything site-wide without listing it all ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), Q3 and Q4). Size: S–M.

## Decided behaviour

- One dashed **Site styles** chip (no count) in the selector field opens a searchable list of the site-wide rules that reach this element: element styles, shared classes and design values, each with its file.
- Clicking a rule opens it in the bottom code editor (`revealRule`); a site class can be picked to style it (slice 32).
- Built on slice 13; the same list Components' folded chip opens (slice 20), one shared part.

## Files

Expected: `src/style-panel/site-styles.ts`, a spec searching `focus` on the hero button.

## Done when

- On the hero button, searching `focus` finds `a:focus-visible` from `elements.css` and opens it in the code editor.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-33 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-33 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
