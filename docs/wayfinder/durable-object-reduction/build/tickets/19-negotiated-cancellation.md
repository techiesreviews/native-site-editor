---
title: "Propagate cancellation to the commit boundary"
type: task (AFK)
status: open
assignee:
blocked_by: [18-quiet-watch]
builder: sol
phase: 3
---

## What

Propagate negotiated protocol cancellation and request aborts through relay/executor. Modern and legacy transport loss follow their distinct rules; JSON-mode behavior gets runtime tests. Before commit cancel; after commit return applied; ambiguous loss reconciles receipts.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/mcp.ts`
- `worker/agent-relay.ts`
- `src/agent-transport.ts`
- `src/agent-tools.ts`
- `tests/mcp-harness.ts`
- `tests/agent-cancellation.test.ts`

## Done when

- Unit tests with modern/legacy runtime cases; no leaked pending entry, silent undo or mutation replay.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Existing harness buffers responses; cancellation tests need a streaming/abort-preserving transport.
