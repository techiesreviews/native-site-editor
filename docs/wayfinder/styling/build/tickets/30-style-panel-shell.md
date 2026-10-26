---
title: "The style panel: opens from the brush, lazily"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-css-writer-back]
---

## Goal

The panel itself, in the unblockwp layout of the [prototype](../../prototypes/03-styling-panel.html) ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), [ticket 04](../../tickets/04-grill-panel-scope.md#resolution-2026-10-26)). Size: L. *main.ts*.

**Waits for** the catalogue's last release (parts Field row, Search field, Select, Icon button, Menu and Tabs, and [slice 66](../../../atomic-catalogue/build/tickets/66-organism-top-bar.md), top bar B with its right side), and for the site structure build's last release (the gate).

## Decided behaviour

- **Open:** a brush in the edit bar when something is selected opens the panel on the right; Esc or × closes it. It works on the page and in Edit component mode.
- **Lazy:** the panel and everything only it needs load through `lazyModule()` (`src/lazy-module.ts`) on first open; boot bytes ±0. The old panel went for boot size (research 02), so the chunk size is quoted in Done.
- **From parts only:** every control is a catalogue part; no new one-off controls. good-css for the panel's own CSS.
- **Top to bottom:**
  - the HTML tag (Select);
  - the CSS Selectors field (slice 32 fills it; here it shows the element's classes read-only) with `*{}`, which shows the rule in the bottom code editor (`revealRule`, `src/controllers/linked-styles-controller.ts:337-347`);
  - **Search controls**, filtering the groups;
  - seven folding groups: Layout, Sizing, Spacing, Borders, Typography, Background and Effects. A set property's label turns the accent colour, and a group with set values gets an × that clears them.
- **Writes** go through slice 10's writer into real files as ordinary drafts: one Undo step each, shown in Compare changes, the bottom code editor following live.
- **Phone:** the panel opens as a sheet from the bottom over the canvas, the same controls in one column (question 3).

## Files

Expected: `src/style-panel/` (new: panel, groups, controller), `src/main.ts` (wiring only), the edit bar's brush, `docs/agents/code-map.md`, `docs/agents/features.md`, a spec opening the panel and changing padding on the hero.

## Done when

- Changing the hero's padding in the panel writes one declaration in `section-hero.css`, shows it in the code editor and undoes in one step; `kit size` shows boot ±0 and the new chunk.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-30 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-30 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
