---
title: Decide how search in Pages and files works
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-research-structure-and-search]
---

## Question

Names and addresses plus picture names and descriptions (Lex, 2026-10-26). Decide how results show (in each part of the panel, or one list across Pages, Media and Files), what a result opens, keyboard use, and whether the map uses the same search.

## Resolution (2026-10-26)

Lex, after trying the [site map prototype](../prototypes/08-site-map.html) (also at `am-typing-together-poc.lexvd.workers.dev/mockups/site-map.html`) and being asked for his round 1 answers: "looks good". Taken as yes to the prototype and to every round 1 recommendation (Q1–Q11).

- **One search field** in the left panel: one list grouped under Pages, Media and Files, filtering as you type. Clicking a result opens it.
- **What it searches:** page titles, file names and addresses, plus picture names and descriptions. `.editor/media.json` is read on the first key press if Media was never opened.
- **In the map:** matches light up and the rest fade. Enter zooms to the first match.
- **Matching:** one shared module (DRY), built from the palette's matcher (`src/page-builder/palette-search.ts`), replacing today's six matchers. Word starts rank first ("gp" finds garden-photo), and middle-of-word matches ("rden") rank below them. It has "best first" and "keep the order" modes. No index.
