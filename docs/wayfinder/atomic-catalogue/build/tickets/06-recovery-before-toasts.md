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

- **Try again on the failed screen:** when a read GitHub never answers (or answers 502/503 to every try) fails an open, the notice bar on the failed page or Files panel now carries a **Try again** button. Pressing it hides the notice and repeats the open; if that fails too, the notice shows again. The toast with Try again and the `say` port in `src/github-reads.ts` / `src/main.ts` are gone; the screen-reader line in `#status` still says "GitHub isn't answering. Try again in a moment." No new toast or explainer text.
- **Replace Undo:** after Replace everywhere, the new picture's File details shows an **Undo** button under the picture (`src/page-builder/media-library-details.ts`, `media-library-replace.ts`, `media-detail.css`). It takes the step back, and stays until used, so it is reachable without the toast. The top bar's Undo also takes the replacement back once the dialog is closed. The replace toast itself is left for ticket 07.
- **Tests:** `tests/github-reads.test.ts` (Try again button runs the retry, hides the notice; none for 401, other errors or no retry); `tests/native-save/native-github-silent.spec.ts` moved from the toast to the notice (GitHub stops answering, the failed screen shows Try again, pressing it reloads); `tests/native-save/native-media-rename.spec.ts` gained two specs: Replace in Media, close the dialog, top-bar Undo restores the old picture; and the Undo beside the new picture restores it.
- **Validation:**
  - `RESULT: ok unit 1805/1805 (101 files)` (`kit unit --affected`)
  - `RESULT: ok specs 2/2 passed` (native-github-silent 9, native-media-rename 13)
  - `npm run check` and `npm run lint` pass.
- **Not run here:** `kit size`, `kit shots --compare dev` and the UX review; the slice runs them.
- Feature list: updated F-repo-06 and F-media-08.
