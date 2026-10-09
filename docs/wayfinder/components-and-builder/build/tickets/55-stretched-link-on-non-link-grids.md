---
title: Stretched link on grids whose items aren't links
type: task (AFK)
status: open
assignee:
blocked_by: [53-fill-card-and-info-strip, 09-slot-plan-nested-instances-and-stretched-links]
builder: sol
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §6: on a grid whose items aren't links, choosing a page makes the card's title a stretched link, shown as "added" in the strip. The markup and where its CSS lives are open point 3 in the [spec](../spec.md); use the same answer as slice 09.

## Done when

- Unit test for the markup change.
- Nightly spec: on a non-link grid, picking a page makes the whole card clickable and the strip says "added".
