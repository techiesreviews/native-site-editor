---
title: Browser check of the starter's tones
type: task (AFK)
status: closed
assignee:
blocked_by: [60-starter-tone-rules]
builder: sol
phase: 7
---

## What

Ticket [08](../../tickets/08-accessible-tone-text.md) §3: the CSS must match the proof.

- Refresh `fixtures/actual-starter` to slice 60's commit on the starter's `dev` branch (provenance in `fixtures/actual-starter.README.md`).
- A nightly spec in the `@actual` group renders each tone in Chromium with several `--brand` values (mid-tones across the hue circle included) and asserts computed text/surface contrast of at least 4.5:1 and button fill/surface of at least 3:1.

## Done when

- The spec passes on the starter's tones and fails when the nudge is removed from the CSS (checked once by hand).
- The other tests that use `fixtures/actual-starter`, the drift test included, still pass.

**Note (2026-10-09), from slice 60:** computed colours on the starter now read back as `color(srgb-linear …)` rather than `rgb(…)`; specs comparing against exact `rgb()` values need a tolerance after `fixtures/actual-starter` is refreshed. Check both `prefers-color-scheme` modes (slice 75).

## Done (2026-10-09)

- `tests/native-save/native-tones-actual.spec.ts` (`@actual`; note CI's nightly job runs only the default fixture, so the `@actual` group runs by hand with `npm run test:browser:actual`): the starter's home and About pages (plus intro/split/quote, `.btn`, `.cta`, `.steps` and a form mounted on home), every band (header, `main > *`, footer) in each tone (none, light, dark, brand, accent), 14 brands (the starter's, `oklch(0.61 0.12 h)` every 45°, #ffd400, #0066cc, #ff0000, #808080, `oklch(0.7 0.3 150)`), `prefers-color-scheme` light and dark, with Chromium's `contrast-color()` and with the computed-text fallback. Colours are read back as the 8-bit sRGB pixel a canvas paints, so `color(srgb-linear …)` and `oklch(…)` need no parsing and the thresholds apply without a tolerance; partial opacity, filters or blending on measured text fail the spec rather than being misjudged. 21,840 checks in ~8 s; worst text and fill both 4.935:1. Compositing helper unit-tested in `tests/tone-contrast.test.ts`.
- `fixtures/actual-starter` was already at the starter's `dev` head `6a20035` (slice 77); unchanged. By hand: with the nudge removed from `tones.css` the spec fails 1,656 checks, all on the computed-text fallback (e.g. hue 0 brand header 3.94:1); `contrast-color()` alone masks a missing nudge, hence both passes.
- `npm run check`, `npm test` pass; the `@actual` group and the drift test pass except `native-edit-bar-label-actual.spec.ts` at 760 px (fails on `origin/dev` too, see slice 77).
- Only Chromium was run: WebKit lacks system libraries on this machine (`libevent`, `libavif`, `libmanette`) and Firefox is not installed. Built by Sol, checked by Claude. Commits on `dev`: 76ed867, a65a64c, 515526c (and this note).
