---
title: "An element's end stops at its parent's end tag, in both readers"
type: task (AFK)
status: open
assignee:
blocked_by: [40-source-tree-module]
builder: claude ★
phase: 4
---

## What

Found in slice 40. Both readers (`readSource` and `readPage`) find an element's end the way the existing page reader (range lookup in `src/native-source-location.ts`) does, so an element that is the last child of a parent with the same tag name (`<div class="grid"><div class="card">…</div></div>`) gets no range. In production today the last `div` card in a `div` grid has no source range; card-grid's `elementTree` still has one, so slice 43 would lose it.

- Find the end by walking the parse, so it stops at the parent's own end tag; one fix used by both readers and by the existing page range lookup.
- Lead decision (2026-10-10): this is a bug fix; the element's range is the one the browser reads.

## Done when

- Contract and parity suites (`tests/source-tree*.test.ts`) gain nested same-tag cases (`div>div`, `section>section`, three deep, last and not-last child) on both readers, and each has a range.
- A browser spec selects and edits the last `div` card in a `div` grid (e.g. its heading through the edit bar) and the write lands in that card.
- `npm run check`, `npm test`, full `native-save` suite, smoke and `@actual` green (this changes shared range lookup).
