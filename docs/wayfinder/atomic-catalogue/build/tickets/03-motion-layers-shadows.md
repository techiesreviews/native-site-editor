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
- Motion: `--dur-hover` 120ms, `--dur-press` 150ms, `--dur-tooltip` 180ms, `--dur-menu` 200ms, `--dur-sheet` 300ms, `--dur-fly` 600ms, and `--ease-out`, which was used in `media-picker.css` as `var(--ease-out, ease-out)` but defined nowhere. It is set to the browser's own ease-out curve (`cubic-bezier(0, 0, 0.58, 1)`), so those three places look exactly as before. The steeper curve the board's parts use is `--ease-out-strong` (`cubic-bezier(0.23, 1, 0.32, 1)`); the replacement slices pick it where they want it.
- Layers: `--layer-raised` 1, `--layer-canvas` 20, `--layer-bar` 30, `--layer-popover` 40, `--layer-dialog` 90, `--layer-wizard` 1000, `--layer-celebration` 1100, `--layer-note` 10000, in the order the raw values stack today.
- Elevation: `--shadow-small` (step 1) and `--shadow` (step 3) stay; added `--elevation-2` and `--elevation-4` (the dialog's two-layer shadow), all through `--semantic-shadow`.
- `docs/editor-colors.md` has a "Motion, layers and elevation" section.
- Validation: `kit unit --affected` `RESULT: ok unit none affected`; `npm run check` ok (`RESULT: ok tokens in step`); `npm run lint` ok; `kit specs --affected` `RESULT: ok specs 1/1 passed`; `kit shots editor files structure --compare dev` `RESULT: ok shots compare dev@6dc6169 ... 84 files`.
- Not green: `kit size` `RESULT: fail size boot 355 KB over budget 355 KB`. The base was already at the limit (about 30 bytes of room, per slice 02); the 14 new tokens add about 170 bytes gzip to the boot stylesheet (`theme.css`), so the boot is about 140 bytes over. Dropping `--elevation-1` and `--elevation-3` aliases saved a little but not enough. Options for the lead: raise the budget by 1 KB, or pay the bytes back from elsewhere in the boot CSS.
- Not run: the one-offs count (slice 04 has not landed).
- Feature list: no change (no visible change; the new tokens are not used by any screen yet)
