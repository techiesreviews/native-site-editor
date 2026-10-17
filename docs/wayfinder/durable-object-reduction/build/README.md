# Build: Durable Object reduction

Implementation of the [handoff](../handoff.md) build order, phases 1–6. Phase 7 (modern
registration) is a separate later change and has no tickets here. Ticket answers in
[../tickets/](../tickets/) are the accepted product decisions; this build does not reopen them.

Tickets live in [tickets/](tickets/), one slice each, landed through `kit pr` into `dev`.
Tickets run in parallel lanes (browser correctness 07–11; relay 12–13; server caps 23→24→22), joining at 14 (browser live transport) and 25 (disconnect lifecycle). `blocked_by` holds the lanes; parallel slices that share a file (mostly `worker/index.ts`, `worker/app.ts`, `worker/oauth.ts`, `src/main.ts`) resolve the overlap when `kit pr` rebases. Source plan: a read-only Sol audit of `38039dda`
(2026-10-17); its file:line evidence is summarised under "Current code" below.

## Runner extras

Read with [runner.md](../../../agents/runner.md). Where they differ, this section wins.

- **Owner names.** `ASE_OWNER=dor-NN` for ticket `NN`.
- **Counts, not promises.** Every resource number a test asserts comes from the
  [usage harness](tickets/01-usage-harness.md) counters. Name them as call/key/byte counts;
  never call them billed rows, requests or savings.
- **No WebMCP.** `src/webmcp.ts` is uncommitted work elsewhere and is not on `dev`. Browser
  tools use their own injectable interface; WebMCP can adapt to it later.
- **Nothing ships enabled to production.** Preview deploys are the lead's; production
  deployment needs a separate instruction from Lex.

## Lead decisions (implementation detail, not product changes)

- **Remote opt-in is per tab and not remembered (phases 1–2).** Until the live relay lands,
  the legacy transport is the only remote path, and remembering opt-in would restart polling on
  ordinary reloads. An existing grant alone never turns remote mode on. Phase 3 revisits
  remembering opt-in once an idle connection is a hibernating socket.
- **First-use cost.** The accepted ticket said first use adds two calls; current code adds one
  (`markGrantUsed`). The harness asserts what the code does.
- **Docs.** Each ticket that renames a term or entry point updates `CONTEXT.md` /
  `docs/agents/code-map.md` in the same slice when it owns them; otherwise ticket 25 does.

## Current code (2026-10-17, `38039dda`)

- One DO class, `SessionStore` (binding `SESSIONS`), holds every record kind: sign-in
  sessions with the repository cache, App config (`native-site-editor/config`), agent grants
  (`agent:<sha256 token>`), the agent hub (`agent-hub:<sign-in id>`: grants, last tab, queued
  commands/results, `context`, `drafts` + `draft:<hash>`, `requests`), OAuth clients, requests,
  codes and the registration limiter.
- One alarm per object; it clears the repository cache and hub keys unconditionally. No presence
  tracking, grace period, generation fence or WebSocket handlers.
- Browser: the agent controller probes at startup and every 30 s while visible; the agent menu
  polls every 2 s (30 s without grants), sends a context heartbeat every 30 s, uploads missing
  drafts, and claims/acks each command. Duplicate outcomes live in a 100-entry memory map.
- Server: queued edit results are polled every 400 ms for up to 10 s; `wait_for_requests` polls
  every ≤1.5 s for 25 s and invites the client to repeat; copied prompts reinforce the loop.
- `/mcp` authentication costs 3 DO calls (grant, sign-in, hub); first use adds 1. A simple read
  is about 4; a changed edit about 30 plus draft fetches; an empty default wait about 21.
  These are source-derived counts, not measurements.
- Browser drafts: IndexedDB `native-site-editor-drafts`; batches are atomic but a failed batch is
  retried per file; uploads use a separate database; no durable agent receipt exists.
