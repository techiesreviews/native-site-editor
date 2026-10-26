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
