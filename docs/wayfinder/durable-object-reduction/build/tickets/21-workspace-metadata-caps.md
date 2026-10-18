---
title: "Account for all retained agent metadata"
type: task (AFK)
status: closed
assignee: dor-21
blocked_by: [20-disable-legacy-content]
builder: sol
phase: 4
---

## What

Enforce five connections/64 KiB aggregate persistent metadata per workspace, including grants in separate objects. Reserve before allocation; make finalize/release/crash recovery idempotent. Reject additions without evicting existing connections.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/agent-metadata.ts`
- `worker/agent-context.ts`
- `worker/agent-relay.ts`
- `worker/index.ts`
- `tests/agent-metadata.test.ts`

## Done when

- Unit tests: concurrent creation, partial failures and repeated deletion cannot exceed/leak budgets; ordinary used-tool traffic adds **0 accounting writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Cross-object reservations require authoritative workspace membership; grant-record existence alone cannot authorize access.

## Done (2026-10-19)

**Behaviour.** One ledger per workspace (account + repository id + branch) in the workspace relay object
(`relayObjectName`, key `agent-metadata`, route `/agent-metadata`, inside blockConcurrencyWhile + a storage
transaction; worker/agent-metadata.ts). It counts every grant: its `agent:<sha256>` record, its hub entry (sized
for later growth: client name, first use, repository rename, generation) and the ledger itself. Caps: 5
connections and 64 KiB. The relay keeps only memory and editor-socket attachments, and Watch lives in browser
localStorage, so neither adds Durable Object metadata. Expiry is lazy; the ledger never sets an alarm, and the
shared alarm never clears it.
- **Reserve before allocation** (createGrant for token connect and OAuth token): reserve → record PUT (carries a
  60 s deadline; refused once that has passed) → hub `add-grant` → finalize. At capacity: 409 "This site already has
  5 agent connections on this branch. Disconnect one in the editor's agent menu first." (and a 64 KiB variant).
  Nothing existing is evicted. The OAuth token endpoint answers 400 `invalid_grant` with that text; an unreachable
  ledger fails closed (503, nothing allocated). The hub's silent `.slice(-20)` eviction is now a refusal.
- **Idempotent.** A repeated reserve or finalize does nothing; release is generation-checked (a stale release never
  removes a newer reservation); a double revoke never double-counts. A failed step releases only after the record
  is definitely gone (deleted or 404) and the hub entry removed; unknown outcomes stay counted.
- **Reconcile** runs only when a creation hits capacity: it releases entries whose grant is gone, expired, signed
  out, or moved to another workspace. It deletes records the hub never listed (conditional on a SHA-256 proof
  and on the hub generation) and finalizes live ones. Pending entries are left alone for 60 s, and a connection
  mid-rebind is never deleted.
- **Revoke** releases after the record delete and hub removal. **Rebind** reserves in the destination before
  the hub fence and releases the source afterwards; the record proof is an ASCII hash, so Unicode branches work.
  **Sign-out** deletes the grant records, the session and its separate hub, then releases (3 + 2n calls). An
  uncertain deletion stays counted.
- **Tool traffic unchanged:** 0 ledger calls and 0 accounting keys written; a used grant stays at 3 auth DO calls + 1
  relay dispatch (usage counters). The ledger takes its workspace only from Worker-verified identity, and
  authenticateAgent still requires the hub listing, so having a grant record alone never gives access to
  another workspace.
- Legacy grants made before this change are not in any ledger until the ticket 27 inventory.

**Out-of-Files edits (needed).** worker/app.ts (rebind, sign-out), worker/oauth.ts (token capacity error),
worker/agent-operations.ts (refuse instead of evicting at 20; generation-checked remove-grant),
tests/native-save/server.ts and fake-hub.ts (the fixture runs the real ledger and record proofs),
tests/agent-grant-reliability.test.ts, tests/agent-workspace-binding.test.ts (fakes answer the ledger route),
tests/fakes/counted-agent.ts (a ledger call may wake the relay object before a socket attaches).

**Commits.** ba36971f (Sol build), 822ee131 (Claude: cheaper sign-out, OAuth error code), a24e5991 (review 1, Sol),
fdab862a (review 2, Sol); hashes before `kit pr`'s rebase.

**Tests.** New tests/agent-metadata.test.ts (36): sixth connection refused without eviction; exact 64 KiB boundary;
lazy expiry; workspace mismatch; 8 concurrent Worker connects admit exactly 5, other branches/repos/accounts
independent; record PUT / add-grant / finalize failures; crashes between steps recovered by reconcile, young pending
kept; unknown outcomes and an unreachable ledger; repeated, missing-record, wrong-session and post-logout revokes;
rebind moves the count, capacity refusal changes nothing; overlapping A→B→A rebind keeps A's reservation; Unicode
branch and client rebind; reconcile during a held rebind keeps the moving connection; sign-out with hub deletion
failure keeps counts; delayed PUT past the deadline; OAuth token refusals; 21st hub grant refused; used tool traffic
0 ledger calls, 3 auth + 1 dispatch. Focused by hand: unit.sh on agent-metadata, agent-usage, agent-workspace-binding,
agent-grant-reliability, agent-cutover, mcp-oauth pass 95 fail 0; `npm run check` ok; lint on touched files ok.
Sol's runs also passed the full unit suite (4511) and specs 14/14.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review … evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-21/20261018T221826Z`:
fixed 3 (reconcile released without removing the hub entry; Unicode JSON in a header threw after the hub fence; a
stale rebind release removed the current reservation).
Round 2 `RESULT: ok review … evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-21/20261018T223234Z`:
fixed 2 (sign-out released while the separate hub stayed; reconcile deleted a connection mid-rebind). Rejected 0.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs 14/14 passed (affected, after review 2)
- Boot size not run: worker-only change, no `src/` imports.
