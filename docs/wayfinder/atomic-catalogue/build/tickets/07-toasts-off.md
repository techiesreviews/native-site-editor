---
title: "No toasts: the one switch and feedback in place"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [06-recovery-before-toasts]
---

## Goal

Remove every toast, explainer line and unneeded count ([ticket 09](../../tickets/09-grill-toast-replacements.md#resolution-2026-10-25)); the list with file and line is research 03: `git show origin/research/ac-03-toasts-and-explainers:docs/wayfinder/atomic-catalogue/research/03-toasts-and-explainers.md`.

## Decided behaviour

- `announce()` (`src/announce.ts`) and `say()` (`src/components/toast.ts`) only write the screen-reader line: all 95 toasts go at once.
- The 12 rows that need it get feedback on the control: 4 as state, 8 as an error that stays until Lex acts or it is fixed (use the existing anchored refusal note, `src/components/refusal-note.ts`, until slice 26's In-place notice lands).
- The 47 refusals shown twice keep only their note.
- Undo lives in the top bar, with no "Undid …" message.
- The 37 explainer lines and 5 counts marked "nothing" go, including the count on Publish.
- Confirm on the preview, then fix: the drag keyboard tip (`src/page-builder/insert-drag.ts:186`) and the keystroke toast in component slot fields (`src/page-builder/components.ts:434`).
- `showToast()` and its CSS are deleted once nothing calls them.
- Mock-up approved by Lex (2026-10-27, with his change): [09-feedback-in-place.html](../../prototypes/09-feedback-in-place.html)

## Files

- `src/announce.ts`, `src/components/toast.ts` (+ CSS), the callers listed in research 03's tables, `src/main.ts` (wiring only, if the toast host is mounted there), tests that assert toast texts (update to the in-place feedback; keep behaviour coverage).

## Done when

- `grep` shows no `showToast(` callers and no toast element in the DOM after each spec family.
- Each of the 12 on-control rows has a spec or unit case showing its state or error on the control.
- Screen readers still hear every message (the live region spec).
- `kit shots --compare dev` of every screen research 03 names.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-07 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-07 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
- Big, delicate slice: one second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.

## Done (2026-11-10)

- **One switch:** `announce()` and the Media screens' `done()` now write only the screen-reader line (`#status`, a polite live region). `showToast()`, `say()`, the toast module, its CSS, its pure rules and the toast-aware geometry in the edit bar and the Files adding summary are deleted; nothing draws a toast, and `grep` finds no `showToast(` caller. The "quiet" and "undo" arguments of `announce()` and the `quiet` flag on steps went with it. The top bar's Undo is the only Undo for page and file steps, with no "Undid …" message drawn; the Undo beside a replaced picture in File details (ticket 06) stays.
- **The 12 rows, on the control:**
  - State, 4: Files ⋯ Copy path and Media File details ⋯ Copy path turn that ⋯ button into a check for a moment (`src/ui/done-mark.ts`; a menu item now receives the button its menu opened from); Download site reads "Preparing…" and is busy on its own button; Keep as new file leaves the draft's Files row reading "added, not saved to GitHub yet" with the bar gone.
  - Error, 8: GitHub not answering (ticket 06: Try again on the failed panel); Page Structure row action while the preview is drawing, Make component and the slot menu on bytes that moved on, and Edit component mode too late all say why in the refusal note by the button the menu opened from (by the edit bar for the late mode); the command palette's stale selection keeps its refusal note; a slot row refused keeps only its note (the toast copy is gone, as for the 47 doubled refusals); an image place that changed shows its reason on the picker's own message line.
  - Not-added files when the picker closes now say so in the refusal note.
- **Explainers and counts removed:** the Publish button's count (the title and the menu still carry it), the Files heading's count and its version tooltip, the folder view's badge, the unused edit-bar badge; the upload "or drop a file here", "Esc leaves the card blank", the slot "Content: select…" line, the home page's fixed-URL note, the palette's second lines and "Native HTML", "(no page)" beside a folder, the image popup's picture hint (now only read aloud, with the "seen hints" storage gone), the video spot popup's three lines, the video details' two lines, Description, Always keep, rename and Replace forwarding, Optimise, Clean up and New collection lines, the settings dialogs' field hints, preview and navigation notes and "Drafts until you publish", "Click to enlarge", and the wizard's agent line. A greyed menu item says nothing (no title, no note). "By agent" keeps its mark only. The drag keyboard tip and the slot keystroke toast are gone with the chokepoint.
- **Tests:**
  - `tests/native-save/native-feedback-in-place.spec.ts` (was the toast spec): the live region says a whole step with no toast element and Undo takes it back; a Media result is said in the live region only; Files and Media Copy path show the check on their button; Download site's busy label and its failure note. The other specs' toast texts now read `#status`, and the toast-only layout specs are gone. Added or updated cases show `.editor-toast` absent in the agent, cards, palette, structure, Media and save families.
  - Unit: `tests/announce.test.ts` (status only, Undo live and refusing), `tests/component-menu-refusals.test.ts` (Make component and the slot menu refuse by their button), `tests/media-page-markup-stale.test.ts`, `tests/workspace-mount.test.ts` (row action refusal by anchor), `tests/command-palette-controller.test.ts` (refusal note too); `tests/toast-rules.test.ts` and the Files count test are removed with their code.
  - `RESULT: ok unit 3028/3028 (190 files)`; `RESULT: ok specs 1/1 passed` for each of the 30 touched and related spec files (one run of 30: 1 failed, the Publish count assertion, fixed and passed); `npm run check` and `npm run lint` clean.
- **Size and one-offs:** `RESULT: ok size boot 354 KB (-1 KB) vs dev@f8c13b9, budget 355 KB`; `RESULT: ok one-offs fell by 1 in 1 file, 1578 left; scripts/agents/one-offs.json rewritten` (fell by 17 in all; `scripts/agents/one-offs.json` rewritten).
- Feature list: added F-pages-17 (results show where they happened) and updated F-bar-01.
- **Left for a decision:** Edit component mode's note, info mark and count stay (they are the only place Make component's notes show); the "Adds noindex … does not make a page private" line stays (research asked to check with Lex); the card "its text could not be reset" tail and the Media Remove pointer to Recently removed are now status-line only; a right-click on a Files row has no ⋯ button to turn into a check, so Copy path says it in the status line only. The Opus UX review against the rulebook, and the preview check of the drag keyboard tip and the slot keystroke toast (both now only the status line), stay with the slice.
- **Review fixes (round 1):**
  - Download site's button now keeps the project menu open while it is busy (`data-keep-open`, as Copy link does); a spec presses it in the real project menu with the zip code held, and fails without the fix. The menu hides its site actions for now (`showSiteActions` in `repository-menu.ts`), so the press there is made on the DOM and the case cannot check that the button is visible.
  - The Files ⋯ overlay stays shown while a button in it holds the check (`[data-done]`), so Copy path's check is seen after the pointer leaves; specs check it is visible at opacity 1 with the mouse and with the keyboard.
  - Closing the picker with files still being prepared: the refusal note is drawn first and then the live region ends with the whole "Added … 1 file still being prepared was not added." sentence (spec in `native-media-adding.spec.ts`).
  - One writer of the live region: `say()` in `src/announce.ts`, used by `announce()` and the Media screens' `done()`. `STILL_DRAWING` has its own comment. Nits: the card link foot is drawn only with a look, the dead image-popup hint rules and comment are gone, `markDone`'s gate is documented, the test casts are explained.
- **Shots:** `RESULT: ok shots compare dev@f8c13b9: base 0 cached, 40 shot; after ok; 190 files` for editor, files, pages, structure, file-details, media-gallery, image-popup, site-settings, cleanup and picker at 390 and 1280, light and dark; contact sheets in `/home/ubulex/Projects/native-site-editor/.scratch/shots/fleet-lead/20261110-211559/` (`contact-1.webp` +14). Its layout findings are an insert-point plus clipped and crowded at 390 in image-popup and a crowded Add button in structure, in parts this ticket did not touch.
- **UX review (scripted checks against dev):** the same scripted checks run on `f8c13b9` and on this tree for F-pages-03, F-pages-11, F-bar-01, F-structure-01, -04, -06, -07, F-media-14 and F-phone-03 give the same 17 tap-target and layout findings, so the touch sizes (HS18), the cut-off start screen picks (L5, U5) and the two-row top bar (L4) were there before this ticket and are not in its files. The crumb strip's code names (S7, HS4) are the same as in ticket 06's follow-ups. The F-bar-01 strip at 390 px no longer has the "Heading added" toast; the docked bar's geometry for the no-toast case is unchanged, and `native-edit-bar.spec.ts` checks the new heading ends above the bar.

