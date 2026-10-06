---
title: Decide which browser tests run in CI and how the configs are consolidated
type: grilling (HITL)
status: open
assignee:
blocked_by: [07-what-is-left-after-removals]
---

## Question

CI (`.github/workflows/deploy-preview.yml`) runs only `check` and `npm test`. There are about 836 Playwright tests across 8 configs:
- `native-preview` and `native-quick` share a folder,
- `slot-ghosts`, `style-widgets` and `focal-draft` have no script,
- `scripts/native-browser-tests.mjs` keeps its group lists by hand.

What runs in CI, and within what time budget (a smoke slice, sharding)? Which configs merge or go? How do the groups stay correct without hand-kept lists? Do the cold-start budget checks run here too?
