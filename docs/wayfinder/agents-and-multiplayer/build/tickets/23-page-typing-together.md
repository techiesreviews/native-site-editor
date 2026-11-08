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

- Typing on the page goes out letter by letter. Each input in the element typed in sends a `text-edit` at once (a word an input method composes goes once it is chosen), numbered per frame document (`seq`) and per typing (`session`). The host writes each as one guarded range edit in a typing group (`page-typing:<load>:<session>`), so the typing stays one Undo step until the user clicks away. Letters select nothing: the element stays selected on the page while it is typed in, and clicking away sends nothing more (every letter has gone already). Only text sent when typing ends without having gone as letters (a word cut short while being composed, or text before Ctrl+B/I/K) selects the element again after its render. The draft store's change then reaches the shared copy as before (`src/live-text.ts`), so the room hears every letter.
- Others' letters in the same element: a render whose `typedSeq` (the latest text edit the host has written or turned down) is lower than what the frame sent leaves the element typed in as it is; the next render brings both. The caret in that element stays by its words: its text offsets are moved past the change (someone else's letter right at the caret goes after it). On the host, a typed change written against text someone else changed since moves past their change (`nativeTextSourceEdit`): theirs first where both replace, the typed one first where both insert at one spot; one that overlaps theirs is refused as an unplaced text change was before. Text the source already has writes nothing, whether insertion or replacement (checked before any refusal). The host's text-edit handler hands back the write's promise (`src/workspace-mount.ts`), so `typedSeq` moves on only once a letter is written or turned down, also while the page's file is still opening.
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

- Everything others changed in the element since a letter's text counts as one stretch, from their first changed character to their last. If others change it both before and after this tab's caret between two of its letters (within one round trip), that letter is refused, with the refusal message and the page drawn again.

- Repeated letters right at the caret (others typing "a" before your caret in "aa") can leave your caret on the other side of their letter: the frame sees only the text before and after, not where it was typed.
- Carets are measured again on every render, scroll and resize of the page; a layout change with none of these (a late font or image) moves the words under a caret until the next one.

### UX follow-ups

- UX (looks off): F-canvas-07 the paragraph goes and the next block is selected, but a "Heading removed / Undo" toast pops up over the code pane at the foot of the screen (S4, HS1) (.scratch/ux/fleet-lead/20261108-160055-iXqKbX/add-panel-F-canvas-07-1280-light-removed-strip.webp)
- UX (looks off): F-canvas-14 the page and code update in place with the scroll kept, but each edit brings up a "Text changed" toast that covers the code pane at 390 (S4, HS1, U5); the crumb buttons are only 26×24 px on a phone (HS18); the crumbs read "section.flow › h2", which is code (S7, HS4); in the first dark 390 frame the edit bar covers the bottom of the heading being edited (U5) (.scratch/ux/fleet-lead/20261108-160055-iXqKbX/add-panel-F-canvas-14-390-dark-live-strip.webp)
- UX (looks off): F-bar-01 the bar sits by the heading with its name chip first, docked at the foot on a phone without covering the heading, but a "Heading added. Into Section "Recent work" › after Div / Undo" toast stays above it (S4, HS1), and the crumbs show "body" and "section.flow › h2" as code (S7, HS4) (.scratch/ux/fleet-lead/20261108-160055-iXqKbX/editor-F-bar-01-390-light-bar-strip.webp)
- UX (looks off): F-bar-02 the level changes to H3 and Italic shows pressed with the heading in italics, but a "Heading level H3 / Undo" toast appears above the bar after each change (S4, HS1) (.scratch/ux/fleet-lead/20261108-160055-iXqKbX/editor-F-bar-02-390-light-level-strip.webp)
- UX (looks off): F-phone-03 Publish stays in view at 390 px, but the top bar takes two rows (the account, then undo, redo, history and Publish), not the one row the Good line asks for, and Publish carries a "1" count badge (S2) (.scratch/ux/fleet-lead/20261108-160055-iXqKbX/editor-F-bar-01-390-light-bar-strip.webp)

