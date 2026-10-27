---
title: "Code pane: typing together and carets"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [21-shared-copy-per-file]
---

## Goal

Typing together in the code pane, with others' carets.

## Decided behaviour

[Ticket 12](../../tickets/12-prototype-typing-together-poc.md#resolution-2026-10-25) and [ticket 08](../../tickets/08-grill-shared-editing-mechanism.md#resolution-2026-10-24):

- The Monaco code pane binds to the shared copy (`y-monaco`).
- Others show as a thin caret in their colour with a small circle on top: their first letter, or for an agent a tiny icon of its program (Claude, OpenAI, Gemini, …; from `clientInfo.name` or the helper).
- The full name shows on hover, and a selection shows as a light tint.
- The caret look is shared with slice 23 ([Lex's reference](../../prototypes/12-caret-circle-reference.png)).
- Mock-up for Tuesday 3 Nov: [13-code-pane-and-undo.html](../../prototypes/13-code-pane-and-undo.html)

## Files

Expected (confirm while designing): `src/components/source-editor.ts` (+ CSS), `src/components/monaco.ts`, a new `src/components/live-carets.ts` (+ CSS, shared with 23), the agent icons as small inline SVGs, `kit deps add y-monaco`; a two-context spec.

## Done when

- A spec: Lex and Anna type in the code pane; each sees the other's caret with circle and letter, the name on hover, and an agent's icon circle.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-22 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-22 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
