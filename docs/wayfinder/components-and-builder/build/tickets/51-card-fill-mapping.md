---
title: Card fill mapping
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §4–5, as a pure function from a card's slots and a page's source.

- Title (`h1`, else `<title>`) → the first heading slot; meta description → the first text slot after the title (else before it); `og:image` → the first image slot; address → the link slot, text "Read about <title>".
- Other slots fill by matching: when the page holds the same component or class the slot uses, its text is copied; otherwise the fallback stays.
- It returns one row per slot with its source (`h1`, `meta description`, `og:image`, `address`, kept, not used) for the strip.
- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-core.ts` (`pageInfo` `:88`, `pageContent` `:271`, `mapping` `:431`).

## Done when

- Unit tests: a full card; no `h1`; no description; no image slot; the description before the title; a matching `<card-note>` on the page; the rows' sources.
