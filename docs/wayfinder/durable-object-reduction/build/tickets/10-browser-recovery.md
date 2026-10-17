---
title: "Bound receipts and export recoverable work"
type: task (AFK)
status: open
assignee:
blocked_by: [09-browser-conversations]
builder: claude
phase: 2
---

## What

Enforce receipts ≤24 hours/1,000/1 MiB. On quota failure evict eligible completed records/rebuildable caches, reconcile, then retry an uncommitted transaction at most once. Offer draft/upload export; never remove unsaved work.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/agent-records.ts`
- `src/components/agent-menu.ts`
- `src/uploads.ts`
- `src/agent-recovery-export.ts`
- `tests/agent-local-recovery.test.ts`
- `tests/native-save/native-agent-recovery.spec.ts`

## Done when

- Unit tests and B: full storage, disabled storage, uncertain commit, reload and missing upload evidence produce truthful outcomes; export includes available bytes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Receipt eviction must not make stale delivery eligible as a new edit.
