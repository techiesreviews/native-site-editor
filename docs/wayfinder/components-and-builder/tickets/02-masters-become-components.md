---
title: Decide how masters and page parts become components
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-masters-and-components]
---

## Question

Ticket 01 found no masters in any real site, and the masters code was never on `main`. So nothing needs converting: retiring masters means removing about 4k lines of code and their tests. That leaves three questions.

1. **Header and footer markup.** Slot each nav link into the page (`<a slot="link">` per link, so the links are visible without JS, but each page carries its own copy of the nav), or keep the links in the template (one place to edit, but no links without JS)? What about the skip link?
2. **Removal order.** Should the masters code and `.editor/page-builder.json` go before Make component returns to the edit bar (`main.ts:642`), or together with it?
3. **Wording.** What changes in `site-conventions.ts:52`/`:58`/`:69`?

## Resolution (2026-10-08)

Decided with Lex.

1. **Header and footer markup.** The nav links stay in the template, so a nav change is one edit. The direct-hosting goal allows client JS, and the editor has no tool for editing 100 page copies. The **skip link moves out** of the header: each page carries `<a class="skip" href="#main">Skip to content</a>` as a plain link right before `<site-header>`, so it works without JS. Its style moves from `site-header.css` to the shared CSS. Header and footer keep no slots.
2. **Removal order.** The masters code, `.editor/page-builder.json` and their tests (about 4k lines, about 139 unit and about 71 browser tests, three Playwright projects) are removed in **their own slice first**, as pure deletion. A second slice then puts Make component back on the edit bar in the place `main.ts:642` frees.
3. **Wording.**
   - `site-conventions.ts:52` becomes: "The header and footer are components with no slots: their nav links live in the template, so changing the nav is one edit. Each page puts the skip link, `<a class="skip" href="#main">Skip to content</a>`, before `<site-header>` as a plain link, so it works without JavaScript; its style lives in the shared CSS, not the header's."
   - `site-conventions.ts:69` drops "add the tag to the loader and `site.css`", which contradicts `:58`. It becomes "Write both files, then place it with add_section…".
   - Ticket 05 (what agents are told) starts from this wording.

Changing techies-reviews and the starter (moving the skip link out of the header) belongs to the map's "Starter updates" fog.
