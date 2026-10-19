---
title: "kit pr: stop on open review findings"
type: task (AFK)
status: closed
assignee: ke-01
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

## Done (2026-10-19)

- Added the pure `openFindings(resultMd)` parser for separate and inline groups, em-dash and bold
  headings, commit prefixes and multiline items. Defects and validation gaps count unless they
  start with “none”; nits do not count. Missing completion or Defects markers fail closed with one
  unreadable-format finding. Inline fixtures derive from sampled `dor-*` review formats.
- `kit pr` checks both saved covering reviews and fresh review evidence before waiting for CI or
  merging. It prints at most 15 findings, truncates each to 160 characters and reports the total
  and result path on failure. A new commit triggers a new review; clean reviews merge as before.
- Added lead-only `--waive "<reason>"`, validated through `kitOwner()`. Successful merges record
  the count and reason in a PR comment and a REST PATCH of the body. Help and the kit entry document
  the option and stop rule; the docs tier remains unchanged.
- Validation: 53 focused tests cover format variants, nits, validation gaps, unreadable or missing
  evidence, saved/fresh findings and clean reviews, output caps, reruns after a new commit, lead
  authorization and waiver audit text. `npm run check`, `npm run lint` and `git diff --check` pass.
  The full unit suite was not run, following the builder brief's focused-only rule.
- Evidence: `RESULT: ok doctor 7/7 checks passed`; focused command:
  `NODE_OPTIONS=--test-reporter=spec scripts/agents/unit.sh tests/kit-pr.test.ts tests/review-findings.test.ts`,
  log `.scratch/unit/20261019T080521-2.log`. Earlier non-TTY runs passed all 53 tests but the wrapper
  rejected TAP counts; explicitly selecting the spec reporter satisfies its summary format.
- Review, commit and landing are left to the runner under the builder contract. Changes remain
  unstaged; no agents, commits, pushes or deployments were started.

Dogfood: none yet (first ticket)
