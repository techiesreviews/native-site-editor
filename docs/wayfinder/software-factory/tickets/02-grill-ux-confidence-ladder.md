---
title: Decide the UX confidence ladder
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Lex: "auto releases can work at a stage; now the results are not what I expect from a UX perspective, so how can we climb that confidence level?" What does good UX mean for this editor in a form agents can check (the interaction contract, a UX rulebook, before/after screenshots, prototypes approved before building)? What are the rungs (from "Lex checks everything" up to "some kinds of change release on their own"), what evidence moves the work up a rung (for example N features in a row with no UX correction from Lex), and what moves it back down?

## Resolution (2026-10-22)

Decided with Lex, informed by [Map today's production line and where it went wrong](01-research-line-today.md) (35 items Lex found on preview after tests and review passed: 7 real bugs, 9 too much text or decoration, 8 looks below the bar, 11 behaviour that felt wrong once used):

1. **One UX rulebook** of how the editor should look and feel, seeded from the interaction contract and Lex's past corrections; every new correction is added, and where possible becomes an automatic check.
2. **Mock-up before building** for every visible change; Lex clicks through and approves it; the build must match it (screenshots side by side). Lex: **work the atomic design way** (atoms, molecules, organisms, templates, pages): mock-ups are assembled from approved parts of the editor's design system, so approval moves from whole screens to small reusable parts. Detail in [Decide the atomic design catalogue](09-grill-atomic-catalogue.md).
3. **UX review of every visible change** by Claude Opus 5.5 against the rulebook with screenshots, before it reaches preview. Lex: **move it into the kit** (a `kit` command) so fixed checks run as scripts first (layout findings, design tokens, only catalogue parts, text length) and the model only sees a small, focused bundle, to save tokens.
4. **Rungs:** (1) Lex checks everything before release (today); (2) Lex checks a sample, the UX reviewer checks everything; (3) changes with nothing visible release on their own once every check passes, visible ones wait for Lex; (4) small visible changes release on their own, bigger ones wait. **Up one rung after 5 builds in a row with no UX correction from Lex; down one rung whenever Lex finds a UX problem after release.**
