---
title: Decide what the panel controls
type: grilling (HITL)
status: closed
assignee: 
blocked_by: [01-research-panel-patterns, 03-prototype-styling-panel, 08-research-bricks-acss-wp, 09-research-answers-from-the-code]
---

## Question

With research 01 and the prototype: the control groups, hover and focus states, phone versus desktop, and site-wide design values versus element styles.

## Resolution (2026-10-26)

Settled with Lex in the prototype rounds (ticket 03):

- **Groups:** Layout, Sizing, Spacing, Borders, Typography, Background and Effects, with Search controls.
- **States:**
  - they live in the selector field: Hover, Focus, Pressed, plus the modern selectors that fit the element (`:focus-within`, `:disabled`, `:checked`, `:user-invalid`, `:placeholder-shown`, `:has()`, `::before`, `::after`, `::placeholder`, `::marker`, `[open]`, `::details-content`, `:popover-open`, `:state()` and `@starting-style`);
  - hover is written inside `@media (hover: hover) and (pointer: fine)` and shared with focus unless split;
  - one state plus one part at a time, and a preview switch shows a state.
- **Screen sizes:** the canvas bar stays exactly as built: Desktop, Tablet 768 and Mobile 390, the typed width and dragging. The panel edits the size the canvas shows (`src/page-builder/breakpoints.ts`).
- **Site-wide versus element:** both are in the panel. Every selector shows its scope, and site rules are behind one "Site styles" chip. Editing a site class such as `.btn` is allowed and marked Site-wide.
- **Values:** free text with one suggestion list, no right-click; bare numbers become rem, changeable in a setting.
