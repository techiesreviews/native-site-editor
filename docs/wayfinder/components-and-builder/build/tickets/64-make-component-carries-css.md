---
title: Make component copies the element's page CSS into the component
type: task (AFK)
status: closed
assignee:
blocked_by: [10-card-becomes-component]
builder: claude ★
phase: 2
---

## What

Decided at handoff (2); the problem is ticket [01](../../tickets/01-research-masters-and-components.md) §6 and research 06 edge case 14. The rules that styled the selected element are copied into the new `<tag>.css` (and the card's, slice 10), rewritten so the component looks the same. Page CSS is left alone.

What is correct for whole-element slots:

- The loader clones the page's stylesheets into each shadow root (starter `components/components.js`, `define`) and the template keeps the element's classes, so page rules already reach the template's own elements (the fallbacks). What breaks is the page's slotted content: `<h2 slot="title">` is a light-DOM child of the host, outside `.intro`.
- Find the rules: in the page's stylesheets (with `@import`s), every rule whose selector matches the element or anything inside it (the editor's cascade code, `shared/cascade.ts`, `src/style-cascade.ts`).
- Rewrite each selector to start at the element: compounds that matched ancestors outside it are dropped (`main .intro h2` → `.intro h2`), since the rule styled this element; a compound that matched the element through its `id` (which moves to the instance) becomes `:host`.
- Write the template's selectors as they are, without `::slotted()`: the loader and the preview add each selector's `::slotted()` twin (`withSlottedRules`, `shared/slotted-css.ts`), so `.intro h2` also reaches `<h2 slot="title">`. With whole-element slots the slotted element is the subject, which `::slotted()` can take.
- A rule whose subject sits inside a slotted element (`.intro h2 a`, `.intro p strong`) can't be reached from the shadow root: `::slotted()` takes only the slotted element itself, and only document CSS reaches its descendants. Inherited properties still flow from the slotted element. Copy nothing for these; list them in the making mode's notes ("2 rules can't follow the parts into the component: …"). Decided with Lex (2026-10-09): list them and copy nothing; the site's page CSS is never edited.
- Keep `@media`, `@supports` and `@container` wrappers and the rules' order; drop `@layer` (component CSS is unlayered and wins over the shared layers, as the conventions say). Keep `var(--…)` as is: tokens inherit into the shadow.
- Rules for the card's items go to the card's CSS.

## Done when

- Unit tests for the rewrite: ancestor compounds dropped; `id` → `:host`; at-rule wrappers kept, `@layer` dropped; order kept; a subject inside a slotted element reported and not copied; card rules go to the card's CSS.
- Nightly browser spec: a test section styled by `.intro h2`, `.intro .lead` and `main .intro .actions a` keeps the same computed styles on its heading, lead and links after Make component.

## Done (2026-10-09)

- `withPageCss` (`src/page-builder/component-css.ts`, loaded when Make component opens) reads the page's stylesheets (imports expanded) with a small source-level selector matcher and copies a rule only where it stops reaching an element once it is an instance (`p a`, `h2` still reach slotted parts; `.intro .actions` the template), rewritten to start at the element: ancestor compounds dropped, an id compound `:host` (`:host > section >` before a child combinator), a link card's `a` → `article`; `@media`/`@supports`/`@container` kept, `@layer` dropped, order kept, `url()`s rewritten for the component's folder. Each copy is checked against the template as its shadow root holds it (slots in place, twins `::slotted()` can take); a subject inside a slotted part, a rule that depends on the element's siblings, or a copy that can't reach its element is listed in the plan's notes and not copied; card items' rules go to the card's CSS. The Make component dialog shows the notes.
- Commits "Make component: copy the page rules that styled the element into its CSS" and two review-fix commits on `dev` (the dialog's proofs cover the stylesheets; `unquote` in `shared/css-imports.ts` decodes CSS escapes).
- Tests: `tests/component-css.test.ts` (flattening, ancestors dropped, id → `:host`, wrappers and order, stranded subjects, siblings, state rules and urls, card rules, link card); `native-cards.spec.ts` "Make component copies the rules…" (computed styles of heading, lead and links unchanged).
- Known limits: a document rule that matches a slotted element directly beats the copied `::slotted()` twin (outer context wins); rules from different layers lose their layer order once copied unlayered.
