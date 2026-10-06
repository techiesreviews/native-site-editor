---
title: Research bundle splitting and asset caching
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What is the right build and cache setup?
- Vite 8 (Rolldown) chunking: `advancedChunks`/`manualChunks`, modulepreload, and lazy-loading the page builder, the agent panel, the setup wizard and `html-entities.ts`.
- Trimming Monaco: which contributions and language workers the editor really needs (`src/components/monaco.ts` imports all of them; ts.worker is 1.49 MB).
- Cloudflare Workers static assets: how to set `Cache-Control: immutable` for hashed `/assets/*` (`public/_headers` sets none), and how that combines with `run_worker_first`.
- Moving CSS off the boot path (54 files go into `index.css`, 207 KB).

## Resolution (2026-10-06)

Full findings: branch `research/06-bundle-split-and-asset-caching` (commit c12c0f8), file `docs/wayfinder/lean-fast-editor/research/06-bundle-split-and-asset-caching.md`.

1. Monaco is already a lazy chunk, but two prefetches (`main.ts:8549`, `:9246`) start its ~954 KB gzip download right after sign-in, competing with the reads the preview needs. Deferring them until after first preview paint is the biggest win and needs no chunking change. This is settled under the "usable before Monaco" decision.
2. Add `/assets/*  Cache-Control: public, max-age=31536000, immutable` to `public/_headers`. `run_worker_first` doesn't cover `/assets`, so the rule applies. `index.html`, `native-preview-runtime.js` and the starter files stay on revalidation.
3. The main chunk is 332 KB gzip. The removals cut about 50 KB. Loading onboarding, the agent panel, media, the command palette and history on demand saves about 50 KB more, and their CSS leaves the boot path with them. Rolldown chunk groups don't help. `html-entities.ts` needs a small synchronous fast path rather than on-demand loading.
4. Dropping TypeScript language support removes ts.worker (1.45 MB gzip). It shrinks deploys and speeds up opening JS files, but not boot. This needs Lex's call: see the ticket on JS IntelliSense.
5. Trimming Monaco contributions saves about 97 KB gzip but has broken the editor before (`monaco.ts:1-13`). Do it last, and only once browser tests run in CI.
6. Add a reload-once handler for lazy chunks that fail to load after a deploy (stale tab, 404).
