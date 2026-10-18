---
title: "Execute reads against browser-owned drafts"
type: task (AFK)
status: closed
assignee: dor-15
blocked_by: [14-browser-live-transport]
builder: sol
phase: 3
---

## What

Introduce browser tool execution ports for site/files/pages/selection/export/status. Reuse current context builders and transforms; keep schema/result contracts. One relay dispatch per bounded tool; browser GitHub reads attributed separately.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools.ts`
- `src/agent-tools-read.ts`
- `src/agent-site-host.ts`
- `src/main.ts`
- `worker/mcp.ts`
- `tests/agent-tools-read.test.ts`

## Done when

- Unit tests; existing `tests/mcp-runtime.test.ts` read contracts; already-authorized simple read ≤**4 DO HTTP invocations**, zero server draft fetches.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

No dependency on absent `src/webmcp.ts`. Expose an injectable browser-local tool interface; future WebMCP can adapt it.

## Done (2026-10-18)

**Behaviour.** The MCP read tools get_site, list_files, read_file, export_site, get_page, get_selection (without
`request`), the `native-site://site` resource and the `edit_site` prompt make ONE relay dispatch
(`POST /relay/dispatch` to `relayObjectName(connection.workspace)`) to the workspace's owner tab. The tab answers
from its browser drafts through an injectable browser tool registry (`src/agent-tools.ts`; executors in
`src/agent-tools-read.ts`, loaded lazily with the agent menu/transport), using `buildAgentContext` and the browser's
own tree/blob readers and ticket 11's clean source cache. One implementation serves both sides: `SiteFiles`,
`componentVariantsOf` and the read formatters moved to `shared/` behind injectable readers, so results keep each
tool's schema and contract. The transport checks a read's workspace/tab/generation like a command, runs no
mutation and writes no receipt; a branch/revision change during a read refuses it. Results are bounded under the
8 MiB relay envelope ("too large, export a folder").
- No receiver (`editor-unavailable`): answers at once with the not-sharing message (get_site: `available:false`),
  no wait or poll. Only when authentication's hub snapshot holds a matching legacy-shared context does the old
  read path run (temporary, until ticket 20). Other relay outcomes are clear errors, never retried.
- get_site `pending`/`openRequests` come from authentication's existing hub GET, which now includes request
  summaries (one more storage key read, no extra DO invocation).
- Left on the legacy path: edit tools and their `current()` reads, get_command_status (ticket 16); inspect_preview,
  list_media, preview_media and other queued media/inspection commands (16/17); wait_for_requests,
  reply_to_request, get_selection(request) (18). update_active_draft and create_file_draft stay refused live (16).
- Fixture (lead addition): the browser-spec server upgrades `/api/agent/relay` through the real worker/app.ts route
  into the real `AgentRelay` (tests/native-save/fake-hub.ts) over a small RFC 6455 adapter
  (tests/native-save/fake-websocket.ts), one relay per demo sign-in. Legacy specs install their relay routes
  before navigation (Playwright's socket routes are init scripts).

**Measured (usage harness, real SessionStore relay).** Already-authorized read_file and get_site: **4 DO HTTP
invocations** (3 `auth` + 1 dispatch), 0 data calls, **0 server draft fetches**, 0 repository-cache and 0 Worker
GitHub fetches; 1 socket command + 1 result (`messages`). Browser reads counted apart (get_site: 3 batch reads
cold, 0 warm). No owner: 4 invocations including the refused dispatch, 0 virtual ms waited.

**Out-of-Files edits (needed).** shared/agent-read.ts, shared/site-files.ts, shared/site-variants.ts,
shared/http-error.ts (one shared implementation); worker/site-files.ts, worker/github.ts (re-exports),
worker/site-variants.ts (removed, moved), worker/agent-operations.ts (shared context age), worker/agent-context.ts
(request summaries in the auth hub read); src/agent-transport.ts (scoped reads), src/components/agent-menu.ts
(lazy registry); tests/agent-transport.test.ts, tests/fakes/counted-agent.ts (editor socket on the real relay),
tests/oauth-pending.test.ts (legacy read count); tests/native-save/server.ts, fake-hub.ts, new fake-websocket.ts,
mcp-prompt.ts (`useLegacyRelay`) and the legacy specs that install it (native-agent-recovery,
native-component-loader, native-components, native-delete-card-race, native-discard, native-draft-storage,
native-mcp, native-mcp-media, native-onboarding, native-subfolder-urls); native-components.spec also supplies the
current required ports (an async fixture error). New tests/fixture-relay.test.ts.

**Commits.** 3d026426 (Sol build), a1b85814 (Sol: fixture relay + end-to-end read spec), 788cf729 (review 1).

**Tests.** New tests/agent-tools-read.test.ts (13): registry, each executor (drafts added/modified/moved/deleted,
missing messages, outline hash match/mismatch, selection, export omitted/binaries), revision races, payload bound,
tree walk without a loaded tree (mutation checked), real-relay usage counts, no receiver, legacy fallback. New
tests/fixture-relay.test.ts; new tests/native-save/native-agent-reads.spec.ts: an MCP client over the fixture
socket, no page mocks, reads a browser-only draft with every migrated tool and the selection; Turn off answers
unavailable at once. native-agent-live.spec's token/idle test now uses the real fixture socket.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4387 fail 0 (by hand, Sol round 2).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review git diff
42504cd4f1c7cf7ecd3c7eaf694c45eea325ae65...HEAD evidence .scratch/reviews/dor-15/20261018T112530Z`: no defects; one
validation gap fixed (the tree walk without a loaded tree). Rejected 0.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@42504cd, budget 355 KB
- RESULT: ok specs 6/6 passed (live, reads, recovery, loader, MCP, media; 36 cases)
- RESULT: ok specs 20/20 passed (`--affected`, 152 cases)

**Limits for later tickets.** Boot is at its 355 KB cap. Edits still queue in the hub (16), so a live tab on a real
deployment answers reads but not edits until ticket 16.
