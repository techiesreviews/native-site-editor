---
title: Decide how projects share Lex's central memory
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [06-grill-sweeps-and-learning]
---

## Question

Lex (2026-10-22): learning from past chats should also live in his chat project ([Notifications thread](t3-thread://v1/bebe7a58-c8c2-4e69-a7e7-054a842c493b), `~/Projects/chat/memory/`), "so every time I am working on something my thoughts, context etc. is shown, whilst staying central". The chat project already runs a nightly sync (01:00) that reads conversations across projects into `memory/` (sync records, a reflection), but it is partial (it stops at about 60,000 characters a night and falls behind) and nothing flows back into project sessions. Decide: one collector (the nightly sync) with a corrections pass feeding each project's learning step; a short context card from the central memory shown at the start of every session in every project; how often the sync runs to keep up; and where each part is built (chat project vs this repo vs shared hooks).
