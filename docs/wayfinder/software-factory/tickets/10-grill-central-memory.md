---
title: Decide how projects share Lex's central memory
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [06-grill-sweeps-and-learning]
---

## Question

Lex (2026-10-22): learning from past chats should also live in his chat project ([Notifications thread](t3-thread://v1/bebe7a58-c8c2-4e69-a7e7-054a842c493b), `~/Projects/chat/memory/`), "so every time I am working on something my thoughts, context etc. is shown, whilst staying central". The chat project already runs a nightly sync (01:00) that reads conversations across projects into `memory/` (sync records, a reflection), but it is partial (it stops at about 60,000 characters a night and falls behind) and nothing flows back into project sessions. Decide: one collector (the nightly sync) with a corrections pass feeding each project's learning step; a short context card from the central memory shown at the start of every session in every project; how often the sync runs to keep up; and where each part is built (chat project vs this repo vs shared hooks).

## Resolution (2026-10-22)

Decided with Lex (all as recommended):

1. **One collector:** the chat project's sync stays the only reader of chats and gains a corrections pass that records every correction Lex gives an agent, tagged by project. The factory's learning step reads that list instead of rereading chats.
2. **Context card in every session:** a start-up step in every project shows a short card (about 30 lines: current thinking, recent decisions, open questions for that project) read fresh from `~/Projects/chat/memory/`; never copied into the project; more on request.
3. **Sync every 4 hours** with the same small per-run budget, so it catches up within a day and stays current.
4. **Where:** the sync and corrections pass are built in the chat project (its own thread, started 2026-10-22); the context card and the factory link go into the shared Agent Kit so every project gets them (factory build tickets).
