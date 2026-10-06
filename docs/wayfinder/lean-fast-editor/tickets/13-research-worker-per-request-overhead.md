---
title: Research Worker per-request overhead beyond the session read
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: [04-research-session-and-github-reads, 05-shape-of-boot-requests]
---

## Question

With boot settled as parallel separate calls (ticket 05) and the session changes from ticket 04, what else does each `/api/*` request pay in the Worker before it does useful work? Look at `worker/index.ts`, `worker/app.ts`, `worker/owner-setup.ts` (`configuredApp()` reads a global Durable Object on every call, ~25 ms warm per ticket 01), GitHub token minting/caching, blob cache, routing and body parsing. Rank by cost with concrete fixes, and say what to measure on a fresh preview deploy for the cold-isolate number.

## Resolution (2026-10-06)

Full findings: branch `research/13-worker-per-request-overhead` (commit 6e60087), file `docs/wayfinder/lean-fast-editor/research/13-worker-per-request-overhead.md`. Correction: `configuredApp()` runs only in `/api/session` (`app.ts:740`), and only on owner-setup editors (such as preview), not on every call. Measured: script startup 70–85 ms locally for the 1.0 MB bundle, about 40 ms without MCP. Durable Object and GitHub costs are estimates.

1. Keep the GitHub App config in the isolate once found (`owner-setup.ts:88-103`); it is write-once, so this takes the shared Durable Object (~25 ms) off `/api/session` after each isolate's first request.
2. Keep the repository listing in the session Durable Object so authorization comes back with the session read (`app.ts:917`, `github.ts:390`); today a cold isolate pays 1+N serial GitHub calls (est. 100–400 ms). This promotes ticket 04 point 4 from "only if still slow" to planned. Cheaper first step: send `installation_id` and list only that installation.
3. Load MCP only when `/mcp` is hit (`app.ts:16`, `:434`); zod and ajv are ~79% of the bundle, so this halves cold startup.
4. Pass `ctx` through (`index.ts:75`), use `waitUntil` for blob cache writes (`blob-cache.ts:99`), open the cache once per isolate.
5. Add a `Server-Timing` header (session, config, auth, github, cold) first. After `deploy:preview`, record Worker startup time, the first `/api/session` and `/api/branches` against a 10-run curl median (signed out and in), `wrangler tail`, and repeat from a US region.
