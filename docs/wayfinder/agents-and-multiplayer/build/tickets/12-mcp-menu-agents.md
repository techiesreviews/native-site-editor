---
title: "MCP menu: agents working now, Stop, and Pins go to"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Lex can stop one agent without stopping the others, and choose which agent picks up pins ([mock-up](../../prototypes/10-asking-agents.html)).

## Decided behaviour

[Ticket 05, item 4](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24) and [ticket 06, item 4](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- The open menu lists the agents working now (dot, name, Stop); Stop ends that agent only.
- "Pins go to" picks the agent the helper starts for pins (Claude Code, Codex, Gemini CLI, …). The choice is remembered per site in the browser.
- Disconnect MCP still stops them all.
- The three-state button and no-explainer rules from clean-up slice 29 stay.

## Files

Expected (confirm while designing): `src/components/agent-menu.ts` (+ CSS), `src/controllers/agent-controller.ts`, `worker/mcp.ts` and `worker/agent-relay.ts` (end one agent session), `shared/agent.ts`; tests and `tests/native-save/native-mcp-menu.spec.ts`.

## Done when

- A spec stops one of two agents: its outline and dots go, and the other keeps working.
- The Pins go to choice survives a reload.
- No new explainer strings (grep in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-12 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-12 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
