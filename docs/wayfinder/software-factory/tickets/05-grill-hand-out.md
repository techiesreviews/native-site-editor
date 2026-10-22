---
title: Decide automatic hand-out of ready tickets
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [04-grill-scoreboard]
---

## Question

A scheduled coordinator (T3 `schedule_task`, Matt Pocock's `chief-of-staff`) picks the next frontier ticket, matches it to a builder by size and kind, starts it through Agent Kit, watches it, and posts Lex a two-line status. When does it run and when does it stop; how many at once (cap five); what always waits for Lex (grilling tickets, production, spending money); how does it recover after a restart (`keep-long-builds-alive`)?

## Resolution (2026-10-22)

Decided with Lex:

1. **When:** every 30 minutes while a build is active (a T3 `schedule_task` bound to the lead's thread; the clean-up build's heartbeat of 2026-10-22 is the first rough version). It stops itself when the frontier is empty or everything left waits on Lex.
2. **Always waits for Lex:** questions that are his (grilling), going live, anything that costs money, deleting what cannot be recovered, changes to his settings or keys. Everything else runs.
3. **At most 5 helpers at once**, at most 2 in `src/main.ts`, plus each build's own parallel rules.
4. **`kit next` picks the job by fixed rules** (ticket size and kind, later the scoreboard's numbers) and names the builder; the AI only starts and watches it. Cheaper and the same every time.
