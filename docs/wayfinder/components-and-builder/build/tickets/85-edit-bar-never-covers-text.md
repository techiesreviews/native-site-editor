---
title: "The edit bar never covers the text being edited"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From slice 42 (see its Done note, shot 2): the edit bar sits over the selected element's top edge, so it covers a heading while you type in it (on the page and in Edit component mode). Place the edit bar above the selected element with a small gap; when there isn't room above (top of the canvas, under the sticky site header or the mode's bar), put it below the element; never over the element's own text while it's selected or being edited. Keep its horizontal alignment and the existing narrow-width wrapping.

## Done when

- Unit test for the placement rule (above / below when no room / clamped to the canvas); nightly spec: selecting and editing the first heading of a page and of a template in Edit component mode leaves the heading's text box uncovered.

## Done (2026-10-09)

- The edit bar stands 8 px above the selection, below it when there is no room above (the canvas top, or under the page's sticky header: the old "pinned over the selection's top" is gone), and only when neither fits is it clamped to the canvas edge covering less of the selection; the sticky header stays clear. The rule is `src/components/edit-bar-placement.ts`. While text is typed (or restored by Escape) the runtime redraws the selection box and reports its rectangle, so a heading that wraps stays clear.
- Commits 93ea5e1d, 7d2ed8cd, 174256b3. Unit tests `tests/edit-bar-placement.test.ts` (9); nightly spec `native-edit-bar-clear.spec.ts` (first heading of a page and of a template in Edit component mode, typed into and Escaped, at 1440 and a narrow wrapping width); `native-edit-bar-inset.spec.ts` updated to the below placement.
