---
title: "Starter: card title links stretch inside a section component's items slot too"
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- Starter `dev` commits `f95c960` (rule and AGENTS.md wording) and `9f3dbf9` (the `:has()` rule split out): `styles/layout.css` adds `:not(main, body, section, div) > * > [slot="title"] > a:only-child::after` beside the `.cards` selector, and, as its own rule, `:not(main, body, section, div) > :has(> [slot="title"] > a:only-child) a:not([slot="title"] > a:only-child) { position: relative; z-index: 1; }` for other links. The structural part also reaches cards in a named items slot and any non-card component nested in another (which then needs `:host { position: relative; }`); a section component under `main`, `body`, a `<section>` or a `<div>` keeps a title-sized link.
- Checked in Chromium (Sol's script, 1280 and 390px): corner hits and clicks on a `card-project` in a section component's items slot, a `card-service` in a named slot, a plain `.cards` item, `card-project` and `card-quote` in a plain grid; other links clickable; `section-work`'s and `section-intro`'s title links (under main, body, section, div) and a lone `card-project` unstretched; 19 Tab focus rings; the six real pages pixel-identical. Screenshots in `.scratch/cb-build-shots/68/`. Sol review: no defects; its optional note led to `9f3dbf9`.
- For slices 17 and 55: the conventions' "Card links" bullet still quotes the two-line starter rule; the starter's rule now has the second selector above, so the chapter's own `section-work` example gets a whole-card link on the starter.
