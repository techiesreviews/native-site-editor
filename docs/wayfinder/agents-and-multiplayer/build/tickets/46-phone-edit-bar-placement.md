---
title: "Where the edit bar sits on a phone, so it doesn't cover the element above (follow-up on 43)"
type: task (HITL)
status: ready-for-human
assignee:
builder: claude
blocked_by: [43-phone-edit-bar-fixes]
---

## Goal

Ticket 43 decided "the bar never covers the element above it", but no fix was made. At 390 px the bar sits 8 px above a paragraph, and its "Paragraph" label and controls cover the bottom line of the card above (the "Read about Meadow Row Allotments" link on the starter). Every placement above an element covers whatever sits just above it, and today's rule (F-bar-01) only protects the selection. A placement decision is needed before anything is built. Shots: `.scratch/ux/am-43-builder/20261029/editor-F-bar-03-390-{light,dark}-size-strip.webp` (main checkout).

## Question for Lex (Tuesday pack)

On a phone, when the space above the selected element is full of other content, where should the edit bar go?

- **A. Keep it above (today).** It may cover a line of the element above for as long as the selection lasts. Nothing changes.
- **B. Scroll the page so the bar gets clear space above or below.** The page moves a little when you select something. Where there's no clear space (a dense page), it falls back to A.
- **C. Dock it to the bottom of the canvas on phones**, like a keyboard toolbar. It never covers page content near the selection, but it sits further from what you selected.

Default if not answered: A, which is easy to change later.

## Files

- the edit bar's placement (`src/components/edit-bar-placement.ts`, `src/components/edit-bar.ts`) and their tests
- the F-bar-01 entry in `docs/agents/features.md` (its Good line)

## Done when

- The chosen placement holds at 390 px light and dark in the F-bar-01 and F-bar-03 UX checks (shots in the Done), with a unit test in `tests/edit-bar-placement.test.ts`.
- `kit unit --affected`, `kit specs --affected`, `kit doctor` pass.
