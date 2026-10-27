---
title: Theme the editor (pick its colours)
status: needs-triage
assignee:
blocked_by: []
---

# Theme the editor (pick its colours)

Lex (2026-10-27), after seeing the catalogue's Today / After mock-up: "I am thinking now of theming the editor. I kinda dislike the blue, so being able to theme the editor would be nice in the future."

## What

The editor's own colours (not the sites it edits) could be picked: at least the action blue (`--action` in `src/theme.css`), perhaps a few preset themes, in light and dark.

## Why it fits after the catalogue

The atomic catalogue puts every editor part on one shared set of values from the techies.tools Framework, and removes the drifted copies (139 tooltips, 45 badges, six icon-button sizes). Once that has landed, a theme is a change to that one set of values, not a hunt through every component. Before then, a theme would miss the copies.

## Open (for a later Tuesday pack)

- Who picks: each person for themselves (kept in the browser), or one theme per project?
- Presets only, or any colour, with a contrast check?
- Is it part of the detail pass, or its own small build after the styling build?
