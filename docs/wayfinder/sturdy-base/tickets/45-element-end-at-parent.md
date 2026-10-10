---
title: "An element's end stops at its parent's end tag, in both readers"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- An element's end tag lies before its parent's end tag too (walking up the parse, memoized): `markedRange` (page adapter, `locateNativeElementRange`, `wrapperAround`, card-source) and `readSource().range`. From Sol's reviews, `elementEnd` now also fails closed when a `</name>` sits in a comment, raw text or a start tag, or the content holds an end tag nothing inside opened (an ancestor's `</section>`); a start tag the browser cloned (adoption agency) has no range. `elementEnd` never gives a range the old one did not; across every fixture and starter page no element loses a range and two gain one.
- Visible: a `div` grid of `div` cards is a grid (Add card, Select card, Duplicate/Remove on the last card); a fact run inside the last card is a grid as in the others (native-cards.spec.ts:274 now clicks the heading link).
- Tests: contract +6 cases (nested same-tag ×3, end tag in comment/raw text/attribute, another element's end tag, cloned element; one updated), html-boundaries +1, site-head one message updated, `native-same-tag-cards.spec.ts`. `npm test` 1835, full native-save 873 passed + the adjusted spec, smoke and `@actual` green.

