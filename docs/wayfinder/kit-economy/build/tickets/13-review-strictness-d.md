---
title: "Review strictness D: strict for three fix rounds, then only serious findings block"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-pr-stops-on-findings, 04-kit-slice, 11-review-reuse-and-fix-fallback, 12-slice-brief-guard-ci-digest]
builder: sol
---

## What

Lex's decision (2026-10-19, option D). Today every open finding blocks the merge forever: after the
three `kit fix` rounds a slice leaves its PR unmerged even for a minor nit-like defect or a missing
test, and the lead has to `--waive` or hand-fix it. New rule:

- **During the fix rounds** (fewer than 3 completed `kit fix` rounds on the branch): every open
  finding blocks, exactly as today.
- **After 3 completed rounds**: only **blocking** findings stop `kit pr` and `kit slice`. Blocking =
  a Defect (Spec or Standards) of severity P0 or P1, a Defect with no readable severity (fail
  closed), or an unreadable review. Spec defects that break an item of the ticket's "Done when" are
  P0/P1 by definition (the reviewer is told so, see a). P2/P3 Defects and Validation gaps do not
  block: they merge, are posted on the PR and are listed as follow-ups in the ticket's Done section.
- `--waive "<reason>"` (lead only) stays exactly as it is; `kit slice` still never passes it.

### a. Severity in the review format

`reviewFormat` in `scripts/agents/review-brief.mjs` asks every Defect item to carry a severity,
written as `P0`, `P1`, `P2` or `P3` right after its location (`commit:path:line — P1: …`), and
defines them in one or two lines each:

- P0: data loss, security hole, broken build/tests, or the change does not work at all.
- P1: wrong behaviour a user or runner would hit, or a Spec defect that breaks a "Done when" item.
- P2: real but minor defect (edge case, misleading message, standards breach with low impact).
- P3: cosmetic or style.

Validation gaps carry no severity. Keep the first-line `REVIEW_STATUS: complete` rule.

### b. Parser

In `scripts/agents/review-findings.mjs`:

- `openFindings` keeps its result and adds `severity` to each finding: `"P0"`–`"P3"` or `null`.
  Accept the variants reviewers write: `P1:`, `P1 —`, `**P1**`, `(P1)`, `[P1]`, `Severity: P1`,
  `severity P1`, after an optional `commit:path:line — ` prefix (case-insensitive; the first
  `P0`–`P3` token in the item's first 80 characters wins). Validation gaps get `severity: null`.
- New pure `blockingFindings(findings)` returns the Defects with severity P0/P1 or `null`, plus the
  "review format unreadable" finding. Validation gaps and P2/P3 Defects are never blocking.
- New pure `afterFixRounds(rounds)` (or a constant `FIX_ROUNDS = 3` exported beside it) so `kit pr`
  and `kit slice` share the threshold.

### c. Completed rounds

`kit pr` needs the branch's completed `kit fix` rounds. Add one helper (in `kit-lib.mjs` or
`review-findings.mjs` with the directory passed in) that counts `round-N.md` files under
`.scratch/kit-fix/<encoded-branch>/` of the main root, minus a round still pending (`pending.json`
present for that round). A branch that never ran `kit fix` has 0 rounds and stays strict.

### d. kit pr

After it obtains the review covering HEAD (saved, reused or fresh):

- Rounds < 3: unchanged (any open finding stops it, same output and RESULT line).
- Rounds ≥ 3 and blocking findings: stop as today, listing the blocking ones first; the RESULT line
  keeps its format `RESULT: fail pr #N review has <n> open findings (<path>)` with `n` = blocking
  count, so `kit slice`'s parser keeps working.
- Rounds ≥ 3 and only non-blocking findings: print
  `review: <n> follow-ups after 3 fix rounds (non-blocking)`, then
  1. post one PR comment `Follow-ups (non-blocking after 3 fix rounds):` with one line per finding
     (group, severity or "gap", first 160 characters), and add the same list to the PR body (REST
     PATCH, as the waiver does);
  2. with `--ticket`, append the same list under `### Follow-ups` at the end of the ticket's
     `## Done` section (create the subsection if missing; idempotent on rerun), commit it as
     `docs: <ticket slug> follow-ups from review` and push before waiting for CI;
  3. wait for CI and merge as today, pinned to the new head.
- **Review coverage survives that commit.** A review that covers commit X also covers HEAD when X is
  an ancestor of HEAD and `git diff --name-only X HEAD` lists only the `--ticket` file. Apply this one
  rule (a shared helper) wherever coverage is checked (`kit pr`'s `savedReview`, `kit slice`'s
  moved-HEAD and covering checks). Any other changed path still needs a new review.
- `--waive` still overrides blocking findings; when both apply, record the waiver and the
  follow-ups separately.

### e. kit slice

- After the fix loop: if findings remain and rounds ≥ 3 with none blocking, finish the fix phase
  (`slice: fix ok 3 rounds, <n> follow-ups`) and run the pr phase (`kit pr` adds the follow-ups).
  Blocking findings after the rounds: unchanged (PR opened unmerged, fail with the findings digest).
- The resume rule that reopens fix/pr when the covering review has findings uses the same
  blocking rule once rounds ≥ 3, so a rerun does not loop.
- The builder brief is unchanged.

### f. Docs

`docs/agents/agent-scripts.md` (the `kit pr`, `kit slice` and `kit review` lines only) and
`docs/agents/runner.md` (the slice and manual review/landing paragraphs): the D rule in two or three
sentences, the severity scale, follow-ups in the PR and the ticket's Done, `--waive` unchanged.

## Files

- `scripts/agents/review-brief.mjs`
- `scripts/agents/review-findings.mjs`
- `scripts/agents/kit-lib.mjs` (rounds helper only, if it lives there)
- `scripts/agents/kit.d/pr`
- `scripts/agents/kit.d/slice`
- `tests/review-findings.test.ts`
- `tests/kit-review.test.ts` (format text only)
- `tests/kit-pr.test.ts`
- `tests/kit-slice.test.ts`
- `docs/agents/agent-scripts.md`
- `docs/agents/runner.md`
- this ticket

## Done when

- `tests/review-findings.test.ts`: severity parsed for every variant in b (and `null` when absent);
  `blockingFindings` on P0, P1, P2, P3, no severity, validation gap only, unreadable review.
- `tests/kit-pr.test.ts` (fake `gh`, real git against a bare origin): 2 rounds + a P3 → stops as
  today; 3 rounds + P2 and a validation gap → merges, PR comment and body list both, ticket Done gets
  `### Follow-ups` in a new commit, the saved review is reused for that commit (no second review),
  rerun does not duplicate the list; 3 rounds + a P1 → stops, RESULT counts blocking only; 3 rounds +
  a defect without severity → stops; a non-ticket file changed after review → new review; `--waive`
  unchanged.
- `tests/kit-slice.test.ts`: 3 rounds ending with only P2/P3 → pr phase runs and the slice succeeds;
  ending with a P1 → PR left unmerged, slice fails as today; a resume after the follow-ups commit
  does not re-review or loop.
- `kit unit --affected` passes; `npm run check` and `npm run lint` pass.
- Sol review via `kit review --ticket` under the rules above; landed via `kit pr --ticket` into `dev`
  with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
