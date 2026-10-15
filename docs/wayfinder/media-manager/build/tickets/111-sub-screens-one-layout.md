---
title: The sub-screens share one layout
type: task (AFK)
status: closed
assignee: claude (mm-111 runner)
blocked_by: [104-media-panel-size, 105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#to-check-a-15-and-agent-facing-text): Clean up, Recently removed, To check, Improve images and Manage collections.

- One header: ← icon button and title (Manage collections loses "Back to grid"); at most one helper sentence under it.
- Rows run full width; row actions are right-aligned at the panel edge. Row actions are secondary or text buttons; the screen's one primary sits in the pinned bottom row (slice 104).
- To check: "Looks right" (secondary) and "Edit" (text); helper "An agent wrote these. Check they read right."
- Clean up: the review uses the media grid (3 columns on phone) with each file's size; a ticked tile keeps its full picture with an inset 3 px ring (no white or black band); the group page says "Files used only from outside the site? Mark them Always keep." and the title shows what all groups free ("Clean up · 271 KB"); the confirm's primary uses the standard primary colour.
- Recently removed: Restore is a secondary button; one sentence, "Removed files stay here for 30 days."
- Improve images: Fix is a 36 px secondary button; row text "4 pictures · lighter copies for phones"; 20 px checkboxes with the theme's `accent-color`.
- Manage collections: one ⋯ menu per row (Rename, Delete last in red); keyboard hints hidden on touch (`pointer: coarse`) here and in the Media footer.

## Done when

- Specs updated for the renamed buttons and the ⋯ menus; the Clean up review at 390 shows three tiles per row.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour (look and words only).**
- **One layout.** Clean up, Recently removed, To check, Improve images and Manage collections (with its Name and Delete screens) share one header from `sheetHead()` (`media-library-sheet.ts`): a ← Back icon button, the title, and at most one helper sentence.
- **Full screens.** Every sheet with a `data-mode` is now a full screen. One `[data-mode]` rule in `media-picker.css` replaces the three copied mode lists, and Improve's and Clean up's own copies are gone. So Manage collections is no longer a side sheet at 1280 (left from slice 104).
- **Rows and buttons.** Rows run full width (To check lost its 760 px cap). Row actions sit at the row's end as 36 px secondary or text buttons, each with a 44 px hit area. Pinned action rows are right-aligned. In sub-screens, secondary buttons have a 1 px `--control-line` edge and sit on `--surface-card`, so in dark mode they are a step lighter than the panel.
- **To check.** **Looks right** (secondary) and **Edit** (text). Helper: "An agent wrote these. Check they read right." While editing, Save is secondary and Cancel is text. "press OK" became "Looks right" in File details' and video's by-agent lines and in the editing refusal.
- **Clean up.** The review is the media grid. Its tiles reuse the grid's tile classes, and the sheet also answers `media-browse` container queries, so it shows 3 across on phones, 4 on tablets and 6 wide. Each tile has its name and the size it frees. A ticked tile keeps its full cover picture inside a 3 px inset ring. The group page says "Files used only from outside the site? Mark them Always keep.", and its title names what all groups free ("Clean up · 145 KB", pure `cleanUpTitle()`). Keep files is an edged secondary, and the primary is the standard one.
- **Recently removed.** "Removed files stay here for 30 days." Restore is secondary.
- **Improve images.** The row text is plain (`improveRowLine()`: "4 pictures · lighter copies for phones", "On 97 pages · 1 picture · lighter GIFs"). An opened picture line no longer adds "size details", and a picture with only size details reads "Faster loading". Fix is an edged 36 px secondary, so Fix all is the one primary. Ticks are 20 px in `accent-color: var(--primary)` on touch too. Helper: "Open a row to choose which pictures change."
- **Manage collections.** Each row has one ⋯ menu ("More for <name>": Rename…, then Delete… in red, using slice 108's `danger` menu item). Back on the Name or Delete screen returns focus to the row's ⋯. Cancel comes before the primary. More's "Delete collection" is red too.
- **Keyboard hints.** The Media footer's hints ("Enter opens details · Arrow keys browse") hide under `pointer: coarse`. Manage collections, now a full screen, no longer shows the footer.
- **Lead's extra: Files drag into code at 1280.** Once a Files row's drag leaves the explorer, the box steps aside (`.explorer.is-stepping-aside`: `pointer-events: none`, opacity 0.15), so the code under it takes the dropped path. Inside the box, rows still take drops to move files. The box comes back just after the drop is handled (the next task, because Monaco finds its drop position by what lies under the pointer) or on dragend (cancel or a drop nowhere). `stepAsideWhenOut()` is in `file-row-actions.ts`.

**Commits.**
- a4005905: claim.
- 2c4a4c39: build.
- 5acb6e2b: restore after the drop; dark secondaries on the card surface.
- 65970da7: review test.

**Tests.**
- **Unit.** `improve-images-words.test.ts` covers row lines (count by picture, unticked pictures, details only, components, GIFs, players, outside pictures, all left as they are). `media-clean-up-review.test.ts` covers `cleanUpTitle` (sum, a file counted once, unknown sizes, empty).
- **Browser specs.**
  - `native-media-cleanup.spec.ts` has a new 390 test: three tiles a row, square tiles, the 3 px inset ring, the picture filling its tile, and Review removal in view. It also covers the title with size, the new helper, and the tile size.
  - `native-media-collections.spec.ts`: the ⋯ menu's items and order, red Delete…, Back from Delete returning focus to ⋯, and Back replacing "Back to grid".
  - `native-improve-images.spec.ts`: new row text, Fix at 36 px with a solid border and not primary, 20 px tick.
  - `native-monaco-features.spec.ts`: the Files-row drop runs at 1280 through the stepping-aside box. A new test drags out and lets go where nothing takes it; the box comes back, the source is unchanged and the tabs answer.
  - Updated: `native-media-screen` (Looks right), `native-explorer-size` (Back), `native-mcp-media` (comment).
- **Runs.**
  - `npm run check`, `npm run lint`, unit 3442/3442.
  - The 16 touched specs: 153/154, where the one failure was the drop test, then fixed.
  - After rebasing on slice 108: 12 media specs 119/120 plus the drop tests 2/2. The drag tests also passed 6/6 with CI fonts (`--repeat-each=3`).
- **Flaky on dev, not this slice.** The one failure, "the Media tab counts unused files… Dismiss hides the count", waits only 15 s for the use check after a reload (its menu still says "Still checking which files are used."). On a clean `origin/dev` worktree it failed 1 of 3 (`--repeat-each=3`); on this branch it passed 3/3.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-111/before/` (48) and `.../after/` (54). They are on the real starter seeded with 11 pictures, 4 collections, two agent descriptions and one Clean up removal, at 390, 768 and 1280, light and dark. The screens: Manage collections, its ⋯ menu (after only), To check, Recently removed, the Improve list and an opened row, and the Clean up groups, review and confirm. Scenario: `.scratch/shots111.spec.ts` in the slice worktree, run by `scripts/agents/shots.sh`.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-111/`; run.log shows model gpt-6.1-sol, sandbox read-only). It found no Spec or Standards defects. Its one validation gap, a cancelled drag, was added as a test. Nothing was rejected, and the fix was a test only, so there was no second review.

**Bytes.** Boot is 348 / 355 KB before first preview paint. Boot entry gzip vs the merge base: JS +100 B and CSS +32 B (the drag step-aside and its rule). Everything else is in the lazy media chunks.

**Follow-ups.**
- `worker/site-conventions.ts` still tells agents the user "presses OK" in To check. It must match the starter's AGENTS.md (the `agents-md-drift` unit test), so changing it to "Looks right" is a starter slice plus a fixture refresh.
- `media-adding-settings.css` still has its own copy of the full-screen rules, now redundant with `[data-mode]`. It was left for slice 112, which owns that screen.
- Slice 118 builds "Leave alone everywhere" on the opened Improve rows. The row actions are `.media-improve__top > .secondary` (36 px), and the per-picture tick is the 44 px `.media-improve__tick`.
