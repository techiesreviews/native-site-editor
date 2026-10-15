---
title: Media tab count matches Clean up; Flip shows when it's on
type: task (AFK)
status: open
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
