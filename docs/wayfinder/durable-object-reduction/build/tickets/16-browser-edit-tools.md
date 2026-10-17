---
title: "Dispatch editing tools through atomic browser execution"
type: task (AFK)
status: open
assignee:
blocked_by: [15-browser-read-tools, 07-atomic-structural-edits]
builder: sol
phase: 3
---

## What

Adapt text/page/section/component/file tool handlers to one browser dispatch using existing guarded transformations. Preserve hashes, protected-path checks and receipt status lookup.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools-edit.ts`
- `src/agent-tools.ts`
- `src/agent-site.ts`
- `worker/mcp.ts`
- `tests/agent-tools-edit.test.ts`

## Done when

- Unit tests and existing browser spec `native-mcp.spec.ts`: ≤**4 control-path invocations**, **0 result polls**, duplicate commands apply once.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Do not perform a separate context dispatch before mutation dispatch; that would exceed the control-path target.
