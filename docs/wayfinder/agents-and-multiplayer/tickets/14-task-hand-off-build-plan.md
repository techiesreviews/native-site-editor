---
title: Hand off the agents and multiplayer build plan
type: task (AFK)
status: open
assignee:
blocked_by: [13-grill-undo-with-several-editors]
---

## Question

Write the build folder `docs/wayfinder/agents-and-multiplayer/build/` in the style of the clean-up build:

- a README with rules, gates and waves for the three stages;
- one slice per ticket with size, Files, Done when, kit commands and evidence;
- "Check with Lex" marks;
- Lex's checklist for the GitHub App webhook;
- deleting the throwaway PoC Worker.

Done when `node scripts/agents/tickets.mjs check` passes and the frontier shows the first wave. Building waits until the clean-up build ships.
