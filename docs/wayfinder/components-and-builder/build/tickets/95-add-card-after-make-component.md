---
title: "Add card appears right after Make component, without a reload"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

From slice 54 (see its Done note): on the starter, after Make component (and Done) on Recent work, hovering the new section's cards shows no Add card until the page is reloaded, although the template is correct (the slot's fallback is `card-project`). Find why the card-slot/grid report isn't refreshed after the template and page change (probably the items-slot/card-component cache or the grid tracking from slices 40/50 not seeing the new template) and fix it.

## Done when

- Nightly @actual spec: Make component on Recent work, Done, hover a card → Add card shows; adding works; no reload.
