---
title: Decide the weekly sweep, learning from past chats and grouping problems
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Three routines: a weekly sweep that only lists bad patterns (`improve-codebase-architecture`, guardrail candidates); a scan of past chats every week or two for corrections Lex had to repeat, each turned into a hook, lint rule or kit check (`retro`); and grouping related problems before hand-out (`triage`). How often each runs, what it produces, where the output goes, and what Lex sees.

## Resolution (2026-10-22)

Decided with Lex:

1. **Weekly sweep** (`improve-codebase-architecture`, guardrail candidates): lists bad patterns only, changes nothing; the lead brings Lex the top 3 with a recommended fix each; he picks which become tickets.
2. **Learning from past chats** (`retro`) every two weeks: corrections Lex gave more than once become an automatic check (hook, lint rule, kit check) or a UX rulebook line; Lex sees the list before anything is added. Lex wants this tied to his central chat project (thread `bebe7a58-c8c2-4e69-a7e7-054a842c493b`, `~/Projects/chat/memory/`), which already syncs conversations from all projects nightly: see [Decide how projects share Lex's central memory](10-grill-central-memory.md).
3. **Grouping** (`triage`): before hand-out, new problems (Lex's feedback, sweep findings, failing tests) are grouped by shared cause; one builder takes a whole group.
4. **When:** sweep Mondays 09:00 Amsterdam; chat learning every other Monday right after; one short message with both.
