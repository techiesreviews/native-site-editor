---
title: "Propagate cancellation to the commit boundary"
type: task (AFK)
status: closed
assignee: dor-19
blocked_by: [18-quiet-watch]
builder: sol
phase: 3
---

## What

Propagate negotiated protocol cancellation and request aborts through relay/executor. Modern and legacy transport loss follow their distinct rules; JSON-mode behavior gets runtime tests. Before commit cancel; after commit return applied; ambiguous loss reconciles receipts.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/mcp.ts`
- `worker/agent-relay.ts`
- `src/agent-transport.ts`
- `src/agent-tools.ts`
- `tests/mcp-harness.ts`
- `tests/agent-cancellation.test.ts`

## Done when

- Unit tests with modern/legacy runtime cases; no leaked pending entry, silent undo or mutation replay.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Existing harness buffers responses; cancellation tests need a streaming/abort-preserving transport.

## Done (2026-10-18)

**Behaviour.** Cancellation now reaches the browser's commit boundary; nothing user-visible changes.
- **Era, per request.** worker/mcp.ts classifies each request with the SDK's `classifyInboundRequest` (header,
  per-request `_meta`, initialize), never from package versions. **Modern (2026-07-28):** a closed response cancels the
  call. JSON mode only notices a gone client on its next write, so a modern call that reached the relay streams JSON
  whitespace every 250 ms ahead of its single JSON result (still one valid JSON document, never SSE). **Legacy
  (2025-11-25 and older):** a disconnect alone never cancels; the internal dispatch is not tied to the client and is
  kept alive with `waitUntil`, so the tab finishes and the receipt reconciles. **Explicit `notifications/cancelled`**
  (stateless, so it arrives on its own POST): handleMcp forwards {JSON-RPC id, this grant} to the workspace relay
  (`POST /relay/cancel`), which cancels only that grant's call with that id; the cancelled request's POST answers 202.
- **Relay.** Every dispatch carries its cancel key. Cancel or deadline of a SENT call sends the tab
  `{type:"cancel", id, …scope, reason}` on the socket it went to (unsent calls need none). A cancel that lands during
  body intake aborts the body reader and frees the slot at once; one that lands before the dispatch arrives is kept in
  a 10 s, 32-entry in-memory memory (no timers, no storage) so that dispatch is refused `cancelled`/not-sent. Entries,
  bytes, timers and the wait slot leave on result, cancel, timeout, disconnect and reset; nothing is resent.
- **Tab.** Each in-flight command gets an AbortSignal (src/agent-tools.ts registry; `agentCommandSignals` carries it to
  the text, structural and media commits). The cancel frame, the relay deadline measured on arrival (arrival +
  remaining − 1 s), socket loss, reset and Turn off abort it; for mutations the abort writes ticket 05's tombstone
  (`records.cancel(…, {live:true})`), which IndexedDB serializes against the drafts + receipt transaction. Tombstone
  first: nothing applied (no drafts, history, preview or model change). Commit first: it stays applied, never undone.
  The socket is ordered, so a command frame delayed past the relay's deadline is followed by its cancel frame: it can no
  longer commit after the agent was told "unknown" unless its commit already won (lead extra from ticket 17).
- **Lookup.** get_command_status and duplicates: receipt → applied; a definite tombstone (written by a live in-flight
  abort with no receipt/retired/legacy evidence, within 24 h) → `cancelled` ("cancelled before it committed; nothing was
  changed by it"); anything else → unknown. Never replayed. MCP returns cancelled edits and media as errors with
  `state:"cancelled"`.
- **Compatibility flag (lead decision, see decide).** `request.signal` only fires on client disconnect with workerd's
  `enable_request_signal`; without it a closed modern response is never observed (runtime test). All three
  wrangler*.jsonc now set `"compatibility_flags": ["enable_request_signal"]`; tests/mcp-harness.ts mirrors it by default.

**Out-of-Files edits (needed).** worker/index.ts (`/relay/cancel`, intake cancel key and signal), worker/app.ts
(`waitUntil` into handleMcp), src/agent-records.ts (`status`, definite/uncertain tombstones), src/agent-tools-edit.ts,
src/agent-tools-media.ts, src/agent-tools-read.ts, src/agent-watch.ts, src/agent-site.ts, src/agent-media-actions.ts,
src/components/agent-menu.ts (signal through executors and commit fences), wrangler.jsonc, wrangler.preview.jsonc,
wrangler.techies.jsonc (flag), tests/agent-text-commit.test.ts and tests/agent-media-commit.test.ts (race coverage).

**Commits.** 1b47b3b0 (Sol build), 271eca97 (flag; Claude), 3dc7efc6 (review 1; Sol), c653208f (review 2; Claude);
hashes before `kit pr`'s rebase.

**Tests.** New tests/agent-cancellation.test.ts (28), Miniflare runtime over a live (abort-preserving) harness mode
(`startWorker({streaming})` + `workerFetch(…, {streaming})` through the runtime's own HTTP ingress): modern abort and
legacy explicit cancel, each before and after commit (cancelled → 0 drafts/receipts, status and duplicate `cancelled`;
after → applied, 1 history step; 1 executor run in every case); legacy disconnect alone completes and reports applied;
another grant's cancel matches nothing; media change cancelled stays cancelled over MCP (mutation checked); without the
flag no abort is observed; every Wrangler config sets the flag; modern whitespace response parses as one JSON result.
Relay: signal/explicit/timeout/disconnect/reset/result each leave 0 pending, bytes, timers and wait slot, no resend;
unsent restored call gets no frames; recent-cancel scope, expiry and cap; SessionStore cancel before or during a stalled
body intake: no frame, nothing committed, reader cancelled, slot freed before the deadline (mutation checked), 0 storage.
Tab: delayed frame past the deadline is tombstoned before any executor await; own remaining-budget timer; socket loss;
wrong-scope cancel ignored; retention keeps old applications `unknown`. `forEachAwait` at every await of the real
`prepareAgentText` (tests/agent-text-commit.test.ts, 11) and media commit (tests/agent-media-commit.test.ts, 18): a
cancel that wins leaves 0 drafts/receipts and no Undo step; a commit that won stays applied.
Focused by hand: `scripts/agents/unit.sh` on the agent tests pass 224 fail 0, then pass 117 fail 0 after review 2;
`npm run check` ok; `npm run lint` ok.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review … evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-19/20261018T191823Z`: fixed 2 + 1 gap (a cancel before
or during dispatch intake was lost; a cancel after retention could relabel an old application `cancelled`; race
coverage through the real commit adapters). Round 2 `RESULT: ok review … evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-19/20261018T193354Z`: fixed 2 (MCP media relabelled a
cancelled change applied; an intake cancel held its slot until the 10 s deadline). Rejected 0.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@16e3866, budget 355 KB
- RESULT: ok specs 7/7 passed (native-agent-live, -edits, -reads, -quiet, -recovery, native-mcp-media, native-mcp)

**Limits.** The cancel key is grant + JSON-RPC id: a client that restarts and reuses an id within 10 s of cancelling it
gets that call refused as cancelled (safe: nothing changes). Explicit cancel of a call whose dispatch never reached the
relay within 10 s is lost (then it behaves like a legacy disconnect: receipt reconciles).
