---
title: "Replace unattended waits with explicit Watch"
type: task (AFK)
status: open
assignee:
blocked_by: [17-browser-media-tools]
builder: claude
phase: 3
---

## What

Quiet waiting returns without automatic continuation. Add explicit ten-minute Watch, shared across workspace grants/tabs: one outstanding wait, ≤25 seconds each, ≤25 calls/activation. Persist only bounded activation metadata; visible deadline and explicit renewal.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/agent-relay.ts`
- `worker/mcp.ts`
- `src/agent-transport.ts`
- `src/components/agent-menu.ts`
- `src/agent-prompts.ts`
- `tests/agent-watch.test.ts`

## Done when

- Unit tests plus browser spec(s): `native-agent-quiet.spec.ts`: no automatic renewal; expiry does not revoke grants/cancel independent edits; **0 storage polling**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Update tool descriptions, empty-result hints and both copied/MCP prompts together.
