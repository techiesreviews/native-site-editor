---
title: "Route remaining media tools through the same executor"
type: task (AFK)
status: open
assignee:
blocked_by: [16-browser-edit-tools]
builder: sol
phase: 3
---

## What

Adapt media reads/edits/settings to browser execution and durable media commit path. Preserve current result limits and explicit timeout/unknown outcomes.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools-media.ts`
- `src/agent-tools.ts`
- `src/agent-media.ts`
- `src/agent-media-actions.ts`
- `worker/mcp.ts`
- `tests/agent-tools-media.test.ts`

## Done when

- Unit tests and existing browser spec `native-mcp-media.spec.ts`: no legacy queue/storage result path; aggregate buffering stays ≤8 MiB.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Encoding may exceed 10 seconds; cancel before commit or reconcile an already-committed result. Do not silently extend deadlines.
