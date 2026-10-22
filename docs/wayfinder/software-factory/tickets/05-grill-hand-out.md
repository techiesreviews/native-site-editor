---
title: Decide automatic hand-out of ready tickets
type: grilling (HITL)
status: open
assignee:
blocked_by: [04-grill-scoreboard]
---

## Question

A scheduled coordinator (T3 `schedule_task`, Matt Pocock's `chief-of-staff`) picks the next frontier ticket, matches it to a builder by size and kind, starts it through Agent Kit, watches it, and posts Lex a two-line status. When does it run and when does it stop; how many at once (cap five); what always waits for Lex (grilling tickets, production, spending money); how does it recover after a restart (`keep-long-builds-alive`)?
