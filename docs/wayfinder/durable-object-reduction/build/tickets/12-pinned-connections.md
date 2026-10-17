---
title: "Bind grants to an explicit workspace"
type: task (AFK)
status: open
assignee:
blocked_by: [11-clean-source-cache]
builder: sol
phase: 3
---

## What

Add branch/workspace/generation identity to token and OAuth grants. Stop following the latest shared repository. Resolve OAuth selection against an explicit receiving workspace; refuse ambiguous/missing receiver. Require explicit rebind/new authorization.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/agent-context.ts`
- `worker/oauth.ts`
- `worker/app.ts`
- `shared/agent-command.ts`
- `tests/agent-workspace-binding.test.ts`

## Done when

- Unit tests and existing `tests/agent-grant-reliability.test.ts`: repository/branch changes never redirect an existing grant; stale commands fail.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Session-scoped hubs currently merge workspaces. Use one authoritative coordinator per account/repository/branch; include separate grant objects in later cap accounting.
