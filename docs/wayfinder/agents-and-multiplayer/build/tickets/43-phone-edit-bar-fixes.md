---
title: "The edit bar on a phone: opens on a new element, and Text size applies (found on dev by 42's UX check)"
type: task (AFK)
status: ready-for-human
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
- **Deferred, needs Lex's sign-off (not yet given):** "the bar never covers the element above it" (Decided behaviour) is not built. At 390 px the bar above a paragraph still covers the bottom line of the element above it (the "Paragraph" label over the card's link). Every placement above an element covers what sits just above it, and the F-bar-01 rule only protects the selection, so changing this needs a placement decision first. It moves to [46 Where the edit bar sits on a phone](46-phone-edit-bar-placement.md), which asks Lex to choose in the Tuesday pack, together with the F-bar-01 waiver below. So this ticket stays open as `ready-for-human`, not closed: the fixes above land now, and 43 closes once Lex chooses the placement in 46 (built there) and accepts or rejects the F-bar-01 waiver.
- Tests: `tests/page-structure-controller.test.ts`: "Text size chosen right after Bold, before the bar redraws, applies to the bolded source" and "Heading level chosen right after Bold, …" (each failed before its fix, passes after); "Text size applies when the latest source changed only inside the element"; "Text size refuses once the element's own start tag changed in place"; "Text size refuses once a new paragraph lands at its old place …" and "… once its paragraph swapped with the next …" (both failed on the first version of this fix); "Heading level refuses once its close tag changed"; "Text size refuses once the source after the element changed"; "Layout applies when the latest source changed only inside the block"; "Text size from a bar drawn before its element's start tag moved still refuses". `tests/native-save/native-edit-bar.spec.ts`: "on a phone › a Heading just added from the Blocks rail is selected with its bar in view" (also: the bar stays clear of the "Heading added … Undo" strip). `tests/native-save/native-text-size.spec.ts`: "Text size chosen in the same moment as Bold, before the bar redraws, applies with no refusal" (fails on the code before this ticket, passes after). Steps: `scripts/agents/shots/features/F-bar-01.json`, `F-bar-03.json`.
- Shots after the fix, 390 and 1280 px, light and dark (`kit shots --steps`, `RESULT: ok shots 14 files, 0 failed` for each): `.scratch/ux/am-43-builder/20261029/editor-F-bar-01-{390,1280}-{light,dark}-bar-strip.webp` and `editor-F-bar-03-{390,1280}-{light,dark}-size-strip.webp` (main checkout).
- Validation: `RESULT: ok unit 123/123 (6 files)`; `RESULT: ok specs 2/2 passed; 67 more run in kit pr` (affected); named specs `RESULT: ok specs 2/2 passed` (native-edit-bar, native-text-size); `npm run check` and `npm run lint` pass; `RESULT: ok size boot 342 KB (±0 KB) vs dev@9ff2b5a, budget 355 KB`; `RESULT: ok doctor 11/11 checks passed`.
- Feature list: F-bar-03's Good line now says the chosen size applies at once, also right after Bold, with no "source changed" refusal.

### Follow-ups

- Spec (P2): 7c57a96b6:docs/wayfinder/agents-and-multiplayer/build/tickets/43-phone-edit-bar-fixes.md:49 — P2 ticket: One Decided behaviour item is not built: "the bar never covers the element above it". Because of that, the Done when item "the UX check for F-bar-01 and F-bar-03 at 390 px light and dark shows them fixed" is also not met. The dark case from Goal 2 ("the bar covers the link above") still shows in the 390 px shots. The author says so openly. They moved it to HITL ticket 46 (choices A/B/C, no default) and set 43 to `ready-for-human` rather than closing it. Taken alone this would be P1. It is P2 because nothing in the change claims it is done. Fix: none in this slice. 43 must not close until Lex picks a placement in 46 and the 390 px light/dark shots show the bar clear of the element above.
- Spec (P3): 7c57a96b6:docs/wayfinder/agents-and-multiplayer/build/tickets/43-phone-edit-bar-fixes.md:41 — P3 ticket: The Done when item "Unit or spec tests for both faults fail before the fix" is waived for F-bar-01, because there was no app fault (the old check selected `main`). The reasoning holds. The evidence backs it: the corrected step fails when run the old way (`expect visible "Bold" failed`). The waiver is still Lex's call and has not been accepted yet. Fix: keep it in 46's question to Lex, as already written. No code change.
- Standards (P3): 7c57a96b6:tests/native-save/native-edit-bar.spec.ts:309 — P3 race: `barBox` is measured before the "Heading added … Undo" strip has shown (line 314 waits for the strip later). If the bar moves when the strip appears, the "apart" check at lines 316–318 compares a stale bar box with the strip's new box. It could then pass, or fail, on a layout that isn't the final one. Rule: CODING_STANDARDS.md › Browser specs, "Wait on observable state". Fix: first `await expect(strip).toContainText("Heading added")`, then take both `barBox` and `stripBox`. Or poll the overlap check with `expect.poll`.
- Validation gaps (gap): Layout has only an "applies" unit test for the new latest-source path (`tests/page-structure-controller.test.ts`, "Layout applies when the latest source changed only inside the block"). There is no refusal test. Add "Layout refuses once the block's own start tag changed": draw the bar on `<main><div class="flow"><p>A</p></div></main>`, use `typeInto` to set `<div class="flow" id="x">…`, call `layout.onChange("cards")`, and assert the page is unchanged and the notice is "The source changed. Select the element again and try again." Without it, a later edit to `blockLayoutEdit`'s call site that drops `own.tag` would go unnoticed.
- Validation gaps (gap): Text size after Bold is only tested for choosing a size (`"l"` / `"text-large"`). Nothing covers choosing "Default" after Bold on a paragraph that already has a size. `textSizeEdit` builds a different edit there (it removes the class or style). Add a unit test: start from `<main><p style="font-size: 1.25rem">Hello world</p></main>`, press `bold.onPress()`, then `size.onChange("default")`, and assert the result is `<main><p><strong>Hello</strong> world</p></main>` with no notices.

