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

- **Try again on the failed screen:** when a read GitHub never answers (or answers 502/503 to every try) fails an open, the failed panel the caller drew ("Your repository could not be opened.", "Branches could not be loaded.", or the file-read message) carries a **Try again** button. The callers pass that panel to `errorMessage(error, retry, panel)`; there is no document-wide lookup, so a loading line or an unrelated note is never given the button. The notice carries it instead when the explorer is open (it covers the panel, and the notice is placed in it: the Files panel case) or when the caller drew no panel (a branch list refilling beside a shown page). Matching the approved mock-up, it is a primary button (the mock-up's busy state with a spinner and "Trying again", and its retry icon, are left out to save boot bytes: pressed, the open repeats and replaces the panel); a failure draws the panel and button again. The toast with Try again and the `say` port are gone. The `#status` line "GitHub isn't answering. Try again in a moment." is written as the user's own announcement, so a later load-progress line does not replace it. No new toast or explainer text.
- **Replace Undo:** after Replace everywhere, the new picture's File details shows an **Undo** button under the picture. It belongs to the step: it is kept on the sheet, drawn again by every refresh while that step is still the newest (`ToastAction.live`, set by `undoAction` in `src/announce.ts`), gone once the top bar's Undo has taken the step back, and removed on Back. After a newer change it stays until the sheet is redrawn; pressed then, it takes nothing back and the existing refusal note says why. Pressed while the step is the newest, it takes the step back. The top bar's Undo also takes the replacement back once the dialog is closed. The replace toast itself is left for ticket 07.
- **Tests:**
  - `tests/github-reads.test.ts`: the button on the panel passed in, on the notice (explorer open, or no panel drawn while a loading line shows), none for 401, other errors or no retry, and `#status` kept against `settleStatus`.
  - `tests/native-save/native-github-silent.spec.ts`: the button is on `#content .empty-message` for every failed open, and in `#notice` only while the explorer covers the page (the Refresh case, which then closes the explorer and finds the panel's own); a 390 px case with a long 503 message fits and then opens; the file-read failure panel (a reopen of a file) is checked to hold the words and the button with none in the notice.
  - `tests/native-save/native-early-reads.spec.ts`: a first visit whose branch list GitHub never answers opens the site on the early snapshot, then shows Try again in the notice (no toast); pressing it fills the selector. This changes today's first-visit behaviour and is open for Lex's OK. `RESULT: ok specs 1/1 passed` (12 tests).
  - `tests/native-save/native-media-rename.spec.ts`: close the dialog, the top bar's Undo restores the old picture; the details Undo restores it; the details Undo is gone after the top bar's Undo, with no second undo and no refusal note.
- **Validation:**
  - `RESULT: ok unit 1838/1838 (103 files)`; `RESULT: ok specs 4/4 passed` (native-github-silent 10, native-media-rename 16, native-early-reads 12, native-boot-memory 14); `npm run check` and `npm run lint` pass.
  - Boot size (budget 363520 bytes, unchanged; Lex decided on 2026-11-10 to keep it, with no waiver): the exact median of the cold loads is **363510 bytes, 10 under**; `RESULT: ok size boot 355 KB (±0 KB) vs dev@7797ff2, budget 355 KB`. After the busy-state trims the slice stood 38 bytes over; the rest came from dead styles in the boot CSS, each proved unused by a search of `src`, `tests`, `public` and `index.html`: the five `.topbar > .topbar-add` selectors in `src/page-builder/add-panel.css` (no element ever gets that class; `.structure-add` keeps the shared rules), `.insert-picker` in the `:is(...)` list in `src/components/native-preview.css`, and `.pages-count` in `src/components/pages-tree.css` (only `.pages-note` is drawn).
  - Trimmed in the slice itself: the busy spinner on Try again is gone (the repeated open already clears the notice and replaces the failed panel, so the spinner was only ever painted on the branch-list refill, and the notice-only case is told by the notice going while the open repeats; a second press restarts the open), one `map` for the buttons, the unused `showToast` key of `createAnnounce` dropped, three strings shortened ("Branches could not be loaded.", "Files could not be loaded.", "The request failed.", the advice now being the button), merged CSS. The shared words "Try again in a moment." are kept.
- **Review fixes (lead's list):**
  - Keyboard focus: a press leaves the focus on Try again (it is never disabled); when the repeated open fails and focus fell to the body, the button drawn now takes it. The open it repeats clears the notice itself, so a notice-only Try again leaves the page with it (the panel shows "Opening your repository…" or "Loading branches…" in its place). The details Undo moves focus to the picture (its focus ring stays visible) before it leaves.
  - The Files panel covering the failed page: the failed page always carries its own Try again, and the notice in the explorer carries a second while it covers the page, so closing the explorer leaves the button reachable. Either runs the same retry.
  - The details Undo pressed after a newer change: it runs the action, which says why it takes nothing back (the existing refusal note), and the button leaves.
  - Both new buttons (the panel's and the notice's Try again, and the details Undo) are at least 44 px tall on a phone.
  - The busy state of Try again was dropped for bytes (see Validation).
  - Tests first: unit cases in `tests/github-reads.test.ts` (both buttons when covered, focus after a failed retry, focus left on another control) and `tests/announce.test.ts` (`live`); specs in `native-github-silent.spec.ts` (Escape closes the explorer, Try again still there, 44 px) and `native-media-rename.spec.ts` (stale press says why, focus after Undo, 44 px).
  - The details Undo is the icon alone, named "Undo" for the tooltip and the screen reader, as the top bar's is.
  - Kept as decided: the Undo on the picture (the ticket asks for it; the mock-up shows none, so Lex sees it in the contact sheet).
- **Port types:** `node` in `src/workspace-boot.ts` now returns an `HTMLElement` and `errorMessage` takes `panel?: HTMLElement`, the same contract `src/github-reads.ts` relies on; the boot test's fake element is typed to match.
- The UX review and `kit shots --compare dev` ran in the slice (see the follow-ups below); the one-offs count does not exist yet (slice 04 has not landed).
- Feature list: updated F-repo-06 and F-media-08.

### UX follow-ups

- UX (looks off): F-bar-01 the bar sits by the new heading with its name as a label and the phone bar is docked at the foot, but adding the heading shows a toast ("Heading added. Into Section "Recent work" › after Div" with Undo); the mock-up has Undo with no message. On the phone this toast covers the heading under it ("Have a project in"). Publish carries a "1" count, which the mock-up removes. The path above the canvas and the toast show code words ("section.flow", "Div") (.scratch/ux/fleet-lead/20261110-074723-RGR9T6/editor-F-bar-01-390-light-bar-strip.webp)
- UX (looks off): F-phone-03 at 390 px the top bar takes two rows: the project name on one, then Undo, Redo, History and Publish below it. Publish stays in view once the site is open, but while the Files explorer is open during loading the Publish row is gone. Opening the explorer from the top bar was not tried (.scratch/ux/fleet-lead/20261110-074723-RGR9T6/editor-F-repo-01-390-light-open-strip.webp)

### Follow-ups

- Validation gaps (gap): R2-10 still open: this is the same point as R2-1. The github-silent spec was not changed.
- Validation gaps (gap): R2-9 still open: this is the same point as R2-2. The media-rename spec was not changed.
- Validation gaps (gap): R2-2 still open: `tests/native-save/native-media-rename.spec.ts` did not change. No spec leaves File details another way than Back and then opens them again while the step is still the newest.
- Validation gaps (gap): R2-1 still open: `tests/native-save/native-github-silent.spec.ts` did not change in this round. No end-to-end spec presses Try again, lets the repeated open fail, and then checks that the new panel has one button and that it has focus.
- Validation gaps (gap): R1-8 / R2-1 / R2-10, still open: in `tests/native-save/native-github-silent.spec.ts`, keep GitHub silent and press Try again on `#content .empty-message`. Let the repeated open fail. Then check three things: exactly one Try again exists on the new panel (`#content .empty-message button` has a count of 1); `#notice` holds no Try again; that button is `document.activeElement`. Today only the fake-element unit test at `tests/github-reads.test.ts:134` covers focus.
- Validation gaps (gap): R1-7 / R2-2 / R2-9, still open: in `tests/native-save/native-media-rename.spec.ts`, after Replace everywhere, close the dialog. Then close the Media pane, open it again, and open the new picture's File details without making any newer change. Assert whichever behaviour is intended: Undo is shown again, and pressing it restores the old picture; or Undo is not shown. `sheet.undo` is only cleared on Back, so today this path is not pinned down.
- Spec (P2, second look): 277f4a927:src/github-reads.ts:80 — P2 ticket: Try again is added to Files only if the explorer is already open when the request fails. If failure happens first, opening Files afterward covers the page’s button and shows no recovery button inside Files. The explorer’s open handlers never update this placement. This misses ticket 06’s requirement that the failed Files panel itself offers Try again. Fix: update recovery placement when the explorer opens, keeping the page’s button available after it closes.
- Validation gaps (gap, second look): In `native-github-silent.spec.ts`, press Try again while GitHub remains silent. After the repeated failure, assert exactly one button on the replacement panel, none in the notice, and keyboard focus on the new button. Current coverage simulates focus loss only in the unit fake.
- Validation gaps (gap, second look): In `native-media-rename.spec.ts`, replace a picture, close and reopen Media without using Back or making another change, then check the details Undo. Pin whether it remains available; if shown, assert it restores the original picture.

