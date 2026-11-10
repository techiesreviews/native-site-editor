---
title: "Motion, layer and shadow tokens"
type: task (AFK)
status: open
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
- Layers: `--layer-raised` 1, `--layer-canvas` 20, `--layer-pins` 25, `--layer-bar` 30, `--layer-popover` 40, `--layer-dialog` 90, `--layer-tooltip` 95, `--layer-wizard` 1000, `--layer-drag` 1050, `--layer-celebration` 1100, `--layer-note` 10000. `docs/editor-colors.md` lists which raw value moves to which step and where two parts now share a step (the move changes which wins where they overlap).
- Elevation: `--shadow-small` (step 1) and `--shadow` (step 3) stay; added `--elevation-2` and `--elevation-4` (the dialog's two-layer shadow), all through `--semantic-shadow`.
- `docs/editor-colors.md` has a "Motion, layers and elevation" section.
- Validation: `kit unit --affected` `RESULT: ok unit none affected`; `npm run check` ok (`RESULT: ok tokens in step`); `npm run lint` ok; `kit specs --affected` `RESULT: ok specs 1/1 passed`; `kit shots editor files structure --compare dev` `RESULT: ok shots compare dev@6dc6169 ... 84 files`.
- Not green, waiting for the lead: `kit size` `RESULT: fail size boot 355 KB over budget 355 KB` (re-run after the review changes, `boot 355 KB (±0 KB)` against dev). The base was already at the limit (about 30 bytes of room, per slice 02); the new tokens add about 200 bytes gzip to the boot stylesheet (`theme.css`), so about 170 bytes over. The ticket stays open until the lead picks one: raise the boot budget (with the lead's OK on record), or pay the bytes back from elsewhere in the boot CSS. Then a passing `kit size` line is quoted here.
- Not run: the one-offs count (slice 04 has not landed).
- Feature list: no change (no visible change; the new tokens are not used by any screen yet)

### Review follow-up (2026-11-10)

- Fixed: the ticket is open again while the size gate is red; the layer scale gained `--layer-pins`, `--layer-tooltip` and `--layer-drag`, and the doc maps every raw z-index to a step and says where the move merges steps; the doc says there is no `--elevation-1` or `--elevation-3`; the easing comment says what the plain `ease-out` keyword is.
- New checks: `scripts/check-css-vars.mjs` (in `npm run check`, `RESULT: ok css vars defined`) fails when a `var(--name)` in `src/**/*.css` names a property no stylesheet declares, no script sets (a literal name or a template prefix such as `--agent${part}`) and no listed open hook covers (`--structure-surface`). A fallback does not excuse it, so it would have caught `--ease-out`; the review text said "without a fallback", which would not have, because `--ease-out` always had one. `tests/theme-tokens.test.ts` keeps the `--layer-*` values strictly increasing in written order and tests the check on fixtures, including the `--ease-out` case.
- Validation: `kit unit --affected` `RESULT: ok unit 6/6 (1 files)`; `npm run check` ok; `npm run lint` ok; `kit specs --affected` `RESULT: ok specs 1/1 passed`.
- Declined (nit): a `prefers-reduced-motion` block that sets the `--dur-*` tokens to 0ms — reason: it adds boot bytes while the size gate is already red; the doc tells the replacement slices to switch motion off.

### Review follow-up round 2 (2026-11-10)

- Fixed: `scripts/check-css-vars.mjs` now strips comments from scripts and ignores a name that sits right after `var(`, so only a name a script writes (`setProperty`, `--name:` in a `cssText` string, a template prefix) counts as defined. Tests: a script that only mentions or reads `--ghost` leaves one problem; a `cssText` or quoted `setProperty` write defines the name. The layers test now pins the eleven names in order. The doc's z-index map includes `0`, and its check paragraph says what counts.
- Still open for the lead: the size gate (see the first Done list); nothing left for the builder.
- Validation: `kit unit --affected` `RESULT: ok unit 8/8 (1 files)`; `npm run check` ok (`RESULT: ok css vars defined`); `npm run lint` ok; `kit specs --affected` `RESULT: ok specs 1/1 passed`.

### Review follow-up round 3 (2026-11-10)

- Fixed: `scripts/check-css-vars.mjs` now counts only writes: a quoted name in the first argument of `setProperty` (both arms of a ternary, as in `spotlight.ts`), `--name:` in a style string, or a template prefix. `getPropertyValue`, `removeProperty`, `var()` reads and comments no longer define a name. It also strips HTML comments from `index.html` and leaves an unclosed `/*` (a glob in a string) alone. New tests: a read with `getPropertyValue` or `removeProperty` leaves one problem; the ternary writes count; the glob and HTML comment cases.
- Still open for the lead: the size gate (`RESULT: fail size boot 355 KB over budget 355 KB`, about 170 bytes over; raise the budget by 1 KB or pay the bytes back from the boot CSS). Nothing left for the builder; this round changed no boot CSS.
