---
title: Research why remote "usable" takes 17 s and how image blobs are served
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

The signed-in remote baseline (ticket 01, added section) shows paint at 2.7–4 s but "usable" (first Page structure row) at 17–20 s, and 4.5 MB of `/api/raw` image blobs fetched before paint on every load, warm too. Why is usable so late remotely when locally it equals paint? What is the cheapest way to serve blob bytes by SHA with immutable private caching (raw bytes instead of base64 JSON) and to keep images off the critical path? Does any of this change the budget or the phase order?
