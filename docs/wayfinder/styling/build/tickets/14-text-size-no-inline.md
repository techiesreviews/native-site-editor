---
title: "Text size stops writing inline styles"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-css-writer-back]
---

## Goal

A silent fix found in research 09: on sites without `text-*` classes, the edit bar's Text size writes `style="font-size: …"` into the HTML (`src/native-text-size.ts:9-14`), which breaks "never inline styles" ([ticket 05](../../tickets/05-grill-where-styles-go.md#resolution-2026-10-26)). Size: S.

**Waits for** the catalogue's last release (the edit bar is rebuilt in [catalogue slice 50](../../../atomic-catalogue/build/tickets/50-organism-edit-bar.md)).

## Decided behaviour

- Where the site has no `text-*` classes, Text size offers the site's text tokens (`--text-*`) and writes a `font-size` declaration through slice 10's writer, in the component's or site class's rule as slice 11 places it once landed, else in the element's own rule.
- Sites with `text-*` classes behave as today.

## Files

Expected: `src/native-text-size.ts`, its unit test, the Text size spec.

## Done when

- On a fixture without `text-*` classes, using Text size leaves no `style` attribute in the saved HTML.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-14 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-14 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
