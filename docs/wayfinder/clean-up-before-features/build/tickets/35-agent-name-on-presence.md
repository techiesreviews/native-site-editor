---
title: "The agent's own name on its presence chip"
type: task (AFK)
status: needs-triage
assignee:
builder: claude
blocked_by: [33-agent-presence-on-section]
---

## Goal

Follow-up from [Agent presence on a section](33-agent-presence-on-section.md) (2026-10-24). Slice 33 decided the chip says "Agent", or the agent's name when the connection knows it. The browser never learns the name, so the chip always says "Agent". The Worker does know it: the MCP client's `clientInfo.name` from `initialize` (`worker/app.ts`, recorded on the connection's first use with `markGrantUsed`).

## Expected behaviour

- The presence chip shows the connected agent's name as its MCP client gives it ("Claude Code", "Codex"), clipped to one short line; "Agent" while no name is known.
- Nothing else changes: same colour, place and timing.

## Files (expected; confirm while designing)

- `worker/app.ts`, the relay (`/api/agent/relay`) and the agent hub: carry the connection's client name to the browser with the relay's `ready`, or with each command.
- `src/agent-transport.ts` / `src/components/agent-menu.ts`: keep the name for the connection.
- `src/agent-presence.ts` and `src/main.ts`: pass it to `nativePreview.agentPresence(request, name)` (the runtime already draws any name it is sent, up to 60 characters).
- Tests: a unit test for the name's path; a step in `tests/native-save/native-agent-presence.spec.ts` that the chip shows the spec client's name.
