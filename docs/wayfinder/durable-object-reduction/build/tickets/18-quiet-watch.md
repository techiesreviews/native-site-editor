---
title: "Replace unattended waits with explicit Watch"
type: task (AFK)
status: closed
assignee: dor-18
blocked_by: [17-browser-media-tools]
builder: claude
phase: 3
---

## What

Quiet waiting returns without automatic continuation. Add explicit ten-minute Watch, shared across workspace grants/tabs: one outstanding wait, ≤25 seconds each, ≤25 calls/activation. Persist only bounded activation metadata; visible deadline and explicit renewal.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `worker/agent-relay.ts`
- `worker/mcp.ts`
- `src/agent-transport.ts`
- `src/components/agent-menu.ts`
- `src/agent-prompts.ts`
- `tests/agent-watch.test.ts`

## Done when

- Unit tests plus browser spec(s): `native-agent-quiet.spec.ts`: no automatic renewal; expiry does not revoke grants/cancel independent edits; **0 storage polling**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Update tool descriptions, empty-result hints and both copied/MCP prompts together.

## Done (2026-10-18)

**Behaviour.**
- **Quiet by default.** wait_for_requests returns at once when nothing waits, with a hint that tells the agent not to
  call again on its own but to tell the user it is ready. The tool descriptions, empty-result hints, the copied curl
  prompt (`src/agent-prompts.ts`: no shell loop, curl timeout 40 s), the `watch_editor` MCP prompt and the site
  conventions changed together. `waitSeconds` is now at most 25 and only matters under Watch.
- **Request tools on the relay** (lead extra). wait_for_requests, reply_to_request and get_selection(request) make ONE
  relay dispatch (`{operation:"requests", tool, args, grantId, generation, waitMs}`, shared/agent-requests.ts) to the
  owner tab, which answers from this browser's conversation records (ticket 09) with the hub's own rules
  (`requestOperation`, moved from worker/ to shared/; worker/agent-requests.ts re-exports it). In socket mode Ask
  agent, answers and dismissals stay in the browser (0 hub calls); the record now keeps the element's clipped source
  and which connections had it (as the hub did). get_site's openRequests come from the tab. Other tabs of the browser
  follow asks, takes and replies over a BroadcastChannel (no polling).
- **Watch.** The agent menu (connected, socket mode) shows "Watch for requests"; while on, a countdown line
  ("Watching for requests until 6:58 PM (9:41 left, 24 waits left).") with **Stop watching** and **Watch again**;
  ended: "Watch paused at …"; used up: "Watch paused: your agent used all 25 waits." Off, it says in plain words that
  agents stop when nothing waits and to ask the agent to continue. Watch lasts 10 minutes per activation and counts
  every wait call during it, at most 25, across tabs and grants, in one localStorage record per workspace
  (`{startedAt, until, waits}`, forgotten a day after it ends). Only the user's start resets it; empty results and
  ordinary commands never do. Expiry or Stop ends new holds only: the grant, socket and separate edits are untouched.
- **Event-driven waits.** Under Watch the tab holds one wait until a request is kept here (an in-memory wake), Watch
  stops, or min(25 s, the relay's remaining budget − 1 s, Watch's end) passes; 0 storage polling. The relay
  (`worker/agent-relay.ts`) admits one outstanding wait per workspace (a second gets `waiting`, not sent; the agent is
  told not to repeat) with a 10–25 s budget; other commands keep 10 s.
- **Writes are fenced.** A take or reply is kept only over the exact stored copy it read (a reply, answer or
  dismissal meanwhile wins), only while the connection holds (checked inside the write transaction), and only while
  the tab's owner generation still owns the workspace unpaused (new optional `owner` on `putConversation`, same
  transaction). A wake or Watch change during a wait's read is not lost. User answers keep only over their copy.
- **Legacy fallback** (until ticket 20): on `editor-unavailable` with a matching legacy-shared context the hub path
  runs once (one `take-requests`, no loop, no polling); otherwise the quiet "no editor tab receives requests" hint.
  After this ticket no MCP tool uses the legacy hub path except that fallback (edits, media, get_command_status and
  the request tools, all only on editor-unavailable with a legacy-shared context).

**Measured (usage harness, real SessionStore relay; `tests/agent-watch.test.ts`).** Already-authorized waits:
idle (no Watch) 3 auth + 1 dispatch, 0 data calls, 0 relay storage keys, 0 virtual ms; Watch with nothing asked
3 + 1, 0 data, 0 keys, 24 000 virtual ms, 1 socket command; Watch woken by a request after 5 s: 3 + 1, 5 000 ms;
Watch ended: 3 + 1, 0 ms; an edit after expiry: 3 + 1, applied. Legacy fallback empty wait: 1 take, 0 ms (was 18
takes over 25 000 ms).

