---
title: "Card copies on the source tree: card-grid's elementTree, plainText and slot scan go"
type: task (AFK)
status: closed
assignee:
blocked_by: [41-card-tree-fill-and-swap, 42-card-tree-page-paths, 45-element-end-at-parent]
builder: sol
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (sections 2.1 rows P5, P11-P13, P15, 2.3.5, 6, 10.1).

- `card-grid.ts`: `elementTree` and its `SourceElement`, `RAW_TEXT`, `plainText`, `decodeEntities`, `allElements`, `attribute` (61-146, 175-186) go; `textLeaves`, `titleLeaf`, `itemTitle`, `itemCopy`, `itemFill`, `pageBodyCopy`, `leafSummary` read a `readSource` tree and require `exact` where `elementTree` was required (not only the outer `range`). `slotFallbacks` (476-487) reads `templateSlots`. `aOr`, `itemNoun`, `insertAfterEdit`, `ownLines` keep their exports (26 imports `aOr`).
- `withTitle` (259, used at 297 and 438) matches the decoded old title inside each decoded text run and replaces that run's source span (offsets through `textRangeInSource`).
- `card-fill.ts` `itemPageFill` (299-328): one `readSource` of the card instead of `elementTree` + `parseSource`; the `itemPlainText` import goes. `cards.ts`: `cardMarkup`, `subpageDocument`, `canFill` (310) and `tagOf` (343) on the tree; `itemElement` (card-source 161-165) goes.
- Behaviour, if the lead agrees: T5 Add card's copy writes a slot fallback's text as the browser shows it and takes a fallback holding a nested slot whole. Without a decision, keep today's fallback text.

## Done when

- `rg "elementTree|function plainText|function decodeEntities|indexOf\(\"</slot\"" src/page-builder` finds nothing outside source-tree.ts and component-model.ts.
- `tests/card-grid.test.ts`'s `elementTree`/`plainText` uses go through `readSource` (replace, don't layer), plus: a fallback `Caf&eacute;`, a nested slot's fallback, `withTitle` with a title written with references, with formatting in the title leaf, and with another spelling of the same character in kept text; `<div><span>A</div>` still refused.
- `native-cards`, `native-add-card*`, `native-card-paths*`, `native-slot-change-pages-actual` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.

## Done (2026-10-11)

- card-grid's `elementTree`, `SourceElement`, `RAW_TEXT`, `plainText`, `decodeEntities`, `allElements`, `attribute` and card-source's `itemElement` go. `textLeaves`/`titleLeaf`/`itemTitle` read any `SourceTree`; `itemCopy`, `itemFill`, `pageBodyCopy`, `leafSummary`, `itemPageFill`, `canFill`, `fillFrom` read `readSource` and require `exact`; `tagOf` reads the tree. `withTitle` matches the decoded title per text node and maps it back through `textRangeInSource` (new optional decoder; `decodeHtmlEntity` split out of `decodeHtmlEntities`), keeping the unmatched rest of a reference. `slotFallbacks` reads the template's tree (first non-empty fallback per decoded name, own properties only; `fallbackFor` reads them, so a slot named `constructor` no longer throws, also a dev bug). Built T5 and T4's rest: sibling titles come from the page tree, so a sibling card with an implied end keeps its title. Commits a1d455c8 (Sol built, Claude fixed an import cycle and the old-title scope), 63135a8f, 697bcd41 (Sol's review findings).
- Tests: card-grid +13 (references in fallbacks, nested slot fallback, `withTitle` ×5 spellings incl. formatting, partial and shared references, empty-first and prototype-named slots, `<div><span>A</div>` refused by every copy, pre's dropped newline ×3, peer title with an implied end), card-fill +2, cards-controller +3 (peer with implied end on the grid, links and Pages-tab paths). `npm test` 1956; full native-save 887 passed, 0 failed; smoke 42, @actual 54. Budget −487 B gzip total.
