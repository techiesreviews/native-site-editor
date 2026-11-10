---
title: "Motion, layer and shadow tokens"
type: task (AFK)
status: closed
assignee: fleet-lead
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

## Done (2026-11-10)

- `src/theme.css` (outside the generated block) now defines the shared values as tokens only; no component uses them yet, so nothing changes look.
- Motion: `--dur-hover` 120ms, `--dur-press` 150ms, `--dur-tooltip` 180ms, `--dur-menu` 200ms, `--dur-sheet` 300ms, `--dur-fly` 600ms, and `--ease-out`, which `media-picker.css` used as `var(--ease-out, ease-out)` but nothing defined. It is the browser's own ease-out curve (`cubic-bezier(0, 0, 0.58, 1)`), so those places look exactly as before. A steeper curve is left to the replacement slices to add when a part needs it; the boot budget had no room for an unused one.
- Layers: `--layer-raised` 1, `--layer-canvas` 20, `--layer-pins` 25, `--layer-bar` 30, `--layer-popover` 40, `--layer-dialog` 90, `--layer-tooltip` 95, `--layer-wizard` 1000, `--layer-drag` 1050, `--layer-celebration` 1100, `--layer-note` 10000. `docs/editor-colors.md` lists which raw value moves to which step and where two parts now share a step (the move changes which wins where they overlap). `tests/theme-tokens.test.ts` keeps the steps in order.
- Elevation: `--shadow-small` (step 1) and `--shadow` (step 3) stay; added `--elevation-2` and `--elevation-4` (the dialog's two-layer shadow), all through `--semantic-shadow`, so they follow light and dark.
- `docs/editor-colors.md` has a "Motion, layers and elevation" section.
- Boot size: the new tokens cost about 175 bytes gzip in the boot stylesheet (`theme.css`) and the base had about 30 bytes of room, so the same slice removes styles nothing uses: `.milestone`, `.small-dot`, `.fine-print`, `.step-number` and `.setup-card` in `src/style.css`, and the `.component-dialog__files` / `.component-dialog__notes` rule in `src/page-builder/components.css` (no script, markup or test names them), about 165 bytes gzip.
- Validation: `kit unit --affected`, `kit specs --affected`, `npm run check`, `npm run lint` and `kit size` are quoted below.
- Not run: the one-offs count (slice 04 has not landed).
- Feature list: no change (no visible change; the new tokens are not used by any screen yet)

### Review decisions

- Declined (outside this ticket's Files, "tokens only"): a script that checks every `var(--name)` has a definition. It was built in the first review rounds and removed again, with its tests, so the slice stays tokens and docs.
- Declined (nit): a `prefers-reduced-motion` block that sets the `--dur-*` tokens to 0ms: it adds boot bytes, and the doc tells the replacement slices to switch motion off.
