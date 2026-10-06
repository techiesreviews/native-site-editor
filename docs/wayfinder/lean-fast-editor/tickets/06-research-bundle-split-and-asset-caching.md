---
title: Research bundle splitting and asset caching
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

What is the right build and cache setup?
- Vite 8 (Rolldown) chunking: `advancedChunks`/`manualChunks`, modulepreload, and lazy-loading the page builder, the agent panel, the setup wizard and `html-entities.ts`.
- Trimming Monaco: which contributions and language workers the editor really needs (`src/components/monaco.ts` imports all of them; ts.worker is 1.49 MB).
- Cloudflare Workers static assets: how to set `Cache-Control: immutable` for hashed `/assets/*` (`public/_headers` sets none), and how that combines with `run_worker_first`.
- Moving CSS off the boot path (54 files go into `index.css`, 207 KB).
