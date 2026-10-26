---
title: Find how Bricks, Core Framework, ACSS and WordPress block styles work
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex wants the panel to work like Bricks Builder (round 1 of ticket 03). Find out:

- **Bricks:** its style panel inputs (free fields, units, suggestions on click) and its selector (element ID, global classes as chips, states and pseudo-classes, custom selectors, which selector is active). Also what CSS it writes and where.
- **Core Framework and Automatic.css:** how their right-click variable picker works in Bricks (what it lists, grouping, search, colour swatches, how a variable is inserted).
- **WordPress block styles and variations:** `register_block_style`, block variations, `theme.json` style variations. How users pick them, how they show in the editor, and how they map to classes (`is-style-…`). How this editor's data-attribute variants could borrow from them.

Propose how each maps onto this editor. Findings on branch `research/st-03-bricks-acss-wp`, in `docs/wayfinder/styling/research/03-bricks-acss-wp.md`.

## Resolution (2026-10-26)

Findings: `docs/wayfinder/styling/research/03-bricks-acss-wp.md` on branch `research/st-03-bricks-acss-wp` (commit `adad1f7a3`, never merged; `kit doctor` 7/7).

- **Fields:**
  - any CSS value is accepted, and a bare number becomes `px`, as in Bricks;
  - an invalid value is marked on the field and not written;
  - clicking shows suggestions: design values (colour swatches), values already in the stylesheet, then keywords;
  - `--space-m` then Enter writes `var(--space-m)`, and simple sums become `calc()`, as in ACSS.
- **Right-click picker:**
  - opens with search focused and prefilled;
  - groups come from `tokens.css` headings, with the component's own variables first, and the group that fits the field opens first (from Core Framework's code, open source since 2026-08-13);
  - colours show light and dark swatches;
  - hovering previews on the page, clicking writes `var(--x)` and clicking again removes it; it stays open;
  - the ContextMenu key, Shift+F10 and typing `--` open it too.
- **Selector, as in Bricks:**
  - chips for the element's classes, the component itself and the variants set on the instance;
  - the filled chip is the one being edited;
  - a state button offers Normal, Hover, Focus, Pressed or a typed state, with dots where styles exist;
  - `+` adds a site class or a new variant and makes it active.
- **Variants, as WordPress block styles:** a row of buttons with Default first; hovering shows the look on the page. They are still written as `data-*` attributes, and the edit bar dropdown stays. Bricks components now split variants the same way (the look on the component, the choice on each instance).
- **Code:** no code area in the panel. The active chip plus state is one rule, and "Code" opens the bottom editor on it. One shared module provides suggestions and swatches.
- **Open for Lex:**
  - a bare number means px;
  - the picker stays open;
  - variant buttons with names or live pictures;
  - creating new variants;
  - site classes in the chips.
