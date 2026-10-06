---
title: Set the cold-start budget
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-measure-cold-start-baseline]
---

## Question

What numbers count as "fast enough"? For example: preview usable within N seconds on a warm repository, at most X KB gzip before first preview, and a separate target for a cold Worker isolate. Is the budget enforced in CI, or only checked by hand with the script?
