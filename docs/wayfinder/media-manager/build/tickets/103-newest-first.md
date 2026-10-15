---
title: Newest first, and you can see what you just added
type: task (AFK)
status: open
assignee: claude (mm-103 runner)
blocked_by: []
builder: claude
phase: 6
---

## What

Fix from Lex's iPhone (Safari, preview editor): "When I upload an image, the image appears to disappear, even though it says it has been added. It may be added elsewhere in the media folder, so I'm not sure where to look. It would be nice if the images were ordered by date by default, with the most recent first, so you can verify that the added image's date is correct."

1. Find out why an added picture seems to vanish (default order in Media and the picker, active filter/collection/kind, family tiles with a different name, grid scroll) at phone width (390x844) and desktop.
2. Newest first is the default order everywhere media is listed (Media screen, the picker, Files-tab media if it lists them). Files without a date go after dated ones, then by name. The date shows in file details.
3. After adding (drop, Choose file, inside the picker, inside Replace) the new file(s) appear at the top, are scrolled into view and get a brief highlight. If a filter or collection would hide them, clear it or say "Added to ... - Show" with one tap. In the picker, the just-added file is selected so Use is one tap.

## Done when

- Unit tests cover the sort rule.
- Browser cases (phone and desktop): add, then the file is visible at the top and highlighted.
- Existing specs keep passing (order assumptions updated deliberately).
- New code is lazy; boot stays within budget.
- Before/after shots at 390 and 1280.
