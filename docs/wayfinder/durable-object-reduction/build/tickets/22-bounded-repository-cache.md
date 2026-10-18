---
title: "Separate authentication from cache loading"
type: task (AFK)
status: closed
assignee: dor-22
blocked_by: [24-authorization-cap]
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

## Done (2026-10-18)

Behaviour: a sign-in session read (`GET /` and `/consume` on SessionStore) now returns the session and the
`repositoryCacheGeneration` number only; it never reads `repositoryCache` or `repositoryCache:<n>`. That is the
read behind /mcp authentication (worker/agent-context.ts), OAuth token exchange (worker/oauth.ts), editor
session checks, account switch and sign-out; no change was needed in those two files.
- The repository list loads only when GitHub needs it (`repositories()`, the installation/repository listing
  pages behind `authorizeRepository`), through a lazy `load()` on the cache store (worker/github.ts) and a new
  `GET /repository-cache` route (`{generation, value}`, 404 for an expired or missing sign-in).
- Memory first: a per-isolate map (at most 256 entries, least recently used dropped) keyed by sign-in id +
  generation + token. A hit reads nothing durable. Entries die with the sign-in's expiry, on sign-out, account
  switch, session replacement and invalidation (generation bump). Every load and save installs its own entry
  object and fills it only if it is still the current one, so a slow durable read or an older save cannot
  restore a replaced listing.
- Durable fallback capped at 262,144 UTF-8 bytes of the JSON per sign-in session: a larger listing clears any
  older durable copy and stores nothing; it still works (kept in that isolate's memory; another isolate fetches
  GitHub normally). The PUT answers with `X-Repository-Cache-Generation` only when it was accepted for the
  current generation; only then does memory take the value.
- Unchanged: generation fencing of in-flight refills, the 60-second read freshness, writes that revalidate
  with GitHub (cached visibility never authorizes a write), deletion at sign-out (session DELETE) and at expiry
  (session alarm). No new alarms, no keepalive, no 15-minute deadline; cache retention never extends sign-in.
- /mcp authentication is still 3 DO calls (tests/agent-usage.test.ts unchanged).

Out-of-Files edit (needed): tests/fakes/counted-agent.ts gains a `readKeys` log (3 lines) so the test can
name the keys authentication reads.

Commits: e3932d26 (Sol build + Claude fix: a save without a prior load drops the old memory entry),
5d359f3d (review 1).

Tests: tests/repository-cache-runtime.test.ts now 14 tests: /mcp tools/list and `/api/session` and `/consume`
read 0 `repositoryCache*` keys with a multi-chunk durable cache stored (usage-harness key counts; auth 3 calls,
2 keys read for the session check); 262,144 bytes stored, 262,145 not (older copy cleared, alarm unchanged);
first listing reads chunks, the next is a memory hit with 0 cache keys read; oversized listing stays in memory
and a fresh isolate fetches GitHub; invalidation and session replacement fence memory, durable copy and old
refills; sign-out deletes durable keys and memory, later PUT 401; expiry hides the cache and the alarm deletes
it; slow fallback read versus repository creation (fails before the review fix). `npm run check` ok,
`npm run lint` ok, `scripts/agents/unit.sh` pass 4195 fail 0 (by hand; no kit command covers them).

Review (Sol gpt-6.1-sol, medium, read-only; one round): 1 defect fixed (P2: a delayed fallback read could
restore a listing that repository creation had cleared, because the save reused the load's memory entry;
fixed by giving every save its own entry, regression test added). Rejected 0. Not re-reviewed: the fix is
local to one function.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs 2/2 passed
- RESULT: ok review git diff 6635ffa1b27f790abe4c3afad7fac8fd9a7b6571...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-22/20261018T013222Z
