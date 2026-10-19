---
title: "Delete only proven eligible legacy records"
type: task (AFK)
status: closed
assignee: dor-28
blocked_by: [27-legacy-inventory, 20-disable-legacy-content, 25-disconnect-lifecycle]
builder: sol
phase: 5
---

## What

Require verified browser recovery before deleting live-workspace mirrors; defer otherwise. Never replay old commands. Add ten-object canary, ≤100 objects/batch, ≤1,000 maintenance invocations/namespace/UTC day; enforce ≤5,000 written rows/day only with verified next-deletion bound.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (legacy discovery, migration budgets), [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md).

## Files

- `worker/agent-maintenance.ts`
- `scripts/agents/durable-inventory.mjs`
- `scripts/agents/durable-cleanup.mjs`
- `tests/durable-cleanup.test.ts`

## Done when

- Unit tests: nested calls charged, crash resume, quota pause, generation races and unknown/unbounded objects deferred; re-enumeration produces redacted totals. Remove manifest after verification.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

`deleteAll()` cost is not assumed free; inaccessible browser recovery cannot be inferred from old server content.

## Done (2026-10-19)

**Behaviour.**
- **Off by default, twice.** `POST /__maintenance/cleanup` (worker/agent-maintenance.ts `cleanupRoute`, one line in `route()`)
  answers 404 with no DO work unless the new, separate secret `MAINTENANCE_CLEANUP_TOKEN` (>= 32 chars) is set; it shares
  the inventory's bearer SHA-256 check (401 before DO work), takes `{id, expected, allowance, wakeDay?}` (400 otherwise) and
  makes exactly one DO fetch; a failure never forwards runtime text (503 "Cleanup unavailable", Retry-After kept). The
  script `scripts/agents/durable-cleanup.mjs` without `--delete` makes zero network calls and prints the plan.
- **Deletion-time recheck.** `SessionStore` runs the internal handler inside `blockConcurrencyWhile`, local storage only.
  It re-reads and re-classifies the object now and compares a SHA-256 fingerprint (per key: kind, eligibility, bytes,
  generation, expiry, hub grant ids/generations; key names never leave the object) with the one the inventory saw:
  any change (generation, expiry crossing or extension, key added) defers `changed`. Unknown or malformed records,
  including a hub grant that is not `{id: string}`, answer `review`; oversized objects, open sockets (`present`) and
  live legacy content (`awaiting-browser-recovery`) are deferred. Nothing in those cases is written or deleted.
- **Recovery proof (this slice).** A legacy live-workspace mirror (hub context/drafts/requests, inline context or
  commands) is deletable only once past every expiry: the hub's `expiresAt` plus a 5-minute clock margin; orphan legacy
  keys with no hub count as expired. No signed browser acknowledgement exists (no browser path in Files); old server
  content is never treated as proof. A live hub with only grants is an active registration and stays. Legacy commands
  are never replayed or acknowledged; their pending/unknown count is reported as `unresolvedCommands`.
- **Preserved always**: live sign-in sessions, `config`, live OAuth clients, unexpired one-time sign-in/request/code,
  the registration limiter, the workspace ledger, live record fences, a live session's repository cache. Ticket 25's keys
  (`alarm-deadlines`, `agent-lifecycle`, `agent-cleaned-until`, `agent-metadata`) are now classified instead of unknown.
- **Method.** Every key disposable: `deleteAlarm()` then `deleteAll()`. Otherwise per-key deletes of the expired keys only
  (chunks of 128); a retained session or fence gets one alarm at its latest expiry, nothing points at deleted data.
  Objects with lifecycle or registration retry chains defer `budget` (no finite invocation bound).
- **Budgets** (shared namespace ledger and lock with durable-inventory.mjs, refactored into `maintenanceBudget` /
  `maintenanceLock`): every call is reserved and checkpointed before it is made, no refunds: one DO fetch now, plus the
  retained-record wake on the UTC day it will run (`scheduled`), so 1,000/namespace/day holds across midnight; a reply
  reporting more invocations than reserved is charged in full and stops the run. The 5,000 written-row budget applies
  once preview accounting is given (`--rows-per-key`, `--rows-per-object`), including the wake's rows on its day
  (`scheduledRows`). Limits are never raised.
