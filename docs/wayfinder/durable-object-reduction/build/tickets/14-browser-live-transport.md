---
title: "Receive live commands without polling"
type: task (AFK)
status: open
assignee:
blocked_by: [10-browser-recovery, 11-clean-source-cache, 13-live-relay-core]
builder: sol
phase: 3
---

## What

Add explicit socket handshake, shared ownership/reconnect coordination and browser receipt reconciliation. Deliver through fenced command commits; send matching results. Keep background owner; focus does not transfer.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-transport.ts`
- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `src/agent-owner.ts`
- `src/main.ts`
- `tests/agent-transport.test.ts`

## Done when

- Unit tests: duplicate/stale results, two tabs, owner close, freeze/resume, restart and quota pause; live idle has **0 polling/context-heartbeat calls**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Owner loss must not silently promote another tab or replay mutations.
