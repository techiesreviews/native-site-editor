---
title: Measure today's cold start
type: task (AFK)
status: closed
assignee: claude (measure subagent)
blocked_by: []
---

## Question

What does cold start cost today, measured the same way every time? Build a repeatable timing script (Playwright against the real starter on preview-editor.techies.tools, and locally against the fake GitHub server) and record the baseline: time to `/api/session`, first preview paint, editor usable, Monaco ready; bytes (gzip) fetched before first preview; a cold and a warm run each. The script becomes the yardstick every later decision is judged by.

Scout evidence (2026-10-06): main chunk 341 KB gzip, Monaco about 980 KB gzip on the boot path, ts.worker 1.49 MB, no `Cache-Control` on hashed assets.

## Resolution (2026-10-06)

Script and findings: branch `research/01-cold-start-baseline` (commit 944222e), `tests/perf/cold-start.ts` and `docs/wayfinder/lean-fast-editor/research/01-cold-start-baseline.md`. Run against the local fake GitHub server with `ASE_COLD_BASE=… tsx tests/perf/cold-start.ts 5` (optional `ASE_COLD_NET=100/20`); a signed-in remote run needs `ASE_COLD_STORAGE` + `ASE_COLD_HASH` from a one-time `playwright codegen --save-storage` sign-in by Lex.

Signals: *paint* = first contentful paint inside the preview iframe; *usable* = later of paint and the first Page structure row; *Monaco ready* = first Monaco editor showing code.

Baseline, median of 5 (ms from navigation start):

| Target | Load | session | paint | usable | Monaco | bytes before paint |
|---|---|---|---|---|---|---|
| Local, unthrottled | cold | 157 | 459 | 459 | 717 | 1404 KB |
| Local, unthrottled | warm | 67 | 185 | 185 | 279 | 15 KB |
| Local, 100 ms / 20 Mbps | cold | 568 | 1719 | 1719 | 1475 | 1419 KB |
| Local, 100 ms / 20 Mbps | warm | 339 | 1219 | 1219 | 996 | 15 KB |
| Remote, signed out | cold | 559 | – | – | – | 372 KB |
| Remote, signed out | warm | 133 | – | – | – | 3 KB |

1. Monaco (`editor.api.js` 659 KB) and `code-editor.js` (300 KB) are about 70% of the bytes before first paint; on the throttled profile Monaco is ready ~250 ms *before* the preview paints.
2. A warm reload moves 15 KB but still takes 1.2 s on a slow link: ~29 assets revalidate (fixed by the immutable `/assets/*` rule from ticket 06).
3. Signed-out `/api/session` on owner-setup editors still reads a global Durable Object (`worker/owner-setup.ts:97`, ~25 ms warm).
4. Cold Worker isolate: can't be forced without a deploy; curl shows 180–250 ms outliers against a 30–55 ms warm median. Measure right after a preview deploy.
5. Still missing: signed-in numbers on preview-editor.techies.tools (needs Lex's one-time sign-in). Local numbers are for comparing runs, not user-facing truth.

Per ticket 11, `tests/perf/edit-component-latency.ts` goes; `cold-start.ts` is the yardstick that stays.

## Remote signed-in baseline (2026-10-06, added after close)

preview-editor.techies.tools, starter repository 1389746318, real network from Lex's machine (no throttling), median of 5:

| Load | session | paint | usable | Monaco | bytes before paint | requests before paint | bytes total |
|---|---|---|---|---|---|---|---|
| cold | 1125 | 3956 | 18327 | 3351 | 6591 KB | 72 | 15190 KB |
| warm | 807 | 2716 | 17077 | 2035 | 5148 KB | 73 | 13683 KB |

Top bytes before first paint (cold): `/api/raw` 4566 KB, Monaco `editor.api` 683 KB, `/api/files` 548 KB, `index.js` 332 KB, `code-editor` 304 KB.

New findings the local profile hid:
1. **Images dominate.** `/api/raw` returns each image blob base64-encoded in JSON (`worker/app.ts:958`) with no caching, so the ~4.5 MB of starter images (+33% for base64) is fetched again on every load, warm included. Blobs are addressed by SHA, so they can be cached as immutable.
2. **"Usable" is 17–20 s**, far behind paint (2.7–4 s). Locally the two were equal. Cause unknown; see ticket 16.
3. **Warm is barely faster than cold** (2.7 s vs 4.0 s paint): almost nothing on the data path is cached by the browser.

