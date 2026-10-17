---
title: "Prepare release and rollback evidence"
type: task (AFK)
status: open
assignee:
blocked_by: [29-rollout-controls]
builder: claude
phase: 6
---

## What

Produce executable release checklist and sanitized metric comparison workflow. Separate steady state, Watch, migration and stale-client requests; compare completed comparable windows. Record actual quota errors when available.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (rollback), [handoff](../../handoff.md) release evidence.

## Files

- `scripts/agents/durable-report.mjs`
- `tests/durable-report.test.ts`
- `docs/wayfinder/durable-object-reduction/build/rollout.md`
- `docs/wayfinder/durable-object-reduction/build/validation.md`

## Done when

- U validates attribution/window handling; checklist requires successful local/preview evidence and explicit production authorization. Rollback pauses features without restoring legacy behavior.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Historical quota dimension, plan and aggregate stored bytes remain unverified; no percentage-saving or incident-resolution claim without evidence.
