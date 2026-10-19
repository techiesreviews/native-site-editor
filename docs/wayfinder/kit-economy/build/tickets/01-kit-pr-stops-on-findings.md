---
title: "kit pr: stop on open review findings"
type: task (AFK)
status: ready-for-agent
assignee:
blocked_by: []
builder: sol
---

## What

Today `kit pr` (`scripts/agents/kit.d/pr`) posts the review (a saved one from `savedReview()` that
covers this exact HEAD and merge base, else it runs `kit review --pr N`), prints `review: ok` and
merges once CI is green, whatever the review says. Tickets 06 (PR #37) and 27 (PR #55) of the
Durable Object build merged with findings still open.

- **Open findings parser** (pure function, own module `scripts/agents/review-findings.mjs`, or in
  `kit-lib.mjs`): `openFindings(resultMd)` returns `{ findings: [{ group, text }], readable }`.
  The format comes from `reviewFormat` in `scripts/agents/review-brief.mjs`
  (`REVIEW_STATUS: complete`, `Defects:` with Spec and Standards groups, `Validation gaps:`,
  `Optional nits:`). Real reviews in the main root `.scratch/reviews/dor-*/*/result.md` vary; the
  parser handles every variant seen there, each as a fixture in the test:
  - `Defects:` followed by `Spec:` / `Standards:` sub-headings with `- ` items;
  - `Defects — Spec` / `Defects — Standards` headings (with or without `**`);
  - one-line groups (`- Spec: none.`, `Spec: none.`, `- Standards: none. No applicable …`);
  - inline section values (`Validation gaps: none.`, `Validation gaps: none beyond …`);
  - items in bold, with `commit:path:line — P1:` prefixes, or spanning several lines.
  An **open finding** is each item under Defects (Spec or Standards) or Validation gaps whose text
  does not start with "none" (case-insensitive, after list markers, bold and the group label).
  `Optional nits` never count. A result without `REVIEW_STATUS: complete` or without a Defects
  heading is `readable: false` and counts as one open finding "review format unreadable".
- **kit pr** after posting the review that covers HEAD (saved or fresh; the fresh one's
  `result.md` is the evidence folder named in `kit review`'s RESULT line):
  - open findings → print them, one line each (group + first 160 characters), at most 15 then
    `… and N more`; leave the PR open (no merge, no `kit wait ci`); exit 1 with
    `RESULT: fail pr #N review has <n> open findings (<result.md path>)`.
  - none → continue to CI and merge as today.
  - A rerun after new commits finds no saved review covering the new HEAD, reviews again and merges
    when clean (no new code needed for that; add a test that proves it).
- **`--waive "<reason>"`** (lead only: refused unless the owner from `kitOwner()` ends in `-lead`):
  merges despite open findings, posts a PR comment "Merged with N waived findings: <reason>" and
  adds "merged with N waived findings: <reason>" to the PR body (REST PATCH, as the body update does
  today). `kit slice` (ticket 04) never passes `--waive`.
- Tiers docs/css/tests/full are unchanged; the docs tier has no review and is unaffected.
- `--help` shows `--waive`; `docs/agents/agent-scripts.md#kit` gets the stop rule and `--waive` in
  the `kit pr` line.

## Files

- `scripts/agents/kit.d/pr`
- `scripts/agents/review-findings.mjs` (new; or a function in `scripts/agents/kit-lib.mjs`)
- `tests/kit-pr.test.ts`
- `tests/review-findings.test.ts` (new; fixtures inline or under `tests/fixtures/review-findings/`)
- `docs/agents/agent-scripts.md`

## Done when

- `openFindings` is unit-tested with one fixture per format variant above (open and none), a review
  with only nits (0 open), a validation gap only (1 open, the ticket 06 case) and an unreadable result.
- `tests/kit-pr.test.ts` (fake `gh`/kit, real git against a bare origin) proves: saved review with
  findings → no merge, no `kit wait ci`, findings printed (capped at 15), exit 1, RESULT line names the
  count and path; fresh review with findings → same; clean review → merge as before; rerun after a
  new commit → new review, merge when clean; `--waive` by a `*-lead` owner merges and posts the reason;
  `--waive` by another owner exits 2; docs tier unchanged.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-pr.test.ts tests/review-findings.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
