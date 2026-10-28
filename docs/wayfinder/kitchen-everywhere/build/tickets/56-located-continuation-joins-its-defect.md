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

- Split on a located line only when the pending item would otherwise be a note (no location and no severity), so ticket 52's "prose paragraph, then located defect" case still splits and a located defect's continuation lines join it.

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

- `openFindings` (`scripts/agents/review-findings.mjs`) starts a new item at an unindented, unbulleted located line only when the item above would be a note (no location and no severity). Under a located or severity-naming defect the located line is a continuation: `Defects:\nSpec:\n- a.ts:1 — P2 fault: x\nb.ts:2 has the same bug.` gives one P2 fault finding with both lines, and `blockingFindings` is `[]`. Ticket 52's "prose paragraph, then located defect" case still splits and blocks.
- Tests: `tests/review-findings.test.ts` adds the P2 continuation case (failed before the fix), a located severity-less defect taking its continuation, and an unlocated P3 line taking one; `tests/kit-score.test.ts` adds `scoreReview` on a notes-only `result.md` with no `findings.json`, giving all-zero counts and no `unreadable`.
- Validation: `kit unit --affected` RESULT: ok unit 515/515 (15 files); `npm run check` and `npm run lint` pass; `kit doctor` RESULT: ok doctor 11/11 checks passed; `kit status` RESULT: ok status all 776 tickets, 599 closed, 1 open PRs.
- Feature list: no change (internal review parsing, nothing a user sees).
