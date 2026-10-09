---
title: "Starter: the card link rule"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Repository: `~/Projects/native-site-editor-starter`, on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices.

Card links follow the card (decided at handoff, 3): a card without a link slot gets its title wrapped in a link, stretched over the card. Component CSS can't stretch a link inside slotted content (`::slotted()` reaches only the slotted element), so one shared rule in the site's CSS does it for plain grids and card components alike. These are the selectors (the conventions, slice 16, and slices 09 and 55 use the same):

```css
.cards > * { position: relative; }
.cards > * :is(h2, h3, h4) > a:only-child::after,
[slot="title"] > a:only-child::after { content: ""; position: absolute; inset: 0; }
```

- Card components set `:host { position: relative; }` in their own CSS (the starter's `card-*` components gain it where missing).
- Only a title whose sole content is a link stretches, so a card's other links stay clickable (give them `position: relative; z-index: 1` in the card's CSS where needed).
- `AGENTS.md` mentions the rule beside `.cards`.

## Done when

- In a `.cards` grid of plain items and in a grid of `card-project` instances, a title wrapped in a link makes the whole card clickable; a card with a second link keeps it clickable; focus outlines stay visible.
- One commit on the starter's `dev` branch; screenshots.

## Done (2026-10-09)

- Starter `dev` commits `c753c04` (rule) and `3c85b91` (AGENTS.md wording): the ticket's selectors in `styles/layout.css` beside `.cards`, plus `.cards > * a:not(:is(h2, h3, h4, [slot="title"]) > a:only-child) { position: relative; z-index: 1; }` so a plain item's other links stay clickable; `card-project` and `card-note` set `:host { position: relative; }`; `card-project`'s `.actions a` sits above the stretched link; `AGENTS.md` describes the rule.
- Checked in Chromium (hit tests and focus screenshots): plain items and `card-project` instances with a title link are clickable everywhere, second links stay clickable, focus outlines show; the real pages are pixel-identical to before. Sol review: no defects; its wording note (`:only-child` ignores text) went into `AGENTS.md`.
- Left open: a title link takes the browser's default link colour (the starter colours only `p a, li a`).
