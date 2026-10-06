---
title: Measure today's cold start
type: task (AFK)
status: open
assignee: claude (measure subagent)
blocked_by: []
---

## Question

What does cold start cost today, measured the same way every time? Build a repeatable timing script (Playwright against the real starter on preview-editor.techies.tools, and locally against the fake GitHub server) and record the baseline: time to `/api/session`, first preview paint, editor usable, Monaco ready; bytes (gzip) fetched before first preview; a cold and a warm run each. The script becomes the yardstick every later decision is judged by.

Scout evidence (2026-10-06): main chunk 341 KB gzip, Monaco about 980 KB gzip on the boot path, ts.worker 1.49 MB, no `Cache-Control` on hashed assets.
