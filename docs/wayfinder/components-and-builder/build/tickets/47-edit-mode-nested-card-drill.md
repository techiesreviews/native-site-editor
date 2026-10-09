---
title: "Edit component mode: open a nested card component"
type: task (AFK)
status: closed
assignee:
blocked_by: [41-edit-mode-shell]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §3: a nested card component opens with "◇ card-project ›" in the label (or "Open ›" on its Structure row), and the breadcrumb leads back out.

- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-tree.ts` (`treeHooks` crumb and drill `:23`), `cb14-app.ts` (the mode's chain).

## Done when

- Nightly spec: open the card from the section's mode, edit its fixed text, go back by the breadcrumb.

## Done (2026-10-09)

- In Edit component mode a component instance inside the template reads "◇ Card project ›" on the edit bar ("Open Card project component") and opens its template in place: the mode keeps a chain (`edit-component-chain.ts`), the frame message carries the nested levels and the runtime walks shadow roots to frame the innermost (no reload). The slim bar reads "Editing <section-work> › <card-project>"; an earlier crumb goes back and selects the instance opened; a tag already in the chain returns to its level. Placeholders reach every opened level; this page's content is refused while it would hide an opened fallback (filled or a section's hidden slot), and opening one hidden by it switches to placeholders. Structure's "Open ›" row variant (`opens`) waits for slice 46's template rows.
- Commits "Edit component mode: open a nested component and back by the breadcrumb (slice 47)" and its review fix on `dev` (built with Sol). Tests: `tests/edit-component-chain.test.ts`; `native-edit-component-drill-actual.spec.ts` (@actual: open the card, edit its text in place, back by the crumb, reopen, Done, same frame document; refusal of this page's content; card-note level with its own fallback; Esc keeps the chain; a section's unfilled slot).

