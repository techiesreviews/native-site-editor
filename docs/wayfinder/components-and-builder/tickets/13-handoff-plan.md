---
title: Write the handoff plan
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-masters-become-components, 04-prototype-making-components, 05-what-agents-are-told, 08-accessible-tone-text, 09-prototype-add-existing-page, 12-prototype-drag-and-drop, 14-prototype-edit-component-visually, 15-dedup-on-make-component]
---

## Question

Turn the decisions into an ordered build plan: phases and slices, which builder (Sol or Claude) takes each, Astra review, the browser checks each adds, starter and techies-reviews follow-ups, and the order of the master retirement relative to Make component. This ticket closes the map.

## Resolution (2026-10-09)

Decided with Lex. The plan is [build/spec.md](../build/spec.md) with its slices in [build/tickets/](../build/tickets/) (index: [build/README.md](../build/README.md)).

1. **Phase order:** removals (the masters code first, as its own slice) → component model → Make component and New component → block builder → Edit component mode in place → Add card → tone.
2. **One run, tiny slices, straight into `dev`.** Each slice: its own branch and worktree from `dev`, build, `check`, unit tests, the touched browser specs, Sol review, merge into `dev`, `deploy:preview`, screenshots on the real starter. The work goes on without waiting for Lex; his feedback, whenever it comes, becomes new slices. The lead tells Lex where his help is needed.
3. **Builders as in the last map:** Sol (codex) takes mechanical slices, Claude agents the judgment-heavy ones (★); Sol (gpt-6.1-sol) reviews every branch read-only before merge.
4. **Tests:** unit tests for every pure rule and one `@smoke` browser spec per feature's main path; edge cases in nightly specs.
5. **Testing by Lex:** no test-guide file; step-by-step instructions in chat when he asks.
6. **Sites:** the starter's changes are slices in this run, on a `dev` branch of the starter repo, merged to its `main` only when Lex says ship. techies-reviews is a separate effort afterwards.
7. **Production:** nothing reaches `main` or `deploy:techies` until Lex says.
8. **Open points found while writing the plan** (page CSS on Make component, card links, the page's items, what an items slot is, when pages are rewritten, the placeholder image, one chip everywhere, tag names without a hyphen, which elements Make component works on, touch, content kept aside on a look swap) were decided with Lex and are listed in the spec under "Decided at handoff".

