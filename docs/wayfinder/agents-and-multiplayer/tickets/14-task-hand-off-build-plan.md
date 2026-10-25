---
title: Hand off the agents and multiplayer build plan
type: task (AFK)
status: closed
assignee: claude (lead)
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

## Resolution (2026-10-25)

[build/README.md](../build/README.md) and 22 slices in `build/tickets/`:

- stage 1, several agents at once and asking them: 8 slices (10–17);
- stage 2, typing together: 7 slices (20–26);
- stage 3, people and outside changes: 7 slices (30–36).

Each stage is shipped on its own, after Lex's end check. The build waits until the clean-up build is released. First wave: 10 and 11.

Check with Lex when the build starts:

- the helper's installation and publishing, and its default agent (16);
- buying the preview domain (35).

`tickets.mjs check` passes.
