---
title: "kit shots: layout check on every shot"
type: task (AFK)
status: closed
assignee: ak-07
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

## Done (2026-10-16)

**Behaviour.** `checkLayout(page)` runs one evaluation in the editor's top
document (the site preview iframe is the user's site) and returns
`{kind, selector, text, detail}` findings: `clipped`, `overlap`, `tap-target`,
`contrast`, `overflow`; at most 10 per kind, then a `+N more` finding.
Tuned on all 13 screens at 390 and 1280 px, light and dark (three tuning runs
of 52 shots). Known-fine patterns that no longer report:

- controls and text covered by another layer (the floating explorer panel,
  sheets): hit-tested with `elementFromPoint`;
- a control peeking out from under a floating panel (layering, not a collision);
- the body of a closed `<details>` (`checkVisibility()`);
- text over a picture or a `::before`/`::after` scrim, unless the text has its
  own opaque background;
- visually-hidden text, inert/hidden/closed dialogs and popovers, everything
  under an open modal, decorative icons inside a bigger control (from Sol's build).

**Deviation from the ticket (lead decision).** Tap targets: under 24 px always
reports (WCAG 2.5.8 AA). From 24 to 43 px it reports only when the 44 px zone
centred on the target reaches a neighbouring control. Same-looking repeats (a
rail, a list) collapse into one finding (`x16 alike`). The strict 44 px rule
put 10+ findings on every phone shot (32 px header buttons, 36 px block rail).
The Sol review flagged this as a spec gap; kept on purpose.

**Real findings (final run, 35 findings over 52 shots):**

- every screen, 390 px: "More publish actions" 29x32 px, flush against Publish;
- editor, image-popup, structure, 390 px: canvas device buttons 28x24 px x3, packed;
- files, 390 px: file rows 350x32 px x16, no gap between rows;
- structure, 390 px: "Add" 61x30 px, 7 px under the sheet handle; the
  code-pane "body elements" chip is 20 px tall;
- image-popup, 1280 px light: the "Original" badge in the edit bar is 3.7:1
  (#fbfbfd on #5a81d5, needs 4.5).
- No clipped controls, real overlaps or horizontal overflow on any screen.

**Commits.** b0312374 (Sol build plus tuning), dc814e28 (review fixes).
**Tests.** `tests/kit-shots-layout.test.ts`, 34 Chromium fixture cases (one per
kind, clean page, each known-fine pattern, layering, grouping, cap);
`unit.sh` full 3690 pass; `npm run check`, `npm run lint` pass.
**Review.** Sol, `.scratch/reviews/ak-07/20261016T131240Z` (main root). Fixed 2:
form-field values now count as text for contrast; an opaque text background
over a picture is still checked. Rejected 1: isolated 24–43 px targets (the
tuning above).
**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-07/final/`
(contact.webp, index.json with `layoutFindings`).
**Not done here.** `kit shots` prints only the count in its RESULT line; printing
the per-shot list needs `scripts/agents/shots/cli.ts`, outside this ticket.
