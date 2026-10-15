---
title: The shape menu fits on a phone
type: task (AFK)
status: open
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
