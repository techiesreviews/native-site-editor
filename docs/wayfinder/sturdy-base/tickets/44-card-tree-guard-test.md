---
title: "Guard test: card files read HTML through the source tree only"
type: task (AFK)
status: open
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
