---
title: Mock up several agents working while Lex works
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [05-grill-several-agents-at-once, 06-grill-asking-with-a-pin]
---

## Question

A clickable mock-up (the `prototype` skill, an HTML page shown with T3 `html_render`, or `?proto=` on a `prototype/` branch) of stage 1: Lex asks two agents through pins (and the chat, if decided), both work on the page and on another page while he types elsewhere, one asks a question, one finishes. Lex clicks through and approves, or says what changes, before the stage-1 build is ticketed.

## Resolution (2026-10-25)

Lex approved the [stage-1 mock-up](../prototypes/10-asking-agents.html) ("asking agents looks great"), with one change: **Ask agent shows only its icon**, as today, with no text. Kept:

- The name chip sits on the pin only, not also on the outline, while an agent works through a pin.
- The pin card has a Send button.
- "Pins go to" in the MCP menu.
- A follow-up reopens a pin.
- The agent's orange question pin.
