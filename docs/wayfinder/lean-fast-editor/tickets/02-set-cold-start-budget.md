---
title: Set the cold-start budget
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-measure-cold-start-baseline]
---

## Question

What numbers count as "fast enough"? For example: preview usable within N seconds on a warm repository, at most X KB gzip before first preview, and a separate target for a cold Worker isolate. Is the budget enforced in CI, or only checked by hand with the script?

## Resolution (2026-10-06)

Decided with Lex. Budget on the throttled local profile (100 ms / 20 Mbps, `tests/perf/cold-start.ts`, median of 5):

- at most 350 KB gzip fetched before first preview paint;
- cold first preview paint at most 1.0 s;
- warm first preview paint at most 0.4 s.

Remote signed-in target (set with ticket 16, on preview with Lex's site): usable at most paint + 0.5 s, no image bytes before paint, cold paint at most 2.5 s, warm at most 1.5 s. The byte budget is enforced in CI (deterministic); timings are checked by hand with the script on each build slice and recorded in the slice's notes.
