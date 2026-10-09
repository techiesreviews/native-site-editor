---
title: Browser check of the starter's tones
type: task (AFK)
status: open
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
