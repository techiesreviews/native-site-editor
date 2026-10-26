---
title: "Inbox: agents' questions and finished asks"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [40-inbox]
---

## Goal

Agent items from the agents and multiplayer build land in the Inbox ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26)): an agent's question (agents build slice 15, "ask first") and a finished pinned ask (agents build slice 13, "a pin is a conversation"). Size: M.

## Decided behaviour

- An agent question waiting for an answer is an item; clicking it opens the pin or the agent's question in place. It goes when answered or when the agent stops.
- A finished pinned ask is an item until Lex opens it.
- The pins and chips on the page keep working as before; the Inbox only lists them.

## Files

Expected: `src/inbox/agent-items.ts`, the agents build's pin and question modules (read only), tests.

## Done when

- With a fake agent asking a question and finishing a pin, both items show and clear as described.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-43 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-43 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
