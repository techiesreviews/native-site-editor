---
title: "Fields: free values with one list of the right variables"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-style-panel-shell, 12-token-colours-from-preview, 13-rule-scope]
---

## Goal

The value fields of the [prototype](../../prototypes/03-styling-panel.html) ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), [ticket 04](../../tickets/04-grill-panel-scope.md#resolution-2026-10-26)). Size: M–L.

## Decided behaviour

- Every field takes free text. Clicking opens **one list**: the component's own variables that fit the property, then the site's (colour ones with light and dark swatches from slice 12), then values used in this file, then keywords. Typing searches the same list (`src/search/match.ts` if site structure's slice 11 has landed, else the palette's matcher). There is no right-click picker.
- Hovering a row previews it on the canvas; clicking applies it. `--name` plus Enter becomes `var(--name)`.
- Font family is a Select of the site's font tokens.
- **Bare numbers:** `1.5` becomes `1.5rem` by default. The panel's settings button holds "Numbers without a unit: rem / px / em", kept in the browser (question 2). Unitless properties (`line-height`, `font-weight`, `opacity`, `z-index`, flex numbers) stay bare.
- An invalid value marks the field and isn't written (no explainer text).
- Each set field has an × that clears it (slice 10's clearing).

## Files

Expected: `src/style-panel/fields.ts`, `src/style-panel/values.ts`, unit tests for the list order, units and invalid values, a spec choosing `--space-l` for the hero's padding.

## Done when

- In the hero's Spacing, clicking padding lists `--space-*` first with values; typing `2` writes `2rem`; switching the setting to px makes `2` write `2px`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-31 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-31 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
