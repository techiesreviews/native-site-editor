---
title: "Components: the component's own rules first, site rules folded"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [13-rule-scope]
---

## Goal

Fix fault 1's first two causes and three of the smaller faults ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), items 1 and 6; research 02, fault 1 and "Other faults" 3, 5 and 6). Size: M–L.

**Waits for** [atomic-catalogue slice 64](../../../atomic-catalogue/build/tickets/64-organism-components.md) (Component panel, Edit component mode, canvas bar rebuilt from parts) to be released; written here because `blocked_by` can't point to another map.

## Decided behaviour

- In Edit component mode the rule chips show the component's own rules first. The matching site rules fold into one dashed **Site styles** chip (no count) that opens them (slice 13's scopes).
- The stylesheet pane stays on `components/<tag>/<tag>.css` while a component template is open, whatever matched (`linked-styles-controller.ts:371-378`, using `nativeComponentTagForPath(page)`).
- The new component's root shows its own `:host` rule, not `<body>` from `elements.css` (`:362-365`).
- Chip labels stop repeating the context (`:host :host`, `::slotted(h1) ::slotted`; `:295-299`); on the page, a slotted heading's chip reads the file's selector (`h1`), not the loader's `::slotted(h1)` twin.

## Files

Expected: `src/controllers/linked-styles-controller.ts`, the Edit component mode spec, unit tests for the chip order and labels.

## Done when

- On the starter's Site footer, selecting either paragraph keeps the pane on `site-footer.css`; a spec checks it.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
