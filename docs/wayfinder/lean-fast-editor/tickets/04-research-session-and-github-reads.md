---
title: Research faster session and GitHub reads in the Worker
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What are the options, with their costs, for taking `/api/session` and the boot reads off the critical path?
- Caching the installations and repositories list (`worker/github.ts:363-388`: listed one installation at a time, `maxAge` 0) across isolates: Cache API, KV or Durable Object, TTL, and invalidation through installation webhooks.
- GitHub conditional requests (ETag/If-None-Match, which don't count against the rate limit) and listing installations in parallel.
- Moving the repository list out of the session response.
- Batching `/api/files` through the existing GraphQL `prefetchTexts` (`github.ts:501`) instead of one REST request per blob.
- The cost of a Durable Object session read on every `/api/*` call (`app.ts:845,917`), including `blockConcurrencyWhile`, versus a signed cookie or session cache.

## Resolution (2026-10-06)

Full findings: branch `research/04-session-and-github-reads` (commit f5af065), file `docs/wayfinder/lean-fast-editor/research/04-session-and-github-reads.md`.

1. List installations in parallel, capped at 4-8 (`github.ts:363-388`), and take the repository list out of `/api/session`. Neither risks stale data. Reuse the duplicate installation lookup for accounts with no repositories.
2. Keep the Durable Object session. Drop `blockConcurrencyWhile` on reads (`worker/index.ts:67`), remove the duplicate session read, and consider RPC. An encrypted cookie only if the baseline shows the Durable Object call is slow.
3. Batch `/api/files` through GraphQL `prefetchTexts`, writing into the shared blob cache.
4. A cross-isolate repository-list cache (in the Durable Object, about 60 s TTL, plus ETags) only if it is still slow after point 1. No KV, no Cache API.
5. No installation webhooks: they need setup on every self-hosted app and still miss membership changes.
