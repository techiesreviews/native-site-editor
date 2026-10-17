---
title: "Bound unfinished authorization requests and codes"
type: task (AFK)
status: open
assignee:
blocked_by: [23-registration-cap]
builder: sol
phase: 4
---

## What

Enforce shared ≤20 records/64 KiB per sign-in for requests plus codes. Preserve ten-/five-minute expiry, atomic consumption and idempotent transitions/deletion accounting.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/oauth-pending.ts`
- `worker/oauth.ts`
- `worker/index.ts`
- `worker/app.ts`
- `tests/oauth-pending.test.ts`

## Done when

- Unit tests: request-to-code transition, duplicate consumption, expiry and failed allocation remain within caps; **0 added writes on tool traffic**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Current separate objects need coordinated accounting; reject capacity without evicting pending consent.
