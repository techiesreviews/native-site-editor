---
title: Measure how wide an image shows
type: task (AFK)
status: closed
assignee: claude (mm-32 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Size hint"; research 03 §3.

- The preview measures an image's rendered width at phone, tablet and desktop widths and either side of the site's own breakpoints (read from its stylesheets), using the cover-adjusted width when it is shaped by `object-fit: cover`.
- A pure function turns the measurements into a `sizes` list, rounded up.
- Also reports whether the image's top is on the first screen at phone or desktop width (for slice 33's loading order).
- No markup change yet.

## Done when

- `tests/image-sizes.test.ts`: measurements to `sizes`, breakpoints, cover-adjusted widths, rounding, a full-width image.
- A nightly spec measures a starter image at three widths through the preview.

## Done (2026-10-14)

**Behaviour.** The preview answers a new `measure-image` request (host: `createNativePreview().measureImage(request)`, the `inspect` request/reply pattern; validated in `preview-protocol.ts`). The frame copies the rendered page (site CSS, shadow roots and their adopted sheets, no scripts, no editor overlays; iframes kept as empty sandboxed boxes; the preview's hide-unfilled-slots rule kept) into a hidden off-screen frame and resizes that copy to 390, 768 and 1280 px and to both sides of up to 24 site breakpoints (`min-`/`max-width` and range syntax such as `(width > 900px)`, read through CSSOM). The visible preview never resizes. Pure rules in `src/page-builder/image-sizes.ts` turn the facts into a rounded-up `sizes` list (cover-adjusted widths; `vw` when the image tracks the screen, `px` otherwise; the lower measured width is the inclusive `max-width`) and a first-screen flag (top above the fold at 390 × 844 or 1280 × 800) for slice 33. No markup changes; nothing calls it yet.

**Commits.** c543ff31 (build: Sol, runner fix: the copy waits for its new viewport width), ecdc9a2b and ff1d21d4 (review fixes).

**Tests.** `tests/image-sizes.test.ts` (12: breakpoints incl. range syntax, viewports and cap, cover, full width, rounding, boundary semantics, 1px runs, first screen); protocol/link/wire/frame-guard tests extended. Nightly `tests/native-save/native-image-markup.spec.ts` (4 untagged): responsive hero at 390/768/899/900/1280 without resizing the visible frame; cover content box and missing-image error; range-syntax breakpoint and a 1,000 px embed above the image (`firstScreen` false); copy matches the visible preview's image position at the same width with an unfilled card above it (fails without the slot fix). Also passes with CI fonts. check, 2,305 unit, lint green. Full suite (3 shards): 886 passed, 4 failed, all 4 passed on rerun (load flakes; machine load ~24).

**Review (GPT-6.1 Sol).** Round 1: fixed 3 (range-syntax breakpoints ignored; six-breakpoint cap skipped breakpoints, now 24 with an even sample beyond; iframes dropped from the copy). Round 2: fixed 2 (unfilled slots reappeared in the copy; `imageSizes` threw on a run of 1px steps). Rejected 0. Not added: a component-slot image browser case (the shadow-sheet path is covered by the unfilled-card case).

**Bytes.** Boot 340 → 343 KB gzip (+3 KB: preview runtime +2 KB, index +1 KB), budget 355 KB.

**For slice 33.** Call `measureImage` when an image is placed, replaced or moved; prepend `auto, ` for lazy images; use `firstScreen` for eager/`fetchpriority`.
