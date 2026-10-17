---
title: "Persist Ask agent history locally"
type: task (AFK)
status: open
assignee:
blocked_by: [06-atomic-text-edits]
builder: claude
phase: 2
---

## What

Move questions, replies, seen/dismissed states and thread retention into browser records. Enforce 50 unfinished requests, 1 MiB aggregate conversations and seven-day completed retention. Preserve unfinished work; explicit capacity errors.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/agent-records.ts`
- `src/components/agent-menu.ts`
- `src/components/agent-pins.ts`
- `src/controllers/agent-controller.ts`
- `src/controllers/page-structure-controller.ts`
- `shared/agent.ts`
- `tests/agent-conversations.test.ts`

## Done when

- Unit tests; existing browser spec `native-mcp.spec.ts` Ask agent scenarios plus reload/scope isolation. Local conversation actions produce **0 DO writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Existing request visibility assumes remote connection; local history must remain accessible after disconnect.
