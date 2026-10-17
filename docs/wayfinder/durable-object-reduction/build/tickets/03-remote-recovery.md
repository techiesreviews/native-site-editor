---
title: "Distinguish quota pause from transient reconnect"
type: task (AFK)
status: open
assignee:
blocked_by: [02-explicit-remote]
builder: sol
phase: 1
---

## What

Preserve structured status/Retry-After/reset information. Positive daily-quota exhaustion stops automatic remote work; authentication failures request reconnection. Coordinate ≤5 transient reconnects within 2 minutes, starting at 1 second with exponential backoff/jitter. Manual Retry is single-flight and respects cooldowns.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `shared/agent-failure.ts`
- `src/agent-recovery.ts`
- `worker/app.ts`
- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `tests/agent-recovery.test.ts`

## Done when

- Unit tests verify quota/auth/network separation, shared budgets, authoritative cooldowns, no mutation replay and zero automatic attempts while quota-paused.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Generic 429/500/network errors are insufficient evidence of daily exhaustion.
