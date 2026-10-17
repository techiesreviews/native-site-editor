---
title: "Count transport, storage and retained bytes"
type: task (AFK)
status: closed
assignee: dor-01
blocked_by: []
builder: sol
phase: 1
---

## What

Add reusable fake namespace/storage/socket/clock counters. Separate editor/auth, agent control, data fetching, messages, lifecycle and migration. Count calls, keys read/written/deleted, serialized bytes, peak retained bytes and elapsed active waits.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `tests/fakes/counted-agent.ts`
- `tests/agent-usage.test.ts`
- `tests/mcp-harness.ts`

## Done when

- Unit test `tests/agent-usage.test.ts` verifies current 3-call authentication, **+1** first-use, 25 result polls and 18 default-wait operations. Counters handle multi-key operations and failed writes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Fake operations are billing proxies; never label them exact SQLite charges.

## Done (2026-10-17)

**Behaviour.** `tests/fakes/counted-agent.ts` runs the real `handle` (worker/app.ts) and the real
`SessionStore` (worker/index.ts, bundled with a stub for `cloudflare:workers`) in Node over a counted
fake namespace, storage, socket and clock. Per category (`auth`, `control`, `data`, `messages`,
`lifecycle`, `migration`) it counts DO stub fetch invocations (`calls`), alarm deliveries (`alarms`),
storage keys read/written/deleted (every key of a multi-key operation), serialized bytes written
(node:v8 `serialize` length) and failed writes; globally, retained and peak retained bytes and virtual
milliseconds waited, plus a per-operation log. A failed (injected) write counts as failed, not written,
and leaves retained bytes alone; transactions roll back. Fetches and alarms wait for an object's active
`blockConcurrencyWhile`. The fake clock advances to the earliest timer only when the process is idle.
Classification is by request shape; the first plain hub read of a `/mcp` request is `auth`
(authenticateAgent), later hub reads are `data`. These are counts, billing proxies, not SQLite charges.
`tests/mcp-harness.ts`: the fake GitHub is a shared `fakeGitHub`/`githubState`; `signIn`, `editorTab`
and `workerFetch` accept either runtime. No product code changed.

**Measured baselines (current code, `tests/agent-usage.test.ts`).**
- Already-used grant (`tools/list`): 3 DO invocations, all `auth` (grant, sign-in session, hub).
- First use (`initialize`): +1 (`use-grant`), 4 in all. Matches the lead decision (ticket 07 said +2).
- Changed edit (`write_file`, default 10 s, tab never claims): 25 result polls, 10 000 virtual ms;
  plus one `requests=1` hub read before queueing and one `queue`: 3 + 1 + 1 + 25 = 30 invocations.
- Empty default `wait_for_requests` (25 s): 18 `take-requests`, 25 000 virtual ms; 21 with auth.
No difference from the expected numbers. The usage tests run in about 2 s.

**Commits.** 5537ca2f (build, Sol), 34b9f18d (review fixes).

**Tests.** Added `tests/agent-usage.test.ts` (8 tests). `npm run check` ok; `npm run lint` ok;
`scripts/agents/unit.sh` pass 3996, fail 0 (after review fixes);
`RESULT: ok specs none affected`.

**Review** (gpt-6.1-sol, effort medium, read-only; `RESULT: ok review` evidence
`.scratch/reviews/dor-01/20261017T140057Z`). Fixed 2: events now wait for an active concurrency block
(new test fails without the fix); alarm deliveries counted as `alarms`, apart from fetch `calls`.
Rejected 0.

**Evidence.** `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected`;
`RESULT: ok review git diff a88ec98f...HEAD`.

**Limit.** The fake clock replaces global `Date.now`/`setTimeout`; tests using it run serially and
restore the globals in `finally`.
