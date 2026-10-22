---
title: "Review findings: explanation notes and sub-bullets never count as findings"
type: task (AFK)
status: open
assignee: lead-sf15 (this session)
builder: claude
blocked_by: [10-review-findings-severity]
---

## Goal

On 2026-10-22 four clean or nearly clean Claude reviews blocked `kit pr` (PRs #125, #127, #128 and #126) because `scripts/agents/review-findings.mjs` read text that is not a finding as a finding without a severity, which always blocks:

- explanation bullets under `Spec: none` / `Standards: none` or `Spec: None. I checked …` (the reviewer explaining why there are no defects);
- indented sub-bullets of one finding (`- a.ts:1 — P3: …` followed by `  - "Commits" names …`);
- the lead landed each with a recorded `--waive`.

Follow-ups from slice 10's last review also belong here: a `Spec defects` / `Standards defects` label after the notes section reads as plain text (rare heading order), and a bulleted bare group inside a defects-label section moves the finding to another group.

## Decided behaviour

- An indented sub-bullet (more indentation than the bullet above it) belongs to that finding's text; it is never a new finding.
- A group whose first line says `none` (any case, with or without a following sentence, for example `Spec: None. I checked …`) has no findings; bullets under it are notes, until the next heading.
- A defects heading after the notes section opens its group as a defects heading (fail closed: a real fault there must block).
- A bulleted bare `Spec:` / `Standards:` inside a defects-label section stays in that section's group.
- Everything else from slice 10 stays: severity window, blocking rules, Validation gaps without severity, Optional nits ignored.

## Files

- `scripts/agents/review-findings.mjs`
- `tests/review-findings.test.ts` (use the four real review files from 2026-10-22 as fixtures, trimmed: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/lead-sf11/20261022T133021Z/result.md`, `lead-sf12/20261022T133254Z/result.md`, `lead-92/20261022T134125Z/result.md`, `lead-sf10/20261022T140235Z/result.md`; copy the relevant parts into the test, not the files)

## Done when

- Tests prove: each of the four real reviews parses to the findings a person would count (no severity-less blocker from notes or sub-bullets); a real P1 after `none` notes in a later group still blocks; the two slice-10 follow-up cases.
- `scripts/agents/kit unit tests/review-findings.test.ts tests/kit-pr.test.ts tests/kit-slice.test.ts tests/kit-fix.test.ts` and `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-sf15 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sf15 --timeout 2h`.
