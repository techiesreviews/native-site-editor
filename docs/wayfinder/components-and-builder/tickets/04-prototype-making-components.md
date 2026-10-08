---
title: Prototype the two ways to make a component
type: prototype (HITL)
status: open
assignee: Lex + claude (prototype)
blocked_by: [03-default-editables]
---

## Question

How should the two entry points look and behave? (a) **Make component** on a selected section or element, built from HTML: where it lives (edit bar, Structure row, both), the dialog (name, tag preview, the editables that will become slots, with toggles), and what the user sees afterwards. (b) **New component**, made directly: where it starts (Add panel, Files, the ⌘K palette), what it starts from (blank section, a copy of an existing component, a default static section from `static-section-defaults.ts`), and where the user lands afterwards to fill it (an instance on the current page, or the template source). Make a rough clickable prototype on `dev`, behind a flag, to react to.
