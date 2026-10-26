---
title: Prototype the styling panel
type: prototype (HITL)
status: open
assignee: Lex + claude (prototype)
blocked_by: []
---

## Question

A clickable prototype in top bar version B: select an element, open the panel from the edit bar's style icon, change colour, size, spacing and layout with plain controls, see the page update, and see the CSS it writes in the Code view. It includes the site-wide design values and the Components fixes (swatches, token suggestions). Served from the PoC Worker's /mockups/.

## Round 1 with Lex (2026-10-26)

Prototype: [03-styling-panel.html](../prototypes/03-styling-panel.html), also at `am-typing-together-poc.lexvd.workers.dev/mockups/styling-panel.html`.

Lex: "I would like it to work like done with Bricks. Free field to write anything, on click has suggestions, on right click, like Core Framework and ACSS do it, show the variables that are set up. Code can be the same code editor as already exists in the bottom, so no editor in the side bar. I want to see all the classes for the button and variants. The variants can be inspired by variants in WordPress on blocks. It needs to be a selector like Bricks does too. The rest is already as we have built it, so for questions look at how it's done now in terms of variants and components."

- **Inputs:** free text fields that take any value. Clicking shows suggestions. Right-clicking shows the project's variables, as Core Framework and Automatic.css do in Bricks.
- **No code editor in the panel.** Code is the existing code editor at the bottom.
- **A selector like Bricks:** the element's classes and variants shown as chips at the top. You pick which one you are styling.
- **Variants** inspired by WordPress block styles and variations.
- **Everything else follows what is already built** for components and variants. Questions are answered from the code where possible (research 03 and 04).

### Reference from Lex (2026-10-26)

"Use the style panel from unblockwp as inspiration." Screenshot: [03-unblockwp-panel-reference.png](../prototypes/03-unblockwp-panel-reference.png). What it shows, from top to bottom:

- **Element:** HTML Tag (select, `h2`), id and class fields, each with a small database icon for picking a value.
- **STYLES:** breakpoint icons (desktop, tablet, phone).
- **CSS Selectors:** a chip field (`.intro__title ×`) with a `*{}` button for custom CSS.
- **Search controls…:** a field with a filter icon.
- **Collapsible groups:** Layout, Sizing, Spacing, Borders, Typography. A group with set values gets an × that clears it.
- **Inside a group:** labels of set properties turn blue. Values are free text (`clamp(32px, …)`, `500`, `1.05`, `-0.03em`), each with its own × to clear. Font Family is a picker, and Text Color shows a swatch plus `var(--ink)`.

## Round 2 with Lex (2026-10-26)

Prototype v2 (unblockwp style, Bricks selector) shown with ten open questions. Lex's answers:

- **Q1, screen sizes:** "check how this is done now with the editor. Don't change that." The canvas bar already has Desktop, Tablet 768 and Mobile 390 (`src/components/canvas-bar.ts:3-7`), shared through `src/page-builder/breakpoints.ts`. The old panel wrote Tablet and Mobile as `@media (max-width: 768px)` and `(max-width: 390px)`, reusing a matching block (`docs/page-builder/style.md` at `1aada9c8c^`). The panel follows the size the canvas shows. It has no size switch of its own.
- **Q2, hover and focus:** as recommended. Hover is guarded and shared with focus unless split. A switch previews the state.
- **Q3, the starter's older CSS:** "do not convert, use what exists." In his words:
  - The panel should know what is site-wide and what is specific. Design values, element styles and shared classes are reused on every page, so it shouldn't list every site-wide selector. Everything must still be findable, and the one "site styles" chip makes sense for that.
  - Styles can be removed, and classes can be removed.
  - Variables and search are one thing: click, write, and it searches the relevant variables. The right-click picker goes.
  - The id and class fields go, because they are part of the selectors. States go into the selectors too.
  - Offer the modern selectors from good-css.
- **Q4, site styles:** one chip (in Q3).
- **Q5, colour swatch in the code:** it also works in the code editor, with a colour picker or another variable.
- **Q6 and Q7, New look and editing site classes:** not answered. Taken as recommended (yes and yes). Prototype v3 shows site classes as site-wide.
- **Q8, bare numbers:** rem by default, with a setting to change the default unit.
- **Q9, the picker staying open:** moot, because the right-click picker goes.
- **Q10, look buttons as names or pictures:** "can you show?" Prototype v3 has a Names / Pictures switch to compare them.
