---
title: "Starter: title links look like the title, stretched only in cards"
type: task (AFK)
status: open
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
