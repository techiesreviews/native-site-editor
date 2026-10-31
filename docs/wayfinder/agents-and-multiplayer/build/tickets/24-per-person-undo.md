---
title: "Your Undo undoes your own typing"
type: task (AFK)
status: open
assignee: am-24
builder: claude
blocked_by: [21-shared-copy-per-file, 15-agent-tools-ask-and-undo]
---

## Goal

Undo with several editors.

## Decided behaviour

[Ticket 13](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25):

- Lex's Undo undoes only his own typing (Yjs `UndoManager` tracking his origin).
- An agent's **text** change is undone from its caret's name tag, like a person's (approved by Lex in mock-up 13, 2026-10-27); its other changes from its pin or chip (slice 15).
- A guest's or collaborator's **text** change is undone from their caret's name tag: on hover or focus the tag ends with an undo icon while that change can be undone. A styling, picture or look (variant) change is undone from its brief author outline and chip (Lex, 2026-10-27: an outline only makes sense for those, not for typing).
- A change that landed on another page undoes on that page (clean-up slice 34).
- Mock-up approved by Lex (2026-10-27): [13-code-pane-and-undo.html](../../prototypes/13-code-pane-and-undo.html)

## Notes for the build (am-24, 2026-10-31)

Choices the ticket leaves open, taken the safe way (easy to undo; listed for Lex's Tuesday pack):

- **No carets here.** Carets and their name tags are slices 22 (code pane) and 23 (page), not built yet. This slice does not draw carets or name tags. It builds the undo a name tag will call: undo one author's latest text change in the shared copy, and whether it can still be undone, as a small port with unit tests. Slices 22 and 23 wire their name tags to it. The Done when's name-tag line moves to them.
- **Agents' text changes** join the shared copy under their own name only in slice 25. Until then an agent's change in Lex's tab stays as slice 15 built it (undone from its pin card or chip, slice 49; Undo and Redo still step over it), and the name-tag undo for agents arrives with 22, 23 and 25.
- **What this slice changes:** with live sharing on, someone else's change no longer clears Lex's Undo for that page; Lex's Undo and Redo take back only his own typing and edits, and leave the others' words in place, on the page and in the code pane.
- Live sharing stays off by default (the per-browser setting from slice 21). With it off, Undo behaves exactly as today.
- Boot stays within 355 KB (346 KB now): new code loads with the live-text chunk, never at boot. No toasts; plain words; theme tokens.

## Files

Expected (confirm while designing): `src/live-text.ts`, `src/guarded-edit/commit.ts`, `src/editor-workspace.ts`, `src/agent-presence.ts`; a two-context spec.

## Done when

- A spec: Lex and Anna type; Lex's Undo removes only his words. Lex undoes an agent's text change from its caret's name tag, on the page and in the code pane.
  - Amended 2026-10-31 (am-24, see Notes for the build): the spec covers Lex and Anna, on the page and in the code pane, and that Anna's change no longer clears Lex's Undo. The name-tag undo is a tested port here; its click on a caret comes with slices 22, 23 and 25.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-24 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-24 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
