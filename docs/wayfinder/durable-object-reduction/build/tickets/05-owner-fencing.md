---
title: "Serialize takeover, revocation and command identity"
type: task (AFK)
status: open
assignee:
blocked_by: [04-durable-agent-records]
builder: sol
phase: 2
---

## What

Scope IDs/payload hashes to account/repository/branch, authorization and generation. Store ownership generation durably; explicit takeover pauses admission, reconciles outcomes and reloads drafts. Commit validates ownership, cancellation and expected revisions in the same transaction.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/agent-records.ts`
- `shared/agent-command.ts`
- `src/agent-owner.ts`
- `tests/agent-owner.test.ts`

## Done when

- Unit test covers duplicate identity mismatch, receipt eviction, manual revision races, completed revocation, takeover and frozen old-owner resume; **0 late commits**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

BroadcastChannel/focus cannot serve as the commit lock.
