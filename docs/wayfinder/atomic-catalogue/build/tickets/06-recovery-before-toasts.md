---
title: "Try again and Replace Undo get their own homes"
type: task (AFK)
status: closed
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

- **Try again on the failed screen:** when a read GitHub never answers (or answers 502/503 to every try) fails an open, the failed panel itself (the "Your repository could not be opened." / "Branches could not be loaded." / file-read message in the page area) carries a **Try again** button. With the explorer open, which covers that panel, the notice placed in the explorer carries it instead (the Files panel case); with no panel (a branch list refilling beside a shown page) the notice does. Pressed, the button turns busy (spinner, "Trying again", disabled so a second press starts nothing), the notice hides and the open repeats; a failure draws the panel and button again. The toast with Try again and the `say` port are gone. The `#status` line "GitHub isn't answering. Try again in a moment." is written as the user's own announcement (not via `status()`), so a later load-progress line does not replace it. No new toast or explainer text.
- **Replace Undo:** after Replace everywhere, the new picture's File details shows an **Undo** button under the picture. It belongs to the step: it is kept on the sheet, drawn again by every refresh while that step is still the newest (`ToastAction.live`, set by `undoAction` in `src/announce.ts`), gone once the top bar's Undo or any newer change has taken its place, and removed on Back. Pressed, it takes the step back only if the step is still the newest. The top bar's Undo also takes the replacement back once the dialog is closed. It does not outlive the Media pane's own view; the top bar's Undo is the one that does. The replace toast itself is left for ticket 07.
- **Tests:**
  - `tests/github-reads.test.ts`: the button on the panel, on the notice (explorer open, no panel), busy after a press with a second press starting no second retry, none for 401, other errors or no retry, and `#status` kept against `settleStatus`.
  - `tests/native-save/native-github-silent.spec.ts`: moved from the toast to the panel, plus a 390 px case with a long 503 message where the notice and Try again fit and the open then succeeds.
  - `tests/native-save/native-media-rename.spec.ts`: close the dialog, the top bar's Undo restores the old picture; the details Undo restores it; the details Undo is gone after the top bar's Undo, with no second undo and no refusal note.
- **Validation:**
  - `RESULT: ok unit 1812/1812 (102 files)` (`kit unit --affected`)
  - `RESULT: ok specs 2/2 passed` (native-github-silent 10, native-media-rename 14)
  - `npm run check` and `npm run lint` pass.
  - `RESULT: fail size boot 355 KB over budget 355 KB`: boot shows 355 KB, ±0 KB against dev (dev's own run is 355 KB and within by a hair, 363520 bytes). The button's code in `src/github-reads.ts` is boot code and tips it over the byte budget by a margin the report does not print; the slice or the lead decides where to trim.
- **Not run here:** `kit shots --compare dev`, the Opus UX review and the one-offs count (slice 04 has not landed, so no command exists); the slice runs them.
- Feature list: updated F-repo-06 and F-media-08.
