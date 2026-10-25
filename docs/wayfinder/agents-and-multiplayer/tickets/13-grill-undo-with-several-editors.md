---
title: Decide whose Undo undoes what with several editors
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [08-grill-shared-editing-mechanism]
---

## Question

When Lex, agents, collaborators and guests edit one page at once (ADR 0003), what does Lex's Undo undo: only his own typing, or everything? How does he undo one agent's change, or a guest's? How does this fit clean-up slice 34's rule that a change written away gets its Undo on its own page?

## Resolution (2026-10-25)

Decided with Lex ("yes"):

1. **Lex's Undo (Ctrl+Z) undoes only his own typing**, like Google Docs (Yjs `UndoManager` tracking his own changes). It never undoes someone else's work.
2. **An agent's change:** one click undoes it from its pin card, or from its chip when the agent worked without a pin (the agent's own "undo its own change" tool from ticket 06 does the same).
3. **A guest's or collaborator's change:** their own Undo; Lex can also undo it from the change's brief author outline while it shows.
4. **A change that landed on another page** (clean-up slice 34): its Undo waits on that page.
