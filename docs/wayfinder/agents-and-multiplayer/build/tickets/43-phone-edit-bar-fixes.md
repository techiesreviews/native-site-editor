---
title: "The edit bar on a phone: opens on a new element, and Text size applies (found on dev by 42's UX check)"
type: task (AFK)
status: open
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
