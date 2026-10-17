---
title: "Execute reads against browser-owned drafts"
type: task (AFK)
status: open
assignee:
blocked_by: [14-browser-live-transport]
builder: sol
phase: 3
---

## What

Introduce browser tool execution ports for site/files/pages/selection/export/status. Reuse current context builders and transforms; keep schema/result contracts. One relay dispatch per bounded tool; browser GitHub reads attributed separately.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools.ts`
- `src/agent-tools-read.ts`
- `src/agent-site-host.ts`
- `src/main.ts`
- `worker/mcp.ts`
- `tests/agent-tools-read.test.ts`

## Done when

- Unit tests; existing `tests/mcp-runtime.test.ts` read contracts; already-authorized simple read ≤**4 DO HTTP invocations**, zero server draft fetches.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

No dependency on absent `src/webmcp.ts`. Expose an injectable browser-local tool interface; future WebMCP can adapt it.
