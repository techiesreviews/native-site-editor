---
title: Decide the atomic design catalogue
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-grill-ux-confidence-ladder]
---

## Question

Lex asked to work the atomic design way: the editor's UI is built from approved atoms (buttons, inputs, icons, tokens), molecules (a field with its label, a toolbar group), organisms (the edit bar, the Media grid), templates and pages. Where does the catalogue live and how does Lex browse and approve parts (a catalogue page on the preview editor?); how are mock-ups assembled from it; which existing editor parts and theme tokens seed it (see the "modern CSS and design system" rule: the editor reuses theme tokens and components); and how does the kit check that new UI uses only catalogue parts?

## Resolution (2026-10-22)

Decided with Lex, informed by [the building-blocks inventory](../research/09-editor-building-blocks.md):

1. **For the editor's own UI** (not users' sites). Lex wants a **canvas-style, interactive overview of every part, like Figma or Paper**: all components and elements of the editor laid out on one zoomable board, live and clickable, in light and dark, where he reviews and approves parts. Mock-ups for new features are assembled from it.
2. **Missing shared values first** (spacing, motion timing and easing, stacking layers, pill radius), **with the techies.tools Generative UI Framework as the basis** (`~/Projects/TechiesTools`: Primitives such as colour, type, spacing, radius; Semantic Roles; Element and Component Guidance; its export). How the editor's `src/theme.css` is derived from a Framework export is the first question of the catalogue build.
3. **Merge the copies into one each, approved by Lex** (icon button, close button, menu item, dialog, switch, badge, section heading, card; plus the missing tooltip, empty state, label with field). **Design parts to be extended, not copied:** for example one button with an icon before, after, text only or icon only, by options or **slots**, so variants are configurations of one part.
4. **A one-way check** ("for now"): the kit counts hand-typed values and one-off parts, and the count may only go down.
5. **Its own build right after the clean-up**, before multiplayer.
