---
title: Follow-ups keep the ticket's line endings and match old cuts through an emoji
type: task (AFK)
status: closed
assignee: ke-35
builder: claude
blocked_by: [29-pr-ci-filters-and-claim-owner]
---

## Goal

The OpenCode second look on [ticket 18](18-full-follow-ups.md#done-2026-10-27) (P2, evidence `.scratch/reviews/ke18-second-look/20261027T152625Z` in the main checkout; Claude's P3s in ticket 18's Follow-ups) found two ways `kit pr`'s full follow-ups still go wrong:

- **An old cut through an emoji is not matched (P2):** `oldLines` and `oldSummary` rebuild the old cut with `item.text.slice(0, 160)` (UTF-16 units, `scripts/agents/kit.d/pr:389`). When that cut split a surrogate pair, the old run wrote U+FFFD to the ticket and to the PR comment, so the rebuilt cut (with a lone surrogate) never matches: the old bullet stays, a full bullet is added beside it, and a second comment is posted.
- **Line endings (P3):** `eol` is read only from the Follow-ups section's own lines (`:430`) and the no-section branch hard-codes `\n` (`:437`), so a CRLF ticket without the section, or whose last bullet has no trailing newline, gets mixed endings.

## Decided behaviour

- Old cuts are compared after a round trip through UTF-8 (`Buffer.from(item.text.slice(0, 160)).toString()`), on both the ticket and the comment side.
- `eol` is `\r\n` when the ticket file has any `\r\n`, else `\n`, computed once and used in both branches.

## Files

- `scripts/agents/kit.d/pr`
- `tests/kit-pr.test.ts`

## Done when

- The four cases from ticket 18's Follow-ups pass: a CRLF ticket with no `### Follow-ups` section; a CRLF section whose last bullet has no final newline; an old cut beside its full line (file and HEAD unchanged, no third line); an old cut that split 🙂 at unit 160, seeded with U+FFFD (one full bullet, no second comment).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke35 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/35-follow-ups-line-endings-and-old-cuts.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke35 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, how the emoji case was made to fail, review decisions, PR and merge SHA.

## Done (2026-10-28)

- `kit pr` rebuilds each old 160-unit cut through UTF-8 (`Buffer.from(item.text.slice(0, 160)).toString()`), so a cut that split an emoji matches the U+FFFD the old run wrote, in the ticket and in the posted PR comment: the bullet is upgraded in place and no second comment is posted.
- The ticket's line ending is read once from the whole file (`\r\n` if it has any, else `\n`) and used for a new Done heading, a new Follow-ups section and bullets added to an existing one.
- Four tests in `tests/kit-pr.test.ts`: a CRLF ticket with no Follow-ups section; a CRLF section whose last bullet has no final newline; an old cut beside its full line (file and HEAD unchanged); an old cut that split 🙂 at unit 160, seeded with U+FFFD in the ticket and a posted comment. Before the fix the first two got bare `\n` lines and the emoji case added a second Spec bullet beside the U+FFFD one and posted a second comment; the old-cut-beside-full case already held and stays as a guard.
- Feature list: no change (kit plumbing only, nothing a user of the editor sees).
