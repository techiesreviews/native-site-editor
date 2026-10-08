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

## Done when

Each waits for an observable state instead of time or ordering luck, and
passes 30 of 30 runs.
