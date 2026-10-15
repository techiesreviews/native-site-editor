---
title: The Media panel fills the height, keeps one size, pins its actions
type: task (AFK)
status: closed
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

## Done (2026-10-15)

- **Behaviour (look only).** The explorer is one box for Pages, Media and Files: `min(1040px, 100vw - 32px)` wide, from the top bar's real bottom edge (`anchor-name: --topbar`) to 16 px above the window's bottom, centred; switching tabs never resizes it. Without CSS anchor positioning, `mountDropdown`'s new `below` option places it the same way (review fix). The Pages and Files lists fill the box and scroll inside (`.pages-tree` and `.explorer #files` lose their 46dvh/40dvh caps; `#explorer-media` loses `min(55dvh, 560px)`). The gear is a 44 px icon button at the end of the tab row (`.explorer-head`); the 50 px band is gone. In the Media pane the One bar sticks under the tabs on the panel colour, and every sub-screen's last action row (`.media-cleanup__footer`, `.media-detail__foot`, and the sheet's `.media-remove__actions` / `.media-library__sheet-actions`) is sticky at the bottom with a 1 px top line; Manage collections' New collection now sits in such a row. At tablet widths (≤1050 px) the top bar's side columns size to their content, so Publish with a count stays on the first row and the page button shortens first. The page button shows an 8 px dot instead of the count; the number stays on the Media tab.
- **Commits.** 0422eba6 claim; 12a18f82 claim status; 335876c0 build; ca1a0bfa review fix (no-anchor fallback) and the media specs' new size rules; c58511f3 the Files-row drop spec in a wide window.
- **Tests.** New `native-explorer-size.spec.ts`: at 1280×800 and 390×844 the box ends 16 px above the bottom, sits under the top bar and is identical on all three tabs; the Pages and Files lists fill it; the gear shares the tab row at 44 px; the One bar stays in view after scrolling; Save details, New collection, Review removal, Keep files and Remove N files are fully in the viewport; the page button's dot is 8×8 with the number on the Media tab. At 768×1024 with a Publish count, Publish is level with the page button and the box starts below it. Updated: `native-media-tab.spec.ts` (narrow pane ends inside the box; "Media fills the height under the top bar on desktop" replaces the old ≤495 px / above-700 rule), `native-media-screen.spec.ts` (Save is pinned in view; scrolled to the end it follows the fields), `native-monaco-features.spec.ts` (the Files-row drop runs at 2000 px wide, where the code's first line shows beside the box). `npm run check`, `npm run lint`, unit 3424/3424; full suite 1065 passed, 1 failed (that drop test, then fixed and passing); after rebasing on slice 114 the four touched specs pass 61/61.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-104/before/` and `.../after/` (main checkout, not committed): 11 states (page button, Pages, Media scrolled, Files, List view, Manage collections, Clean up review and confirm, Improve images, File details, Replace everywhere confirm) at 390, 768 and 1280, light and dark, on the real starter with 44 seeded files; `geometry.json` in each. After: every open panel ends at the viewport minus 16 px, no action row is cut off, Publish is never covered.
- **Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-104/`). Fixed 1: the no-anchor fallback still hung the explorer from the page button. Validation gaps added: Pages/Files fill, New collection in view. Not added: a no-anchor browser case (Chromium cannot turn CSS anchor positioning off, and the suite has no Firefox project); Improve images and Replace everywhere rows are covered by the shots' geometry rather than the spec (their setup needs heavy JPEGs and the picker). The fix was small, so no second review.
- **Bytes.** 347 / 355 KB before first preview paint; boot entry +138 B gzip (CSS +95, JS +43, replaced rules and the fallback option); lazy media CSS about +108 B.
- **Follow-up for the lead.** With one 1040 px box for every tab, the open Files tab covers the code editor below about 1700 px of window width, so dragging a Files row into the code to insert its path needs a wide window (or the code pane visible beside the box). Manage collections at 1280 is still a side sheet beside the grid; slice 111 owns its layout.
