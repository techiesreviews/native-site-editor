---
title: Decide how several agents and subagents work at once
type: grilling (HITL)
status: closed
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
- 2026-10-24, round 2 with Lex: keeping agents in sync, "cool" (all four parts as recommended). Prototype: "Yes, this feels acceptable".

## Resolution (2026-10-24)

Decided with Lex:

1. **Names and colours:** every agent tool takes an optional short name, and the connection prompt (`src/agent-prompts.ts`) tells each subagent to name itself; the server alone only knows the program (`worker/app.ts`, `clientInfo.name`). The editor gives each new name the next colour from a fixed set of existing theme colours, in order of arrival (prototype: the MCP green, components violet, video pink, data teal). Orange stays for a question and blue for Lex's own selection.
2. **In sync, rarely refused:**
   - Agent changes target the exact words or section they change, not the whole file (`expectedHash` in `shared/agent-edit.ts` narrows to the part), so changes elsewhere on the page never refuse them.
   - Every reply tells the agent what changed since it last read.
   - Only a true clash (the same words changed meanwhile) is refused, and the refusal carries the new version of just that part so the agent retries at once.
   - In stage 2 the agent joins live editing and its change merges like typing.
3. **Seeing them work while Lex works:**
   - an outline and name chip per agent on its section, in its colour; the chip turns orange when that agent asks a question;
   - the agent's dot on the section's row in Page Structure;
   - agent dots on another page's row in Pages and files;
   - no progress bars, status text or toasts.

   Approved in the [prototype](../prototypes/05-agents-at-once.html).
4. **Stopping one:** the MCP menu lists the agents working now (dot, name, Stop); Disconnect MCP stops them all.
5. **Agents know about each other:** reading the site tells each agent who works on what.
