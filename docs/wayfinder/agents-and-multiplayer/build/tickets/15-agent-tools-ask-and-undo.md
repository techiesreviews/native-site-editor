---
title: "Agent tools: ask first, undo its own change"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-exact-part-edits, 13-pin-conversation]
---

## Goal

An agent can ask Lex before it acts, and undo what it did ([mock-up](../../prototypes/10-asking-agents.html)).

## Decided behaviour

[Ticket 06, item 5](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24) and [ticket 13](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25):

- `ask_user` puts an orange question pin on an element and returns when Lex answers in the pin card.
- `discard_change` undoes one of the agent's own changes by request id.
- Lex can undo an agent's change with one click from its pin card, or from its chip when it worked without a pin.

## Files

Expected (confirm while designing): `shared/agent-tool-table.ts`, `shared/agent-requests.ts`, `worker/mcp.ts`, `src/agent-tools-edit.ts`, `src/components/agent-pins.ts`, `src/agent-presence.ts`, `src/guarded-edit/commit.ts` (undo of one receipt), `docs/mcp.md`; tests and a spec.

## Done when

- A spec: an agent asks, Lex answers in the pin, the agent continues.
- An agent discards its change and the page is back as before.
- Lex undoes an agent's change from its pin card.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-15 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-15 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
