---
title: "Starter: title links look like the title, stretched only in cards"
type: task (AFK)
status: closed
assignee:
blocked_by: [65-starter-card-link-rule]
builder: sol
phase: 2
---

## What

Follow-ups from slice 65 (Lex, 2026-10-09), in `~/Projects/native-site-editor-starter` on its `dev` branch:

- **Title links look like the title:** a link that is a heading's whole content takes the heading's colour, with no underline; it underlines on hover and keeps a visible focus ring. Today it shows the browser's default blue and underline, because the starter only colours links in paragraphs and list items.
- **Stretch only inside cards:** slice 65's `[slot="title"] > a:only-child::after` also matches a section component's title slot, whose host isn't positioned, so it would stretch over too much. Limit the stretch to cards: plain items of a `.cards` grid and card components (e.g. scope to `.cards` descendants and to hosts that set `position: relative`, as `card-project` and `card-note` do). Update the AGENTS.md wording to match.
- The skip link's row stays in the editor's Page Structure (Lex: keep the row); nothing to change in the editor.

## Done when

- A card title wrapped in a link reads like the title on light and dark bands, with hover underline and focus ring; the stretch still covers plain cards and card components; a section component's title link doesn't stretch.
- Browser check script (as in slice 65) passes; screenshots in `.scratch/cb-build-shots/67/`.

## Done (2026-10-09)

- Starter `dev` commits `3b8039a` (rules) and `14a6875` (AGENTS.md wording): in `styles/elements.css`, `:is(h1, …, h6, [slot="title"]) > a:only-child` takes the heading's colour with no underline, underlines on hover, keeps the focus ring (beats `p a, li a`); in `styles/layout.css` the stretch is now `.cards > * :is(h2, h3, h4, [slot="title"]) > a:only-child::after` only, so a section component's title link (or a card component outside a `.cards` grid) covers just the title.
- Checked in Chromium (Sol's script): colour/underline/hover on light and dark bands and in a list item, stretch and second links on plain items and `card-project`, Tab focus rings, a `section-intro` title link that doesn't stretch; the real pages are pixel-identical to before. Sol review: no defects; its wording note went into `AGENTS.md`.
