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
