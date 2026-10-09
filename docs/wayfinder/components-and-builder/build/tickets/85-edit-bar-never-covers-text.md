---
title: "The edit bar never covers the text being edited"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From slice 42 (see its Done note, shot 2): the edit bar sits over the selected element's top edge, so it covers a heading while you type in it (on the page and in Edit component mode). Place the edit bar above the selected element with a small gap; when there isn't room above (top of the canvas, under the sticky site header or the mode's bar), put it below the element; never over the element's own text while it's selected or being edited. Keep its horizontal alignment and the existing narrow-width wrapping.

## Done when

- Unit test for the placement rule (above / below when no room / clamped to the canvas); nightly spec: selecting and editing the first heading of a page and of a template in Edit component mode leaves the heading's text box uncovered.
