---
title: "The helper: any agent picks up pins"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-mcp-menu-agents, 13-pin-conversation]
---

## Goal

A pin never waits for nobody: a small helper on Lex's computer listens all the time and starts the chosen coding agent for each pin ([research 01](../../tickets/01-research-agents-on-own-subscriptions.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 06, item 4](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- The helper is an MCP client of the editor's `/mcp`, connecting through the same connection and OAuth. Connect to MCP stays the only button; its copied prompt gives the helper's start command.
- It waits for pins and starts the agent chosen in "Pins go to" through ACP (Claude Code, Codex, Gemini CLI, OpenCode), on Lex's own plans.
- Agents run with limited permissions (a short allowed-tools list) and work through the MCP tools.
- Questions and approvals come back to the pin.
- It reports the agent's program, so carets and chips can show its icon (stage 2).
- **Check with Lex:** installation and publishing (README, lead decisions).

## Files

Expected (confirm while designing): a new `helper/` package (its own `package.json`, outside the editor bundle), `src/agent-prompts.ts` (the start command), `worker/mcp.ts` and `worker/oauth.ts` only if the helper needs a client type; tests for the helper's pin loop with a fake ACP agent; `docs/mcp.md` and a short `helper/README.md`.

## Done when

- A test runs the helper against the local Worker and a fake ACP agent: a pin starts one agent, its question returns to the pin, and its change lands.
- With the real Claude Code on the lead's machine, one manual run is recorded in Done (command and result).
- Permissions are limited (test of the allowed-tools list).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-16 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-16 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
