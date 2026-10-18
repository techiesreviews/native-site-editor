---
title: "Build restricted resumable discovery"
type: task (AFK)
status: closed
assignee: dor-27
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

## Done (2026-10-18)

- **Behaviour.** `POST /__maintenance/inventory` (worker/agent-maintenance.ts, one line in `route()`) is disabled (404, no DO work) unless the new optional secret `MAINTENANCE_INVENTORY_TOKEN` (>= 32 chars) is set; the bearer token is compared by SHA-256 digest before any DO work (401), then a 64-hex id is validated (400) and exactly one DO fetch goes through `idFromString` to the DO-internal `/maintenance/inventory` (one line in `SessionStore.fetch`). The secret is in no wrangler file. Classification is read-only (`list` pages of 128, `getAlarm`), stops at 2,048 keys or 8 MiB read and answers `deferred: oversized`. Output is an allow-listed object: kind, count, bytes, earliest/latest expiry, generation, eligibility (`preserve` / `expired` / `legacy-candidate` / `review`), hub grant and command-state counts. Kinds: sign-in session, one-time sign-in state, agent grant, legacy agent hub, its context/drafts/requests, OAuth client/request/code, pending ledger, registration limiter, repository cache (follows its sign-in session; an orphan is expired), App config, unknown. Relay metadata is reserved; agent-relay.ts stores nothing today.
- **Discovery.** `scripts/agents/durable-inventory.mjs` cursor-pages the object-list API (ids + `hasStoredData` only), saves a whole page before advancing the opaque cursor, classifies stored objects up to `--limit` (<= 100) per run, and writes a 0600 manifest (dir 0700, atomic) under the main root `.scratch/durable-inventory/`. A namespace-wide budget file enforces 1,000 maintenance calls per UTC day (charged before each call, failures included; `reserveMaintenance` exported for ticket 28) and a saved Retry-After cooldown. 401/403/`success:false` is `inaccessible`, never empty; `complete` needs a finished listing, confirmed permission and nothing pending/deferred/unknown/inaccessible. Secrets come only from env and never reach the manifest or output. Not run against real Cloudflare.
- **Commits.** acdb9c88 (Sol build; repository-cache eligibility fix by Claude), 22964e22 (review 1).
- **Tests.** tests/durable-inventory.test.ts, 19 tests: route gating, internal path not forwarded by public routes, classification and secret/content exclusion, key/byte caps, 3-page pagination, permission failures, resume, batch limit and rescan, UTC-day budget, quota/Retry-After stop, saved cooldown across resume/rescan/deployments, manifest re-sanitization and locks. `npm run check` ok, `npm run lint` ok, `scripts/agents/unit.sh` pass 4334 fail 0 (by hand: no kit command covers them).
- **Review.** One Sol review (gpt-6.1-sol, medium, read-only): fixed 1 (P2: Retry-After was not persisted, so a rerun ignored the cooldown); rejected 0.
- **Evidence.** `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected`; `RESULT: ok review git diff 1b9a678c...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-27/20261018T051057Z`.
