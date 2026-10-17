---
title: "Bound retained dynamic registrations"
type: task (AFK)
status: open
assignee:
blocked_by: [22-bounded-repository-cache]
builder: sol
phase: 4
---

## What

Enforce ≤16 KiB serialized record and ≤10,000 retained registrations/namespace, preserving 10/100/1,000 admission rates and fixed 180-day lifetime. Add idempotent reservation/deletion accounting; distinguish inventoried legacy occupancy.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/oauth-registration.ts`
- `worker/oauth.ts`
- `worker/index.ts`
- `tests/oauth-limits.test.ts`
- `tests/registration-retention.test.ts`

## Done when

- Unit tests in both files: concurrency and allocation/deletion failures preserve exact logical occupancy; full capacity preserves existing registrations.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Cannot claim legacy-inclusive aggregate bound before phase-5 inventory. Unknown occupancy must not be treated as zero.
