---
title: Byte budget headroom: 351 of 355 KB
status: needs-triage
assignee:
blocked_by: []
---

# Byte budget headroom: 351 of 355 KB

## What

The cold-start budget (`tests/perf/byte-budget.ts`, ticket 02) was raised
from 350 to 355 KB on 2026-10-08 (`da4e1e9`) because each controller slice
adds about 1 KB: port and API property names survive minification. dev
measures 351 KB. Further controller slices will run out of room.

## Options

- Lazy-load controllers not needed before first paint (file operations about
  4.7 KB gzip standalone, Pages actions about 5.5 KB), as history and palette
  already are. Frees roughly 8–10 KB.
- Fewer, shorter ports per controller (slice 15's builder won back only about
  100 B this way).
- Raise the budget again.

## Comments

- 2026-10-08: after slices 17 and 18, dev measures 352 KB of 355.
- 2026-10-22: `dev` measures 355 of 355 KB (cbf research 02). Lex keeps the budget (cbf ticket 04); [slice 11](../../../wayfinder/clean-up-before-features/build/tickets/11-lazy-media-and-pages.md) loads rarely used code when Media or Pages & files opens (target: 8 KB freed), and every clean-up slice stays at or under 355 KB ([build README](../../../wayfinder/clean-up-before-features/build/README.md#rules-for-the-whole-build)).
- 2026-10-25: Lex raised the budget to 362 KB for the clean-up's `main.ts` split (slice 86 measured 356 KB); [TD 12](12-boot-back-under-355-kb.md) brings boot back under 355 KB after the clean-up.
