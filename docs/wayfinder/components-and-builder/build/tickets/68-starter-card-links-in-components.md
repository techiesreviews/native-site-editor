---
title: "Starter: card title links stretch inside a section component's items slot too"
type: task (AFK)
status: open
assignee:
blocked_by: [67-starter-title-link-look]
builder: sol
phase: 2
---

## What

Gap found in slice 16 (see its Done note): slice 67's rule `.cards > * :is(h2, h3, h4, [slot="title"]) > a:only-child::after` doesn't reach cards placed in a section component's items slot, because the `.cards` grid is inside the section's shadow DOM. In the light DOM those cards are direct children of the section's host (`section-work > card-project > h3[slot="title"] > a`), while a section component's own title is a child of a host that sits in `<main>` (`main > section-x > h2[slot="title"] > a`), which must not stretch.

In `~/Projects/native-site-editor-starter` on `dev`, extend the rule so a card's title link stretches over the card in both places, and a section component's title link still doesn't. One way: also match `[slot="title"] > a:only-child::after` when the title's host is a child of another custom element rather than of `<main>`/`<body>`/a band (e.g. `:not(main, body, section, div) > * > [slot="title"] > a:only-child::after`, or a `:has()`-based selector); pick the simplest selector that holds for the cases below and keep it in `styles/layout.css` beside the `.cards` rule. Card components already set `:host { position: relative; }`. Update `AGENTS.md`'s wording, and tell slices 17 and 55 in the Done note.

## Done when

- Browser check (as in slices 65/67): a `card-project` inside a section component's items slot, a plain `.cards` item and a `card-project` in a plain `.cards` grid are all clickable as a whole card; a section component's title link and a `section-intro` title link don't stretch; other links in the card stay clickable; focus rings show; the real pages are pixel-identical.
