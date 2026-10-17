---
title: "Bound disposable browser source caching"
type: task (AFK)
status: open
assignee:
blocked_by: [10-browser-recovery]
builder: sol
phase: 2
---

## What

Introduce 32 MiB/tab LRU accounting keyed by account/repository/immutable revision/path. Route clean source caches through it; retain draft baselines/uploads separately. Clear private entries on account change/sign-out; reauthorize misses.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/clean-source-cache.ts`
- `src/repository-loading.ts`
- `src/main.ts`
- `tests/clean-source-cache.test.ts`

## Done when

- Unit tests verify byte eviction, in-flight accounting and account isolation; existing browser spec `native-draft-storage.spec.ts` still preserves large drafts.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Count `nativeBaseSources`, `fileContents` and other clean copies consistently; never evict required draft baselines.