**Out-of-Files edits (needed).** shared/agent-requests.ts (moved request rules + relay contract; thread limits moved
here from shared/agent.ts so boot stays 355 KB), worker/agent-requests.ts (re-export), shared/agent.ts,
src/agent-watch.ts (new, lazy with the menu), src/agent-records.ts (`owner` fence), src/components/agent-menu.css
(Watch row), worker/site-conventions.ts (loop wording), docs/mcp.md, docs/agents/code-map.md,
tests/mcp-runtime.test.ts and tests/agent-usage.test.ts (legacy wait is quiet now), tests/frame-guard.test.ts (the
requests BroadcastChannel allowlisted), tests/agent-tools-read.test.ts (get_site counts the tab's requests, not the hub's).

**Commits.** 5f68c933, d5da51ba, 32919ccc, 14dbf7c1, bc375199, 991107ec, 5db9ef97, 9186a978 (build; Claude),
372d55b3 (review 1), 388de921 (review 2), a70f1aae (review 3); hashes before `kit pr`'s rebase.

**Tests.** New tests/agent-watch.test.ts (14): bounded record, caps and renewal; quiet default; held wait woken by an
ask with no re-reads, clipped to Watch's end; 25 calls (0 s, across grants) exhaust Watch without renewal; 25 s and
relay-budget clips; Stop releases; stale socket takes nothing; reply/get rules; take/reply racing a reply keeps it;
connection lost at the transaction writes nothing; wake or Stop during the read is not lost (mutation checked);
two answers from one copy; takeover fence on real IndexedDB records (paused too); relay wait slot and budgets; usage
harness above; copied prompt has no loop. native-agent-quiet.spec.ts (+2 @live, real fixture socket): quiet wait,
Watch control and countdown, a held wait answered by Ask agent with 0 `/api/agent` requests, reply reaches the pin,
an empty Watch wait runs out and keeps the deadline (count +1), forced expiry answers paused at once while the
connection and an edit still work; another tab's pin follows takes and replies without a reload (mutation checked).
Focused runs by hand: unit.sh on the touched tests pass 75 fail 0; `npm run check` ok; lint on touched files ok.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review … evidence .scratch/reviews/dor-18/20261018T165851Z`: fixed 3 (a take could overwrite a
concurrent reply; 0 s and request-returning calls bypassed the 25-call budget; writes after the connection went
stale). Round 2 `RESULT: ok review … evidence .scratch/reviews/dor-18/20261018T170302Z`: fixed 4 (other tabs' pins
missed agent progress; Watch stop or a wake during the read was lost; connection not checked inside the write
transaction; concurrent answers ordered by time). Round 3 `RESULT: ok review … evidence
.scratch/reviews/dor-18/20261018T171244Z`: fixed 2 (owner generation not proved in the write transaction; answers did
not recheck the activation after the read). Rejected in part 1: a `forEachAwait` test of the menu's answer path (no
agent-menu DOM harness, as tickets 09/14; the guard is one predicate checked after the read and inside the write).

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: fail size boot 355 KB over budget 355 KB (THREAD_TEXT_LIMIT pulled into boot; moved), then RESULT: ok size boot 355 KB (±0 KB) vs dev@4b42ebd, budget 355 KB
- RESULT: ok specs 1/1 passed (native-agent-quiet 7, after review 2)
- RESULT: fail specs 1 of 4 failed: native-agent-reads.spec.ts (list_files frame counted before Playwright delivered it; passed alone: RESULT: ok specs 1/1 passed); native-agent-quiet, native-agent-live, native-mcp 18 passed
- RESULT: ok shots raw spec, out /home/ubulex/Projects/native-site-editor/.scratch/shots/dor-18/20261018-164932 (Watch off, on with countdown, paused; 1280 light, 390 dark)

Landed: PR #67, merged as 54d394b (`RESULT: ok merged #67 54d394b`; kit pr: tier full, check, unit, lint, specs, review,
CI ok). Landing fixes before it: tests/frame-guard.test.ts allowlists the requests BroadcastChannel; agent-tools-read's
get_site now expects the tab's count; rebase over ticket 17's review 4 (media `seen` proof kept beside the requests route).

Follow-up (landing review round 4, gpt-6.1-sol, medium, read-only; `RESULT: ok review … evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-18/20261018T174509Z`): fixed 1 (P2) in a follow-up PR —
the socket Ask path checked the activation before its write but not inside it; the write transaction now rechecks the
activation and workspace, and a refused write throws "Nothing was sent" with no broadcast. Rejected in part: a
`forEachAwait` menu test (no agent-menu DOM harness, as tickets 09/14; one predicate inside the write).
RESULT: ok specs 1/1 passed (native-agent-quiet 7).
