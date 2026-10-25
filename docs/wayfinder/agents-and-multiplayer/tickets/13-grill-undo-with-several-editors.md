---
title: Decide whose Undo undoes what with several editors
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [08-grill-shared-editing-mechanism]
---

## Question

When Lex, agents, collaborators and guests edit one page at once (ADR 0003), what does Lex's Undo undo: only his own typing, or everything? How does he undo one agent's change, or a guest's? How does this fit clean-up slice 34's rule that a change written away gets its Undo on its own page?
