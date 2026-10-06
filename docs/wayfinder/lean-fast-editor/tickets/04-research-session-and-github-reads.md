---
title: Research faster session and GitHub reads in the Worker
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

What are the options, with their costs, for taking `/api/session` and the boot reads off the critical path?
- Caching the installations and repositories list (`worker/github.ts:363-388`: listed one installation at a time, `maxAge` 0) across isolates: Cache API, KV or Durable Object, TTL, and invalidation through installation webhooks.
- GitHub conditional requests (ETag/If-None-Match, which don't count against the rate limit) and listing installations in parallel.
- Moving the repository list out of the session response.
- Batching `/api/files` through the existing GraphQL `prefetchTexts` (`github.ts:501`) instead of one REST request per blob.
- The cost of a Durable Object session read on every `/api/*` call (`app.ts:845,917`), including `blockConcurrencyWhile`, versus a signed cookie or session cache.
