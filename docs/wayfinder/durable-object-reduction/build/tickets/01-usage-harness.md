---
title: "Count transport, storage and retained bytes"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Add reusable fake namespace/storage/socket/clock counters. Separate editor/auth, agent control, data fetching, messages, lifecycle and migration. Count calls, keys read/written/deleted, serialized bytes, peak retained bytes and elapsed active waits.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `tests/fakes/counted-agent.ts`
- `tests/agent-usage.test.ts`
- `tests/mcp-harness.ts`

## Done when

- Unit test `tests/agent-usage.test.ts` verifies current 3-call authentication, **+1** first-use, 25 result polls and 18 default-wait operations. Counters handle multi-key operations and failed writes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Fake operations are billing proxies; never label them exact SQLite charges.
