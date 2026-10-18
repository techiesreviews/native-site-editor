---
title: "Reject obsolete endpoints before DO work"
type: task (AFK)
status: closed
assignee: dor-20
blocked_by: [19-negotiated-cancellation]
builder: sol
phase: 4
---

## What

Disable legacy hub/context/drafts/claim/ack/request-content routes and writers; remove browser polling/upload paths. Reject stale clients before session/DO lookup, with upgrade/reconnect guidance. Retain narrow legacy readers only for migration.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/app.ts`
- `worker/agent-store.ts`
- `worker/agent-operations.ts`
- `worker/agent-requests.ts`
- `worker/agent-schemas.ts`
- `src/components/agent-menu.ts`
- `tests/agent-cutover.test.ts`

## Done when

- Unit test covers every obsolete route: **0 DO invocations**; mixed-version client cannot recreate mirrors; no persistent content writers remain reachable.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Count residual stale-client Worker requests separately. Do not delete legacy data yet.

## Done (2026-10-18)

**Behaviour.** The legacy hub transport is gone; agents work only over the live relay (tickets 13–19).
- **Obsolete routes refused first.** `route()` (worker/app.ts) answers `/api/agent/hub`, `/context`, `/drafts`, `/claim`,
  `/ack`, `/pause`, `/ask`, `/answer`, `/dismiss` (any method, signed in or not) with **410**
  `{error: "This editor was updated. Reload this tab to keep using agents.", code: "editor-updated"}`, `no-store`,
  before the maintenance route, OAuth, sign-in/account lookup, origin checks or any DO call. The text reads well in an
  old bundle's menu, which shows `error`. Stale tabs still cost one **Worker request** each until reloaded (counted
  apart in tests/agent-cutover.test.ts), never DO work.
- **Grants only in the hub.** `hubOperation` accepts only `add-grant`, `use-grant`, `rebind-grant`, `remove-grant`; any
  other type gets 400 before any storage read or write. Removed: context/pause/queue/claim/ack and the request writers
  (ask/answer/dismiss/take-requests/request/reply), the DO `/agent-drafts` writer and `/agent-draft` reader,
  `storeDraftTexts`, `draftText`, `connectionContext`, worker/agent-schemas.ts and worker/agent-requests.ts (re-export).
  No path creates `context`, `draft:*`, `drafts` or `requests` keys or adds commands. A legacy claimed pending
  command no longer blocks rebind (no tab can ack it; ticket 05: never replayed, outcome unresolved). The DO hub read
  returns grant metadata only; `SessionStore` 404s unknown internal paths.
- **Readers kept for migration.** worker/agent-maintenance.ts (ticket 27 classifier) unchanged; `clearHub` still deletes
  at expiry/sign-out as before. Stored legacy data is not deleted otherwise (ticket 28); a grant operation on an old hub
  rewrites its record as it is (inline legacy fields kept, nothing added).
- **New narrow reader** `GET /api/agent/connections` → `{grants}` for the menu's explicit checks (Connect re-use,
  Disconnect, Retry, consent checks, copied token on return): one hub read, no context/draft/request keys.
- **MCP.** Every legacy fallback is gone from worker/mcp.ts (queue + 400 ms result polling, SiteFiles + draft fetches,
  legacy take/request/reply, legacy get_command_status). Without a receiving tab every tool answers the not-sharing
  message at once (get_site `available:false`; wait_for_requests keeps ticket 18's quiet "No editor tab receives
  requests" hint, not an error). authenticateAgent still costs 3 DO calls and now reads the hub with `context=0`, no requests.
- **Browser.** agent-menu.ts lost polling (2 s/30 s), the context heartbeat, draft uploads, claim/ack, `pause`, hub Ask/
  answer/dismiss and hub request adoption. agent-transport.ts has no fallback: no WebSocket → "unavailable" state; a 404
  or other probe answer goes through the recovery coordinator (quota/Retry-After classification kept); storage refusal
  stays paused.
- **Boot.** `RESULT: ok size boot 355 KB (±0 KB) vs dev@aff80ec, budget 355 KB` — unchanged: all removed browser code
  lived in the lazy agent-menu/transport chunks, not in boot (total loaded at startup 1444 KB, also ±0).

**Out-of-Files edits (needed).** worker/mcp.ts, worker/agent-context.ts, worker/index.ts, worker/site-conventions.ts,
worker/site-files.ts (dead exports), src/agent-transport.ts, src/agent-records.ts (comment), shared/agent.ts,
shared/agent-requests.ts (oldest-first delivery kept without the hub), shared/types.ts (comment), CONTEXT.md,
docs/agents/code-map.md, docs/mcp.md; fixture tests/native-save/server.ts, fake-hub.ts, mcp-prompt.ts (`useLegacyRelay`
removed), drafts.ts (a synthetic pagehide closes the relay); the specs that used the legacy path; unit tests that
asserted it.

**Commits.** c35ef8bf (Sol build), 5b5b5b71 (Sol pass 2: socket specs, dead exports), ed6a4c33 (Claude: quiet wait kept).

**Tests.** New tests/agent-cutover.test.ts (5): every obsolete route × GET/POST/PUT/DELETE/PATCH/OPTIONS × signed
in/out → 410 `editor-updated`, **0 DO invocations and 0 keys read/written/deleted in every category**, 1 Worker request
each; the hub DO refuses every removed type (and an unknown one) with 400 and 0 key reads/writes, `/agent-drafts` gone,
seeded legacy keys untouched; `/api/agent/connections` and MCP auth read no context/draft/request keys; **mixed tabs**:
an old tab's hub polling, context, drafts, claim, ack and Ask all 410 with 0 DO calls, afterwards the hub holds only
`session` with its commands unchanged, while a new tab on the relay answers an MCP read and edit with **3 auth + 1
dispatch**; seeded matching legacy content never enables a fallback for any tool family (0 data calls, 0 waited ms).
Converted, not deleted: legacy fallback cases in agent-tools-read/edit/media, agent-transport (fallback → unavailable/
recovery), agent-usage (25 polls / 18 takes → immediate refusal / quiet wait with 3 + 1), mcp-runtime and
agent-workspace-binding (claim/rebind cases), agent-grant-reliability, mcp-oauth, oauth-pending, onboarding-runtime,
worker-speed, workflow-protection. Deleted (subject gone): "requests to agents stay on the branch they were asked on"
(hub request store; browser records are per workspace, ticket 09/18 tests) and "a claimed change outlives answered
history, so rebind stays refused" (rebind no longer waits for legacy claims). Specs native-mcp, native-components,
native-discard, native-subfolder-urls, native-agent-recovery, native-component-loader, native-delete-card-race,
native-lazy-panels, native-agent-quiet, native-onboarding, native-draft-storage, native-agent-live, native-mcp-media now
run over the fixture relay with their assertions. Remote-off and live idle 0 hub calls stay asserted by
native-agent-quiet and tests/agent-transport.test.ts.
`npm run check` ok; `npm run lint` ok (Sol); full `scripts/agents/unit.sh` pass 4475 fail 0 (Sol pass 2); focused after
the quiet-wait fix: agent-usage + agent-cutover pass 13, agent-cutover pass 5.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review git diff
aff80ecb64ee8a19839786ddd986082c8e403c33...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-20/20261018T211032Z`: no defects, no gaps. Runner's own
review fixed 1 before it: the first build turned wait_for_requests without a receiving tab into an error, undoing
ticket 18's quiet answer.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@aff80ec, budget 355 KB
- Sol pass 1: RESULT: fail specs 7 of 12 failed (legacy specs not yet on the socket), then fixed in pass 2
- Sol pass 2: RESULT: fail specs 1 of 15 failed: native-mcp.spec.ts (request order), fixed; RESULT: ok specs 2/2 passed
- RESULT: ok specs 2/2 passed (native-agent-quiet 7, native-mcp 18; after the quiet-wait fix)

Landed: PR #71, merged as 29f28da (`RESULT: ok merged #71 29f28da`; kit pr: tier full, check, unit, lint,
`RESULT: ok specs 139/139 passed`, review, `RESULT: ok ci pr 71 e2e04bf green`). Round 2 (run by `kit pr`, gpt-6.1-sol,
medium, read-only; `RESULT: ok review … evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-20/20261018T213650Z`):
no defects, no gaps. Rejected 0.
