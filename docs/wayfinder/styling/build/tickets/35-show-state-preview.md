---
title: "Preview a state while styling it"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [32-selector-chips]
---

## Goal

See the hover, focus or pressed look while editing it ([ticket 04](../../tickets/04-grill-panel-scope.md#resolution-2026-10-26)). Size: S–M.

## Decided behaviour

- With a state chip filled, the canvas shows the element in that state (the preview runtime forces the state on that element only), and stops when the chip is cleared or the panel closes.
- **Split focus:** a small control on the Hover chip splits hover from focus; until then, slice 10 writes them together.

## Files

Expected: `src/components/native-preview-runtime.js` (forced state), `src/style-panel/selector-field.ts`, a spec.

## Done when

- Filling Hover on the hero button shows its hover colour on the canvas without the mouse over it.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-35 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-35 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
