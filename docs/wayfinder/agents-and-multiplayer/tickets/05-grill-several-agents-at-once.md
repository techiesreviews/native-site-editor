---
title: Decide how several agents and subagents work at once
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Lex (2026-10-24): "agents and subagents doing things at the same time" matters most. Slice 33 shows one agent on a section; slice 29 lets several agents share one connection. What does Lex see and control when three agents or subagents work on his site at once?

- Each agent's name and colour, and where it comes from (the connection, the agent's own name, a number).
- Two agents on the same section or file: who goes first, does one wait, merge, or get told.
- Seeing them work while he works (his pain 3): on the page (presence outline and chip), in Page Structure, in Pages and files for other pages, and how far along each one is, with no toasts or explainer lines.
- Stopping one agent without stopping the others.
- What the agent learns about the others (who is on what).

## Comments

- 2026-10-24, round 1 with Lex:
  - **Names and colours:** as recommended. Every agent tool takes an optional short name and the connection prompt tells each subagent to name itself (the server only knows the program, `worker/app.ts` `clientInfo.name`). The editor gives each new name the next theme colour in order of arrival.
  - **Two agents on one page:** Lex asked how to keep agents in sync so a change made in the editor never refuses them (today the whole-file `expectedHash` in `shared/agent-edit.ts` does). Follow-up in round 2.
  - **Seeing them work:** yes, "let's check the real UX in a tiny prototype". An outline and name chip per agent in its colour, the chip orange when the agent asks a question, the row dot in Page Structure, agent dots on the page's row in Pages and files, no progress bars or status text. Prototype: `../prototypes/05-agents-at-once.html`.
  - **Stopping one agent:** yes. The MCP menu lists the agents working now (dot, name, Stop); Disconnect MCP stops them all.
  - **Agents know about each other:** yes. Reading the site tells each agent who works on what.
