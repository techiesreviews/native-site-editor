---
title: "The page: typing goes out letter by letter, carets on the page"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [22-code-pane-together]
---

## Goal

Typing together on the visual page, as in the [demo](../../prototypes/08-typing-together.html).

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 3 and [ticket 12](../../tickets/12-prototype-typing-together-poc.md#resolution-2026-10-25):

- Typing in the preview reaches the shared copy letter by letter (today it reaches the source on click-away).
- Others' carets show in the page's text with the shared caret look, and no element highlight. The look is from [mock-up 13](../../prototypes/13-code-pane-and-undo.html), approved by Lex on 2026-10-27: a circle with the first letter, or the agent's icon. On hover or focus it widens and the rest of the name slides out from behind the letter (blur, slide, fade, about 200 ms ease-out; fade only with reduced motion). The same look is used in the code pane (22) and for guests (30). A caret shows at the same spot on the page as in the code pane, and the undo on its name tag works in both places (Lex, 2026-10-27).
- An agent's change replacing the element someone types in waits until they click away (clean-up slice 52).

## Files

Expected (confirm while designing): `src/components/native-preview-runtime.js`, `src/components/native-preview.ts`, `src/components/preview-protocol.ts`, `src/native-source-location.ts` (source offset to rendered text), `src/components/live-carets.ts`; a two-context spec `tests/native-save/native-page-together.spec.ts`.

## Done when

- A spec: both type in one paragraph on the page and end identical; carets show in the page's text.
- An agent's heading change waits while Lex types in the heading and lands after he clicks away.
- Moved here from slice 24 (am-24, 2026-10-31): on the page, Anna's caret name tag ends with an undo icon while `LiveText.canUndoAuthor` (src/live-text.ts) says her change can be taken back; clicking it runs `LiveText.undoAuthor`, and the spec shows her words gone in both tabs and Lex's still there.
- Moved here from slice 25 (am-25, 2026-11-08): on the page, an agent's caret, which the receiving tab draws and tells the room (`CaretShare.carets`, src/live-text.ts), shows with its program's icon at the end of its change, in both tabs; its name tag's undo takes back only the agent's words, in both tabs.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-23 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-23 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.

## Done (2026-11-08)

**Behaviour**

- Typing on the page goes out letter by letter. Each input in the element typed in sends a `text-edit` at once (a word an input method composes goes once it is chosen), numbered per frame document (`seq`) and per typing (`session`). The host writes each as one guarded range edit in a typing group (`page-typing:<load>:<session>`), so the typing stays one Undo step until the user clicks away, and only the last one selects the element again. The draft store's change then reaches the shared copy as before (`src/live-text.ts`), so the room hears every letter.
- Others' letters in the same element: a render whose `typedSeq` (the latest text edit the host has written or turned down) is lower than what the frame sent leaves the element typed in as it is; the next render brings both. The caret in that element stays by its words: its text offsets are moved past the change (someone else's letter right at the caret goes after it). On the host, a typed change written against text someone else changed since moves past their change (`nativeTextSourceEdit`): theirs first where both replace, the typed one first where both insert at one spot; one that overlaps theirs is refused as an unplaced text change was before. Text the source already has writes nothing.
- A press while a letter's render is still due waits for that render, as a press after click-away always did.
- Carets on the page: the frame reports this tab's caret while typing (`text-caret`: element and text offsets). `src/components/live-carets.ts` (`startCarets`, loaded with Yjs as before) maps it to an offset in the file (`sourceOffsetOfText`) and tells the room, the newest of the page and the code panes. Others' carets (`CaretShare.carets`, people and agents) are mapped from file offsets to an element and text offset (`textPointAt`); the frame finds each in its text (`carets` → `caret-rects`), and the carets are drawn in a layer over the frame with the code pane's look (`caretFlag`): line, circle with letter or program icon, name on hover, tap or focus, undo while `LiveText.canUndoAuthor` says yes, tint over a selection, no element outline. A caret in a tag, a comment or the head shows in the code pane only.
- The undo on a page tag runs `LiveText.undoAuthor` for that author (the file's own Undo list), for a person or an agent; it is not taken while the caret is contested or leaving.
- An agent's change to the element being typed in still waits until the user clicks away (slice 52); it then lands on the letters already written, and its caret shows on the page in both tabs.
- Boot: `src/components/page-caret-port.ts` (the page's side, a small registry) and the frame's caret code; the drawing stays in the lazy carets chunk.

**Tests**

- New spec `tests/native-save/native-page-together.spec.ts`: Lex and Anna type in one paragraph on the page at once (Anna at its start, Lex at its end) and both pages and sources end identical while both still type; each sees the other's caret in the paragraph's text; Anna's tag at Lex's takes back her page words in both tabs with Lex's kept, then her earlier code-pane comment, then its undo goes. Second test: an agent's heading change waits while Lex types in the heading (his letters already at Anna's), lands after he clicks away in both tabs; its caret shows in the heading on both pages with its program icon; Anna's undo on its page tag takes back only its words in both tabs. Passed 3 runs in a row.
- `tests/page-structure-controller.test.ts`: letters as one step selecting nothing until the end; a typed change moved past someone else's, same-spot insertion, an overlap refused, text already there writes nothing. `tests/native-source-text-points.test.ts` (new, Chromium): text offset to file offset and back, never inside a tag, comment or entity. `tests/preview-protocol.test.ts`, `tests/preview-wire.test.ts`: the new messages.
- Specs adjusted for the new behaviour: `native-click-to-type.spec.ts` (renders held from before the last letter, since the letter asks for the render now; a refusal from a heading changed before the page showed it), `native-agent-waits.spec.ts` (main's typing is kept across a branch switch, as it is written as typed), `native-code-carets.spec.ts` and `native-agent-merge.spec.ts` (their caret locators scoped to the code pane, since the same carets show on the page too).
- `RESULT: ok unit 4312/4312 (284 files)` (`kit unit --affected`).
- `RESULT: ok specs 15/15 passed` (the 7 `kit specs --affected` picks plus 8 page-typing specs), `RESULT: ok specs 20/20 passed` after fixes (agent, carets, live text, click-to-type and other page-typing specs; first run found 4 failing, fixed above), `RESULT: ok specs 6/6 passed` (five `@actual` page-typing specs and native-live-text), `RESULT: ok specs 3/3 passed` (native-agent-merge, native-code-carets, native-agent-waits).
- `npm run check` and `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`). `RESULT: ok size boot 349 KB (+2 KB) vs dev@0401824, budget 355 KB`. `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`.

**Files beyond the expected ones**

- `src/components/page-caret-port.ts` (new: the page's side of the carets, so the preview never loads the carets' code); `src/controllers/page-structure-controller.ts` (the typing group and the move past others' changes); `shared/html-source.ts` (`sourceText`, the decoder `textRangeInSource` already had, now shared); `src/live-text.ts` (one line: it loads `startCarets`).
- Docs: `docs/agents/features.md` F-canvas-17 added (F-canvas-15, F-canvas-16 point to it); `docs/agents/code-map.md` carets row; `CONTEXT.md` Shared copy.

**Choices left open, taken the safe way (for Lex's Tuesday pack)**

1. A caret's circle stands over the line above it on the page, as in the code pane: a click on the words just there opens the tag rather than typing.
2. A caret at a soft line wrap shows at the start of the next line (the offset cannot tell which side the other person's browser shows it on).
3. Your page typing stays one Undo step until you click away; someone else's letter arriving between yours starts a new step (as slice 24 does for the code pane).
4. Two people typing at one spot: each one's own next letter goes before the other's just-arrived text in their own copy.

**Known limits**

- Repeated letters right at the caret (others typing "a" before your caret in "aa") can leave your caret on the other side of their letter: the frame sees only the text before and after, not where it was typed.
- Carets are measured again on every render, scroll and resize of the page; a layout change with none of these (a late font or image) moves the words under a caret until the next one.

