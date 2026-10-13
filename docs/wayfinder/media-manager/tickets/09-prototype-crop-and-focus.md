---
title: Prototype crop and the focus point
type: prototype (HITL)
status: open
assignee: Lex + claude (prototype)
blocked_by: [03-research-responsive-output-crop-focus, 06-prototype-media-manager-look]
---

## Question

How do crop and the focus point look and behave? The focus point is set in the edit bar for each place an image is used (settled). Mock up (published with `html_render`): setting the focus point on a selected image (a dot to drag, a live preview at phone and desktop widths), and cropping (fixed shapes such as square, 4:3, 16:9, free). Decide with Lex: is crop done in the manager to the file (a new file), or per place in the edit bar like the focus point? Does rotate come with crop? What happens to a crop when the image is replaced? How do they show on images inside components?

## Comments

- 2026-10-13, Lex: **Direction C, one Crop button.** Compared in [crop-focus.html](../prototype/crop-focus.html) (three directions; screenshots published with `html_render`, title **Crop and focus point: three ways**, attachment `467210bd-87f6-413e-ad59-a3bf99c7f93c-fea21176-9f23-4a0b-9c27-521a03c7eaf5-html`). The edit bar has one Crop button per place, showing the current state. Choosing a shape and moving the picture within it changes only that place (no new file). Trimming freely, zooming in or turning saves a new picture in Media used only by that place; other places keep the original. A live message says which of the two is happening. Rejected: A (shapes and focus only, no trimming or turning) and B (trimming and turning in Media).
- 2026-10-13, Lex: **On replace, keep the shape and re-centre.** Replacing the picture in a cropped place keeps that place's shape, resets what stays in view to the middle, and drops any trimming or turning made for the old picture. A short note says so, with Crop available to adjust. Rejected: starting with no crop, and asking each time.
- 2026-10-13, Lex: **Re-cropping updates the earlier trimmed picture when only that place uses it.** Crop reopens from the full original with the earlier trim restored. On Done, the earlier trimmed picture is replaced if no other place uses it; otherwise a new trimmed picture is made so the other place does not change. Rejected: always saving another copy. (Build note: write the new trim under a fresh name and remove the old one, rather than overwriting the same address, so visitors' cached copies cannot show the old trim.)
- 2026-10-13, Lex: **Components start on their own shape.** When a component already gives its picture a fixed shape, Crop opens on that shape, labelled for example "Card's shape (4:3)". Other shapes stay available, with a small note that this item will then look different from the others. Rejected: locking the shape, and treating it like any other picture.