- **Stages.** Ten-object canary (across runs, <= 128 keys each), then stop `canary-complete`; batches (<= 100 per run)
  need `--canary-verified` and row accounting, otherwise `needs-accounting`. 429/503/Retry-After saves a cooldown and
  pauses; 401/403 stops `inaccessible`; a lost reply stops `interrupted` and the reserved object is re-sent once on the
  next explicit run (idempotent, charged again). Checkpoint `<deployment>-<namespace>.cleanup.json` (0600/0700, atomic)
  stores hashed object ids only.
- **Verify.** After `durable-inventory.mjs --rescan`, `--verify` reports redacted `{scanned, classified, deleted,
  deferred, unknown, review, inaccessible, reappeared, unresolvedCommands, complete}`; it removes the cleanup checkpoint
  and inventory manifest only when the rescan is newer, complete, permitted and nothing is deferred, unknown or back
  (a per-key pass that kept preserved records is not reappearance). The namespace budget file stays (no ids).

**Out-of-Files edits (needed).** worker/app.ts (route line, `MAINTENANCE_CLEANUP_TOKEN` in Env), worker/index.ts (one line
in `SessionStore.fetch`).

**Commits.** 6ebfe3b3 + 51d4e509 (Sol build, two passes after capacity stops), d08be500 (Claude: per-key pass is not
reappearance), 1a8f6473 (Sol: review 1), 0d761255 (Claude: review 2); hashes before `kit pr`'s rebase.

**Tests.** New tests/durable-cleanup.test.ts (45): route gating/auth/redaction, deleteAll vs per-key, preserved kinds,
live legacy content deferred, clock margin, orphan mirrors, unknown/malformed (incl. hub grants) review, oversized,
sockets, generation/expiry/key races, a real `SessionStore` await race (`forEachAwait`), retained wakes, zero-call plan,
nested invocations charged, shared ceiling with inventory, crash resume charged twice, quota pause, canary cap, batch
gates, <= 100/run, row ceiling, wake reservations across UTC rollover (calls and rows), verify/reappearance/manifest
removal, locks, CLI secrecy. Focused `scripts/agents/unit.sh tests/durable-cleanup.test.ts tests/durable-inventory.test.ts`
pass 65 fail 0; Sol's full run pass 4577 fail 0 (before review 2); `npm run check` ok; eslint on changed files ok (by hand).
Not run against real Cloudflare: the lead runs the canaries on preview and supplies the row accounting.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review git diff 4c17f258b15768d2b565ea9898ad30bd638fab30...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-28/20261019T003810Z`: fixed 1 (P1 a retained-record wake was
charged to today but runs on a later UTC day) and both gaps (rollover test, SessionStore await race).
Round 2 `RESULT: ok review git diff 4c17f258b15768d2b565ea9898ad30bd638fab30...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-28/20261019T004539Z`: fixed 2 (P2 a malformed nested hub grant
could let an expired hub reach deleteAll; P2 the wake's rows were not reserved on its day). Rejected 0.

**Known limits.** Live legacy hubs wait until they expire (no browser acknowledgement path); unknown or inaccessible
objects keep the manifest and block a complete claim. A hard crash leaves fail-closed locks for operator inspection.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- Boot size not run: worker and scripts only, no `src/` imports.

Landed: PR #77, merged as c3e34ee (`RESULT: ok merged #77 c3e34ee`; kit pr: tier full, check, unit, lint, specs, review, CI ok).

Follow-up (landing review round 3, gpt-6.1-sol, medium, read-only; evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-28/20261019T005150Z; read after the merge): fixed 2 in a
follow-up PR. P2: a `present` deferral was skipped forever when the fingerprint did not change (closing sockets writes
nothing); the next explicit run now retries it within budget. P2: an expired sign-in with an unexpired `oauth-pending`
ledger took the per-key path and stranded the ledger with no alarm; the ledger now follows an expired session (as the
ordinary session alarm does), and an orphan ledger's expiry joins the retained-record wake (and its reserved wake day).
New tests in tests/durable-cleanup.test.ts (47). Claude; focused unit.sh pass 67 fail 0, `npm run check` ok, eslint ok.
