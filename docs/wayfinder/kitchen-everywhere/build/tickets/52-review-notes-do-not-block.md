---
title: "Reviewer notes and headings without a severity do not block a slice"
type: task (AFK)
status: open
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

`openFindings` in `scripts/agents/review-findings.mjs` turns every line under a Defects group into a finding, and a finding with no `P0`–`P3` gets `severity: null`. `kit pr` (`kit.d/pr:485`) and `kit slice` (`kit.d/slice:218`) treat every open finding as blocking (after the fix rounds, `blockingFindings` still keeps the ones with no severity, line 8), so reviewer prose stops a slice that has no real defect. It happened twice:

1. **Slice 12** (PR #202): a Standards note saying no section applies was read as a defect and held the PR until a fresh review.
2. **Slice 48** (PR #223, `.scratch/reviews/ke-48/20261027T194246Z` in the main checkout): the reviewer wrote the group as an italic `*Spec*` line. `clean` strips `**` and `__` but not a single `*` or `_`, so `*Spec*` became the finding `{ "group": "Defects", "severity": null, "text": "*Spec*" }` and stopped `kit pr`. The Standards prose line ("CODING_STANDARDS.md has no section for kit plumbing…") is the same kind.

## Decided behaviour

- A Defects line that names no `P0`–`P3` and does not start with a location (`LOCATION`, `review-findings.mjs:41`) is a note, not a finding: it is kept in `findings.json` under a `notes` count, never blocks, and is not sent to `kit fix`.
- A line that does start with a location but names no severity still blocks (fail closed, as today), and so does an unreadable review.
- Group headings written in single `*` or `_` emphasis (`*Spec*`, `_Standards_`) open their group like the bold and `#` forms.

## Files

- `scripts/agents/review-findings.mjs`
- `tests/review-findings.test.ts`

## Done when

- Tests in `tests/review-findings.test.ts`, each failing before the fix: slice 48's `result.md` (copied as a fixture) gives two findings (its P2 and P3) and no `*Spec*`; a Standards group holding only "No section of CODING_STANDARDS.md applies to this change." gives no finding; `_Standards_` opens the Standards group; a located line with no severity still gives a blocking finding; `REVIEW_STATUS` missing still gives `review format unreadable`.
- `scripts/agents/kit unit --affected` green, including `tests/kit-pr.test.ts`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and tests only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke52 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/52-review-notes-do-not-block.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke52 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the findings for slice 48's review before and after, review decisions, PR and merge SHA.
