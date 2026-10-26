---
title: Decide how page scores show and are measured
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [05-grill-automatic-fixes]
---

## Question

Lex, 2026-10-26: "perhaps we could have a visual overview per page in the page overview of the score, so people know what can be improved, but it should not be distracting". Decide where scores show, how the editor measures them, and how the measuring stays in step with Lighthouse.

## Answers so far (2026-10-26)

- **Where (Lex: "A and C"):** a small score ring on every row in Pages, and a separate site health overview listing every page with its four scores.
- **How measured (Lex: "Yes A, and is it possible to do this on the user's computer, and match the things from Lighthouse as close as possible, and update the tool that measures it every time Lighthouse has a change?"):** the editor's own checks, run on every save on the user's computer, matching Lighthouse's four categories as closely as possible, and updated with every Lighthouse change.
- **Prototype:** [05-page-scores.html](../prototypes/05-page-scores.html), also at `am-typing-together-poc.lexvd.workers.dev/mockups/page-scores.html`:
  - one 14 px ring per row, filled to the page's lowest score; it replaces the per-page Inbox dot;
  - page details with four rings and "What to improve";
  - Site health from the project menu and the Inbox header.

  Waiting for Lex's verdict.
