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

**Behaviour.** While a part of a component's template is typed in Edit component mode (an edit session open on the template and a field focused), a change to the page file no longer ends the edit or the mode: the field keeps its text and caret, typing goes on into the template, and the tree waits. Two things ended it before: an agent's page write opened the page in the code pane (`src/main.ts` agent `writeDraft` now skips that `open` while a template part is typed), and the instance moving on the page switched the mode off (`component-mode.ts` `now()` holds through the instance moving while the host's new `typing` port says so; `components.ts` counts edit sessions on the mode's template and syncs the mode once the last one ends). On leaving the field the tree catches up: a mode whose instance moved ends then, and the marked template part marks its instance where it went (`page-structure.ts` render). A Structure `refresh()` while a paint is held and a field has focus no longer draws the held paint early (a template part's own writes refresh). A change to the template file itself still ends the edit (slice 90's rule). Slice 90's P2 fixed: with nothing selected while a paint is held, choosing an element only the held paint has ends the edit at once (`select()` guard `!waits`); its row is marked once drawn. After such a typed page change the template's code stays open in the code pane instead of the page's. Two files outside the Files list were needed: `src/main.ts` (the agent's write opens the page; it stays at 5650 lines, one condition on an existing line) and `src/page-builder/components.ts` (the Edit component mode module's host, where the edit sessions live and the mode's ports are given).

**Tests.** `tests/native-save/native-structure-inplace.spec.ts`: "an agent's page edit while a template part is typed keeps the field, its text and caret; leaving it ends the mode…" replaces the test that recorded the edit and mode ending (fails on `dev`: the field loses focus after the agent's edit). `tests/page-structure-hold.test.ts`: "with nothing selected, an element only the held paint has, chosen…" (a click on a slot's own row leaves nothing selected; fails without the guard) and a `refresh()`-during-hold check. `tests/component-mode.test.ts`: typing keeps the mode through its instance moving and leaves on sync after; another file opening still ends it.

**Review round 1 (fixes).** While typing holds the mode on an instance the page moved, the preview's frame shows that instance where it went: the same of its tag's elements while the page has as many, else no instance (`component-mode.ts` `moved`, told on `sync`); before, the frame kept the old address. An agent creating a page while a template part is typed no longer opens it over the template (`main.ts`, same condition on the create branch). Known gap, raised to the lead and not decided: a step that creates, moves or deletes a file reopens the file open (`src/guarded-edit/commit.ts` refresh), so it still ends the edit; the typed text stays, and the template, the mode and its instance stay. Its spec is titled "known gap" and records today's outcome, not the decided behaviour. The agent's `create_page` goes through the pages controller, outside this ticket. Tests added: a template file change ends the edit with the template open and the mode on; an agent's new page during typing (the exception above); the frame drawn around the moved footer before leaving the field (fails on 2e8bd2fa); `tests/component-typing-hold.test.ts` (sessions on the template hold the mode, the last one closing ends it after a microtask, stale, other-file and unfocused sessions hold nothing); `component-mode.test.ts` frame following and a page with another count of the tag; `page-structure-hold.test.ts` `refresh()` with nothing held draws at once, the field keeping text and caret. Declined nits: pruning stale sessions in `typingTemplate` (a stale one already holds nothing and leaves the set on close or cancel); focus only inside the tree (the session must be open and fresh as well).

**Review round 2 (fixes).** Specs added: an agent's edit to another existing file (`styles/site.css`) while a template part is typed keeps the field, its text and caret, with nothing ended and the template open; Done with a template part marked marks its instance. The editor fake in `tests/component-typing-hold.test.ts` is typed with `satisfies Partial<…>`. `now()`'s doc says it reads the `typing` port. Also raised to the lead, not decided: the agent's `add_section`, `move_section` and `remove_section` open the page first (`src/agent-site.ts` `openPage`), which ends the typing; outside this ticket's Files.

**Review round 3 (fixes).** The stylesheet spec waits for the preview to have the change (`--agent` computed in the frame) before checking the field. A spec for an agent's edit to another page (`about/index.html`): the field, text and caret stay, and on leaving it the template stays open. The main spec checks the preview shows the typed text at the footer's new place before leaving the field. `tests/component-typing-hold.test.ts` covers Cancel: off at once, the frame let go on the sync after. The other-tab spec is removed: another tab's drafts reach this tab's store only (`src/drafts.ts` `refresh`), with no paint, typing or not, so it showed nothing. Also raised to the lead: `src/page-builder/components.ts`, outside the Files list, to be accepted in scope.

**Commits.** 2e8bd2fa (the change), deb76e01 (review round 1), ad221e4a (review round 2); review round 3 committed as 5a5db85c.

**Evidence.** Round 3: `kit unit --affected` 623/623 (`.scratch/unit/20261022T152942-2917904.log`); `kit specs native-structure-inplace.spec.ts` passed; `npm run check` and `npm run lint` clean. Round 2: `scripts/agents/kit unit --affected` 623/623 (`.scratch/unit/20261022T144940-2113191.log`); `kit specs --affected` 92/92 passed (`.scratch/kit-specs/run-7sEYSA/`); `npm run check` and `npm run lint` clean. Budget (`kit size --base 9cdbc8b7`, before the slice): `index.js` 229.76 → 230.18 KB gzip (+0.42 KB, the `typing` port, `typingTemplate`, the frame following and the main.ts conditions); boot reads 355 KB both ways, but crosses the 355 KB budget (base: within; now: over, report-only) — raised to the lead. Logs `.scratch/size/run-2AfG51/base.log`, `.scratch/size/run-RYer4H/now.log` (measured before round 2's doc-only and test-only changes). Round 1: unit 623/623 (`.scratch/unit/20261022T143333-1947132.log`); the touched spec groups run alone (run together, the default and actual groups share `.scratch/native-save/results` and lose trace files).

