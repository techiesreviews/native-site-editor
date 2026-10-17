---
title: "Distinguish quota pause from transient reconnect"
type: task (AFK)
status: closed
assignee: dor-03
blocked_by: [02-explicit-remote]
builder: sol
phase: 1
---

## What

Preserve structured status/Retry-After/reset information. Positive daily-quota exhaustion stops automatic remote work; authentication failures request reconnection. Coordinate ≤5 transient reconnects within 2 minutes, starting at 1 second with exponential backoff/jitter. Manual Retry is single-flight and respects cooldowns.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `shared/agent-failure.ts`
- `src/agent-recovery.ts`
- `worker/app.ts`
- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `tests/agent-recovery.test.ts`

## Done when

- Unit tests verify quota/auth/network separation, shared budgets, authoritative cooldowns, no mutation replay and zero automatic attempts while quota-paused.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Generic 429/500/network errors are insufficient evidence of daily exhaustion.

## Done (2026-10-17)

Behaviour:

- `shared/agent-failure.ts` classifies remote-agent failures. Quota only on positive evidence: the Worker's `code: "daily-quota"` body (sent when a Durable Object call throws Cloudflare's documented `Exceeded allowed … in Durable Objects free tier` error, with `resetAt` = next 00:00 UTC, the documented reset) or Cloudflare's Worker error 1027 page. Generic 429/5xx/network errors are transient. Sign-in loss only on the Worker's new `code: "signed-out"` 401; an agent's expired or revoked connection no longer turns remote agents off. Retry-After is kept in full (no cap).
- `src/agent-recovery.ts`: one coordinator per workspace across tabs (localStorage record + lease, reads serialized with Web Locks, lease alone without them). Transient: at most 5 hub reads within 2 minutes of the first failure, backoff 1 s × 2^n with jitter, a 30 s limit per read, then a pause with Retry. Quota: every tab of the workspace stops polling, sharing, consent checks and waits; sign-in, drafts and local editing stay. Manual Retry is single-flight, honours Retry-After, reads only the hub (never replays a mutation or re-arms a wait), and clears quota only after a successful read.
- Agent menu: plain-words pause copy (quota with reset time; network pause), a Retry link, Connect disabled while paused. Tabs with remote agents off honour and record quota/cooldowns from their consent checks.

Commits: 81ec8e54 (Sol build), 2a3d2025 (signed-out code), 5f0e0906 (review 1), 38c564c0 (review 2), plus this Done commit.

Tests: `tests/agent-recovery.test.ts` (14 tests: classification, Retry-After, Worker quota body, shared 5-read budget, window from failure, interleaved claims, never-answering read, 48 h cooldown, quota single-flight Retry, off-tab sharing, no mutation replay, auth schedules nothing). `npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4006 fail 0 (by hand: no kit command). `kit specs native-lazy-panels.spec.ts`: `RESULT: ok specs 1/1 passed` (it failed before the signed-out fix). `kit specs --affected`: `RESULT: fail specs 2 of 13 failed: native-components.spec.ts, native-discard.spec.ts`; discard passed on rerun (flaky); components fails with `deps.canvasComponent is not a function`, fixed on dev by 02598b10, rechecked after rebase by `kit pr`.

Review: Sol (gpt-6.1-sol, medium, read-only). Round 1 (`RESULT: ok review … 20261017T154511Z`): 4 P2 fixed (non-atomic lease → Web Locks; window counted from first read → from failure; 24 h Retry-After cap removed; consent checks ignored quota). Round 2 (`RESULT: ok review … 20261017T155101Z`): 3 P2 fixed (body-read failure skipped recovery; off-tab consent checks ignored cooldowns; a never-answering read held the lock). Rejected: none. Kept as is: each tab's 3 fixed consent checks after an approval (ticket 02 design) are not counted against the 5-read budget; they now stop on quota and wait out a shared cooldown.

Evidence: shots `RESULT: ok shots raw spec, out /home/ubulex/Projects/native-site-editor/.scratch/shots/dor-03/20261017-160348` (quota pause, 1280 light and 390 dark).
