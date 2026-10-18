---
title: "Delete only proven eligible legacy records"
type: task (AFK)
status: open
assignee:
blocked_by: [27-legacy-inventory, 20-disable-legacy-content, 25-disconnect-lifecycle]
builder: sol
phase: 5
---

## What

Require verified browser recovery before deleting live-workspace mirrors; defer otherwise. Never replay old commands. Add ten-object canary, ≤100 objects/batch, ≤1,000 maintenance invocations/namespace/UTC day; enforce ≤5,000 written rows/day only with verified next-deletion bound.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (legacy discovery, migration budgets), [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md).

## Files

- `worker/agent-maintenance.ts`
- `scripts/agents/durable-inventory.mjs`
- `scripts/agents/durable-cleanup.mjs`
- `tests/durable-cleanup.test.ts`

## Done when

- Unit tests: nested calls charged, crash resume, quota pause, generation races and unknown/unbounded objects deferred; re-enumeration produces redacted totals. Remove manifest after verification.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

`deleteAll()` cost is not assumed free; inaccessible browser recovery cannot be inferred from old server content.
