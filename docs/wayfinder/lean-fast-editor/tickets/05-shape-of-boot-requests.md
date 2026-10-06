---
title: Choose the shape of the boot requests
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-measure-cold-start-baseline, 04-research-session-and-github-reads]
---

## Question

Should boot keep separate calls (session, snapshot, branches, files) made in parallel, or collapse into one `/api/boot` that returns the session, the last repository's snapshot and its first page files together? Also decide which serial steps on the front end become parallel or deferred:
- the IndexedDB draft load,
- `findDeletedUpstream` (one request per draft),
- the up to 20 rounds of stylesheet `@import` (`main.ts:4066`),
- the wait of up to 4 s for images and fonts (`main.ts:4620`).

## Resolution (2026-10-06)

Decided with Lex.

1. No `/api/boot`. Boot keeps separate calls (session without the repository list, snapshot, branches, files), fired in parallel; files are batched through GraphQL (ticket 04).
2. The IndexedDB draft load starts alongside the network reads.
3. `findDeletedUpstream` runs after first paint, batched instead of one request per draft.
4. Stylesheet `@import` discovery fetches each level's files in parallel (`main.ts:4066`).
5. The wait for images and fonts before paint (`main.ts:4620`, up to 4 s) is capped at about 300 ms or dropped, whichever the budget run supports.
