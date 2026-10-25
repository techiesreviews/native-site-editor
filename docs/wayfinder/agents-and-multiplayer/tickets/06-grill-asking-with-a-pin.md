---
title: Decide how Lex asks agents to do something
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-agents-on-own-subscriptions, 02-research-what-an-mcp-can-do]
---

## Question

Lex (2026-10-24): asking agents with a pin is a pain today, and pins stay (a chat does not replace them). With research 01 and 02 in hand: what is clunky about today's pin (the edit bar's agent request, `src/components/agent-menu.ts`, the pin overlay), what replaces those steps, and is there also a chat panel (in the editor, or the agent's own client through an extensive MCP)? If a chat exists: where it sits, what it holds (replies, questions, progress), and how a pin and the chat relate.

## Comments

- 2026-10-24, round 1 with Lex:
  - **What's clunky:** "a, When there are more changes I am not able to ask for more changes". The pin waits because no agent is listening; the second part gets a follow-up question.
  - **No chat panel:** "No panel it is".
  - **Always-listening helper:** "Yes, instead of connect this computer can we use the mcp?" Follow-up in round 2.
  - **Six new agent abilities:** yes. A picture of the page, "I'm working here", the agent asks first with a question pin, undo its own change, next step in every reply, shorter first instructions.
  - **The pin takes the colour and name of the agent on it:** yes.
- 2026-10-24, round 2:
  - **"More changes"** means asking for a change in context. As recommended: a pin is a conversation, any pin (waiting, being worked on or done) takes a follow-up that reopens it, and one element can have several pins.
  - **Helper:** "this should be build agent agnostic. Why was the idea for connect this computer?" Explained in chat: a web page cannot start programs on Lex's computer, so something running there must start an agent when a pin arrives. Proposal in round 3: the helper starts any coding agent through ACP and connects through the MCP connection, with no new button.
- 2026-10-24, round 3: the helper works with any agent: "yes".

## Resolution (2026-10-24)

Decided with Lex:

1. **What is clunky:** the pin waits because no agent is listening, and Lex cannot ask for more in context.
2. **A pin is a conversation.** Any pin (waiting, being worked on or done) takes a follow-up, which reopens it; one element can have several pins.
3. **No chat panel.** Pins handle "this element"; bigger jobs go in the agent's own app (Claude Code, Codex). The panel comes back after stage 1 only if Lex misses it.
4. **Always-listening helper, agent-agnostic.**
   - One small helper on Lex's computer connects through the MCP connection. **Connect to MCP** stays the only button, and the menu keeps its three states.
   - For each pin it starts the chosen coding agent through ACP (Claude Code, Codex, Gemini CLI, OpenCode or others), on his own plans, with limited permissions. Questions come back to the pin.
   - The MCP menu picks which agent takes pins.
   - Agents Lex runs himself keep connecting straight through the MCP. Where Claude Code supports it, their listening uses the tasks "long job" wait.
5. **Six new agent abilities in stage 1:**
   - a picture of the page at Lex's width or a phone width;
   - "I'm working here" (presence);
   - the agent asks first with a question pin;
   - undo its own change;
   - the next step named in every reply;
   - shorter first instructions.

   No MCP App.
6. **The pin shows who is on it:** the agent's colour and name chip, no text; grey when done.
