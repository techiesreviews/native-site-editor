---
title: "The edit bar on a phone: opens on a new element, and Text size applies (found on dev by 42's UX check)"
type: task (AFK)
status: closed
assignee: am-43
builder: claude
blocked_by: []
---

## Goal

Slice 42's UX check found two edit-bar faults at 390 px that plain `dev` shows exactly the same (not caused by 42):

1. **F-bar-01, the edit bar opens on a selected element.** After adding a Heading at 390 px it is selected but no edit bar appears in any frame; at 1280 px it shows in only one frame. The "Heading added … Undo" strip sits under it. Dev: `.scratch/ux/am-42-dev/20261029-143906-wzkVbH/editor-F-bar-01-390-light-bar-strip.webp` (main checkout).
2. **F-bar-03, Text size on a paragraph (light theme).** Choosing a size leaves it on Default and a "The source changed. Select the element again and try again." strip covers the paragraph; in dark it applies, but the bar covers the link above. The scripted check still counts this as a pass. Dev: `.scratch/ux/am-42-dev/20261029-143906-wzkVbH/editor-F-bar-03-390-light-size-strip.webp`.

## Decided behaviour

- A newly added element that is selected shows its edit bar at every width, in every frame where it shows on desktop.
- Text size on a paragraph applies in light and dark at 390 px; no "source changed" refusal for a fresh selection; the bar never covers the element above it.
- The UX check for F-bar-03 fails when the size didn't apply (fix the check so it can't pass on this fault).
- No toasts added; feedback stays on the control (Lex's rule).

## Files

- the edit bar and its placement (`src/page-builder/` edit-bar code), the text-size action, and their tests
- the F-bar-03 UX check script (in `kit ux`'s editor feature checks)

## Done when

- Unit or spec tests for both faults fail before the fix and pass after; the UX check for F-bar-01 and F-bar-03 at 390 px light and dark shows them fixed (shots in the Done).
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit ux`, `kit review`, `kit pr`; report the RESULT lines and shots.

## Done (2026-10-29)

- **F-bar-03, Text size.** Cause: the bar's controls hold the page source from when they were drawn. When Text size was chosen right after Bold, before the bar had redrawn, the size was checked against that old copy and refused with "The source changed…" (it showed up in 1 of 5 runs at 390 px light; it is a timing race, not a theme or width fault). Now the bar's controls that edit only the element's own tags (Text size, Heading level, Layout) apply to the latest source only when the element's content is all that changed: everything up to the end of its start tag, its close tag and everything after it are as they were. Anything else is still refused, including a new element inserted at its place and a swap with a same-tag sibling. Heading level had the same race after Bold. Bold, Italic and the component variant controls still check against the source from when the bar was drawn, so Bold pressed right after Text size (or twice quickly) can still be refused until the bar redraws. `src/controllers/page-structure-controller.ts`.
- **F-bar-01, edit bar on a new element.** No app fault: the bar does show on a newly added Heading at 390 and 1280 px in every frame. The check clicked the `main.page` crumb after adding the Heading, which selects the page's `main`, and `main` gets no bar by design. The check now records the new Heading's bar, expects Bold, then selects the Heading's section (`section.flow`) and expects its Variants. Run the old way (selecting `main`) with the new closing check, it fails (`expect visible "Bold" failed`). A new 390×844 spec pins the decided behaviour: a Heading added from the Blocks rail is selected, its bar says "Heading" and Bold is in view. It passes before and after, since there was no app fault to fix; the "fail before" part of Done when is waived for F-bar-01 for that reason.
- **The F-bar-03 check** now ends with `expect visible "p.text-l"` (the crumb for the applied size class), so it fails when the size didn't apply. With "press l" left out it fails (`expect visible "p.text-l" failed`).
- **Deferred, needs Lex's sign-off (not yet given):** "the bar never covers the element above it" (Decided behaviour) is not built. At 390 px the bar above a paragraph still covers the bottom line of the element above it (the "Paragraph" label over the card's link). Every placement above an element covers what sits just above it, and the F-bar-01 rule only protects the selection, so changing this needs a placement decision first. It moves to [46 Where the edit bar sits on a phone](46-phone-edit-bar-placement.md), which asks Lex to choose in the Tuesday pack, together with the F-bar-01 waiver below. Until Lex accepts the move, this rule of 43 stays undecided, not dropped.
- Tests: `tests/page-structure-controller.test.ts`: "Text size chosen right after Bold, before the bar redraws, applies to the bolded source" and "Heading level chosen right after Bold, …" (each failed before its fix, passes after); "Text size applies when the latest source changed only inside the element"; "Text size refuses once the element's own start tag changed in place"; "Text size refuses once a new paragraph lands at its old place …" and "… once its paragraph swapped with the next …" (both failed on the first version of this fix); "Heading level refuses once its close tag changed"; "Text size refuses once the source after the element changed"; "Layout applies when the latest source changed only inside the block"; "Text size from a bar drawn before its element's start tag moved still refuses". `tests/native-save/native-edit-bar.spec.ts`: "on a phone › a Heading just added from the Blocks rail is selected with its bar in view" (also: the bar stays clear of the "Heading added … Undo" strip). `tests/native-save/native-text-size.spec.ts`: "Text size chosen in the same moment as Bold, before the bar redraws, applies with no refusal" (fails on the code before this ticket, passes after). Steps: `scripts/agents/shots/features/F-bar-01.json`, `F-bar-03.json`.
- Shots after the fix, 390 and 1280 px, light and dark (`kit shots --steps`, `RESULT: ok shots 14 files, 0 failed` for each): `.scratch/ux/am-43-builder/20261029/editor-F-bar-01-{390,1280}-{light,dark}-bar-strip.webp` and `editor-F-bar-03-{390,1280}-{light,dark}-size-strip.webp` (main checkout).
- Validation: `RESULT: ok unit 123/123 (6 files)`; `RESULT: ok specs 2/2 passed; 67 more run in kit pr` (affected); named specs `RESULT: ok specs 2/2 passed` (native-edit-bar, native-text-size); `npm run check` and `npm run lint` pass; `RESULT: ok size boot 342 KB (±0 KB) vs dev@9ff2b5a, budget 355 KB`; `RESULT: ok doctor 11/11 checks passed`.
- Feature list: F-bar-03's Good line now says the chosen size applies at once, also right after Bold, with no "source changed" refusal.
