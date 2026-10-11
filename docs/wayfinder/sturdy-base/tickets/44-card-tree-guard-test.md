---
title: "Guard test: card files read HTML through the source tree only"
type: task (AFK)
status: closed
assignee:
blocked_by: [41-card-tree-fill-and-swap, 42-card-tree-page-paths, 43-card-tree-copies]
builder: sol
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (section 8). A unit test (TypeScript compiler API, as slices 18 and 34) that fails when a card file (`src/page-builder/card-*.ts`, `src/page-builder/cards.ts`):

- imports `parseMarked`, `markedRange`, `locateNativeElement*`, `elementPathAt`, `parseSource`, `nativeOutline`, `startTags`, `startTagAttribute(s)`, `decodeHtmlEntities`, `decodedText` or any `plainText`;
- calls `querySelector*`, `innerHTML`, `DOMParser`, `textContent`, `getAttribute`;
- with an allowlist (file + reason): card-slot's `nativeInstanceInsertEdit` (the engine writes), cards.ts's `isSectionTemplate` (section-ness of a template).

## Done when

- `tests/card-tree-guard.test.ts` green on dev, with a deliberately broken fixture showing each rule fires.
- `npm run check`, `npm test` green.

## Done (2026-10-11)

- `tests/card-tree-guard.test.ts` scans `src/page-builder/card-*.ts` and `cards.ts` (directory listing) with three rules: `reader-name` (any reference to or declaration of `parseMarked`, `markedRange`, `locateNativeElement*`, `elementPathAt`, `parseSource`, `nativeOutline`, `startTags`, `startTagAttribute(s)`, `decodeHtmlEntit*`, `decodedText`, `decodeEntit(y|ies)`, `plainText`, `elementTree`), `dom-read` (`querySelector*`, `innerHTML`, `outerHTML`, `innerText`, `textContent`, `getAttribute*`, `DOMParser`, `createContextualFragment`) and `reader-module` (value imports, re-exports and dynamic imports from html-source, native-source-location, native-operations, html-entities; `readPage` and `VOID_ELEMENTS` permitted). No src change.
- Allowlist (exact counts): card-slot `nativeInstanceInsertEdit` (the engine writes), cards.ts `isSectionTemplate`, card-grid `textRangeInSource` and `decodeHtmlEntities`/`decodeHtmlEntity` ×2 (withTitle maps decoded matches back to source), card-slot `decodeHtmlEntities` ×2 (template slot names decode as templateSlots and itemsSlotRule do; the tree reads CR LF as LF, which the insert engine then refuses). component-model.ts's `plainText`/`decodeEntities` are outside the card files (component mode, 60-63).
- Tests: 8 (broken example and near-misses per rule, real tree, allowlist mechanics). `npm test` 1964, `npm run check` green. Sol built; Claude kept src unchanged.
