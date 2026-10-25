---
label: wayfinder:map
title: Atomic design catalogue
charted: 2026-10-25
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A finished build plan, with a board mock-up Lex has approved, for the atomic design catalogue of the editor's own UI. It covers:

- a zoomable, clickable board of every editor part, on the preview editor only;
- the editor's shared values taken from the techies.tools Generative UI Framework;
- one approved version of each part, plus the missing ones (tooltip, empty state, label with field, tabs, spinner);
- every toast replaced by feedback in place;
- the kit check that lets one-offs only go down.

## Notes

- **Planning only.** Tickets produce decisions, not code. Second in Lex's order of 2026-10-23, after [agents and multiplayer](../agents-and-multiplayer/map.md). Its build starts after that build, and takes in that build's new parts (pins, name chips, carets, the MCP menu's agent list).
- **Already decided** ([factory ticket 09](../software-factory/tickets/09-grill-atomic-catalogue.md#resolution-2026-10-22), do not re-ask):
  - it is for the editor's own UI, not users' sites;
  - a Figma- or Paper-like interactive board of every part, in light and dark, where Lex approves parts and mock-ups are assembled from it;
  - missing shared values first (spacing, motion, layers, pill radius), based on the techies.tools Framework (`~/Projects/TechiesTools`);
  - merge copies into one approved part each, designed to be extended with options and slots, never copied;
  - a one-way count of one-offs.
- **No toasts anywhere** (Lex 2026-10-23, `no-toasts-feedback-in-place` memory; [UX rulebook](../../agents/ux-rulebook.md)): removing the remaining toasts editor-wide is a step of this build. An expected outcome needs no message.
- **Inputs:**
  - [the building-blocks inventory](../software-factory/research/09-editor-building-blocks.md) (2026-10-22, before the clean-up);
  - `src/theme.css` with its rules in `docs/editor-colors.md`;
  - `scripts/check-colours.mjs`;
  - the UX rulebook;
  - the good-css skill and the modern CSS + design system rule (`modern-css-and-design-system` memory).
- **Charting answers (Lex, 2026-10-25):** the destination above; keep the order (agents and multiplayer first, its new parts move in later); the board lives inside the editor, built from real parts, on the preview editor only.
- **Lex in plain words:** one question round at a time, each question with a recommended answer; technical questions too, explained plainly with file paths.
- **Skills:** `grilling` with `domain-modeling` for grilling tickets; `research` for research tickets (findings on `research/ac-NN-<slug>` branches, never merged); `prototype` for the board mock-up; `good-css` for anything CSS.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier atomic-catalogue`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Take stock of every editor part and its copies after the clean-up](tickets/04-research-parts-inventory.md#resolution-2026-10-25): 1,395 raw values (1,502 with z-index and font sizes); about 300 copies across 16 part types; proposal of 14 atoms, 10 molecules, 15 organisms merging into 24 parts; icons all Phosphor drawn 6 ways
- [List every toast and explainer line with where its feedback belongs](tickets/03-research-toasts-and-explainers.md#resolution-2026-10-25): 95 toasts (83 need nothing), nearly all through `announce()`/`say()`; 56 explainers (37 go); 14 counts (5 go); move GitHub Try again and Media Replace's Undo before removing
- [Find how to build a zoomable board of live parts inside the editor](tickets/02-research-board-on-a-canvas.md#resolution-2026-10-25): real parts on a CSS-transform board, iframes for menus, dialogs and phone width; one `src/catalogue/parts.ts`; separate `catalogue.html` built only for the preview editor (0 boot bytes); dark mode to `light-dark()` first
- [Find how the techies.tools Framework becomes the editor's shared values](tickets/01-research-techies-framework.md#resolution-2026-10-25): colours already match; Framework has spacing and pill radius but no motion, layers or shadows; manual-mode spacing fits; 14 vs 16 px root trap; commit its export and generate theme.css's shared values with a kit check

## Not yet specified

- **Icons:** one way to draw icons instead of three (`src/icons.ts`, direct Phosphor imports, typed × and ▾); which set, which sizes. Sharpens after the parts inventory.
- **Accessibility rules per part:** focus ring, tap size, contrast and reduced motion as part of each part's approval. Probably folds into the board's states.
- **Phone layout of parts:** how each part behaves at 390 wide on the board.
- **Moving organisms over:** the edit bar, Page Structure, Media grid and agent menu rebuilt from catalogue parts, in what order and how big each step is. Hangs on the parts list and the API.
- **Mock-ups from the catalogue:** how a future mock-up page imports parts from the board (kitchen station 3). Hangs on the board's build.

## Out of scope

- **Users' site components and the visual styling panel:** map 6 (styling).
