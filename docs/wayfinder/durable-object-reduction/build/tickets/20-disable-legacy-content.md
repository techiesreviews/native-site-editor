---
title: "Reject obsolete endpoints before DO work"
type: task (AFK)
status: open
assignee:
blocked_by: [19-negotiated-cancellation]
builder: sol
phase: 4
---

## What

Disable legacy hub/context/drafts/claim/ack/request-content routes and writers; remove browser polling/upload paths. Reject stale clients before session/DO lookup, with upgrade/reconnect guidance. Retain narrow legacy readers only for migration.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/app.ts`
- `worker/agent-store.ts`
- `worker/agent-operations.ts`
- `worker/agent-requests.ts`
- `worker/agent-schemas.ts`
- `src/components/agent-menu.ts`
- `tests/agent-cutover.test.ts`

## Done when

- Unit test covers every obsolete route: **0 DO invocations**; mixed-version client cannot recreate mirrors; no persistent content writers remain reachable.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Count residual stale-client Worker requests separately. Do not delete legacy data yet.
