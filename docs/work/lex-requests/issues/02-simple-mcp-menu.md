---
title: "Lex (2026-10-23): the MCP menu is three actions, no explainers"
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

# Lex (2026-10-23): the MCP menu is three actions, no explainers

## What

Lex: "I want to simplify the statuses for MCP, no explainer or what soever needed. I want to have connect to mcp, wait for mcp and disconnect mcp." Today `src/components/agent-menu.ts` shows about 45 texts (statuses, tab messages, errors, Watch controls). Kind: too much text or decoration.

## Decided (2026-10-23, with Lex)

- **Three states, one button each, a coloured dot beside it (the dot in use today); no agent icon, no explainer text, no toasts.** Feedback appears where the action happens (on the button or the dot).
  1. **Connect to MCP** (not connected): copies the connection prompt; the button itself confirms the copy (for example its label reads "Copied" for a moment).
  2. **Wait for MCP** (prompt copied, waiting for the agent to connect): pressing it copies the prompt again. The dot pulses.
  3. **Disconnect MCP** (connected): connected means an agent is running and watching for requests. Pressing it disconnects every agent on this connection.
- **Watching is automatic.** No Watch, Stop watching or Wait toggles: while connected, the agent watches until Disconnect. The prompt is simplified and tells the agent to start a **"watchdog" subagent** that always waits for requests and reports back to the main thread when there is something; it stops when the connection is disconnected.
- **Several agents share one connection:** the same prompt and connection serve any number of agents (no "Connect another agent"; no "Copy the prompt again" while connected). The builder verifies the server accepts several agents on one connection and makes it so if not.
- **Tabs:** no tab messages; taking over is automatic (ticket 98).
- **In-between states:** no "Reconnecting…" or "Waiting for connection…" text; the dot shows it.
- **Problems:** no toast and no error text; the button returns to **Connect to MCP** and the dot shows the state. The one exception keeps work safe: when the browser's storage is full with unsaved changes, the menu itself offers **Download unsaved changes**.
- **Requests list:** no heading and no "Nothing waiting"; requests show only when there are some.

## Comments

- 2026-10-23, Lex: **no toasts anywhere in the editor**: "I don't think it's ever needed, the interface should show what is happening or what is doing." UX rulebook rule. The MCP menu follows it now (clean-up slice 29); the rest of the editor moves its feedback to the place of the action in the atomic design catalogue build (recorded on the software-factory map).
