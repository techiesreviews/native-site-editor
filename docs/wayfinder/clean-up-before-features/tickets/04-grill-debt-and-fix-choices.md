---
title: Decide the tech-debt and small-fix behaviour questions
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [02-research-debt-and-follow-ups]
---

## Question

For the items [Re-check the tech-debt notes and small follow-ups on today's code](02-research-debt-and-follow-ups.md) found still real, the choices a user would notice: for example, should Redo say "nothing to redo"; what should Discard do when nobody is signed in; are the preview preload and Page Structure limits acceptable or worth fixing. Which items are dropped (`wontfix`) and which go into the build plan?

## Comments

- 2026-10-22, round 1 with Lex. Lex: fix the items that are still real, not only note them. Lead closes as done or not reproducible: TD 04 (test server), the kit-wait, kit-preview and code-folding flakes, and `kit specs` for `server.ts`. `discardFile()` asking then doing nothing gets fixed.
  - Byte budget: keep it; rarely used code loads **when Media or the Pages and files manager is opened**.
  - GitHub stops answering while a site reopens: **retry automatically up to 3 times, then tell the user in the existing toast**.
  - Remembering the last site until sign-out: keep as is. When local folders are built, reopening should show the project overview instead (noted on the local-folders handoff).
  - Page Structure typing flicker: fix it.
  - "Nothing to undo/redo" for the keyboard shortcut: no (greyed buttons are enough); TD 11 becomes wontfix.
  - Media: search waits for a pause in typing, and a refresh redraws only changed tiles: both.
  - **New defect from Lex:** editing an image with the edit bar (for example zooming in and moving it to the side) redraws the image and it flickers. Goes into the plan as a diagnose-and-fix slice.
