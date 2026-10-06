---
title: Decide which browser tests run in CI and how the configs are consolidated
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [07-what-is-left-after-removals]
---

## Question

CI (`.github/workflows/deploy-preview.yml`) runs only `check` and `npm test`. There are about 836 Playwright tests across 8 configs:
- `native-preview` and `native-quick` share a folder,
- `slot-ghosts`, `style-widgets` and `focal-draft` have no script,
- `scripts/native-browser-tests.mjs` keeps its group lists by hand.

What runs in CI, and within what time budget (a smoke slice, sharding)? Which configs merge or go? How do the groups stay correct without hand-kept lists? Do the cold-start budget checks run here too?

## Resolution (2026-10-06)

Decided with Lex.

1. Every push runs a tagged `@smoke` slice (about 30 tests, under 5 minutes) plus the byte-budget check. The full suite runs nightly and on manual dispatch, sharded across 4 runners.
2. The Playwright configs merge into one `playwright.config.ts` with a project per suite (save, preview, shared authoring/structure, page part preview). "Quick" becomes a tag/grep, not a config.
3. Groups come from test tags in the specs (`@actual`, `@native-static`, `@smoke`); `scripts/native-browser-tests.mjs` and CI select with `--grep`. The hand-kept `actualOnly`/`nativeOnly` lists are deleted.
