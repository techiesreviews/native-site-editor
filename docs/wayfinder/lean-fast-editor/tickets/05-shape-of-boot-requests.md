---
title: Choose the shape of the boot requests
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-measure-cold-start-baseline, 04-research-session-and-github-reads]
---

## Question

Should boot keep separate calls (session, snapshot, branches, files) made in parallel, or collapse into one `/api/boot` that returns the session, the last repository's snapshot and its first page files together? Also decide which serial steps on the front end become parallel or deferred:
- the IndexedDB draft load,
- `findDeletedUpstream` (one request per draft),
- the up to 20 rounds of stylesheet `@import` (`main.ts:4066`),
- the wait of up to 4 s for images and fonts (`main.ts:4620`).
