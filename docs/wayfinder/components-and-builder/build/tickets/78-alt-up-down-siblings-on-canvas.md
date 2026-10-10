---
title: "Alt+↑/↓ moves any block among its siblings on the canvas"
type: task (AFK)
status: closed
assignee:
blocked_by: [39-alt-arrow-depth-keys]
builder: sol
phase: 4
---

## What

From slice 39 (see its Done note): on the canvas Alt+↑/↓ still moves only Sections, but ticket 12 rule 11 says Alt+↑/↓ moves among siblings on the canvas and on Structure rows. Make Alt+↑/↓ move any selected block (Div, Heading, Paragraph, Image, Button, a card in an items slot) among its siblings on the canvas, one undo step each, with the same refusals as Structure. Also make the move status messages name the containers ("Moved out of Div (stack) into Section", "Moved into Div (grid)") using slice 33's labels.

## Done when

- Unit tests for the sibling move on the canvas path; the nightly move-keys spec covers Alt+↑/↓ on a Paragraph and a card on the canvas, with one undo each; the updated existing assertion still checks Sections.

## Done (2026-10-10)

- Alt+↑/↓ on the canvas (and from the edit bar, focus in the bar or on the name handle) steps any selected non-Section block among its siblings through the same rule as Structure rows (`nativeElementKeyMove`, one guarded helper `moveNativeBlock` in `main.ts`): same refusals, nothing at the ends, one undo step, the block stays selected; items-slot children step among their slot's own items. Sections keep `moveNativeSection`; no move buttons for non-Sections; template parts in Edit component mode don't step (as on their Structure rows). Move messages name the containers with slice 33's labels (`nativeElementMoveMessage`): "Moved out of Div (grid) into Section", "Moved into Div (grid)", "Moved up in Section work".
- Commits "Alt+Up/Down moves any block among its siblings on the canvas (slice 78)" (built by Sol), "Edit bar: selects and text fields keep their Alt+arrows (slice 78 review)". Budget: about +0.9 kB gzip emitted JS (one port, `moveBlock`).
- Tests: `tests/native-move-choices.test.ts` (messages, the key-move rule for Paragraphs and items-slot cards); nightly `native-move-keys.spec.ts` (canvas Paragraph and a `section-work` card, one undo each; Section assertions kept; new messages), `native-edit-bar-label.spec.ts` / `native-edit-bar-groups.spec.ts` (children now step from the bar, one undo), a bar select keeps Alt+Down.
