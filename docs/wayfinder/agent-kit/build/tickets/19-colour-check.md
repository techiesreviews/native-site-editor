---
title: "Check: no raw colours outside theme.css"
type: task (AFK)
status: closed
assignee: ak-19
blocked_by: []
builder: sol
---

## What

- `scripts/check-colours.mjs` (run by `npm run check`): fails on hex, `rgb()/rgba()/hsl()/hsla()/oklch()/lab()/color()` literals and named colours other than `transparent`/`currentColor`/`inherit` in any CSS under `src/` except `src/theme.css`; reports `file:line`. Allowlist file `scripts/check-colours.allow.json` with `{file, match, reason}` entries for genuine exceptions (e.g. checkerboard transparency patterns), stale entries fail.
- Fix the 118 existing literals by using or adding theme tokens in `theme.css` (both light and dark); keep the rendered colours identical in light mode and sensible in dark mode. Load the good-css skill rules: modern CSS, `light-dark()` where theme.css already uses it.

## Files

- scripts/check-colours.mjs (new)
- package.json (the `check` script only)
- `src/theme.css`
- src/**/*.css files with raw colours
- `tests/check-colours.test.ts`

## Done when

- `npm run check` passes; a before/after `kit shots` (or shots.sh) of three affected screens shows no visible change in light mode.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behaviour.** `scripts/check-colours.mjs` (last step of `npm run check`) scans every CSS file under `src/` except `src/theme.css`. Comments, strings and `url()` are blanked and selectors are skipped, so `#id` and `white-space` never count. It fails with `file:line: <match>` on hex, `rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch/color()` and any CSS named colour except `transparent`/`currentColor`/`inherit`, including arguments inside `color-mix()`. One exception: an alpha-only relative colour from a token or `currentColor` (`oklch(from var(--x) l c h / 0.45)`). `scripts/check-colours.allow.json` holds `{file, match, reason}` entries. An entry without a reason, or one that matches nothing, fails.
- **Literals.** All 124 (118 functions/hex plus 6 named `white`) now use theme tokens. The request-pin tokens moved unchanged from agent-pins.css into theme.css, with their dark overrides. New role tokens: `--on-media` (with `--on-accent` and `--preview-paper` aliases), `--media-paper`, `--media-control-ink`, `--media-scrim` (sRGB 10 18 32), `--image-control-scrim` (sRGB 1 9 37, which is not `--color-primary-darkest`), `--shadow-ink`, `--media-player-surface`, `--foundation-action`, `--slot-surface`, `--items-slot-surface`, `--structure-edit-highlight`/`--structure-edit-drop` (light and dark), and `--file-<type>` for nine file kinds. theme.css keeps its `prefers-color-scheme` block (it has no `light-dark()`). Converted values are rounded to 4 significant figures and map to the same 8-bit sRGB.
- **Allow list (7).** Five alpha-only mask gradients (canvas-bar, components x2 on one match, image-large-editor, media-picker x2). Two repository-menu avatar fills, whose hue comes from each element's `--initial-hue`, which a root token cannot read.
- **Dark mode.** No changes: every literal kept its old value in both themes.
- **Commits.** Build by Sol (rebased as 27d36fa6); the runner rounded the long oklch numbers.
- **Tests.** `tests/check-colours.test.ts` (12 tests). `npm run check`, `npm run lint`, `scripts/agents/unit.sh` (3,780 pass, 0 fail).
- **Shots.** `kit shots --compare dev`, 390 and 1280, light and dark. media-gallery, image-popup, files and add-panel show no colour change in either theme (`/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-19/20261016-132708/`). Retakes of image-popup (`…/20261016-133120/`, a loading thumbnail in the first run) and files after the rebase (`…/20261016-133150/`, an older kit shots in the first run) are identical.
- **Review.** One Sol review: no defects, no gaps, no nits (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-19/20261016T132954Z`). Accepted as is: field-suggestions' inset rim reuses `--on-media` (one use, identical value).
