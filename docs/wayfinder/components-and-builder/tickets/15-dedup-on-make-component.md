---
title: Decide what counts as an identical copy on Make component
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [04-prototype-making-components]
---

## Question

Ticket 04 decided that Make component offers to replace identical copies of the section on other pages (a checkbox, ticked by default, and a flag on `make_component`). What counts as identical: the same element tree, tags and classes with the text in the would-be slots ignored, or something looser? Does a copy with a different number of items in its items slot still match, and one whose slots were unticked differently? Which pages are searched (all pages, unsaved drafts)? How does each copy's content map into its slots, and what happens to a copy that doesn't map cleanly? How are the matched pages shown before Create, and how is the change undone as one step across pages? Does the same apply when the repeated card becomes a component (ticket 04, rule 7)?

## Resolution (2026-10-09): out of scope

Ruled out of scope with Lex: matching copies on other pages is too risky for now, because a rule loose enough to be useful (same shape, different text) changes content on pages the user isn't looking at. **Make component turns only the selected section into an instance**; other pages stay as they are. This reverses ticket 04 rule 5 (the "Also on N other pages" checkbox and the `make_component` flag).

Notes for a later effort, answered before the ruling:
- A copy whose items slot holds a different number of items would still match; the items slot belongs to each page.
- All pages would be searched as they stand in the editor, unsaved drafts and 404 included.
- The count would open a list with a checkbox per page, so single pages can be left out.
- Still undecided: what counts as a match (same shape, exact copies only, or looser). The three `/work/` heroes in the starter (same note/h1/lead shape, different text) are the test case.

