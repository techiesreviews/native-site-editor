---
title: Prototype editing a component's template visually
type: prototype (HITL)
status: open
assignee:
blocked_by: [04-prototype-making-components, 12-prototype-drag-and-drop]
---

## Question

Ticket 04 decided that Edit component mode edits the template in the preview, not only in the code pane, and that Make component and New component both land there. How does that look and behave? On the selected instance: how the template's fixed parts, its slots and their fallbacks are shown and edited in place, and whether the page's own slot content is swapped for the fallbacks while editing; how the block set (ticket 10) and drag and drop (ticket 12) work inside the template, including into items slots; how a slot is added, renamed or removed (the chips from ticket 04's making mode?); how a nested card component is drilled into; how Used on, Done and undo work when one edit changes every page that uses it; and how the code pane stays in sync beside it. Prototype it on `dev` behind a flag, starting from New component's blank section and from a component made from the starter's Recent work.
