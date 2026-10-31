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

- `canUndoAuthor` is true while the author's change is in its Undo list, even when someone has since removed those words (then the Undo takes back nothing more).
- A typing step that typed in two places within one settle period is one range: Anna's change between the two places counts as an overlap.

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

shots: none (no visible change: Undo behaviour only; F-canvas-15 has no steps file, it needs two browsers signed in at once)

Feature list: F-canvas-15 updated (Undo with two people).

Commits: Your Undo undoes your own typing; docs: 24-per-person-undo notes for the build
