---
title: "Verify real runtime and browser resource budgets"
type: task (AFK)
status: open
assignee:
blocked_by: [25-disconnect-lifecycle]
builder: sol
phase: 5
---

## What

Replace fake fixture’s legacy-only protocol with live-relay support; retain Miniflare coverage of actual `SessionStore`. Add deterministic fault/resource scenarios and a preview validation checklist.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (legacy discovery, migration budgets), [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md).

## Files

- `tests/native-save/server.ts`
- `tests/native-save/fake-hub.ts`
- `tests/mcp-harness.ts`
- `tests/agent-runtime-budget.test.ts`
- `tests/native-save/native-agent-lifecycle.spec.ts`
- `docs/wayfinder/durable-object-reduction/build/validation.md`

## Done when

- Unit tests and browser specs: plus full suite: remote-off/quiet idle zero polling/mirrors; ≤4 bounded control calls; all caps; freeze/discard/restart/cancellation. Preview evidence separately records hibernation, duration, detection/deletion and storage accounting.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Passing fake browser fixture does not prove hibernation. Preview execution requires release-lead authorization.
