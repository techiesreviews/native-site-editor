---
title: Write the kitchen rulebook, version 1
type: task (AFK)
status: closed
assignee: claude (planning helper)
blocked_by: [01-research-line-today, 02-grill-ux-confidence-ladder, 03-grill-checking-skill, 09-grill-atomic-catalogue, 10-grill-central-memory, 04-grill-scoreboard, 05-grill-hand-out, 06-grill-sweeps-and-learning]
---

## Question

One document every session and every model follows: the stations from idea to release, which skill and kit command each uses, who decides what, what evidence each station leaves, and the current ladder rung. Replace or point from the scattered rules in `AGENTS.md` and `docs/agents/` so there is one place to read; use `mattpocock-skills:writing-for-agents`.

## Resolution (2026-10-22)

Written as [`docs/agents/kitchen.md`](../../../agents/kitchen.md) (PR #122, `89093358`), the front door `AGENTS.md` now points to first. Twelve stations (idea, map and questions, mock-up, tickets, hand-out, build, checks, review, land, preview with note and scoreboard, Lex's end check, release), each with its skill, kit command or T3 tool, who decides, evidence and a done criterion; the 2026-10-22 builder and reviewer pins; UX ladder rung 1 with the move rule; the weekly routines; what always waits for Lex. Everything decided but not built is marked **planned** with its factory ticket. `runner.md`, the runner-extras template and `issue-tracker.md` lost the Sol builder and reviewer defaults and the runner layer; the detailed docs stay the source for their station.

Helper decisions, open for Lex to change: until the UX rulebook exists, visible tickets stay minimal (no explainer lines, hints, counts or badges unless Lex asked); every change Lex asks for gets a ticket opening "Lex (date): …", lead fixes included; ladder moves are brought to Lex rather than applied automatically.

## Comments

- 2026-10-22, Lex accepted the three lead decisions in the rulebook (minimal visible changes until the UX rulebook exists; every request of his gets a "Lex (date): …" ticket; ladder moves are brought to him, not applied automatically): "If that works best, that is fine."
