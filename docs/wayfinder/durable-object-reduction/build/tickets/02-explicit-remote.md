---
title: "Make remote connection an explicit action"
type: task (AFK)
status: open
assignee:
blocked_by: [01-usage-harness]
builder: claude
phase: 1
---

## What

Remote opt-in is per tab and not remembered across reloads (lead decision in the README). Remove controller startup discovery and menu-mount discovery. Start legacy transport only after explicit Connect/authorized consent; preserve a local UI shell. Stop background work on remote-off.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `src/main.ts`
- `tests/agent-controller.test.ts`
- `tests/native-save/native-agent-quiet.spec.ts`

## Done when

- Updated existing controller tests; browser spec `native-agent-quiet.spec.ts`: startup, menu opening, visible/hidden idle each produce **0 agent-hub calls/uploads/writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Consent events must be workspace-bound; existing grants alone must not silently enable remote mode.
