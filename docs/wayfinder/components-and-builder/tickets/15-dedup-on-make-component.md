---
title: Decide what counts as an identical copy on Make component
type: grilling (HITL)
status: open
assignee:
blocked_by: [04-prototype-making-components]
---

## Question

Ticket 04 decided that Make component offers to replace identical copies of the section on other pages (a checkbox, ticked by default, and a flag on `make_component`). What counts as identical: the same element tree, tags and classes with the text in the would-be slots ignored, or something looser? Does a copy with a different number of items in its items slot still match, and one whose slots were unticked differently? Which pages are searched (all pages, unsaved drafts)? How does each copy's content map into its slots, and what happens to a copy that doesn't map cleanly? How are the matched pages shown before Create, and how is the change undone as one step across pages? Does the same apply when the repeated card becomes a component (ticket 04, rule 7)?
