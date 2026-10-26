---
title: "Looks as buttons, with New look"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [32-selector-chips, 11-writer-looks-classes-tokens]
---

## Goal

The WordPress-style looks row ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), round 3; [ticket 05](../../tickets/05-grill-where-styles-go.md#resolution-2026-10-26)). Size: M–L.

## Decided behaviour

- A row of buttons, Default first, one per look the component has (`variant-intelligence.ts`). Hovering a button previews that look on the canvas; clicking makes it the one being styled (its chip in the selector field).
- **Names** for buttons and text; **small live pictures** for cards and sections, reusing `src/components/card-look-gallery.ts`. The prototype's Names / Pictures switch is not built.
- **+ New look** names a new look and writes its first `:host([data-…])` rule (slice 11); the edit bar's variant controls offer it at once.

## Files

Expected: `src/style-panel/looks.ts`, `src/components/card-look-gallery.ts` (shared), a spec making a "Large" look for the hero.

## Done when

- New look "Large" on the hero writes `:host([data-size="large"])` in `section-hero.css`, and Variants shows Size: Default / Large.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-36 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-36 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
