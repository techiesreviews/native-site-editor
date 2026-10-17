---
title: "Add a bounded hibernating workspace relay"
type: task (AFK)
status: open
assignee:
blocked_by: [12-pinned-connections]
builder: sol
phase: 3
---

## What

Add `SessionStore` WebSocket handlers backed by a small relay module; reconstruct socket identity from metadata-only attachments. Dispatch correlated requests to the explicit owner; no receiver means unavailable. Limit five pending commands/8 MiB serialized buffering; ordinary total deadline 10 seconds.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/index.ts`
- `worker/app.ts`
- `worker/agent-relay.ts`
- `tests/agent-relay.test.ts`

## Done when

- Unit tests verify overload before allocation, correlation/scope checks, restart loss, terminal payload release and **0 persistent payload writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Never hold `blockConcurrencyWhile` while awaiting the browser. Idle sockets must remain hibernatable.
