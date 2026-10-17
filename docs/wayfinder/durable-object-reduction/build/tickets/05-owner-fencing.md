---
title: "Serialize takeover, revocation and command identity"
type: task (AFK)
status: closed
assignee: dor-05
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

## Done (2026-10-17)

Behaviour: no user-visible change; nothing imports the new code yet (ticket 06 wires it).
- Command identity (shared/agent-command.ts, src/agent-records.ts): receipts record workspace key,
  authorization id, generation and payload identity. An operation id found anywhere with a different
  workspace, authorization, generation or payload is refused (`duplicate-id`); a full match returns the
  recorded receipt without reapplying, after the revocation check in the same transaction.
- Commit transaction (one readwrite over drafts + receipts + workspaces) checks, in order: revocation of
  the authorization, receipt identity/expiry, a durable cancellation tombstone, durable pause, owner
  generation, workspace revision and each expected draft. New codes: `revoked`, `cancelled`, `not-owner`,
  `capacity`.
- `revoke` writes a durable revocation record and reports receipts that won before it (never undone).
  `cancel` returns the live receipt if the edit already applied, otherwise writes a tombstone so no later
  delivery of that id applies. Tombstones and revocation records are kept indefinitely (small; no cap yet).
- Receipts: 24 h, 1,000 and 1 MiB per workspace, oldest first, evicted inside the commit (with the drafts,
  all-or-nothing) or by `evictReceipts`; drafts are never evicted; an oversized required receipt refuses
  before mutation. Expired receipts read as unknown on every lookup and an expired duplicate id is refused.
  A late delivery after eviction fails its own generation/expected-revision proof instead of applying.
- src/agent-owner.ts `createAgentOwner`: local admission gate plus explicit `takeover(outstanding)`:
  durable pause, reconcile (receipt or unknown, never replayed), snapshot + reload drafts, generation CAS
  that also proves the snapshot's revision and drafts unchanged, then a final reconcile that proves the
  acquired generation still owns the workspace unpaused and every authorization is unrevoked in one
  transaction. Superseded or failed takeovers stay paused (fail closed; a later takeover can recover).
  BroadcastChannel/focus play no part; only IndexedDB transactions decide.

Out-of-Files edits (needed): scripts/check-exports.allow.json gains a "(file unreachable)" entry for
src/agent-owner.ts (remove with the ticket 04 entries in ticket 06); tests/agent-records.test.ts adapted to
the receipt shape and moved its IndexedDB fake to tests/support/fake-agent-indexeddb.ts (shared with the
new tests).

Commits: 6e61b2ff (Sol build), 9ce52b41 (review 1 fixes, Sol), 3d9da0e8 (review 2 fix, Claude).

Tests: tests/agent-owner.test.ts (42): duplicate id mismatch per payload/authorization/generation/
account/repository/branch; matching duplicate after takeover; expired receipt and eviction redelivery;
caps; oversized receipt; completed revocation (and rollback on abort); cancellation before/after commit;
takeover order, reload failure, competing takeovers, contender during final reconciliation, revocation
before final reconciliation; `forEachAwait` races for manual draft writes, manual revision bumps,
revocation, takeover/frozen old-owner resume and cancellation at every await, each asserting 0 late
commits. Mutation check: dropping the final ownership proof fails the contender test.
`npm run check` ok, `scripts/agents/unit.sh` pass 4072 fail 0, `npm run lint` ok (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; two rounds): fixed 4 — cancellation missing from the commit
fence (P1); expired receipts still reported applied (P2); takeover reopened admission after being
superseded (P2); takeover could reveal a receipt after a revocation that landed after its last check (P2,
round 2: ownership and authorization now proven in the final reconcile transaction). Rejected 0.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs none affected
- RESULT: ok review git diff 2ad1fc36ffe8033e2372aaa86a2d559b65a52d27...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-05/20261017T191434Z
- RESULT: ok review git diff 2ad1fc36ffe8033e2372aaa86a2d559b65a52d27...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-05/20261017T192113Z
