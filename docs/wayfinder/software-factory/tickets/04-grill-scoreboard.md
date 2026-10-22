---
title: Decide the scoreboard and how review findings are recorded
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Per piece of work: which model built it, time, cost where known, review rounds, what each review found (in fixed categories), and whether Lex had to correct it afterwards (UX or behaviour). Where is it kept, what does Lex see and when, and which numbers decide moves up or down the UX confidence ladder and the choice of builder per kind of job? Lex (F5): find a structured way to document review findings clearly.

## Resolution (2026-10-22)

Decided with Lex:

1. **Recorded per piece, automatically by the kit, one file per build:** builder model, time, review rounds, review findings in fixed kinds (real fault, mismatch with the ticket, timing/race, style), every UX correction by Lex in the kinds from [Map today's production line and where it went wrong](01-research-line-today.md) (too much text or decoration, looks below the bar, felt wrong once used, real fault), and cost where known. (SB1 was not answered explicitly; taken as accepted because SB2–SB4 build on it. Lex may still change it.)
2. **One page per build** that Lex sees in chat at each milestone and at the end. Lex: **visualize it in the best way possible so he understands more** (use the `dataviz` skill; teach, don't just list).
3. **One feedback log:** every correction Lex gives is one line in the build's feedback list, with its kind and a link to the fix; it replaces the six ways used so far and is the count the UX confidence ladder uses.
4. **Builder choice by numbers:** after about 10 pieces of one kind, the scoreboard shows which builder does that kind best and cheapest; the lead brings it to Lex before changing routing.
