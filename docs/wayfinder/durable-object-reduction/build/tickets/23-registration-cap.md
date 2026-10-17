---
title: "Bound retained dynamic registrations"
type: task (AFK)
status: closed
assignee: dor-23
blocked_by: [03-remote-recovery]
builder: sol
phase: 4
---

## What

Enforce ≤16 KiB serialized record and ≤10,000 retained registrations/namespace, preserving 10/100/1,000 admission rates and fixed 180-day lifetime. Add idempotent reservation/deletion accounting; distinguish inventoried legacy occupancy.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/oauth-registration.ts`
- `worker/oauth.ts`
- `worker/index.ts`
- `tests/oauth-limits.test.ts`
- `tests/registration-retention.test.ts`

## Done when

- Unit tests in both files: concurrency and allocation/deletion failures preserve exact logical occupancy; full capacity preserves existing registrations.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Cannot claim legacy-inclusive aggregate bound before phase-5 inventory. Unknown occupancy must not be treated as zero.

## Done (2026-10-17)

Behaviour: `POST /auth/mcp/register` now refuses a stored client record over 16 KiB (UTF-8 bytes of the
serialized OAuthClient) with 400 `invalid_client_metadata` before any Durable Object call, and refuses new
registrations at 10,000 retained with 503 `temporarily_unavailable` ("The editor has reached its limit of
new app registrations. Existing connections keep working."). Capacity is checked before the rates, so a
refusal spends no rate budget. Rates (10/IP/hour, 100/hour, 1,000/day) and the fixed 180-day lifetime are
unchanged. Existing registrations are never touched.
- Accounting lives in the existing limiter object (worker/oauth-registration.ts, fixed name
  `oauth-registration-budget`), serialized by blockConcurrencyWhile and committed in storage transactions:
  reserve (one call, with the client id and expiry; counts at once) → client record PUT → finalize
  (indexes `registration:<expiry>:<id>`; failure still returns 201, the reservation already counts).
  A failed PUT releases only after a definitive 404 read; otherwise the reservation stays counted.
  Reservations unfinished after 10 minutes are promoted on the limiter alarm (unknown outcome counts as
  occupied). The alarm expires indexed entries in batches of 128. Retried reserve/finalize, double release
  and duplicate expiry are no-ops.
- Client objects delete their own expired record on their alarm (worker/index.ts).
- Legacy: the count covers only registrations admitted since this change. State carries
  `legacy: "uninventoried"`; legacy occupancy is unknown, not zero, until ticket 27's inventory, so the
  10,000 bound does not yet cover pre-change registrations.
- No new calls or writes on MCP tool, authorize or token traffic.

Commits: b059d393 (Sol build), plus the review validation-gap test (Claude).

Tests: tests/registration-retention.test.ts (13): parallel reserve/finalize/release exact occupancy;
pending counts toward capacity; cleanup alarm not postponed; reserve/finalize retries; failed deletion and
count update roll back, release retried once; failed finalize promoted, never freed; expiry at the exact
deadline, batch failures, no double decrement; failed vs ambiguous client allocation; 201 on finalize
failure; real Worker concurrent retries; client alarm deletes only expired records; reservation with a
failing alarm persists nothing. tests/oauth-limits.test.ts: capacity refusal through the Worker (no rate
spent, existing clients kept), 16 KiB exact boundary. `npm run check` ok, `scripts/agents/unit.sh` pass
4086 fail 0 (before the extra test; focused rerun pass 25), `npm run lint` ok (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; one round): defects none. Validation gap (reservation path
with a failing alarm) closed with a test. Rejected 0.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs none affected
- RESULT: ok review git diff fbfc8b4c1cc3d1595ce121d75ea6ebcdc9d8c6ea...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-23/20261017T212105Z
