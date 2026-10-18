---
title: "Build restricted resumable discovery"
type: task (AFK)
status: open
assignee:
blocked_by: [13-live-relay-core, 22-bounded-repository-cache]
builder: sol
phase: 5
---

## What

Add separately protected, disabled-by-default maintenance classification; cursor-page namespace discovery by opaque IDs. Return sanitized kinds/expiry/generation/eligibility only. Store restricted resumable manifest; report inaccessible/unknown coverage.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (legacy discovery, migration budgets), [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md).

## Files

- `worker/agent-maintenance.ts`
- `scripts/agents/durable-inventory.mjs`
- `worker/index.ts`
- `worker/app.ts`
- `tests/durable-inventory.test.ts`

## Done when

- Unit tests: pagination, permissions failures, manifest resume and secret/content exclusion; actual list permission checked before claiming coverage.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Object IDs do not reveal original names. Ordinary session GET is unsuitable for inventory.