### Follow-ups

- Validation gaps (gap): R5-9 still open: this is the fix that goes with R5-1, and it has not been made.
- Validation gaps (gap): R5-8 still open: this is the fix that goes with R5-2, and it has not been made.
- Validation gaps (gap): R5-7 still open: this is the fix that goes with R5-3, and it has not been made.
- Validation gaps (gap): R5-6 still open: this is the fix that goes with R5-4, and it has not been made.
- Previous findings (P3): R5-5 still open: the only commits since d24812552 are the two docs commits, and `src/controllers/page-structure-controller.ts` has not changed. A held letter is still written only when a later letter in its group reaches `unwritten()`. If that later letter returns early, the held letter is never written. The ticket's "Known limits" (lines 74–79) still doesn't mention this. The author didn't decline this finding, so it stands at P3.
- Validation gaps (gap): R5-4 still open: `native-click-to-type.spec.ts` has not changed. The input-method test still reads the source straight after each `Input.imeSetComposition` step, without waiting for the asynchronous write to finish. A letter wrongly sent during composition could land after the check, and the test would still pass.
- Validation gaps (gap): R5-3 still open: no spec checks a backwards (Shift+Left) selection: where its caret shows to others, or that it stays backwards after someone else's text moves it. The ticket's line 103 promises this.
- Validation gaps (gap): R5-2 still open: no spec checks where the caret sits in an empty centred, right-aligned or right-to-left element. The ticket's line 104 promises this behaviour.
- Validation gaps (gap): R5-1 still open: nothing has changed since the last review. `tests/page-structure-controller.test.ts` is the same, and no test runs this order: letters queued while the page opens, the page left, then reopened before the second letter runs (`restoreFile`). The author's declines don't mention it.
- Spec (P3): d24812552:docs/wayfinder/agents-and-multiplayer/build/tickets/23-page-typing-together.md:74 — P3 ticket: "Known limits" doesn't say that a letter held behind a later letter can be left unwritten when that later letter returns early (for example, when the page is busy or left). Fix: write the letter as soon as the group's last queued letter settles, whichever way it settles. If that is out of scope, add a line under "Known limits" that names this case.
- Standards (P3): d24812552:src/controllers/page-structure-controller.ts:882 — P3 fault: a held letter is written only from inside a later letter's `unwritten()` step. That spreads the step's ending across separate code paths and leaves one of them (the early return near line 896) with no write. This breaks the CODING_STANDARDS.md rule that each async step must handle every way it can end. Fix: write the letter in a `finally` block, or from a single place where the group settles, so every ending writes it or reports it.
- Validation gaps (gap): `tests/page-structure-controller.test.ts`: queue two letters while the page's file opens. Leave the page, then come back before the second letter runs, with `restoreFile` not mounting it. Check that the first letter's text is written or reported, not dropped.
- Validation gaps (gap): `native-page-together.spec.ts`: at Anna's, empty a heading with `text-align: center` and put her caret in it. Check that her caret's x at Lex's is within 3 px of the heading box's centre. Repeat with `dir="rtl"`, where the caret should sit near the box's right edge.
- Validation gaps (gap): `native-page-together.spec.ts`: Anna selects a word with Shift+Left. Check that her caret at Lex's sits at the selection's start. Lex types before the word. Check that Anna's `getSelection()` still has its focus before its anchor.
- Validation gaps (gap): `native-click-to-type.spec.ts`, input-method test: after each composition step, wait for the frame's write to finish before reading the source. For example, wait for the next `text-edit` reply, or for a frame-render tick. Then check that the source has not changed.

## Review round 1 fixes (2026-11-08)

