---
title: "Your Undo undoes your own typing"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [21-shared-copy-per-file, 15-agent-tools-ask-and-undo]
---

## Goal

Undo with several editors.

## Decided behaviour

[Ticket 13](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25):

- Lex's Undo undoes only his own typing (Yjs `UndoManager` tracking his origin).
- An agent's change is undone from its pin or chip (slice 15).
- A guest's or collaborator's change can be undone from its brief author outline while it shows.
- A change that landed on another page undoes on that page (clean-up slice 34).
- Mock-up for Tuesday 3 Nov: [13-code-pane-and-undo.html](../../prototypes/13-code-pane-and-undo.html)

## Files

Expected (confirm while designing): `src/live-text.ts`, `src/guarded-edit/commit.ts`, `src/editor-workspace.ts`, `src/agent-presence.ts`; a two-context spec.

## Done when

- A spec: Lex and Anna type; Lex's Undo removes only his words. Lex undoes an agent's change from its chip.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-24 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-24 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
