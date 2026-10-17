---
title: "Separate authentication from cache loading"
type: task (AFK)
status: open
assignee:
blocked_by: [21-workspace-metadata-caps]
builder: sol
phase: 4
---

## What

Add lightweight session/auth reads; load repository fallback only on demand. Use memory-first cache with ≤256 KiB serialized durable fallback/session; oversized listings still fetch normally. Retain until sign-out/expiry, preserving freshness/generation checks.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/index.ts`
- `worker/app.ts`
- `worker/github.ts`
- `worker/agent-context.ts`
- `worker/oauth.ts`
- `tests/session-cache-fake.ts`
- `tests/repository-cache-runtime.test.ts`

## Done when

- Existing unit test `tests/repository-cache-runtime.test.ts`: authentication reads **0 cache chunks**; byte boundary, invalidation, sign-out and expiry pass.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Cached visibility never substitutes for fresh write authorization.
