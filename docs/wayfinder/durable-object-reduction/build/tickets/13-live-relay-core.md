---
title: "Add a bounded hibernating workspace relay"
type: task (AFK)
status: closed
assignee: dor-13
blocked_by: [12-pinned-connections]
builder: sol
phase: 3
---

## What

Add `SessionStore` WebSocket handlers backed by a small relay module; reconstruct socket identity from metadata-only attachments. Dispatch correlated requests to the explicit owner; no receiver means unavailable. Limit five pending commands/8 MiB serialized buffering; ordinary total deadline 10 seconds.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/index.ts`
- `worker/app.ts`
- `worker/agent-relay.ts`
- `tests/agent-relay.test.ts`

## Done when

- Unit tests verify overload before allocation, correlation/scope checks, restart loss, terminal payload release and **0 persistent payload writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Never hold `blockConcurrencyWhile` while awaiting the browser. Idle sockets must remain hibernatable.

## Done (2026-10-18)

**Behaviour.** Server half only; nothing in the browser or MCP tools uses it yet (tickets 14–17).
- `worker/agent-relay.ts` (`AgentRelay`, in memory, no storage port). One relay object per workspace in
  `SESSIONS`: `relayObjectName(workspace)` = `agent-relay:` + SHA-256 of `workspaceKey` (account lower-cased,
  repository **id**, branch), so renames don't move it; tickets 14–17 and 25 use this helper.
- `SessionStore` (worker/index.ts): `/relay/connect` upgrade uses `ctx.acceptWebSocket(server, ["editor"])`;
  `webSocketMessage/Close/Error` delegate to the relay. Heartbeat: `setWebSocketAutoResponse("ping" → "pong")`,
  exact strings, no wake. No timers while idle: a deadline timer exists only while a command is pending.
- Attachments hold metadata only: workspace, tab id, generation, `role: "editor"`, handshake state and the
  recorded owner claim. After hibernation/restart the relay rebuilds sockets from attachments, marks every
  socket un-handshaken and sends `{type:"reset", code:"unknown-outcome", handshakeRequired:true}`; a socket gets
  commands only after a fresh `{type:"handshake", …scope, owner:true}` (answered `{type:"ready", …scope}`).
  Ownership is restored only from an explicit recorded claim; a socket that connected without handshaking
  claims nothing. Results for pre-restart ids are ignored, never replayed.
- `dispatch(target)`: target = workspace plus optional tab/generation fences; the relay resolves the current
  owner (an MCP grant doesn't know the tab). No owner socket → `editor-unavailable` at once (no mailbox). A
  dispatch that wakes the object waits for the owner's fresh handshake inside the same 10 s deadline, and an
  expired command is never sent (`timeout`, `not-sent`). Results must match id, socket, tab, workspace and
  owner generation. A higher-generation handshake takes over and fails the old owner's calls as
  `unknown-outcome`. MCP-tagged sockets never count as editor presence.
- Bounds per workspace: ≤5 pending commands and ≤8 MiB serialized payload (wire envelope; results and
  unfinished intake count against the same budget); 10 s total deadline from ingress. Worker-internal
  `POST /relay/dispatch` needs `Content-Length`, reserves a slot and bytes **before** reading the body, reads
  with a reader that is cancelled (not awaited) on expiry, overflow or request abort, then hands the reservation to `dispatch` in the same turn.
  Entries leave on result, cancel (request signal), timeout and disconnect/error.
- `worker/app.ts`: `GET /api/agent/relay?repo&branch&tabId&generation` (WebSocket upgrade only): same-origin,
  signed-in session, repository authorized through GitHub, then forwarded with Worker-built identity (no client
  headers/cookies cross); refusals happen before any relay DO call. `handle` passes a `101` response through.

**Commits.** ea3da9a1 (Sol build), 840f3fe2 (owner-resolved dispatch; waking dispatch waits for handshake),
64fe97b7 (review 1), 0b7ccad0 (review 2), 3442ea13 (review 3).

**Tests.** New `tests/agent-relay.test.ts` (23): overload before allocation (6th busy, 8 MiB boundary,
reservations); correlation/scope; no receiver and MCP sockets; restart loss and fresh handshake; explicit
owner survives restore; late handshake never sends an expired command; takeover; cancel/timeout/disconnect
release payloads and leave 0 timers; real `SessionStore` dispatch/result/cancel/timeout/close/error/reset with
**0 keys and 0 bytes written** (usage harness counters); stalled-body intake (busy before reading, cancelled
readers, deadline, abort, hung source cancel); upgrade route refusals and trusted headers; Miniflare upgrade + handshake + ping/pong.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4207 fail 0 (by hand);
`RESULT: ok specs none affected`.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review … evidence .scratch/reviews/dor-13/20261018T013415Z`: fixed 4 (restore elected a tab
that never claimed ownership; a delayed handshake sent expired commands; dispatch bodies were read before
admission; body intake sat outside the deadline). Round 2 `RESULT: ok review … evidence
.scratch/reviews/dor-13/20261018T013938Z`: fixed 2 (result admission ignored intake reservations; the stalled-body
cancel hit a locked stream). Round 3 (run by `kit pr`, `RESULT: ok review … evidence
.scratch/reviews/dor-13/20261018T014545Z`): fixed 2 (an aborted request kept its stalled body's slot until the
deadline; awaiting a source's never-settling cancel could hold the deadline and slot; cancellation is now fired,
not awaited). Rejected 0.

**Evidence.** `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected`. Boot size not run:
worker-only change, no `src/` imports.

**For later tickets.** Ticket 14: send `"ping"` text for heartbeats; handshake after every `reset`. Ticket 25:
presence = sockets tagged `editor` that have handshaken; MCP never counts.
