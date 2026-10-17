---
title: Unit-test gaps in the Phase 5 controllers
status: closed
assignee: td-0807
blocked_by: []
---

# Unit-test gaps in the Phase 5 controllers

## What

Gaps the reviews named; the browser specs cover these paths today.

- Page structure (`p5-18`): `renderNativeEditBar` (attribute fields, linked-copy chip, format/link actions, empty new link), `prepareNativeTextEdit`/`applyNativeTextEdit` queue order, `nativeLinkedAncestor`; the `cardControls` port wiring and section/master gate.
- Cards (`p5-20`): no mounted-with-a-real-site test (`controls`, `describe`, `plan`, `cardsLinkingTo`, `cardOffer` after mount); unmounted `preview.addCard`.
- File operations (`p5-21`): `moveFileTarget` itself (epoch guard after `targetFiles`, plain-move dialog, asset-reference error), delete's `stale()` after `targetFiles` and in-use refusal, `duplicateFileTarget`, cancelled dialogs, pins taken before planning.
- Save/publish (`p5-22`): refresh adopting during the first `findEntry` await; the discard-all count after drafts change; no-user scope; `saved` ordering.
- Shared sections (`p5-19`): writes are mocked, so rollback/undo-history and a real transaction refusing a stale write are not proven.
- All controller tests build ports with `as unknown as …Ports`, so an added or renamed port fails only at runtime.

## Done (2026-10-17)

Tests only (no src change). Built by Sol (gpt-6.1-sol, high), checked and
finished by Claude (td-0807).

- **Already true on dev, skipped:** shared sections (p5-19) and the masters
  code were removed (90e89a7c), and with them the linked-copy chip and
  `nativeLinkedAncestor`; `prepareNativeTextEdit` is internal since ticket 08
  (text edits are tested through `applyNativeTextEdit`); unmounted
  `preview.addCard` and the discard-all count after drafts change landed with
  ticket 08. The cards controller has no `plan` API.
- **Page structure:** attribute field as one step with Undo/Redo and its stale
  refusal; Bold wraps and unwraps; Link wraps text and an unused Address
  removes the empty link and its step; `cardControls` only outside sections
  and template roots; text edits queued while the page opens apply in order
  once it mounts, and a generation or scope change during the open writes
  neither (review gap). The port fixture is complete and typed with
  `satisfies PageStructurePorts` (no `as unknown as`, no lint exemption).
- **Cards:** mounted adapters on a real site in the browser-parser bundle
  (`controls`, `preview.describe`, `cardsLinkingTo`, `cardOffer`).
- **File operations:** generation proof through every await including
  `targetFiles` (move and delete), proofs taken before planning, plain-move
  dialog confirm and cancel, asset-reference error, in-use refusal asks nothing.
- **Save/publish:** a refresh adopting during the deleted check's first
  `findEntry` await drops the stale answers; no-user scope does nothing and
  says nothing; `saved` comes first in a save's log. Fixture typed with
  `satisfies SavePublishPorts`.
- **Tests:** `npm run check`, `npm run lint`, `scripts/agents/unit.sh` 3987
  pass; the four touched files 3 runs each, no flakes; the new queue tests
  fail when the queue or the load proof is broken (mutation check).
- **Review (Sol, kit review):** no defects; one validation gap (queue order
  while the page opens) fixed by the two queue tests above. Evidence:
  `.scratch/reviews/td-0807/20261017T065300Z` (main root).
- **Found, not fixed (lead decision):** `discardFile()` still opens its
  question when there is no user scope if `change(path)` returns a change; the
  discard then does nothing and (since ticket 08) says nothing. Out of scope for
  a test-only ticket. `tests/files-tree-controller.test.ts` still builds its
  ports with `as unknown as` (not a Phase 5 controller named here).
