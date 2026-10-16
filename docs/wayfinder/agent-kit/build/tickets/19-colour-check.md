---
title: "Check: no raw colours outside theme.css"
type: task (AFK)
status: open
assignee:
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
