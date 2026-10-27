---
title: Follow-ups written in full
type: task (AFK)
status: closed
assignee: build/ke-18-full-follow-ups
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

## Done (2026-10-27)

- `kit pr` writes each non-blocking review finding into the ticket's `### Follow-ups` in full, one bullet per finding. The PR body, the PR comment and the console list keep a 160-character short form, counted in code points so an emoji is never split; a cut line ends with `…`. A rerun compares full lines and adds nothing new. Bullets and PR comments written before this change (cut at 160 with no `…`) count as present, so a rerun leaves them as they are and adds no second copy.
- Ticket 10's 11 follow-ups are rewritten in full from the saved `findings.json` files; a note names the landed commits (ddbf77dc3, 3cb082ba5) in place of the rebased ones they cite and maps each old line number to today's (`review:120–133`, `doctor:185–195`, `doctor:228–248`). The untested default `KIT_COMMANDS_DIR` path is marked fixed in 498334975; the P2 doctor gate and its test point to ticket 19; the clipped-follow-ups bullet points here; the `--pr` wait gap is marked still open with no ticket.
- Tests: `tests/kit-pr.test.ts` has a new case with a P2 finding longer than 160 characters: the ticket holds the whole text, the PR body and comment show the cut line ending in `…`, and a second run changes neither the ticket nor HEAD and posts no second comment. Further cases: a 160-character finding shows bare and a 161-character one ends in `…`; a cut next to an emoji keeps the whole emoji; a rerun on a ticket and PR that already hold pre-change cut bullets and comment adds no bullet, commit or comment. The existing console-cap case now expects the `…`.
- Validation: `RESULT: ok unit 91/91 (1 files)` (`kit unit --affected`); `npm run lint` exit 0; `tickets.mjs check` 759 tickets.
- Feature list: no change (agent kit only, nothing a site editor user sees).
