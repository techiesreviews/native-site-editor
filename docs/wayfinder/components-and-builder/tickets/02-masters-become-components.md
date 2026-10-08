---
title: Decide how masters and page parts become components
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [01-research-masters-and-components]
---

## Question

Ticket 01 found no masters in any real site, and the masters code was never on `main`. So nothing needs converting: retiring masters means removing about 4k lines of code and their tests. That leaves three questions.

1. **Header and footer markup.** Slot each nav link into the page (`<a slot="link">` per link, so the links are visible without JS, but each page carries its own copy of the nav), or keep the links in the template (one place to edit, but no links without JS)? What about the skip link?
2. **Removal order.** Should the masters code and `.editor/page-builder.json` go before Make component returns to the edit bar (`main.ts:642`), or together with it?
3. **Wording.** What changes in `site-conventions.ts:52`/`:58`/`:69`?
