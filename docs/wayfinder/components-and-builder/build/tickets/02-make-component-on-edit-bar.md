---
title: Put Make component back on the edit bar
type: task (AFK)
status: closed
assignee:
blocked_by: [01-remove-masters-and-save-shared]
builder: sol
phase: 1
---

## What

The second slice of [02](../../tickets/02-masters-become-components.md) §2: Make component goes back where the masters' actions were.

- `src/page-builder/components.ts:440-447`: with `nativePageActions` gone, a selected element on a native page offers "Make component…" again; update the comment at `:125-127`.
- Offered on any element on the page (a section, a card, a div), except `<main>`, `<body>`, the header and footer components, and anything inside an instance (decided at handoff, 10). Elements that are components already keep Edit component instead.
- It opens today's dialog (`openMakeComponent`, `makeComponent` at `:1155`). Phase 3 replaces the dialog with making mode; this slice only restores the entry.

## Done when

- Selecting a section, a card or a div shows Make component…; `<main>`, the header, the footer and elements inside an instance don't. It makes a component as before, one undo step.
- The Make component tests in `tests/native-save/native-components.spec.ts` run again, with a case for each refusal (nightly; the smoke for Make component comes with slice 22).

## Done (2026-10-09)

- "Make component…" is offered on any page element with an end tag (section, card, div, heading…); refused on `<main>`, `<body>`, the page's own `<header>`/`<footer>` (not inside sectioning content or `<main>`), void elements (the dialog needs an end tag), components (Edit component instead) and anything inside an instance. Pure rule `makeComponentOffered` in `component-model.ts`.
- Commits 825f08a (Sol), 4470054. Tests: `tests/make-component-offer.test.ts` (3 unit tests); `native-components.spec.ts` brings back the two Make component tests removed in 7856813 and adds the refusal and card/card-header cases.
- Suite fix (2026-10-09): Make component… on the link's bar made it wrap one more row at 340px and cover the paragraph's start, so `native-edit-bar-groups.spec.ts` "in a 340px canvas…" selects the paragraph by a click on the element itself (as it already did for the section bar).
