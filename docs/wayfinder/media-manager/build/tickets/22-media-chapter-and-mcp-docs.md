---
title: The Media chapter for agents; docs/mcp.md fixed
type: task (AFK)
status: open
assignee:
blocked_by: [21-agents-place-describe-collect]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "What agents are told", as the Components chapter was done in the components build.

- A **Media chapter** in `worker/site-conventions.ts` with phase 1's rules: what agents may and may not do, descriptions and Decorative, the by-agent mark, collections. It replaces "the user uploads other images in the editor" (`site-conventions.ts:41`). A site's own `AGENTS.md` may add style rules but cannot loosen these.
- Starter (its `dev` branch): copy the chapter into `AGENTS.md`; refresh `fixtures/actual-starter` from that commit and the vendored `public/native-static-starter/v<sha>/`.
- Extend `tests/agents-md-drift.test.ts` to the Media chapter.
- `docs/mcp.md`: add `make_component` (missing today), the tool count, and the new media tools.
- Later phases' agents slices (37, 45, 55, 69, 75, 81) grow this chapter and repeat the starter copy and refresh in the same slice ★.

## Done when

- The drift test passes and fails when either copy is changed alone.
- `tests/mcp-runtime.test.ts` checks the chapter is served and the tool descriptions point to it.
- `docs/mcp.md` lists every tool the server registers.
