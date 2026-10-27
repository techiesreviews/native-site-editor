---
title: Follow-ups written in full
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

`kit pr` writes every non-blocking review finding into the ticket's `### Follow-ups`, but cuts each one to 160 characters (`item.text.slice(0, 160)` in `scripts/agents/kit.d/pr:296`). The follow-ups in [ticket 10](10-fixes-from-old-copies.md#follow-ups) stop mid-word (`kitSc`, `the s`, `scrip`, …), so the evidence and the fix each review gave are lost from the ticket. `docs/agents/runner.md` (Review and close) asks for every follow-up with its evidence and fix. Found by the Grok second look on slice 10 (P2, evidence `.scratch/reviews/review/ke10-range/20261027T061559Z`).

## Decided behaviour

- **The ticket gets the whole finding:** `kit pr` writes each follow-up's full text into the ticket's `### Follow-ups`, one bullet per finding, no cut. The PR body and the PR comment may keep a short form, but each short line ends with `…` when it is cut.
- **No duplicates on a rerun:** a rerun still adds only follow-ups that are not there yet, comparing full text.
- **Ticket 10 repaired:** its `### Follow-ups` bullets are rewritten in full from the saved `findings.json` files under `.scratch/reviews/build/runner-ke10-fixes-from-old-copies/` (each bullet: evidence, fix, test to add). Bullets that name something already fixed say so with the commit.

## Files

- `scripts/agents/kit.d/pr`
- `tests/kit-pr.test.ts` (or wherever `recordFollowups` is tested today)
- `docs/wayfinder/kitchen-everywhere/build/tickets/10-fixes-from-old-copies.md`

## Done when

- A test with a finding longer than 160 characters proves the ticket gets the full text, the PR summary line is marked `…`, and a second run adds nothing.
- Ticket 10's follow-ups read in full; none stops mid-word.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke18 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/18-full-follow-ups.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke18 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.
