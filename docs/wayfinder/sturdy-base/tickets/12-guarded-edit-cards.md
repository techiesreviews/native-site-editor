---
title: "Cards (add, fill, swap look, create page) through the guarded edit"
type: task (AFK)
status: open
assignee:
blocked_by: [10-guarded-edit-module]
builder: sol
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. In `src/page-builder/cards.ts`:

- `addCard` (283), `swapCard` (349), `fillFrom`/`fillCard` (387, 418), `hostCss`/`fillOperation` (439, 454), `createPage` (502) and `createWithCompanion` (532) become plans: every file read through `r` (page, own template, look template, linked page, CSS host file and its absence, the new page's sibling inputs). The hand-built `expectedSources` (360-363, 403-407, 456-457, 522) and the re-checks after `await import("./card-swap")` (364-365) and `await import("./card-link-css")` (442-444) go: the imports are plain awaits inside the plan.
- The new page draft is a `creates` entry in the same step, not a history companion (`createWithCompanion` goes).
- **Gap:** `createWithCard` (686-703) passes no expected sources and relies on `applyNativeOperation` auto-filling them; as a plan its grid page is read through `r`.
- Grid moves/duplicate/remove (`deps.change` at 574, 613, 619) use `edits.now`.
- `deps.site()`/`deps.editor()` identity proofs are replaced by the stamp and the anchor.

## Done when

- `tests/cards-controller.test.ts` on the memory workspace, plus: a look template edited during the `card-swap` import refuses; a CSS file created during `card-link-css` import refuses; create page + fill is one undo step that removes the page draft.
- `npm run check`, `npm test`, full `native-save` suite green.
