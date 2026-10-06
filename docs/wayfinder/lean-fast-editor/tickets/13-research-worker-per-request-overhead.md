---
title: Research Worker per-request overhead beyond the session read
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: [04-research-session-and-github-reads, 05-shape-of-boot-requests]
---

## Question

With boot settled as parallel separate calls (ticket 05) and the session changes from ticket 04, what else does each `/api/*` request pay in the Worker before it does useful work? Look at `worker/index.ts`, `worker/app.ts`, `worker/owner-setup.ts` (`configuredApp()` reads a global Durable Object on every call, ~25 ms warm per ticket 01), GitHub token minting/caching, blob cache, routing and body parsing. Rank by cost with concrete fixes, and say what to measure on a fresh preview deploy for the cold-isolate number.
