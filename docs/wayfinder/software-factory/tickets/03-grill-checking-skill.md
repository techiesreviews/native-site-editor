---
title: Decide the acts-like-a-user checking skill
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-grill-ux-confidence-ladder]
---

## Question

A skill with a list of every editor feature that drives the real editor like Lex would and reports what broke or looks wrong. What does the feature list hold and who keeps it current; when does it run (each slice, each preview deploy, before release); what does it report and how (screenshots, recordings, a pass list); how does it judge UX, not only "works"; what does it cost per run?

## Comments

- 2026-10-22, Lex (UX ladder): the UX review becomes a kit command, scripted checks first and a small focused bundle for the model, to save tokens. Decide it together with the checking skill here.

## Resolution (2026-10-22)

Decided with Lex (all as recommended):

1. **Feature list:** one plain-words list of every editor feature, each with how to try it and what good looks like (linked to the UX rulebook). A visible change cannot land unless its slice updated the list.
2. **When:** after each visible slice, only the features it touched; the whole list once before Lex's end check.
3. **Report:** per feature tried, fine / looks off / broken, with a screenshot or a short recording.
4. **One kit tool with the UX review** ([Decide the UX confidence ladder](02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 3): scripted checks first (layout, design tokens, catalogue parts only, text length), then the Opus reviewer compares screenshots with the rulebook and the approved mock-up.
