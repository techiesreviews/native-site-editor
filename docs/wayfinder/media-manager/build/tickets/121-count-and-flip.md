---
title: Media tab count matches Clean up; Flip shows when it's on
type: task (AFK)
status: closed
assignee: claude (mm-121 runner)
blocked_by: [114-numbers-double-click-dates, 110-large-editor-fit]
builder: claude
phase: 8
---

## What

Found in the "after" audit shots on dev d7a46bf7 (`07-onebar-more-open-1280-light`, `12-manage-collections-390-light`, `24-large-editor-straighten-flip-768-dark`).

- The Media tab's count badge says 15 while More says "Clean up (10)"; on Manage collections the badge read 10, elsewhere 15, in the same session. Slice 114 aligned the Improve images count; slices 49/74 (and map ticket 11) define the badge. Find why the numbers disagree and flicker, give the badge and More's counts one source so they agree and stay the same across screens. If the agreed rule is badge = Clean up + Improve images, make that visible (More shows both counts that add up) rather than changing the rule.
- In the large editor, Flip (and any other toggle there) shows a clear pressed state with `aria-pressed`, consistent with slice 106's pressed styles, light and dark.

## Done when

- Unit tests for the count source; a browser spec that the badge equals the agreed sum on every Media screen; a spec for Flip's `aria-pressed` and look.
- Shots at 390, 768 and 1280, light and dark, before and after.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**The agreed rule stays.** Ticket 11 and slice 74: the Media tab's count is what Clean up suggests plus the pages and components Improve images would change. The rule was not changed; More already shows both counts that add up ("Clean up (10)", "Improve images (5)" → 15), and now a pointer's tooltip on the count says it too ("10 files to clean up and 5 pages with pictures to improve").

**Why the numbers disagreed.** Each use check published the badge twice: Clean up's count alone as soon as the files were known, then the sum once Improve images had read the picture bytes (seconds with the audit's 1.8 MB JPEGs). The audit reloaded before each shot, so a quick screen (Manage collections) caught the 10 and slower ones the 15. Once settled, every screen agreed.

**Behaviour.**
- One count source: the controller keeps one settled pair, Clean up's suggestions and Improve images' rows from the same check (`MediaCleanUpState.counted` + `improve`). The badge, More's "Clean up (n)" and "Improve images (n)" read only that pair, so they always add up. Clean up's screen still opens on the newest check at once; it never waits for Improve images.
- First check: no count shows until both parts are in (badge hidden, More says "Clean up" and "Improve images" without numbers), then all three appear together. A recheck keeps the last pair until the new one is complete; if Improve images' rows cannot be read the last rows stand rather than dropping to Clean up alone. An open More updates both labels when the counts settle.
- More's Clean up item takes its count from the pair and only its availability (and the reason it is off) from the newest check (review).
- Large editor: Turn and Zoom are actions; Flip is the only toggle. Both Flip buttons (side panel and the phone's tool row) carry `aria-pressed`, from `shownFlips` (the picture as shown, so a sideways turn flips the other stored axis, like `flipEdit`). Pressed is solid `--pressed` / `--on-pressed` (slice 106's tokens: action blue in light, light blue in dark), with its own hover and press shades; the phone row's label follows the button colour.

**Commits.** 9740a106 claim; 668addb1 build; dc862883 specs; 11d0adea review fix; this close.

**Tests.**
- Unit: `tests/media-clean-up-controller.test.ts` "the badge and More's counts come from one settled check" (no badge from half a check; More's counts sum to the badge after the first check, during and after a recheck, when Clean up drops to 0 mid-check, and when the rows cannot be read); `tests/media-badge.test.ts` (`cleanUpMenuItem` with no settled check and with one); `tests/image-large-rules.test.ts` "Flip's pressed state…" (turns 0/90/180/270, on and off). Unit 3490/3490 before the review fix, the three files 33/33 after; check and lint pass.
- Browser: new `tests/native-save/native-media-badge-sum.spec.ts` (the badge equals More's Clean up + Improve images on the gallery, Manage collections, To check, Recently removed, Adding settings, Improve images and Clean up, and has shown no other value since load; fails on dev's controller, which shows Clean up's count first). `native-image-popup.spec.ts` large-editor test: Flip side to side `aria-pressed` false → true (upside down stays false), solid `--pressed` / `--on-pressed` in light and dark, false again after Undo. Ran: badge-sum, image-popup (19), media-cleanup, improve-images, media-numbers, media-collections, explorer-size: all pass.
- Shots (fixtures/actual-starter, 390/768/1280, light and dark): `/tmp/mm-121-shots/before` (dev d7a46bf7) and `/tmp/mm-121-shots/after`: Manage collections straight after opening Media, More open with the badge, the large editor after Flip. In this smaller seed the race is too quick for the camera (both sets read 10 = 8 + 2); the spec's badge timeline is the evidence. Flip shows clearly on in the after set only.

**Review.** GPT-6.1 Sol, read-only (`.scratch/reviews/mm-121/`, run.log: gpt-6.1-sol, sandbox read-only, REVIEW_STATUS: complete). Fixed 1: P2, on a recheck where Clean up drops to 0 while Improve images is read, More's Clean up count dropped at once while the badge held the old sum → the count now always comes from the settled pair, with a unit case for 2→0. Rejected 0. Not re-reviewed (a one-function fix with its test).

**Bytes.** Boot unchanged (none of the touched code is in the boot chunk); budget 350 KB of 355 KB.
