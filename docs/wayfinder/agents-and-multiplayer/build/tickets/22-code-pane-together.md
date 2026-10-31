---
title: "Code pane: typing together and carets"
type: task (AFK)
status: open
assignee: am-22
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
- Mock-up approved by Lex (2026-10-27): [13-code-pane-and-undo.html](../../prototypes/13-code-pane-and-undo.html)

## Files

Expected (confirm while designing): `src/components/source-editor.ts` (+ CSS), `src/components/monaco.ts`, a new `src/components/live-carets.ts` (+ CSS, shared with 23), the agent icons as small inline SVGs, `kit deps add y-monaco`; a two-context spec.

Notes for the build (am-22, 2026-10-31):

- Boot stays within 355 KB (`kit size`; about 346 KB now). Carets, `y-monaco`, `y-protocols` and the agent icons load only when a live room opens, in the lazy live-text chunk, never at boot.
- Live sharing stays off by default (`LIVE_SHARING_KEY` in `src/live-text.ts`, slice 21); do not change that. Specs switch it on per context.
- Slice 21 shares the open file through its draft store entry, and slice 24's per-person Undo lives in the draft-store history with Monaco's stops. Check whether a `y-monaco` text binding would bypass that history; if it would, keep the text path as it is and use awareness (from `y-protocols`) and Monaco decorations for the carets, and record the choice in Done.
- Slice 24 follow-up: `canUndoAuthor` walks the whole document on each call. Ask it only when `onAuthorUndo` fires, at most once per frame for all carets, never per keystroke per caret.
- The caret and its name tag: a short fade in and out with no movement under reduced motion (animation), a name tag whose undo icon is a real button with keyboard focus, a visible focus ring, a screen-reader name, and a touch target of at least 24 px (44 px at touch widths). Theme tokens only; no toasts or explainer text; state shows on the caret itself.
- Where the ticket leaves a choice open and it is easy to undo later, take the safe, cheap way and list it under "Choices left open, taken the safe way (for Lex's Tuesday pack)" in Done.

## Done when

- A spec: Lex and Anna type in the code pane; each sees the other's caret with circle and letter, the name on hover, and an agent's icon circle.
- Moved here from slice 24 (am-24, 2026-10-31): Anna's caret name tag in the code pane ends with an undo icon while `LiveText.canUndoAuthor` (src/live-text.ts) says her change can be taken back; clicking it runs `LiveText.undoAuthor` and the spec shows her words gone in both tabs and Lex's still there. The caret names the author by the Yjs client id its own changes carry.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-22 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-22 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
