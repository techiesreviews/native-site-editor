---
title: "Your Undo undoes your own typing"
type: task (AFK)
status: closed
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

## Done (2026-10-31)

Behaviour:

- **Someone else's change no longer clears your Undo.** With live sharing on, Anna's change reaches Lex's draft as before (`edit({ record: false, origin: "shared" })`), now with `rebase: rebaseHistory` (`src/shared-undo.ts`). Instead of clearing the histories over the file, it moves each of Lex's Undo and Redo steps over that file past her change. Lex's Undo and Redo then take back or put back only his own words, on the page and in the code pane, and her words stay. The Undo goes into the shared copy as his own change, so it shows on both screens. With live sharing off, nothing changes.
- **How a step is moved** (`rebaseChanges`): a change of hers wholly before or after one of his moves it by its length; at the same spot, hers comes first. If she types inside words his Undo would take away, those words are split around hers, so her typing stays. Any other overlap (she deleted or rewrote some of his words) cannot be moved: that step leaves Lex's Undo, with every step under it. Steps above it stay.
- **Steps that cannot move** leave the same way, with the steps under them: a host action over the page (a section moved, a component made, media steps) and a multi-file receipt over the file, whose exact texts no longer hold. Before this slice the whole history went, so this is never less than before.
- **Typing in the code pane.** Typing still open when her change arrives stays open, its start moved, so her keystrokes do not cut his typing into pieces. Typing that spans her change, and committed typing moved past it, undoes as one whole step: Monaco's undo stops inside it no longer line up. A typing step Lex had partly undone through those stops leaves his Undo.
- **Typing on the page.** An open inline typing group closes at her change; his next keystroke starts a new step, so his typing undoes in two parts around her change.
- **The name-tag Undo port** (`LiveText`, what `startLiveText` returns; calling it still stops sharing): `undoAuthor(author)` takes back that author's latest text change in the open file's shared copy for everyone, `canUndoAuthor(author)` says whether there is one, and `onAuthorUndo(listener)` says when that may have changed. The author is the Yjs client id their own changes carry. The frames' 4-byte copy id is now that client id, so a caret (slices 22, 23 and 25) can name it. Only the author's own UPDATE frames count (each under that author's Yjs `UndoManager`); catch-up answers carry everyone's text and are not counted. No caret, name tag or click is built here.
- Boot: `src/draft-store.ts` only hands its history to `rebaseHistory` (`HistoryAccess`, 93 bytes gzip). The rest loads with the live-text chunk.
- Expected Files: `src/guarded-edit/commit.ts`, `src/editor-workspace.ts` and `src/agent-presence.ts` needed no change. `src/draft-store.ts` (the history lives there) and the new `src/shared-undo.ts` did.
- Docs: `docs/agents/features.md` F-canvas-15 says what Undo does now; `CONTEXT.md` Shared copy and `docs/agents/code-map.md` (a per-person Undo row) updated.

Choices left open, taken the safe way (for Lex's Tuesday pack):

1. When Anna changes some of Lex's own words, that step of Lex's (and older ones) leaves his Undo, rather than Undo taking away only what is left of his words.
2. A section move or other whole-page step under Anna's change leaves Lex's Undo with the steps under it, as all of them did before.
3. Lex's typing that spans Anna's change undoes as one step, not stop by stop.
4. The name-tag Undo names authors by their Yjs client id, and counts only changes they sent live (not what a joiner's catch-up brought).
5. Lex's own Undo is not a Yjs `UndoManager` tracking his origin (the decided behaviour's wording): his draft-store steps are moved past others' changes instead (`src/shared-undo.ts`), because the page builder's actions, the steps' companions (selection on Undo) and the code pane's Monaco stops all live in the draft-store history, which a Yjs `UndoManager` would not see. Yjs `UndoManager` serves only the name-tag Undo. Its visible effect is choice 1.

Known limits:

- A typing step that typed in two places within one settle period is one range: Anna's change between the two places counts as an overlap.
- A change Anna sent while Lex's tab was still catching up, built on text Lex did not have yet, waits inside Yjs and comes in with the catch-up answer instead, which counts as no one's: her name tag cannot take that one back. Applying her frame again later would not help (Yjs has it already), so this stays; it is only the first moments after joining.

Tests:

- `tests/per-person-undo.test.ts` (new, 8): `rebaseChanges` shifts, ties, splitting around her typing, and overlaps that cannot move. In the store: Anna's change keeps Lex's Undo and Redo, which take back only his words (the Undo's text event carries ranges in the text as it is); her typing inside his words survives his Undo; an overlapped step leaves with those under it while newer steps stay, and without `rebase` the history clears as before; a host action goes with those under it while a step over another file stays; open code-pane typing stays one step and undoes whole without asking Monaco; a partly undone typing step goes, and an open inline group splits.
- `tests/live-text.test.ts`: the first test now checks Anna's change keeps Lex's Undo (it asserted the clearing before) and that his Undo leaves her words on both tabs. New: the name-tag Undo takes back Anna's latest change on both tabs, not anyone else's, tells its listeners, and Lex's own Undo still works after.
- `tests/native-save/native-live-text.spec.ts` (two browsers, new test): Lex types into the heading on the page, Anna changes the lead, and Lex's Undo button takes back only his words on both. Then Lex types in the code pane, Anna changes the lead again, and Lex's Ctrl+Z takes back only his comment on both, Redo puts it back, and her text is there once.

Validation:

- `RESULT: ok doctor 11/11 checks passed; warning: 4 setup pieces missing (run scripts/agents/kit init)`
- `RESULT: ok unit 2915/2915 (178 files)` (`kit unit --affected`), and `RESULT: ok unit 37/37 (2 files)` (`kit unit tests/per-person-undo.test.ts tests/live-text.test.ts`; the new file is not picked by `--affected` until it is tracked).
- `RESULT: ok specs 1/1 passed; 189 more run in kit pr` (`kit specs --affected`: `native-live-text.spec.ts`, 5).
- `RESULT: ok size boot 347 KB (+1 KB) vs dev@6863e02, budget 355 KB` (the draft store grew 93 bytes gzip; the report rounds to whole KB).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`).

Review round 1:

- The name-tag Undo drops its authors before it says so when a copy goes (another file, a restart, a stop), so a name tag asking then gets false; and it tells the name tags once a tab is caught up, when changes that arrived meanwhile become undoable.
- The name-tag line now stands in the Done when of slices 22, 23 and 25, and the five choices are in the 3 November Tuesday pack.
- New tests: `tests/per-person-undo.test.ts` (+3, 11): a multi-file receipt over the page goes with the steps under it while Lex's later edit undoes and its other file is untouched; a fully undone typing step on the redo side comes back whole after Anna's text without Monaco's stops; Anna's change while Lex's Undo waits on a companion stops that Undo ("The history changed meanwhile."), her change is there once, and the next Undo takes his back. The fake Monaco stacks are typed `satisfies NativeTyping`. `tests/live-text.test.ts` (+2, 31): name tags hear only false after a file switch and a stop (fails without dropping the authors first); a late joiner's catch-up is not Anna's name-tag change, while what she types after is, and taking it back leaves everyone else's words.
- `RESULT: ok doctor 11/11 checks passed; warning: 4 setup pieces missing (run scripts/agents/kit init)`
- `RESULT: ok unit 2920/2920 (178 files)` (`kit unit --affected`); `RESULT: ok unit 42/42 (2 files)` (`kit unit tests/per-person-undo.test.ts tests/live-text.test.ts`).
- `RESULT: ok specs 1/1 passed; 189 more run in kit pr` (`kit specs --affected`: `native-live-text.spec.ts`, 5).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`).

Review round 2:

- The revision someone else's change is moved from is read after open typing has closed (`rebaseHistory`), so typing that came back to its start never leaves it out of line. No test goes red for the old order: typing with no change sits at the file's end, which no change of Anna's can overlap, so that close never happens; the new test covers the moved start coming back.
- F-canvas-15's Good line says what really drops out of Undo (a change of yours someone deleted or rewrote part of, or a whole-page step, with all older ones; typing inside your words drops nothing).
- Known limits: Anna's change that waited for the catch-up is not her name tag's.
- New tests: `tests/per-person-undo.test.ts` (+2, 13): two of Lex's ranges with Anna's change between them, both orders the same text and hers moved back by one; open typing back at its moved start keeps Lex's earlier Undo through Anna's next change. The companion fake is typed `satisfies HistoryCompanion`. `tests/live-text.test.ts` (+1, 32): a tab never counts its own changes as an author's, and taking back Anna's change from her name tag leaves Lex's Undo and Redo, whose Redo then puts his words back on both.
- `RESULT: ok doctor 11/11 checks passed; warning: 4 setup pieces missing (run scripts/agents/kit init)`
- `RESULT: ok unit 2923/2923 (178 files)` (`kit unit --affected`); `RESULT: ok unit 45/45 (2 files)` (`kit unit tests/per-person-undo.test.ts tests/live-text.test.ts`).
- `RESULT: ok specs 1/1 passed; 189 more run in kit pr` (`kit specs --affected`: `native-live-text.spec.ts`, 5).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`).

Review round 3:

- The name-tag Undo is this tab's own step: `undoAuthor(author, history)` records it in that Undo list (the page's or pane's, the file's own by default) as "Undo their change", so Lex's Undo puts the author's words back on every tab and his Redo takes them again. Like any new step, it ends Lex's Redo.
- `canUndoAuthor` is true only while undoing would change the text: some of the author's words are still there, or words they removed can be put back. Any text change tells the name tags to look again. `undoAuthor` was already false when nothing changed (Yjs skips items that change nothing).
- With live sharing off, stopping clears the name-tag listeners too.
- F-canvas-15: any page-builder step in your Undo for the page drops with older ones; the name-tag Undo is your own step.
- New tests: `tests/per-person-undo.test.ts` (+1, 14): Anna's change while a host action's Undo awaits stops that Undo ("The history changed meanwhile."), cleans the action up once, and her change stands; the host action test checks a dropped action is cleaned up once. `tests/live-text.test.ts` (+2, 34): a name tag whose words someone removed has nothing to take back, and both texts stay (fails with the old check); a name-tag Undo is Lex's own step, his Undo brings her words back on both and his Redo takes them again. Two tests now step back through the name-tag Undo before Lex's older steps.
- `RESULT: ok doctor 11/11 checks passed; warning: 4 setup pieces missing (run scripts/agents/kit init)`
- `RESULT: ok unit 2926/2926 (178 files)` (`kit unit --affected`); `RESULT: ok unit 48/48 (2 files)` (`kit unit tests/per-person-undo.test.ts tests/live-text.test.ts`).
- `RESULT: ok specs 1/1 passed; 189 more run in kit pr` (`kit specs --affected`: `native-live-text.spec.ts`, 5).
- `npm run check` clean; `npm run lint` clean (`check-exports: 15 unused export(s), 0 failure(s)`).

UX review (2026-10-31, `kit ux`, bundle `.scratch/ux/am-24/20261031-085138-iptFVy/bundle.md` in the main checkout): F-canvas-15 fine, not shown (no shot has two people on one page; carets and name tags come with 22 and 23). F-history-01 and F-publish-06 look off for reasons this slice does not touch (it changes only `src/draft-store.ts`, `src/live-text.ts` and `src/shared-undo.ts`); they are in the follow-ups below. A second `kit ux` run (bundle `.scratch/ux/am-24/20261031-105151-ZSdDq0/bundle.md`) found the same, and that at 390 px the strips cover the page (U5): above the format bar after Undo, and the "Have a project in mind?" heading after Discard. A third run (bundle `.scratch/ux/am-24/20261031-120547-V9UVAv/bundle.md`) found the same strips again and nothing new. A fourth run (bundle `.scratch/ux/am-24/20261031-140247-8PGA2u/bundle.md`) found the same again: the strips, the "Div" code word in one, the count on Publish and the 19×24 px "p" crumb, all already listed below.

### UX follow-ups

- UX (looks off, before this slice; atomic-catalogue ticket 07 "No toasts" removes it): F-history-01 Undo and Redo bring up a dark strip ("Undid adding the Paragraph.", "Paragraph added. Into Section "Recent work" › after Div" with an Undo button) that covers the content above the format bar at 390 px, and the Publish button carries a "1" count (`.scratch/ux/am-24/20261031-085138-iptFVy/editor-F-history-01-390-light-undo-strip.webp`).
- UX (looks off, before this slice; atomic-catalogue ticket 07): F-publish-06 Discard brings up a strip saying "Discarded the changes to index.html.", with a file name, that covers the "Have a project in mind?" heading at 390 px (`.scratch/ux/am-24/20261031-085138-iptFVy/editor-F-publish-06-390-light-discarded-strip.webp`).
- UX (looks off, before this slice; no ticket yet, also seen by am-21): the path above the canvas reads "section.flow" as code, and at 390 px its fourth button is 19×24 px, under the 44 px touch target (`.scratch/ux/am-24/20261031-085138-iptFVy/editor-F-history-01-390-dark-redo-strip.webp`).

shots: none (no visible change: Undo behaviour only; F-canvas-15 has no steps file, it needs two browsers signed in at once)

Feature list: F-canvas-15 updated (Undo with two people).

Commits: "docs: 24-per-person-undo notes for the build (carets come with 22 and 23)", "Your Undo undoes your own typing", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "Review fixes round 4", "docs: 24-per-person-undo UX follow-ups", "docs: 24-per-person-undo commits by subject", "Review fixes round 5", "docs: 24-per-person-undo commits by subject", "Review fixes round 6", "docs: 24-per-person-undo commits by subject", "Review fixes round 7", "docs: 24-per-person-undo commits by subject" and this commit; docs: 24-per-person-undo notes for the build
- UX (looks off): F-history-01 Undo and Redo work, but each step brings up a dark message strip at the bottom ("Undid adding the Paragraph.", "Paragraph added. Into Section "Recent work" › after Div"). At 390 px this strip covers the bottom of the page and the "Page structure and code" bar. In the redo shots the Publish button carries a "1" count. The crumb bar shows code words ("section.flow › p"). At 390 px one crumb is 19 px wide, under the 24 px minimum. The mock-up has no message strip and no count on the main button (.scratch/ux/am-24/20261031-090257-Dlodst/editor-F-history-01-390-light-undo-strip.webp, editor-F-history-01-390-dark-redo-strip.webp, editor-F-history-01-1280-light-undo-strip.webp)
- UX (looks off): F-publish-06 Discard works: the added paragraph is gone and the Publish count is cleared. But a message strip ("Discarded the changes to index.html.") pops up at the bottom and covers the end of the page at 390 px, instead of the result showing only where it happened (.scratch/ux/am-24/20261031-090257-Dlodst/editor-F-publish-06-390-dark-discarded-strip.webp, editor-F-publish-06-1280-light-discarded-strip.webp)

### Follow-ups

- Spec (P3): 3bda5e98c:docs/wayfinder/agents-and-multiplayer/build/tickets/24-per-person-undo.md:124 — P3 ticket: The Done section records review decisions and `RESULT:` lines only for rounds 1 to 3. Commits "Review fixes round 4" to "Review fixes round 7" are in the branch, but nothing says what they changed, which findings were rejected, or what evidence they have. runner.md "Review and close" asks the Done section for "behaviour, commits, tests, review decisions, evidence". Fix: add "Review round 4" to "Review round 7" entries, each with its changes, any rejected findings with reasons, and the `RESULT:` lines for unit, specs and check.
- Spec (P3): 3bda5e98c:docs/wayfinder/agents-and-multiplayer/build/tickets/24-per-person-undo.md:136 — P3 ticket: The `Commits:` line ends with a stray "; docs: 24-per-person-undo notes for the build". After it, lines 137 and 138 repeat two older UX bullets with other bundle paths (`20261031-090257-Dlodst`). Line 137 also says the 19 px crumb is "under the 24 px minimum", while line 130 says 44 px. The rulebook (U-rules, line 236) says 24 px, or 44 px on touch, and 390 px is a touch width. Fix: delete lines 137 and 138, since their content is already in the UX follow-ups, and end the `Commits:` line after its list.
- Spec (P2): 89ab7b98a:src/live-text.ts:359 — P2 fault: The check behind `canUndoAuthor` costs more and more as a page grows. How it works now: `can` runs `undoStack.some(undoable)` from the oldest change. For every change that only added words, `undoable` rebuilds `Y.createDeleteSetFromStructStore(doc.store)`, which walks the whole document, and then checks each character one at a time. Why it matters: `authorsChanged()` fires on every text change once any author is known (line 351, and line 408 on catch-up). Slices 22 and 23 will ask `canUndoAuthor` for each caret on every notification. Every keystroke then costs (that author's changes × the document's length), and this is worst for an author whose many changes were all removed later. Fix: build the delete set at most once per `can` call, only when it is first needed. Walk the stack from the newest change, which `undo()` would take anyway, and test whole ranges instead of single characters.
- Validation gaps (gap): A change that only deletes: nothing tests the name-tag Undo for a change that removed words (the deletions branch of `undoable`, src/live-text.ts:355–357). Add to `tests/live-text.test.ts`: Lex types "half past ", Anna deletes "half ", and then: `lex.stop.canUndoAuthor(anna)` is true; `undoAuthor` puts "half " back on both tabs; Lex's own Undo step over those words has dropped out (choice 1).
- Validation gaps (gap): Open typing in the code pane: the case where Lex is still typing when Anna's change arrives is only tested against a fake Monaco (`tests/per-person-undo.test.ts` "typing in the code pane…"). In the spec, Lex waits until Anna sees his comment (up to 20 s), and his typing has committed long before that (`TYPING_SETTLE_MS` is 700). Add a step to `tests/native-save/native-live-text.spec.ts`: Lex keeps typing one character every 200 ms while Anna inserts into the lead. Wait for her text in Lex's pane, stop, press Ctrl+Z, and check that only Lex's typed run is gone on both tabs and Anna's words appear once.
- Validation gaps (gap): Two of her insertions in one of his ranges: `rebaseChanges` has no test where she types twice inside one stretch of his, which makes three parts. Add a test: in "Lex hello", mine `{4,9,""}` and theirs `{5,5,"X"}` and `{7,7,"Y"}`. Both orders should give "Lex XY", and `moved.theirs` should be at 4 and 5.

