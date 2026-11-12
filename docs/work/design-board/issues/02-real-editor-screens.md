---
title: "Design board: the editor's real screens at 1280 and 390, light and dark"
status: closed
assignee: fleet-lead
blocked_by: [01-free-canvas]
---
# Design board 02: the editor's real screens (Orbit TOOLS-215, slice 2)

Lex (2026-11-12): "I want a full real experience of the designs we already have and use", approving the sketch with "html in canvas … so we have something realistic to work with, and use T3 Code annotations to make it work agentic". Approved sketch: fleet inbox `editor-TOOLS-215-design-canvas-sketch-approved-2026-11-12.html`.

## What
A Screens area on the catalogue board with the Editor: the whole workspace in frames at 1280 and 390, light and dark, each a live frame. It is drawn from the editor's own markup, moved from `src/workspace-mount.ts` into `src/workspace-shell.ts` so both draw from one source, and filled by the editor's own parts: the top bar with the project menu (on the phone its Menu and the pull-up sheet), Page structure (`createPageStructure`) on a sample page, the sidebar's resize handle, Pages & files under the page button (`mountDropdown`), and the canvas bar (`createCanvasBar`) around a sample site. Each frame is its own window, so the editor's phone rules apply at 390. The code pane shows the page's source as text (the code editor loads only in the editor), listed as untraced under Made of with the sample site. The top bar part draws from the same markup. Every element is the editor's own, with its ids and classes, and the frame's stage names its files, for T3 Code preview annotations.

## Done when
- The Editor card shows four live frames (1280 and 390, light and dark) of the editor's real workspace; rows, the page button, Publish's hover and the phone Menu work in them.
- The board's options (project, page, Menu open on the phone) reach the frames.
- The editor's boot stays within 355 KB and the editor looks as before.

## Done (2026-11-12)
- Feature list: no change (the catalogue board is a preview-only design tool, not an editor feature; docs/agents/features.md lists editor features only, in fixed areas; the editor itself is unchanged)
- Tests: tests/native-save/native-catalogue-board.spec.ts (two new tests); tests/catalogue-parts.test.ts (areas).
- Evidence: kit size boot 355 KB (±0 KB); kit shots editor and catalogue --compare dev show the editor unchanged.

### Follow-ups

- Validation gaps (gap): R3-6 still open: no unit test yet checks that `pageStorage()` also covers mock-ups as well as screens.
- Validation gaps (gap): R3-5 still open: `tests/catalogue-parts.test.ts:90` still checks only PARTS. The Editor screen's `madeOf` list (`top-bar`, `top-bar-phone`, `button`, `icon`, `inline-field`) is never checked against the files the screen actually loads.
- Validation gaps (gap): R3-4 still open: this round adds no test for rapid redraws. Still missing: one `#topbar-menu` in the 390 frame and one dropdown or explorer listener set in the 1280 frame after several quick `type()` calls.
- Validation gaps (gap): R3-4 (carried): rapid redraws. In the design-board Playwright spec, fill Project with five `type()` calls in a row and no settle in between. Then expect: the 390 frame to have exactly one `#topbar-menu` and one `#repository-menu > *`; the 1280 frame to have exactly one `.page-structure` tree; clicking `#explorer-toggle` in the 1280 frame to toggle `#explorer` exactly once (it opens and doesn't close at once from a leftover listener).
- Validation gaps (gap): R3-5 (carried): Editor screen `madeOf` traced to the code. In `tests/catalogue-parts.test.ts`, add a test for each screen. Collect the files it loads from screens.ts plus the transitive `import("../…")` calls in `src/catalogue/parts.ts` (for `fillTopBar` and `phoneTopBar`). For each `madeOf` id, assert that one of that part's `.ts` files is in the set, or is imported by a file in the set.
- Validation gaps (gap): R3-6 (carried): `pageStorage()` covers mock-ups. Add a unit test in `tests/catalogue-parts.test.ts`: `setItem` and then `getItem` on a mock-up's frame storage returns the value, and the parent's `localStorage` is left untouched.
- Validation gaps (gap): New, from this round's test (`tests/catalogue-parts.test.ts:152`): the new "names every editor file it draws from" test scans only screens.ts. Two files the screen draws from are reached only through `./parts`: `src/components/repository-menu` (through `fillTopBar`) and `src/components/top-bar-phone` (through `phoneTopBar`). They are listed today, but removing either from `files` would not fail the test. Extend the test to also scan `import("../…")` in `src/catalogue/parts.ts`, limited to the modules `fillTopBar` and `phoneTopBar` load, or assert those two paths by name.

