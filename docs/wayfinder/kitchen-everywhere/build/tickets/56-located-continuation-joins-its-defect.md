---
title: "A located continuation line stays with its defect (follow-up on 52)"
type: task (AFK)
status: closed
assignee: ke-56
builder: claude
blocked_by: [52-review-notes-do-not-block]
---

## Goal

Slice 52's final Claude review left one P2 ([ticket 52 Follow-ups](52-review-notes-do-not-block.md#follow-ups)): in `scripts/agents/review-findings.mjs` (about line 144) the new `located` split turns a lazy continuation line under a bulleted P2/P3 defect into its own finding with no severity, and that finding blocks. `Defects:\nSpec:\n- a.ts:1 — P2 fault: x\nb.ts:2 has the same bug.\n` gives two findings today; the second blocks `kit pr`/`kit slice` after three rounds, the false block ticket 52 removed.

## Decided behaviour

- Split on a located line only when the pending item would otherwise be a note (no location and no severity) or the line names a P0–P3 anywhere, so ticket 52's "prose paragraph, then located defect" case still splits, a second defect never hides behind the first, and a located defect's continuation lines join it.

## Files

- `scripts/agents/review-findings.mjs`
- `tests/review-findings.test.ts`, and the `scoreReview` fallback test (`scripts/agents/kit-lib.mjs:478` path) in the kit-lib or kit-review tests

## Done when

- `openFindings(review("Defects:\nSpec:\n- a.ts:1 — P2 fault: x\nb.ts:2 has the same bug.\nValidation gaps: none."))` gives one P2 finding with both lines and `blockingFindings` is `[]`; fails before the fix.
- `scoreReview` on a folder with a notes-only `result.md` and no `findings.json` gives all-zero counts and is not `unreadable`.
- Ticket 52's existing tests still pass; `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-28)

- `openFindings` (`scripts/agents/review-findings.mjs`) starts a new item at an unindented, unbulleted located line only when the item above would be a note (no location and no severity). Under a located or severity-naming defect the located line is a continuation: `Defects:\nSpec:\n- a.ts:1 — P2 fault: x\nb.ts:2 has the same bug.` gives one P2 fault finding with both lines, and `blockingFindings` is `[]`. Ticket 52's "prose paragraph, then located defect" case still splits and blocks, and a located line that names a P0–P3 anywhere always starts its own finding (one named past the 80-character severity window gets severity none and blocks), so `a.ts:1 — P3 style: x\nb.ts:2 — P1 fault: y` gives a P3 and a blocking P1. The note test is one `prose` helper shared by the split and `flush`.
- Tests: `tests/review-findings.test.ts` adds the P2 continuation case (failed before the fix), a located severity-less defect taking its continuation, and an unlocated P3 line taking one, and two located lines that each name a severity (unbulleted, and bulleted then unbulleted) staying two findings with the P1 blocking, a located line naming its P1 late splitting and blocking with severity none, a continuation joining a defect given as the group heading's inline text, and one joining a located finding kept under "none" notes; `tests/kit-score.test.ts` adds `scoreReview` on a notes-only `result.md` with no `findings.json`, giving all-zero counts and no `unreadable`.
- Validation: `kit unit --affected` RESULT: ok unit 519/519 (15 files); `npm run check` and `npm run lint` pass; `kit doctor` RESULT: ok doctor 11/11 checks passed; `kit status` RESULT: ok status all 776 tickets, 599 closed, 1 open PRs.
- Feature list: no change (internal review parsing, nothing a user sees).

### Follow-ups

- Standards (P3): 342870f51:tests/review-findings.test.ts:106 — P3 style: the test is named "…joins the P2 or located defect above it and does not block", but its second case (`a.ts:1 the guard is missing.` with no severity) is a finding that blocks. The comment inside it even says "still blocks once". The name is wrong for half of what the test covers. Rule: CODING_STANDARDS.md "Test fixtures" asks for fakes and assertions that document what they prove. That section is about typing fakes, so it applies only loosely; there is no closer rule for test names. Fix: rename it to "a located continuation line joins the defect above it; only a severity-less one blocks", or split out the located-without-severity case into its own test.
- Validation gaps (gap): `tests/review-findings.test.ts:111` (the `located` case): the comment says the merged finding "still blocks once", but nothing checks it. Add `assert.deepEqual(blockingFindings(located), located)` so a regression that drops the merged severity-less finding, or marks it P2/P3, fails.
- Validation gaps (gap): `tests/review-findings.test.ts` has no case for a bulleted prose note followed by an unbulleted located line, e.g. `Defects:\nSpec:\n- Some general remark.\nb.ts:2 the guard is missing.\nValidation gaps: none.`. It should give one note and one blocking finding, `b.ts:2 the guard is missing.`. The existing ticket 52 test covers only an unbulleted prose paragraph. The new `prose(pending.text)` branch also has to keep working when the pending note came from a bullet.
- Spec (P3): 3f5741020:docs/wayfinder/kitchen-everywhere/build/tickets/56-located-continuation-joins-its-defect.md:42 — P3 ticket: the first Follow-ups entry points at `342870f51:tests/review-findings.test.ts:106`. `342870f51` is not one of the five commits in `commits.log`; it is probably a SHA from before a rebase. The test it describes is at `tests/review-findings.test.ts:583` at HEAD, not line 106. Anyone who follows this pointer to pick up the work lands on the wrong commit and line. Fix: change the pointer to `a84271c94:tests/review-findings.test.ts:583`, or to whichever range commit added the test.
- Standards (P3): a84271c94:tests/review-findings.test.ts:583 — P3 style: the test is named "a located continuation line joins the P2 or located defect above it and does not block". Its second case (`a.ts:1 the guard is missing.\nb.ts:2 has the same bug.`, lines 587–589) produces a finding with no severity, and that finding blocks. The comment on line 587 says so ("still blocks once"), so the name is wrong for that case. The ticket lists this as a follow-up, but it is still in the diff. Rule: CODING_STANDARDS.md "Test fixtures" asks that fakes and assertions document what they prove. That rule only loosely covers test names, and no closer rule exists. Fix: rename the test to "a located continuation line joins the defect above it; only a severity-less one blocks", or move the `located` case into its own test.
- Validation gaps (gap): `tests/review-findings.test.ts:588–589` (the `located` case): no assertion checks that the merged severity-less finding still blocks. Add `assert.deepEqual(blockingFindings(located), located);`. This catches a change that drops the merged finding or gives it P2/P3.
- Validation gaps (gap): `tests/review-findings.test.ts`: no test covers a bulleted prose note followed by an unbulleted located line. That is the new `pending && prose(pending.text)` branch (`scripts/agents/review-findings.mjs:149`) when the pending note came from a bullet. The ticket 52 test at line 574 only covers an unbulleted paragraph. Add: `openFindings(review("Defects:\nSpec:\n- Some general remark.\nb.ts:2 the guard is missing.\nValidation gaps: none."))` should give findings `[finding("Spec", "b.ts:2 the guard is missing.")]` and notes `[{ group: "Spec", text: "Some general remark." }]`, with `blockingFindings(findings)` equal to `findings`.

