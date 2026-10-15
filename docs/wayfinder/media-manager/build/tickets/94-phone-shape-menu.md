---
title: The shape menu fits on a phone
type: task (AFK)
status: closed
assignee: claude (mm-94 runner)
blocked_by: [44-social-image-popup]
builder: claude
phase: 3
---

## What

Follow-up from the stage-3 screenshots (`03-shape-menu-phone.png`). On a phone (390 × 844) the image popup's shape menu (Original, Square, 4:3, 16:9, Tall 4:5, Free; a component's shape first when there is one) drops down inside the bottom sheet's scrolling rows and runs under the sheet's pinned message and Done strip, so Free is partly covered and cannot be pressed.

- The whole shape menu is always visible and pressable, at any phone size (390 and 320 wide included): it opens under the Shape button when there is room, above it when there is not, and scrolls within the screen (clear of the safe areas) when neither fits. 44 px targets stay.
- The same check for the large editor's phone shape menu (a native menu) and the Social image popup (no shape menu, its label only).
- The bottom sheet, too short to show the shape menu, the focus dot and the preview at once, scrolls naturally and keeps the message and Done reachable.

## Done when

- A phone-size browser test (390 wide) in `tests/native-save/native-image-popup.spec.ts` opens the shape menu, finds every entry inside the screen and not covered, and presses Free.
- Screenshots before and after at 390 and 320 wide.
- Byte budget: boot delta zero (the popup is lazy).

## Done (2026-10-15)

- **Behaviour.** The image popup's shape menu is a manual popover on the top layer, anchored to the Shape button with CSS anchor positioning: under it when there is room, above it when not (`flip-block`), else centred on the screen and scrolling inside itself, clear of the top and bottom safe areas. The sheet's scrolling rows no longer clip it and its pinned message and Done no longer cover it; 44 px entries kept. Without anchor positioning it opens whole in the middle of the screen. On a touch screen a vertical swipe on the picture scrolls the sheet (was blocked: at 320 × 568 the picture filled the sheet's visible rows); a tap on the picture moves the dot on release, and the dot, the Free frame and its corners still drag. On short phones (≤ 480 px high, a small phone on its side) the 56 % sheet was all head, note and Done, leaving the picture no height: there it now takes the height and scrolls as one, message and Done stuck to its foot. Desktop popup unchanged. The large editor's phone shape menu is the phone's own native menu and the Social popup has no shape menu (its fixed label): both checked, no change needed.
- **Code.** `image-popup-view.ts`: the menu gets `popover="manual"` (open/close via `togglePopover`); touch presses on the picture wait for release. `image-popup.css`: `anchor-name` on the Shape button, the menu's anchoring and `@position-try --image-popup-menu-fit`, the well's `touch-action: pan-y`, the short-phone sheet rule.
- **Commits.** a48ad79a claim; 8020ccb1 build; f4ea97df review fix (short phones); e4d12c76 review round 2 (safe areas, tests); then this close.
- **Tests.** `native-image-popup.spec.ts`: a phone's shape menu is whole, uncovered, 44 px, Free pressed at 390 × 844, Square at 320 × 568, and at 320 × 280 the menu stays on screen, scrolls and Free is pressed; on a touch phone a swipe on the picture scrolls the sheet without moving the dot at 320 × 568 (rows) and 320 × 280 (whole sheet, message and Done uncovered), a tap moves the dot; the large editor's native Shape at 390 and 320 (44 px, Free/Square, Done on screen). `native-social-image.spec.ts`: the Social popup on a phone shows its fixed label, no menu, message and Done on screen at 390 and 320. The menu and swipe tests fail on origin/dev's popup files and pass with the slice. Ran `npm run check`, `npm run lint`, unit 3106/3106; native-image-popup + native-social-image 22/22.
- **Screenshots.** Before/after at 390 × 844 and 320 × 568 (sheet, shape menu, sheet scrolled, large editor), after also 1280 × 900 and 568 × 280: `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-94/{before,after}/` (default fixture, a JPEG placed through Replace).
- **Review (GPT-6.1 Sol).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-94/round-{1,2}/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` starts `REVIEW_STATUS: complete`; Sol's nested `codex exec` failed on the read-only sandbox, harmless). Round 1: no defects; gaps fixed (a short-screen menu case, which found the short-phone sheet problem; large editor and Social phone checks). Round 2 (on f4ea97df; a run started before that commit reviewed 8020ccb1 and was discarded): fixed 1 P2 (the scrolling fallback ignored the top safe area) and the 320 × 280 swipe gap. Rejected 1 gap: a non-zero top safe-area browser case; the editor's viewport meta has no `viewport-fit=cover`, so phones report zero insets to it, and the test browser has no inset emulation. Not re-reviewed after round 2: a small CSS change, browser-tested.
- **Bytes.** `test:budget` 349 KB gzip before first preview paint (budget 355 KB); boot +0 (only the lazy `image-popup` view and its CSS changed).
- **Follow-ups.** If the editor ever sets `viewport-fit=cover`, the sheet's own top edge should respect `safe-area-inset-top` too. Not validated: real iOS/Android touch, Safari's anchor positioning.
