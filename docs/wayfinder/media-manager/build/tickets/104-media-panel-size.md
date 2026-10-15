---
title: The Media panel fills the height, keeps one size, pins its actions
type: task (AFK)
status: open
assignee: claude (mm-104 runner)
blocked_by: [89-ux-ui-audit]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#c1-panel-size-position-and-stability-all-widths), finding C1. Look only; no behaviour changes.

- The explorer panel runs from under the top bar to 16 px above the window's bottom edge at every width, for Pages, Media and Files. Today `#explorer-media { block-size: min(55dvh, 560px) }` (`src/components/pages-tree.css:200`) and `.explorer #files { max-height: 40dvh }` (`src/style.css:847`) cap it at about 540 px on a 1280×800 screen.
- All three tabs share Media's width (`min(1040px, 100vw - 32px)`), so switching tabs never resizes the panel.
- The gear moves into the tab row's end as a 44 px icon button. The 50 px band above the tabs goes (`.explorer-settings`, `src/style.css:900`).
- The One bar sticks under the tabs while the grid scrolls (`position: sticky` on the panel colour).
- Every media sub-screen's final action row (Remove N files, Replace everywhere, Save details, Fix all, New collection, Keep/Remove) is sticky at the bottom with a 1 px top line, so it is never cut off.
- 768: the top bar stays one row when Publish shows a count (the page button shrinks first), and the panel's top follows the bar's real bottom edge, so it never covers Publish.
- The page button shows an 8 px dot, not the Media count ("Home 12" reads like a page count). The count stays on the Media tab (map ticket 10).

## Done when

- At 390, 768 and 1280 the panel reaches the bottom; switching Pages, Media and Files keeps the same box; no action row is cut off in A-09, A-12, A-18, A-20, B-03 or B-06; at 768 Publish is never covered.
- A browser spec checks the panel's height and that the bottom action row is inside the viewport at 1280×800 and 390×844.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
