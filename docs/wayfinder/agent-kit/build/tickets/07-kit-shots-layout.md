---
title: "kit shots: layout check on every shot"
type: task (AFK)
status: open
assignee:
blocked_by: [06-kit-shots-core]
builder: sol
---

## What

- Runs in the page after each shot and returns findings `{kind, selector, text, detail}`:
  - controls (buttons, links, inputs, `[role=button]`) cut off by an ancestor's overflow or outside the viewport;
  - overlapping interactive elements (bounding boxes intersect by > 4 px, neither contains the other);
  - tap targets under 44×44 px at widths ≤ 768 (touch sizes), skipping inline text links;
  - text contrast below WCAG AA (4.5:1, 3:1 for ≥ 24 px or ≥ 18.66 px bold) from computed colours over the nearest opaque background;
  - horizontal overflow (`scrollWidth > clientWidth`) at 320 and 390 px.
- Visible elements only; at most 10 findings per kind per shot, then a count.
- Printed as a short list by `kit shots`; counts in its RESULT line.

## Files

- `scripts/agents/shots/layout-check.ts`
- `tests/kit-shots-layout.test.ts`

## Done when

- Fixture HTML pages in the test (loaded in Chromium through Playwright) trigger each finding once, and a clean page gives none.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
