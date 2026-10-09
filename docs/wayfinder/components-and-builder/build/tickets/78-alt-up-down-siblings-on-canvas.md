---
title: "Alt+↑/↓ moves any block among its siblings on the canvas"
type: task (AFK)
status: open
assignee:
blocked_by: [39-alt-left-right-depth]
builder: sol
phase: 4
---

## What

From slice 39 (see its Done note): on the canvas Alt+↑/↓ still moves only Sections, but ticket 12 rule 11 says Alt+↑/↓ moves among siblings on the canvas and on Structure rows. Make Alt+↑/↓ move any selected block (Div, Heading, Paragraph, Image, Button, a card in an items slot) among its siblings on the canvas, one undo step each, with the same refusals as Structure. Also make the move status messages name the containers ("Moved out of Div (stack) into Section", "Moved into Div (grid)") using slice 33's labels.

## Done when

- Unit tests for the sibling move on the canvas path; the nightly move-keys spec covers Alt+↑/↓ on a Paragraph and a card on the canvas, with one undo each; the updated existing assertion still checks Sections.
