---
title: "Page Structure: typing in a component's template survives a change to the page file"
type: task (AFK)
status: closed
assignee: lead-97
builder: claude
blocked_by: [90-page-structure-typing-flicker]
---

## Goal

Follow-up from slice 90 (PR #120). Lex decided on 2026-10-22: typing in a component's template in Page Structure (Edit component mode) carries on undisturbed when the page file changes meanwhile (for example an agent saves it), the same as typing elsewhere in Page Structure since slice 90. Today the edit ends and a test records that.

## Decided behaviour

- While Lex types in a template field, a change to the page file (or any file other than the template being edited) does not end the edit, redraw the field, or move the caret; the tree catches up when he leaves the field.
- A change to the template file itself still follows slice 90's rule for the field's own file.
- Also fix slice 90's remaining P2: with nothing selected while a change is held, clicking an element only the held version has ends the edit at once (today the row is marked only on leaving the field).

## Files

Find them from slice 90's change (`git show efb1458 --stat`): `src/components/page-structure.ts`, `src/components/structure-editing.ts`, `src/controllers/page-structure-controller.ts`, the Edit component mode module, and their tests (`tests/structure-editing.test.ts`, `tests/page-structure-hold.test.ts`, `tests/native-save/native-structure-inplace.spec.ts`, and the test that records today's behaviour, which changes). Stay out of `src/main.ts` unless unavoidable (then set its ceiling per the README).

## Done when

- A browser spec types in a component template field, changes the page file meanwhile, and shows the text and caret unchanged until leaving the field; it fails on dev before the fix.
- The held-version click case has a test.
- `scripts/agents/kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-97 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-97 --timeout 2h`.

## Done (2026-10-22)

**Behaviour.** While a part of a component's template is typed in Edit component mode (an edit session open on the template and a field focused), a change to the page file no longer ends the edit or the mode: the field keeps its text and caret, typing goes on into the template, and the tree waits. Two things ended it before: an agent's page write opened the page in the code pane (`src/main.ts` agent `writeDraft` now skips that `open` while a template part is typed), and the instance moving on the page switched the mode off (`component-mode.ts` `now()` holds through the instance moving while the host's new `typing` port says so; `components.ts` counts edit sessions on the mode's template and syncs the mode once the last one ends). On leaving the field the tree catches up: a mode whose instance moved ends then, and the marked template part marks its instance where it went (`page-structure.ts` render). A Structure `refresh()` while a paint is held and a field has focus no longer draws the held paint early (a template part's own writes refresh). A change to the template file itself still ends the edit (slice 90's rule). Slice 90's P2 fixed: with nothing selected while a paint is held, choosing an element only the held paint has ends the edit at once (`select()` guard `!waits`); its row is marked once drawn. After such a typed page change the template's code stays open in the code pane instead of the page's. `main.ts` stays at 5650 lines (one condition on an existing line).

**Tests.** `tests/native-save/native-structure-inplace.spec.ts`: "an agent's page edit while a template part is typed keeps the field, its text and caret; leaving it ends the mode…" replaces the test that recorded the edit and mode ending (fails on `dev`: the field loses focus after the agent's edit). `tests/page-structure-hold.test.ts`: "with nothing selected, an element only the held paint has, chosen…" (a click on a slot's own row leaves nothing selected; fails without the guard) and a `refresh()`-during-hold check. `tests/component-mode.test.ts`: typing keeps the mode through its instance moving and leaves on sync after; another file opening still ends it.

**Review round 1 (fixes).** While typing holds the mode on an instance the page moved, the preview's frame shows that instance where it went: the same of its tag's elements while the page has as many, else no instance (`component-mode.ts` `moved`, told on `sync`); before, the frame kept the old address. An agent creating a page while a template part is typed no longer opens it over the template (`main.ts`, same condition on the create branch). Exception, recorded: a step that creates, moves or deletes a file reopens the file open (`src/guarded-edit/commit.ts` refresh), so it still ends the edit; the typed text stays, and the template, the mode and its instance stay. The agent's `create_page` goes through the pages controller, outside this ticket. Tests added: a template file change ends the edit with the template open and the mode on; an agent's new page during typing (the exception above); the frame drawn around the moved footer before leaving the field (fails on 2e8bd2fa); `tests/component-typing-hold.test.ts` (sessions on the template hold the mode, the last one closing ends it after a microtask, stale, other-file and unfocused sessions hold nothing); `component-mode.test.ts` frame following and a page with another count of the tag; `page-structure-hold.test.ts` `refresh()` with nothing held draws at once, the field keeping text and caret. Declined nits: pruning stale sessions in `typingTemplate` (a stale one already holds nothing and leaves the set on close or cancel); focus only inside the tree (the session must be open and fresh as well).

**Commits.** 2e8bd2fa (the change); this review round's fixes left unstaged for the runner.

**Evidence.** `scripts/agents/kit unit --affected` 623/623 (`.scratch/unit/20261022T143333-1947132.log`); `npm run check` and `npm run lint` clean; `kit specs native-structure-inplace.spec.ts`, `native-structure-slots`, `native-edit-component` and the four `native-edit-component-*-actual` specs pass, each group run alone (run together, the default and actual groups share `.scratch/native-save/results` and lose trace files).