- The host's text-edit handler returns the write's promise (`src/workspace-mount.ts`): the frame is told a letter is written only once it is, so a render with old sources no longer redraws the element typed in without its letters while the page's file opens. New unit test in `tests/workspace-mount.test.ts` (it fails with the promise dropped).
- "Already the source's text" is checked before the overlap refusal, so a replacement the source already holds writes nothing instead of being refused (`tests/page-structure-controller.test.ts` case added; it fails without the move).
- Done and the comment in `page-structure-controller.ts` now say that letters select nothing and click-away sends nothing more.
- Page caret layer uses physical `top`/`left`, the frame's own coordinates.
- New tests: `native-page-together.spec.ts` phone case (390 px, touch, reduced motion): Anna's 80-character name, a tap on her circle opens the tag with focus kept, the tag and its undo inside the frame's layer, presses 21 px around the undo reach it, no clip-path reveal; an agent with an 80-character name at her place opens to the side with room, inside the layer, and goes when it leaves; a real tap on her undo takes back her words in both tabs with focus kept in her tag. `native-click-to-type.spec.ts`: text landing before the caret moves it along (the next letter goes after the word typed at); letters typed while the page's file opens (stylesheet open, code editor held) stay on the page and land in order. The second one passes with the promise dropped too (the write lands before the next render in every setup tried); the workspace-mount unit test is the one that catches it.
- Shots: `kit shots --spec .scratch/am23-page-carets.spec.ts` (two tabs on the real starter, Anna typing at the end of the hero lead), RESULT: ok shots raw spec, out `.scratch/am23-shots/` (8 shots: 1280 and 390, light and dark, caret closed and tag open). UX review (Opus) against the UX rulebook: U4 pass (each tried at 390); U5 pass (at 390 the tag by the frame's right edge opens to the left, name and undo inside the frame); U6 pass (hover only at 1280, tap at 390); U8 pass (no reveal motion under reduced motion, spec-checked); colours from presence tokens in both themes, the caret line clear on both page backgrounds. Open: the circle stands over the line above (choice 1, against B1 and U5), already in the Tuesday pack.
- Validation: `RESULT: ok unit 4313/4313 (284 files)`; `RESULT: ok specs 11/11 passed; 188 more run in kit pr` (`kit specs --affected`); `RESULT: ok specs 3/3 passed` (native-page-together, native-click-to-type, native-agent-waits); `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`); `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`.

## Review round 2 fixes (2026-11-08)

- The carets' layer follows the frame by itself (a `ResizeObserver` on the frame and its pane, and on every draw): a banner above the frame or the code pane growing moves no caret in the frame's viewport, so no new positions come. New check in `native-page-together.spec.ts`: an import of a missing sheet at Lex's shows the stylesheet banner and Anna's caret stays on her words, also once fixed (fails without the refit).
- After the frame reloads, a caret the old document sent late is not taken (`text-caret` is heard again from the new document's `ready`).
- A selection made backwards keeps its direction: others see the caret where it is, and the selection stays backwards when others' text moves it.
- A caret in an empty element shows where typing starts there: the centre when centred, the right for right-aligned or right-to-left text.
- Letters typed while the page's file opens, the page then left, go into its draft as one step: letters queued behind one another take the first one's text along (`page-structure-controller.ts` `typings`). New unit test (fails without it).
- F-canvas-17 now says a letter of someone else's between yours starts a new Undo step.
- New tests: `tests/page-structure-controller.test.ts` (someone else's change between letters starts a new step and Undo takes back only the last letter; text the source already has adds no step and selects nothing; the left page above); `native-click-to-type.spec.ts` (a word composed with an input method is written only once chosen, nothing refused).
- Validation: `RESULT: ok unit 4316/4316 (284 files)`; `RESULT: ok specs 11/11 passed; 188 more run in kit pr`; `RESULT: ok specs 3/3 passed` (native-click-to-type, native-agent-waits, native-monaco-deferred); `npm run check` and `npm run lint` clean; `RESULT: ok doctor 11/11 checks passed; warning: 5 setup pieces missing (run scripts/agents/kit init)`.

