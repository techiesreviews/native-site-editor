---
title: "Clean temporary data after detected last-editor loss"
type: task (AFK)
status: open
assignee:
blocked_by: [21-workspace-metadata-caps, 22-bounded-repository-cache]
builder: sol
phase: 4
---

## What

Combine alarm deadlines by purpose. Last eligible editor loss schedules five-minute eligibility; reconnect revalidates workspace and fences old cleanup. Cleanup invalidates grants; remote traffic cannot renew presence. Sign-out/revoke denies immediately and requests scoped deletion.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/agent-lifecycle.ts`
- `worker/index.ts`
- `worker/agent-relay.ts`
- `worker/agent-context.ts`
- `worker/app.ts`
- `tests/agent-lifecycle.test.ts`

## Done when

- Unit tests: first/last tab, background tab, deadline reconnect, retried alarm, delayed deletion and absolute expiry; sign-in/config survive agent cleanup.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Check generation/presence at deletion, not only scheduling. Exclude remote agents from editor presence.
