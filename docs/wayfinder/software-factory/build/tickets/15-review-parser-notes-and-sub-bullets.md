---
title: "Review findings: explanation notes and sub-bullets never count as findings"
type: task (AFK)
status: closed
assignee: lead-sf15
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

## Done (2026-10-22)

- `openFindings` (`scripts/agents/review-findings.mjs`): a group whose first line says `none` (any case, inline or as its first line or bullet, with or without a following sentence) now holds notes until the next heading, so explanation bullets and plain lines under `Spec: none` / `Standards: None. I checked …` never count. A line under the notes that starts with a location and names a severity (`- b.ts:2 — P1: y`) still counts as a finding in that group, with its sub-bullets (fail closed), so an unrecognised later heading or a `- Standards: none` group cannot hide it. Indented sub-bullets stay part of the finding above them.
- A `Spec defects` / `Standards defects` heading after Validation gaps or Optional nits opens its group when it is unbulleted and either has no inline text, carries `#` / bold markup, or names a severity in its inline text (fail closed). A bulleted label, or a plain unbulleted label with severity-less inline text (`Standards defects: add a race test`), stays gap or nit text as decided in slice 10 round 2; this narrows the ticket's "a defects heading after the notes" to heading forms and severity-bearing lines. A review whose only defects heading comes after the notes is now readable and its P1 blocks, where it used to be unreadable.
- Inside a section opened by a defects label, a bulleted bare `- Spec:` / `- Standards:` stays in that section's group, except after that section's `none` notes, where it opens its own group so a real fault still blocks, or when it says `none` itself (`- Standards: none`), where it opens its group as notes so neither it nor its sub-bullets join the finding above; an unbulleted bare one still switches group. Bullets under a `Validation gaps: none.` line are notes, not gaps.
- Tests (`tests/review-findings.test.ts`): trimmed copies of the four 2026-10-22 reviews (lead-sf11, lead-sf12, lead-92, lead-sf10) parse to the findings a person counts, none blocking; none groups with notes and sub-bullets; a real P1 in a later group after none notes still blocks; both slice-10 follow-ups (late defects heading in four forms; bulleted bare group in a defects-label section). Six of the new and changed tests fail against the old parser. Review round 1 added: a P1 after none notes in a defects-label section, late inline labels (bold, with a severity, after Optional nits, plain text), and bullets under a none gap group. Review round 2 added: a bulleted `- Standards: none` with a note after a Spec finding, an unbulleted `None.` first line under a bare heading, and a combined `Defects` group whose first bullet says none (its notes are skipped; since round 3 a located P1 there counts). Review round 3 added: located P1 findings under none notes after an unrecognised `### Standards (…)` heading, after a bulleted `- Standards: none`, and after a first line opening with "None of …".
- Commits: `400ca414` (parser, tests, ticket), `028d25da` (review round 1), `966f0631` (review round 2), plus this branch's review round 3 correction commit.
- Validation: `kit unit tests/review-findings.test.ts tests/kit-pr.test.ts tests/kit-slice.test.ts tests/kit-fix.test.ts` → `RESULT: ok unit 266/266 (4 files)`; `kit unit --affected` → `RESULT: ok unit 176/176 (2 files)`; `npm run check` and `npm run lint` pass.

### Follow-ups

- Spec (P2): 09102b29:scripts/agents/review-findings.mjs:63 — P2: `none` is `/^none\b/i`, so any group whose first line starts with "None of …" or "None in …" becomes a note
- Spec (P2): 0ca82277:scripts/agents/review-findings.mjs:82 — P2: The decided behaviour says "A defects heading after the notes section opens its group … (fail closed: a rea
- Spec (P3): 8592c767:docs/wayfinder/software-factory/build/tickets/15-review-parser-notes-and-sub-bullets.md:48 — P3: The "Commits" line names `400ca414`, `028d25da` and `9
- Validation gaps (gap): No test shows that a group whose first line starts with "None of …" still reports an unlocated severity finding after it. Add `openFindings(review("Spec:\n- Non
- Validation gaps (gap): No test covers a plain late defects label with severity-less text under a `Validation gaps: none.` group. Add `openFindings(review("Defects: none\nValidation ga

