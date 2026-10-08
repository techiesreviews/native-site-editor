---
title: Decide the block set and its markup
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

The builder has Section/Div, Image, Button, Heading, Paragraph, Span and Link with the button class. What markup does each insert? For example: is Button `<a class="btn">` or `<button>`, given that a static site's `<button>` does nothing without JS; is Section `<section>` with an inner container class; what is the default heading level, chosen by position? Which site classes are used (`.btn`, `data-variant` on buttons) and how are they found in a site that has none? Where may each block be dropped: Sections only at page level or also inside containers, and Span only inside text? How do the new blocks relate to the existing Add panel elements (`native-elements.ts:37-43`), the disabled Columns/Grid layouts and the unused `static-section-defaults.ts`: replaced, merged or kept?

## Resolution (2026-10-08)

Decided with Lex.

1. **Six blocks: Section, Div, Image, Heading, Paragraph, Button.** A plain link is not a block: it is an `<a>` inside a heading or paragraph, made while editing text. **Span is dropped for now** (see the map's Out of scope), because a bare `<span>` does nothing visible without a class or a style panel.
2. **Markup.**
   - **Section:** `<section class="flow"></section>`. It starts empty and shows a drop area. It offers Tone (ticket 08).
   - **Div:** `<div class="flow"></div>`. It starts empty with a drop area. Its edit bar has a Layout choice, Stack (`flow`) or Grid (`cards`). This replaces the disabled Columns/Grid.
   - **Heading:** its level comes from position. Directly in a Section it is `h2`; inside a Div within a Section it is one level below the section's heading (`h3`), capped at `h4`. It is never `h1` by default, but the edit bar's level select changes any heading, including to `h1` for a section used as a hero.
   - **Paragraph:** `<p>`.
   - **Button:** `<a class="btn" href="…">Label</a>`. It asks for the address on insert. There is no `<button>` block, because a static site's button does nothing without JS. Forms are not in the set.
   - **Image:** dropping opens the media picker at once, and cancelling inserts nothing. The markup comes from the existing writer (`mediaImageMarkup`: `src`, `alt`, `width`/`height`, `loading="lazy"`, `decoding="async"`, `srcset`/`sizes`). The alt text field opens right after.
3. **Classes: a fixed small vocabulary named in the conventions:** `flow` (Section and the Stack Div), `cards` (the Grid Div), `btn` (Button). There is no scanning or guessing from the site's CSS. Both reference sites already have `flow` and `cards`, and the starter gains `.btn`. In a site without one of these classes the block still works and just looks plain.
4. **Variants on blocks.** Ticket 07's detection also reads class rules, so Button offers Variant and Size wherever the site's CSS defines `.btn[data-variant|data-size]` (techies-reviews). Section offers Tone and Div offers Stack/Grid. Heading, Paragraph and Image offer nothing.
5. **Where blocks may go.**
   - Section only between page bands, never inside another section.
   - Div, Image, Heading, Paragraph and Button inside a Section or a Div.
   - Inside a component instance only into its unnamed slot, where its repeated items live. Named slots refuse drops, because they are filled by editing.
6. **Existing code.** The hidden element catalogue (`native-elements.ts`) becomes the block set: its markup code is kept, cut to these six blocks and wired back into Add. List, video, embed, divider and form choices are deleted. The disabled Columns/Grid go, replaced by the Div's Layout choice. `static-section-defaults.ts` goes with the masters (ticket 02).
