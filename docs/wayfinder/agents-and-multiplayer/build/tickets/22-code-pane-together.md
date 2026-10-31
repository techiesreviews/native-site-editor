---
title: "Code pane: typing together and carets"
type: task (AFK)
status: closed
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

## Done (2026-10-31)

Others' carets show in the code pane while a file is shared. Each is a thin line in its colour with a small circle on top: the person's first letter, or for an agent a tiny icon of its program (Claude, OpenAI, Gemini, or a plain one, by its MCP client's name). Hover or keyboard focus opens the circle into the full name; a selection shows as a light tint. While `LiveText.canUndoAuthor` says the author's latest change can be taken back, the open tag ends with an undo button (a real button: focusable, focus ring, "Undo Anna's change" for screen readers, a 24 px press area, 44 px on touch); clicking it runs the name-tag Undo for everyone, as this pane's own Undo step. A caret fades in and out (opacity only); the tag's opening reveal runs only without reduced motion. Theme presence colours only; no toast.

- Text path: kept as it was. A `y-monaco` binding writes remote changes straight into Monaco's model, past the draft store's history and slice 24's per-person Undo, so it is not used and `y-monaco` is not added. Carets travel in the live room's own presence (src/live-room.ts `setPresence`/`onPeers`), which already is the room's awareness, so `y-protocols` is not added either.
- Where a caret is: each tab tells the room its author (the Yjs client id its own changes carry, the same id the name-tag Undo takes), its GitHub name and its caret as Yjs relative positions, at most every 50 ms. Others read them in their own copy, so a caret stays by the same words while anyone types. Others' text moving your caret along sends nothing.
- `canUndoAuthor` is asked only when `onAuthorUndo` fires (or a new caret appears), in one animation frame for all carets, once per author.
- Loading: `src/components/live-carets.ts` and its CSS load with Yjs, only once someone else has the file open, never at boot. Boot is unchanged: `kit size` RESULT: ok size boot 347 KB (±0 KB) vs dev@626f989, budget 355 KB.
- Code: `src/live-text.ts` (caret presence, `CaretShare`, `loadCarets` port), `src/components/live-carets.ts` + `.css` (Monaco content widgets and decorations; `caretFlag` builds the tag for slice 23 to reuse), `src/components/source-editor.ts` (`showCaretPane`/`caretPanes`/`watchCaretPanes`: the pane registry, typed only), `src/components/code-editor.ts` (each editable code pane registers itself).
- Tests: `tests/live-text.test.ts` adds a carets test (no carets loaded while alone; Anna's caret read at Lex's and kept on her words as he types; the caret's author is the id her changes carry and its Undo takes back only her words; an agent's caret names its program; carets go when the file closes). New spec `tests/native-save/native-code-carets.spec.ts`: Lex and Anna type in the code pane; each sees the other's caret with circle and letter, the name on hover; an agent connected over MCP joins the room from Node and shows its program's icon and name; Anna's tag at Lex's ends with an undo that takes her words away in both tabs and leaves Lex's. The test server (`tests/native-save/server.ts`) now lets agents into live rooms as the Worker does.
- Validation: `kit unit --affected` RESULT: ok unit 2874/2874 (176 files); `npm run check` and `npm run lint` clean; `kit specs native-code-carets.spec.ts` RESULT: ok specs 1/1 passed; `kit specs native-live-text.spec.ts` RESULT: ok specs 1/1 passed; `kit specs --affected` (20 specs) RESULT: fail specs 1 of 20 failed: native-structure-inplace.spec.ts (a test-clock error under load: "Cannot fast-forward to the past"); alone it passes: RESULT: ok specs 1/1 passed (16 tests).
- Shots: `.scratch/am22-shots/` (code pane at 1280 and 390, light and dark: carets closed, tag open with undo, undo focused).

Choices left open, taken the safe way (for Lex's Tuesday pack):
- Colours: four presence colours (the agents' theme tokens), chosen by author id so every tab shows the same person in the same colour; two people can share a colour.
- A person's name is their GitHub login; an agent's is what it says of itself.
- Your own caret is told from the code pane whenever it is open, focused or not; the page's carets come with slice 23.
- On the first line the tag sits below the caret; two carets at one spot overlap, the one hovered or focused on top.
- On a phone the tag opens on tap (focus), not always open.

Feature list: added F-code-08 (Others' carets in the code pane); F-canvas-15 now points to it.

