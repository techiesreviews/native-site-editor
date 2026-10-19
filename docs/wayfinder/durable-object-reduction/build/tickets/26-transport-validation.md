---
title: "Verify real runtime and browser resource budgets"
type: task (AFK)
status: closed
assignee: dor-26
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

## Done (2026-10-19)

**Behaviour.** Test and docs only; no product code changed. The local evidence pack before preview:
- `tests/agent-runtime-budget.test.ts` (22): one test per accepted scenario with its budget in the title, on the real
  `SessionStore` through the ticket 01 usage harness (plus one Miniflare upgrade/handshake/auto-pong check). Counts are
  calls/keys/bytes, never billing. Remote-off startup/menu/visible/hidden: 0 hub calls, 0 uploads, 0 agent keys written
  (server layer; the browser layer stays in native-agent-quiet). Quiet connected idle: 300,000 virtual ms, 0 calls, 0 keys,
  0 alarms. Already-authorized read_file and write_file: 3 auth + 1 dispatch, 0 keys written, 0 GitHub fetches,
  1 command + 1 result frame; initialization (4 auth, use-grant) reported apart. Watch: 24 empty 25 s holds fill 600,000 ms,
  never more than 25, 0 server storage. Lost edit: unknown at 10,000 ms, 1 delivery. Faults: failed/unreachable ledger fails
  closed (503, 0 grants); quota-shaped DO error is classed quota, network transient, signed-out auth, sign-in kept. Caps:
  5 connections / 65,536 B ledger; 5 pending / 8,388,608 B relay; 20 / 65,536 B OAuth pending; 16,384 B client (16,385
  refused with 0 DO calls); 10,000 registrations (503); repository cache 262,144 B stored, 262,145 not, auth reads 0 cache
  keys. Lifecycle: detection 0 ms (explicit close), eligibility 300,000 ms, deletion at the alarm; sign-in and App config
  survive, 0 server draft keys. Ticket 13 gaps: a slow complete body is delivered once inside the deadline; a body larger
  than its Content-Length is refused (413), nothing sent; both write 0 keys and leave no slot or bytes held.
- `tests/native-save/native-agent-lifecycle.spec.ts` (9, fixture relay, no relay mocks): two tabs and explicit takeover;
  owner close never promotes; bfcache pagehide/pageshow; document freeze/resume; takeover while the owner is frozen; a
  discarded (closed) owner page recovered by a fresh page from IndexedDB with no replay; relay reset with the socket kept;
  server restart that closes the socket (1012) and drops the relay, then reconnect; notifications/cancelled before commit.
  Headless Chromium ignores CDP `Page.setWebLifecycleState` on a visible page, so freeze uses the document events.
- Fixture: tests/native-save/fake-hub.ts handles `/relay/cancel` and dispatch cancel keys like SessionStore;
  `/__demo/relay-reset` and `/__demo/relay-restart` hooks per sign-in (server.ts).
- `docs/wayfinder/durable-object-reduction/build/validation.md`: scenario → budget → local count → test for every ticket 07
  scenario (pointing at earlier tickets' tests where they are the evidence), local limits, and the PREVIEW checklist for
  preview-editor.techies.tools (signed-in steps; DO requests, rows read/written, duration, stored bytes; hibernation;
  deployment restart; detection vs deletion). Every preview row: not yet measured.

**Out-of-Files edit (needed).** tests/native-save/fake-websocket.ts: `closeRelaySockets` (tracks open fixture sockets per
relay) for the socket-closing restart hook.

**Commits.** 479e4ca2 (Sol build + Claude: restart-closes-socket hook and spec, freeze/takeover-while-frozen specs),
b29e0067 (review 1: discarded page; Claude); hashes before `kit pr`'s rebase.

**Tests.** `scripts/agents/unit.sh tests/agent-runtime-budget.test.ts tests/fixture-relay.test.ts` pass 23 fail 0 (by hand);
eslint on touched tests ok (by hand). Full suite `scripts/agents/full-suite.sh 3`: passed 1166, failed 0, skipped 60,
flaky 0; known flaky 0, known failing on dev 0; wall 1717 s.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). `RESULT: ok review git diff
4c17f258b15768d2b565ea9898ad30bd638fab30...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-26/20261019T004933Z`: defects none; 2 validation gaps.
Fixed 1: discard/restart destroyed no page (added the discarded-page spec). Rejected 1: connected hidden idle in the
browser is already covered by native-agent-live.spec.ts (65 s visible + 65 s hidden connected: 0 agent HTTP, 2 pings,
1 handshake; now a validation.md row).

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs 1/1 passed (native-agent-lifecycle, run twice after each change; one intermediate fail on my own
  assertions: CDP freeze fired no events, status frame has no tool name, both fixed)
- RESULT: ok specs 15/15 passed (`--affected`, fixture changed)
- RESULT: ok review git diff 4c17f258b15768d2b565ea9898ad30bd638fab30...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-26/20261019T004933Z

**Limits.** Local only: no deployed hibernation or duration, real deployment restart, silent-loss latency, renderer discard,
legacy inventory/migration accounting or rollback evidence; those are the preview checklist. Preview needs the release
lead's authorization.
