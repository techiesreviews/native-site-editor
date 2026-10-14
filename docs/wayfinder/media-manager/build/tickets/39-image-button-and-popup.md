---
title: The Image button and the image popup
type: task (AFK)
status: in-progress
assignee: claude (mm-39 runner)
blocked_by: [38-place-shape-and-focus, 18-media-picker]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Entry point and popup"; design [crop-popup.html](../../prototype/crop-popup.html) and its validation notes.

- One **Image** button with an image icon in the edit bar, where Choose image… is today, with a small state badge ("Square", "Card's shape", "Trimmed"). No separate Crop or Focus button.
- The popup: the whole picture with the shape menu (Original, Square, 4:3, 16:9, Tall 4:5, Free) and a draggable focus dot with the place's frame drawn over it; **Replace** under the picture (opens the picker); small live phone and computer previews; the one-line message: blue "Only changes this spot" or yellow "Saves a new picture for this spot"; **Done**.
- Nothing is kept until Done; ✕ or Escape cancels everything, a replacement included. Done is one Undo step.
- Beside the picture on wide screens, below the bar when there is no room; a bottom sheet with 44 px targets on phones. Follows the editor's light or dark look. Arrow keys move the dot.
- Replace keeps the shape, resets the focus to the middle and drops a trim with a short note.

## Done when

- `@smoke` `tests/native-save/native-image-popup.spec.ts`: select a starter image, Image → Square, move the focus dot, Done; the page has the shape and `object-position`; Undo restores.
- Nightly: Escape cancels a Replace; arrow keys move the dot; phone width shows a bottom sheet.
