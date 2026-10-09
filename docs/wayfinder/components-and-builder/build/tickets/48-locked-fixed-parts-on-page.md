---
title: Fixed parts are locked on the page
type: task (AFK)
status: closed
assignee:
blocked_by: [41-edit-mode-shell]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §7.

- Outside the mode, a component's fixed parts can't be edited or dropped into on the page. Clicking one selects the instance; the name label says "○ Paragraph fixed in `<section-work>`" with an Edit component button that opens the mode with that part selected.
- Page Structure lists only the instance's slots.
- Code: `src/page-builder/components.ts`, `native-component-selection.ts`, `src/components/page-structure.ts`.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-label.ts` (`lock` `:77`).

## Done when

- Nightly spec: clicking a fixed paragraph selects the instance and shows the hint; Edit component opens the mode with that paragraph selected; Structure lists only slots.

## Done (2026-10-09)

- Outside Edit component mode a click on a fixed template part selects the instance and the label reads "○ Paragraph fixed in `<section-work>`" with Edit component, which opens the mode on that instance with that part selected. The lock rides only on that host selection while the template is unchanged; slot placeholders carry none. Fixed parts take no text editing; drops inside them refuse with the reason (their edges pass the drop beside them). Structure already listed only slots.
- Commits 303e5a4, 2d4db53 (built by Sol, reviewed and fixed by Claude). Unit tests: `nativeLockedComponentPart`, the controller's lock handoff (refresh, template change, replay), the fixed drop refusal and report. Spec `native-locked-fixed-parts-actual.spec.ts` (@actual: hint, no text edit, Structure slots only, Edit component on the part, drop refusal, a second fixed part).
