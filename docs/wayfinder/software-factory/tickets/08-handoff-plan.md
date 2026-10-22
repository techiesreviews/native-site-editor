---
title: Hand off the factory build plan
type: task (AFK)
status: closed
assignee: claude (planning helper)
blocked_by: [07-recipe-v1]
---

## Question

Build tickets in `build/` for each improvement (checking skill, scoreboard, hand-out, sweeps, chat learning, grouping), in order, with builders, Agent Kit commands and evidence, in the sturdy-base style.

## Resolution (2026-10-22)

Written as [the factory build](../build/README.md) (PR #124, `cc2dc50f`): 20 slices in [build/tickets/](../build/tickets/), each with Goal, Decided behaviour citing these resolutions, Files, Done when and its kit commands. Groups: kit follow-ups from the clean-up (10–14: review-severity parsing, commit credit with the model's name, Grok small fixes, kit defaults follow the pins, three load-sensitive tests), scoreboard (20–23: findings by kind, `kit score` records, one feedback log, one visual page), hand-out (30 `kit next`, 31 `kit heartbeat` and the T3 recipe), acts-like-a-user and UX review as one `kit ux` (40 rulebook from the 35 corrections, 41 feature list, 42–43 `kit ux`, 44 feature-list guard in `kit pr`, 45 tries for the rest), routines (50 triage groups, 51 weekly sweep, 52 chat learning from `~/Projects/chat/memory/corrections/`), 60 the context card, 70 a planning slice for copying the kitchen. The build starts after the clean-up build lands; the lead may run 10–13 earlier. Next build: the atomic design catalogue (ticket 09), planned separately.

Helper decisions, marked in the README for Lex: scoreboard records machine-local with a committed end-of-build snapshot and a committed `build/feedback.md`; correction kinds reuse the chat project's names; tries are scripted, the model only judges; chat learning on even ISO weeks; the user-level context-card hook waits for Lex's yes; kit defaults switch to Claude.
