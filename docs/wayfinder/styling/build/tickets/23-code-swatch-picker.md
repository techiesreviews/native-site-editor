---
title: "Swatches in the code, and a picker on click"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-token-colours-from-preview]
---

## Goal

Colour swatches inline in the bottom code editor for `var(--colour)` references, and a picker on click ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), item 3; [ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), Q5; the [prototype](../../prototypes/03-styling-panel.html)'s code pane is the reference). Size: M.

**Waits for** [atomic-catalogue slice 64](../../../atomic-catalogue/build/tickets/64-organism-components.md), released.

## Decided behaviour

- Every colour value in a CSS pane shows a swatch: literal colours as today (`monaco.ts:116`), and `var(--x)` from slice 12's resolved colours (light; dark beside it when they differ).
- Clicking a swatch opens a small popover: an oklch picker (lightness, chroma, hue) and the site's colour variables. Picking a variable writes `var(--name)`; picking a colour writes `oklch(…)`. Monaco's own picker never replaces a `var()` with a raw colour.
- The change shows in the preview at once and is one Undo step. The popover is a catalogue part (Dialog or Menu) and loads lazily.

## Files

Expected: `src/components/code-editor.ts`, `src/components/monaco.ts`, a lazy `src/components/colour-picker.ts` (+ CSS), unit tests for the value rewrite, a spec clicking a swatch.

## Done when

- In `site-footer.css`, clicking the swatch on `var(--muted)` and choosing `--accent` writes `var(--accent)` and the footer changes in the preview.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-23 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-23 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
