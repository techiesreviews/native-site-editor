---
title: "Bound unfinished authorization requests and codes"
type: task (AFK)
status: closed
assignee: dor-24
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

## Done (2026-10-18)

Behaviour: unfinished OAuth authorization requests and codes share one ledger per sign-in session,
capped at 20 records and 64 KiB (UTF-8 bytes of each serialized record). The ledger lives under its own
key (`oauth-pending`) in the sign-in session's SessionStore object, on the internal route `/oauth-pending`
(worker/oauth-pending.ts, wired in worker/index.ts inside blockConcurrencyWhile + a storage transaction).
- authorize reserves before the request PUT; at capacity it shows "Connection limit reached" (429:
  finish or cancel one, or wait up to ten minutes); an unreachable ledger fails closed (503), nothing
  allocated. Existing entries are never evicted and no deadline is extended; entries carry the record's
  exact expiry and stop counting at it (expired records are already unusable through `load`).
- consent: one atomic transition moves the request's reservation to the code (net-checked against the
  caps). Every path after the request was consumed releases or transitions exactly once: deny, wrong
  sign-in (released in the request's own sign-in ledger), invalid branch/repo, repository failure.
- token: consuming the code releases it; a duplicate use finds nothing and releases nothing.
- A failed record PUT releases only after a definitive 404 read; an ambiguous outcome stays counted until
  its own fixed expiry (at most ten minutes).
- Idempotent: retried reserve and release are no-ops; a transition only moves a reservation the ledger
  holds, so a retried transition (or one after the code was consumed) recreates nothing.
- Legacy: requests stored before this change (at most ten minutes old at deploy) have no reservation; their
  codes pass uncounted for their five minutes. No other uncounted path.
- Sign-out (session DELETE) and the session alarm delete the ledger; a session PUT keeps it. Session DELETE
  now runs inside blockConcurrencyWhile so it cannot interleave with a ledger operation.
- 0 added Durable Object calls, reads or writes on ordinary MCP tool traffic (asserted with the usage
  counters). OAuth authorize/consent/token gain one ledger call each.

Commits: 9c3afb80 (Sol build), 92873a6b (review fix), 878d1391 and 3bf099e4 after the ticket 12 rebase (consent tests
send a branch; tests/agent-workspace-binding.test.ts's fake answers the ledger route — outside Files, needed
because its fake SESSIONS returned the session record for every unknown route).

Tests: tests/oauth-pending.test.ts (13): transition net occupancy and retries; delayed transition retry after
code consumption; 21st refused without eviction or extended deadlines; 64 KiB exact boundary and net bytes;
legacy transition uncounted and expiry at the exact deadline; live-session requirement and rollback on
storage failure; real Worker: authorize 21 refused, consent+token free all occupancy, consumed consent paths
release once, code consumption releases once, failed allocations release only after 404, unreachable ledger
allocates nothing, sign-out and alarm clear it, consent fails closed; ordinary MCP reads add zero ledger
calls. `npm run check` ok, `npm run lint` ok, `scripts/agents/unit.sh` pass 4183 fail 0 (by hand; no kit
command covers them).

Review (Sol gpt-6.1-sol, medium, read-only; one round): 1 defect fixed (P2: a delayed transition retry after
code consumption recreated a phantom code reservation; fixed by moving only owned reservations, regression
test added). Rejected 0. Not re-reviewed: the fix is three lines.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok review git diff b72c6cb3ef793b9118bd5e43b3115acad6741bb2...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-24/20261018T005722Z
- RESULT: ok specs none affected

## Regression fix 24b (2026-10-18)

Symptom: on dev, tests/native-save/native-mcp.spec.ts ("an MCP client connected by OAuth…") stopped at
consent with "Too many unfinished connection requests". Kind: **test fixture bug, not production**. The
browser fixture's fake SESSIONS object (tests/native-save/server.ts) had no `/oauth-pending` route, so the
ledger POST fell through to the session read and returned the session record; `oauth.ts` saw no `allowed`
and answered 429. The real SessionStore (worker/index.ts) was correct. Fix: the fixture runs the real
`accountPending` on the `/oauth-pending` route, serialized per object (`serializeObject`, exported from
tests/native-save/fake-hub.ts), and its session DELETE clears the ledger. Caps and spec unchanged.

Commit: 60170569 (Claude). Tests: kit specs native-mcp.spec.ts reproduced the failure first, then passed 2x
after the fix; `npm run check` ok, `npm run lint` ok, `scripts/agents/unit.sh` pass 4195 fail 0 (by hand).
Review (Sol gpt-6.1-sol, medium, read-only): no defects.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: fail specs 1 of 1 failed: native-mcp.spec.ts (before the fix)
- RESULT: ok specs 1/1 passed (twice, after the fix)
- RESULT: ok review git diff 4a2cdb1985bc513f705f97b1694efaa2d041d998...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-24b/20261018T021007Z
