---
title: "Account for all retained agent metadata"
type: task (AFK)
status: open
assignee:
blocked_by: [20-disable-legacy-content]
builder: sol
phase: 4
---

## What

Enforce five connections/64 KiB aggregate persistent metadata per workspace, including grants in separate objects. Reserve before allocation; make finalize/release/crash recovery idempotent. Reject additions without evicting existing connections.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/agent-metadata.ts`
- `worker/agent-context.ts`
- `worker/agent-relay.ts`
- `worker/index.ts`
- `tests/agent-metadata.test.ts`

## Done when

- Unit tests: concurrent creation, partial failures and repeated deletion cannot exceed/leak budgets; ordinary used-tool traffic adds **0 accounting writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Cross-object reservations require authoritative workspace membership; grant-record existence alone cannot authorize access.
