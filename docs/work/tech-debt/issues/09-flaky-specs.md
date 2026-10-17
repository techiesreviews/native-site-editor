---
title: Three flaky browser specs
status: ready-for-agent
assignee:
blocked_by: []
---

# Three flaky browser specs

## What

Pre-existing on dev, seen through Phase 5:

- `native-shared-link-host.spec.ts:82`: about 1 in 6 runs.
- `native-canvas.spec.ts:195`: the hover lands before Monaco paints the line (dev 3/30); a related canvas hint-on-pointer-leave spec failed once on 2026-10-08.
- `native-shared-authoring-host.spec.ts:282`: a fixed 1.5 s wait (dev 9/10).

Added 2026-10-17:

- `native-code-folding.spec.ts`: "a cursor placed before the folding ranges
  load stays put, and its section stays open" fails under heavy parallel load
  (a race with its worker loading; the spec's own comment admits it). Seen in
  tickets 38 and 39's `kit pr` runs.
- `tests/kit-wait.test.ts`: "output waits for a producer that closes the file
  and appends again before exiting" fails under full-suite load ("output ended
  before a line matching /^waiting /"). Ticket 28 fixed the other writer tests
  by stepping on wait scans instead of timers; apply the same approach.

## Done when

Each waits for an observable state instead of time or ordering luck, and
passes 30 of 30 runs.
