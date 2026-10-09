---
title: Prototype Add card with an existing page
type: prototype (HITL)
status: open
assignee: Lex + claude (prototype)
blocked_by: [03-default-editables]
---

## Question

Add card offers **Create page and card** and card-only today (`src/page-builder/cards.ts`, `src/components/card-grid-controls.ts`). How does **Add existing page** fit into that popover: which pages are offered first (siblings under the grid's parent, then all pages, searchable), how pages already in the grid are shown, and how the page's title/h1, meta description, og:image and address map onto the card's slots by slot kind when a card has several text slots or none of them? What happens on a grid whose items aren't links? Prototype it on `dev` behind a flag.
