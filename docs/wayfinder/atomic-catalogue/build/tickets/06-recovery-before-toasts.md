---
title: "Try again and Replace Undo get their own homes"
type: task (AFK)
status: open
assignee: fleet-lead
builder: claude
blocked_by: []
---

## Goal

Move the two recoveries that live only in toasts before the toasts go ([ticket 09, item 1](../../tickets/09-grill-toast-replacements.md#resolution-2026-10-25)); research: `git show origin/research/ac-03-toasts-and-explainers:docs/wayfinder/atomic-catalogue/research/03-toasts-and-explainers.md`, "Undo and recovery".

## Decided behaviour

- **GitHub not answering:** the failed page or Files panel itself shows **Try again** (today only the toast from `src/github-reads.ts:80` / `src/read-retry.ts` has it).
- **Media Replace:** its Undo is reachable outside the modal dialog, on the tile or detail picture (`src/page-builder/media-library-replace.ts:128`); the top-bar Undo also takes it back once the dialog closes.
- No new toast or explainer text.
- Mock-up approved by Lex (2026-10-27, with his change): [09-feedback-in-place.html](../../prototypes/09-feedback-in-place.html)

## Files

- `src/github-reads.ts`, `src/read-retry.ts`, the failed-state view of the page and Files panel, `src/page-builder/media-library-replace.ts` and its detail view; tests.

## Done when

- A spec: GitHub stops answering, the failed screen shows Try again, pressing it reloads.
- A spec: Replace in Media, close the dialog, Undo restores the old picture.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-06 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-06 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-10)

- **Try again on the failed screen:** when a read GitHub never answers (or answers 502/503 to every try) fails an open, the failed panel the caller drew ("Your repository could not be opened.", "Branches could not be loaded…", or the file-read message) carries a **Try again** button. The callers pass that panel to `errorMessage(error, retry, panel)`; there is no document-wide lookup, so a loading line or an unrelated note is never given the button. The notice carries it instead when the explorer is open (it covers the panel, and the notice is placed in it: the Files panel case) or when the caller drew no panel (a branch list refilling beside a shown page). Matching the approved mock-up, it is a primary button; pressed, it is disabled and shows a spinner with "Trying again" (the mock-up has a retry icon on the idle button too: left out to save boot bytes, the one difference), the notice hides and the open repeats; a failure draws the panel and button again, and a second press starts nothing. The toast with Try again and the `say` port are gone. The `#status` line "GitHub isn't answering. Try again in a moment." is written as the user's own announcement, so a later load-progress line does not replace it. No new toast or explainer text.
- **Replace Undo:** after Replace everywhere, the new picture's File details shows an **Undo** button under the picture. It belongs to the step: it is kept on the sheet, drawn again by every refresh while that step is still the newest (`ToastAction.live`, set by `undoAction` in `src/announce.ts`), gone once the top bar's Undo or any newer change has taken its place, and removed on Back. Pressed, it takes the step back only if the step is still the newest. The top bar's Undo also takes the replacement back once the dialog is closed. The replace toast itself is left for ticket 07.
- **Tests:**
  - `tests/github-reads.test.ts`: the button on the panel passed in, on the notice (explorer open, or no panel drawn while a loading line shows), busy after a press with a second press starting no second retry, none for 401, other errors or no retry, and `#status` kept against `settleStatus`.
  - `tests/native-save/native-github-silent.spec.ts`: the button is on `#content .empty-message` and not in `#notice` for every failed open; the Refresh case (explorer open) asserts the reverse; a 390 px case with a long 503 message fits and then opens; the file-read failure panel (a reopen of a file) is checked to hold the words and the button with none in the notice.
  - `tests/native-save/native-early-reads.spec.ts`: a first visit whose branch list GitHub never answers opens the site on the early snapshot, then shows Try again in the notice (no toast); pressing it fills the selector. This changes today's first-visit behaviour and is open for Lex's OK. `RESULT: ok specs 1/1 passed` (12 tests).
  - `tests/native-save/native-media-rename.spec.ts`: close the dialog, the top bar's Undo restores the old picture; the details Undo restores it; the details Undo is gone after the top bar's Undo, with no second undo and no refusal note.
- **Validation:**
  - `RESULT: ok unit 1836/1836 (103 files)` (`kit unit --affected`)
  - `RESULT: ok specs 2/2 passed` (native-github-silent 10, native-media-rename 14)
  - `npm run check` and `npm run lint` pass.
  - `RESULT: fail size boot 355 KB over budget 355 KB`. Exact delta against dev (`origin/dev` built beside this branch, `gzip -9` of the files that changed): the boot chunk `index-*.js` 213661 → 213723 bytes (+62) and `index-*.css` 19862 → 19879 bytes (+17), so about +79 bytes gzip in all. Dev sits at 363520 bytes, the budget, so any added byte is over.
- **Open for the lead:** the boot budget. The new code is already small (no icon, one shared check in `undoAction`), and the panel plumbing costs more than any trim saves, so the +79 bytes cannot be removed without dropping the panel placement or the approved busy spinner. Choices: raise the budget a little, or take the bytes from the toast code in boot that ticket 07 deletes (then land this after 07's removal, or in the same step). The ticket is back to open for that decision.
- **Port types:** `node` in `src/workspace-boot.ts` now returns an `HTMLElement` and `errorMessage` takes `panel?: HTMLElement`, the same contract `src/github-reads.ts` relies on; the boot test's fake element is typed to match.
- **Not run here:** `kit shots --compare dev`, the Opus UX review and the one-offs count (slice 04 has not landed, so no command exists); the slice runs them.
- Feature list: updated F-repo-06 and F-media-08.

### UX follow-ups

- UX (looks off): F-bar-01 the bar sits by the new heading with its name as a label and the phone bar is docked at the foot, but adding the heading shows a toast ("Heading added. Into Section "Recent work" › after Div" with Undo); the mock-up has Undo with no message. On the phone this toast covers the heading under it ("Have a project in"). Publish carries a "1" count, which the mock-up removes. The path above the canvas and the toast show code words ("section.flow", "Div") (.scratch/ux/fleet-lead/20261110-074723-RGR9T6/editor-F-bar-01-390-light-bar-strip.webp)
- UX (looks off): F-phone-03 at 390 px the top bar takes two rows: the project name on one, then Undo, Redo, History and Publish below it. Publish stays in view once the site is open, but while the Files explorer is open during loading the Publish row is gone. Opening the explorer from the top bar was not tried (.scratch/ux/fleet-lead/20261110-074723-RGR9T6/editor-F-repo-01-390-light-open-strip.webp)
