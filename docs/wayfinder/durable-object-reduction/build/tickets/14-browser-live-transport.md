---
title: "Receive live commands without polling"
type: task (AFK)
status: closed
assignee: dor-14
blocked_by: [10-browser-recovery, 11-clean-source-cache, 13-live-relay-core]
builder: sol
phase: 3
---

## What

Add explicit socket handshake, shared ownership/reconnect coordination and browser receipt reconciliation. Deliver through fenced command commits; send matching results. Keep background owner; focus does not transfer.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-transport.ts`
- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `src/agent-owner.ts`
- `src/main.ts`
- `tests/agent-transport.test.ts`

## Done when

- Unit tests: duplicate/stale results, two tabs, owner close, freeze/resume, restart and quota pause; live idle has **0 polling/context-heartbeat calls**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Owner loss must not silently promote another tab or replay mutations.

## Done (2026-10-18)

**Behaviour.** Turning remote agents on in a tab (still per tab, not remembered) loads `src/agent-transport.ts`
lazily (boot unchanged at 355/355 KB) and opens one WebSocket to the ticket 13 relay for the tab's pinned
account/repository/branch, then handshakes with this tab's owner generation. Commands arrive live; the tab
makes no polling, context heartbeat, draft upload or claim/ack. The hub is read once at turn-on and on
explicit actions only (Connect, Disconnect, Retry, Take over, Ask/answer/dismiss, ticket 02's consent checks,
and returning to the tab while a copied token still waits for its agent). Liveness is a `"ping"` socket frame
every 45 s (auto-answered by the relay without waking it); no HTTP.
- **One receiving tab per workspace.** IndexedDB generation (ticket 05) decides; a Web Lock per workspace +
  generation and a localStorage record are hints. Turning on with no live owner runs ticket 05's takeover
  (pause, reconcile, reload drafts, generation CAS) and claims the next generation; with a live owner the tab
  says "Another tab receives agent changes for this site." and offers **Take over**. Focus never transfers;
  the background owner keeps it; an owner closing never promotes another tab ("The receiving tab closed…").
  The old owner learns of a takeover from the storage event or on resume, closes its socket and says "Another
  tab took over…". Lead note (a): a failed takeover stays durably paused with **Try again** and **Turn off**.
  Takeover reloads drafts into the draft store and, when the open file's mounted text differs from the durable
  snapshot, reopens it (this tab's newer typing stays).
- **Commands.** Scope (workspace, tab, generation), shape, repository/branch and grant are checked; the socket,
  its handshake and liveness are rechecked after the admission read, before running. Text, structural and media
  commands run through tickets 06–08's fenced commits with `ownerGeneration` (new optional `AgentCommand` field):
  owner caches in agent-site/agent-media-actions key by it, so a tab that builds its owner after another tab's
  takeover cannot commit. The same operation id in flight joins one run; later duplicates return the receipt's
  recorded outcome; unknown stays unknown. Receiptless mutations (place_media, frame_image, loop_video,
  update_active_draft, create_file_draft) are refused live until tickets 16/17 route them. Results go only on the
  socket the command came on; a result for a lost socket is dropped, never resent.
- **Reconnects** use ticket 03's coordinator (≤5 attempts in 2 min, backoff, pause, Retry; quota pauses every
  automatic attempt). `reset` from the relay re-handshakes on the same socket; nothing is replayed. Every
  reconnect and resume re-proves the stored generation first. Lead note (b): a repository/branch change on a
  connected tab closes the socket at once (in-flight commands refused) and asks "Agents are connected to <repo>
  on <branch>; this tab now shows …" with **Move agents here** (ticket 12's rebind endpoint for each used grant,
  then turn on), **Connect another agent**, **Turn off**; switching back offers Turn on again.
- **Legacy fallback** (until ticket 20): only when `WebSocket` is missing, or after a failed first upgrade one plain
  `GET /api/agent/relay` answers 404 (the real Worker answers 400). Any other probe answer is classified in full
  (quota body, Retry-After). Browser storage refusing ownership also probes: 404 → fallback, else paused.

**Out-of-Files edits (needed).** shared/agent.ts (`ownerGeneration`), src/agent-site.ts and
src/agent-media-actions.ts (owner generation fence), tests/agent-controller.test.ts, tests/agent-text-commit.test.ts,
tests/agent-media-commit.test.ts (fence regressions), tests/frame-guard.test.ts (relay socket listener),
tests/native-save/native-agent-quiet.spec.ts, native-lazy-panels.spec.ts, native-mcp.spec.ts, mcp-prompt.ts,
native-draft-storage.spec.ts, native-onboarding.spec.ts (the
fixture server has no relay upgrade: these route a missing relay so they keep the legacy path), new
tests/native-save/native-agent-live.spec.ts.

**Commits** (PR #56). 645212bb (Sol build), d60c7761, 1fcb8dc5 (review 1), 096d8b23, 5f097e29 (review 2), c8a94068
(landing fix: a repository briefly absent during a refresh counted as a workspace move and stopped the tab's context
sharing; it now refuses commands meanwhile but is no move), c843474b (review 3).

**Tests.** tests/agent-transport.test.ts (30): duplicate delivery in flight and after commit; stale
generation/tab/workspace and malformed commands; two tabs, focus, explicit takeover, old owner's late commit and
resume (0 late commits); owner close without promotion; reset re-handshake without replay; server close → ≤5
coordinated reconnects then pause; quota pause with 0 automatic attempts and single-flight Retry; failed takeover
stays paused; workspace change; **live idle over simulated minutes: 0 HTTP calls**; missing pong; bfcache; absent
route fallback; probe quota body and Retry-After; storage refusal; receiptless refusal; socket lost/reset during
admission never runs (mutation checked); refresh absence keeps the socket, and a socket lost meanwhile reconnects
when the workspace returns; storage refusal records a probe's quota/Retry-After (both mutation checked); `forEachAwait` workspace change at every ownership await.
native-agent-live.spec.ts (2): a mocked relay delivers a write_file and gets the correlated applied result; after
it, 65 s visible + 65 s hidden make **0** `/api/agent/*` or `/mcp` requests (2 pings); a second tab open before
the edit shows "Another tab…" + Take over, takes over with a higher generation and then shows the edit; the old
tab says it was taken over. A copied token turns connected after one hub read on return, then 0 more.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4366 fail 0 (by hand).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review … evidence .scratch/reviews/dor-14/20261018T053422Z`: fixed 3 (receiptless mutations
bypassed the owner fence: now refused live; a socket lost during the admission read still ran the command; a copied
token never showed connected in socket mode). Round 2 `RESULT: ok review … evidence
.scratch/reviews/dor-14/20261018T053920Z`: fixed 2 (takeover left the open editor showing pre-takeover text; the
first-upgrade probe ignored quota bodies and Retry-After). Round 3 (run by `kit pr`, `RESULT: ok review … evidence
.scratch/reviews/dor-14/20261018T065727Z`): fixed 2 (a socket lost while a refresh briefly removed the workspace stayed
"live" with no socket; the storage-refusal probe dropped quota and Retry-After). Rejected 0.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@38a5a54, budget 355 KB
- RESULT: ok specs 3/3 passed (native-agent-live, native-agent-quiet 5, native-lazy-panels 6)
- RESULT: fail specs 1 of 3 failed: native-agent-recovery.spec.ts (disabled storage stopped before any socket; fixed in 90bf94a1), then RESULT: ok specs 1/1 passed; native-mcp 18 and native-mcp-media 5 passed
- RESULT: ok specs 1/1 passed (native-agent-live 2, after review 2)
- First `kit pr`: RESULT: fail specs 4 of 145 failed: native-agent-live.spec.ts, native-discard.spec.ts, native-draft-storage.spec.ts, native-onboarding.spec.ts (refresh treated as a workspace move; two specs clicked Connect without the absent-relay route; live under load). After the fix: RESULT: ok specs 4/4 passed. Second `kit pr`: check, unit, lint, specs ok; PR #56 opened; CI failed in
  tests/agent-resume.test.ts ("SIGTERM records interrupted…", agent kit script timing, no code of this slice); rerun after review 3.
- RESULT: ok shots raw spec, out /home/ubulex/Projects/native-site-editor/.scratch/shots/dor-14/20261018 (live, other-owner, taken-over, quota; 1280 light, 390 dark)

**Limits for later tickets.** Nothing on the Worker dispatches through the relay yet: on a real deployment an on
tab now receives no hub-queued MCP commands until tickets 15–17 move tools onto the relay (the fixture keeps the
legacy path). In socket mode Ask agent progress arrives only on explicit hub reads (ticket 18). A browser cannot
read a refused upgrade's status, so quota/sign-out are learned only from the first-failure probe or other hub
calls; later reconnect failures count as transient.
