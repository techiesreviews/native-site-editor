---
title: Unit-test gaps in the Phase 5 controllers
status: ready-for-agent
assignee:
blocked_by: []
---

# Unit-test gaps in the Phase 5 controllers

## What

Gaps the reviews named; the browser specs cover these paths today.

- Page structure (`p5-18`): `renderNativeEditBar` (attribute fields, linked-copy chip, format/link actions, empty new link), `prepareNativeTextEdit`/`applyNativeTextEdit` queue order, `moveNativeSectionAfterOpening`, `moveNativeSectionTo`, `nativeLinkedAncestor`; the `cardControls` port wiring and section/master gate.
- Cards (`p5-20`): no mounted-with-a-real-site test (`controls`, `describe`, `plan`, `cardsLinkingTo`, `cardOffer` after mount); unmounted `preview.addCard`.
- File operations (`p5-21`): `moveFileTarget` itself (epoch guard after `targetFiles`, plain-move dialog, asset-reference error), delete's `stale()` after `targetFiles` and in-use refusal, `duplicateFileTarget`, cancelled dialogs, pins taken before planning.
- Save/publish (`p5-22`): refresh adopting during the first `findEntry` await; the discard-all count after drafts change; no-user scope; `saved` ordering.
- Shared sections (`p5-19`): writes are mocked, so rollback/undo-history and a real transaction refusing a stale write are not proven.
- All controller tests build ports with `as unknown as …Ports`, so an added or renamed port fails only at runtime.
