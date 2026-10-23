---
title: "The MCP menu: Connect, Wait, Disconnect, and nothing else"
type: task (AFK)
status: open
assignee: lead-29 (this session)
builder: claude
blocked_by: [98-agent-connection-stays]
---

## Goal

Lex (2026-10-23), decisions in [Lex's request 02](../../../../work/lex-requests/issues/02-simple-mcp-menu.md): the agent (MCP) menu has three states and no explainers, no toasts, no Watch controls. Feedback appears where the action happens.

## Decided behaviour

Read the request's "Decided" list; it is the spec. In short:

- One button and the coloured dot in use today (no agent icon):
  - **Connect to MCP** (not connected): copies the connection prompt; the button's own label confirms ("Copied") for a moment.
  - **Wait for MCP** (prompt copied, no agent yet): pressing it copies the prompt again; the dot pulses.
  - **Disconnect MCP** (connected = an agent is running and watching): disconnects every agent on the connection.
- Watching is automatic while connected (remove Watch for requests, Stop watching, Watch again, the 10-minute wait control and its texts). Rewrite `connectionPrompt` in `src/agent-prompts.ts` shorter: connect, `get_site`, then start a **"watchdog" subagent** that keeps calling `wait_for_requests` and reports each request back to the main thread, which makes the change and replies; everything stops when the connection is disconnected. Keep the token-safety rules.
- Several agents share one connection and prompt: verify the server accepts several agents on one connection (sessions on one grant); make it so if not. Remove "Connect another agent" and "Copy the prompt again".
- Remove all tab texts (taking over is automatic since ticket 98), "Reconnecting…", "Waiting for connection…", every error toast and error text: on a problem the button returns to **Connect to MCP** and the dot shows the state. Exception: browser storage full with unsaved changes shows **Download unsaved changes** inside the menu.
- Requests list: no heading, no "Nothing waiting"; shown only when there are requests.
- No toasts from this menu at all.

## Files

- `src/components/agent-menu.ts` (+ its CSS), `src/agent-prompts.ts`, `src/agent-transport.ts`, `src/agent-watch.ts`, `src/agent-resume.ts` (only where texts or the watch toggle live), `worker/mcp.ts` and `worker/agent-relay.ts` only if several agents per connection need it
- Tests: `tests/agent-*.test.ts` and `tests/native-save/native-agent-*.spec.ts` that assert the removed texts or controls (update, do not delete coverage of behaviour); a new `tests/native-save/native-mcp-menu.spec.ts`
- `CONTEXT.md` "Agent connection" if it names Watch

## Done when

- A browser spec walks: Connect to MCP (label confirms the copy, no toast) → Wait for MCP (press copies again) → an agent connects → Disconnect MCP → the dot changes; a second agent joins the same connection; a lost connection returns the button to Connect to MCP without any toast or text.
- `grep` shows none of the removed texts left in `src/` (list them in Done).
- The prompt asks for the watchdog subagent; a unit test pins its key lines.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit shots --compare dev` of the menu in each state (Lex sees them).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-29 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
