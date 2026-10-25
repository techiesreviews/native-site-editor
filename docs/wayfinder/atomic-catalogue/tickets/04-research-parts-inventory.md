---
title: Take stock of every editor part and its copies after the clean-up
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Refresh [the building-blocks inventory](../../software-factory/research/09-editor-building-blocks.md) (2026-10-22) against `dev` after the clean-up build. For each part type, list every copy with file and line, and which screens use it:

- buttons, icon buttons, close buttons;
- fields, switches, menus and menu items;
- dialogs, badges, section headings, cards and tiles;
- the missing parts.

Count the raw values (px spacing, radii, shadows, timings, local custom properties) per file, and note which helpers (`src/ui/dom.ts` `button()`, `node()`) already act as parts. Propose the atoms, molecules and organisms list, with the copies each merges.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md` on branch `research/ac-04-parts-inventory` (commit `5f65cd3a`, never merged; counting scripts included so the counts can be re-run).

- **The clean-up barely touched the parts:** 5 of 65 stylesheets changed.
- **Raw values now** (same script as 22 Oct):
  - 1,006 px spacing;
  - 158 raw radii;
  - 57 raw shadows;
  - 77 hand-set timings;
  - 97 local custom properties.

  That is 1,395 in all (1,403 on 22 Oct), and 1,502 with 68 raw z-index values and 39 raw px font sizes.
- **Spacing and motion:**
  - 46 distinct spacing values, 72% of them on the Framework steps from research 01 (10 px is the biggest outlier);
  - 52 hand-typed pills and 36 circles;
  - `--ease-out` is still undefined.
- **Copies per part:**
  - button: 131 own classes, 26 own looks;
  - icon button: 25;
  - close button: 13 (6 icon sizes);
  - boxed field: 17;
  - switch: 3;
  - tick box: 8;
  - menu item: 18;
  - dialog: 13 modal and 7 non-modal, with 11 backdrops in 8 shades;
  - badge: 45;
  - uppercase heading: 13;
  - card or tile: 17;
  - empty state: 16;
  - label with field: 12;
  - tabs: 3;
  - spinner and progress bar: 2 and 3;
  - tooltip: 139 `title` texts;
  - icons: all Phosphor Regular, drawn 6 ways in 10 sizes.
- **Proposal:** 14 atoms, 10 molecules and 15 organisms, merging about 300 copies into 24 parts. It also lists some possibly unused classes to check.
