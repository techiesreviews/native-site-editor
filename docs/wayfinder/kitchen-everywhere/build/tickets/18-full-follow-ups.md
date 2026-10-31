---
title: Follow-ups written in full
type: task (AFK)
status: closed
assignee: ke-18
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

- **Second look (OpenCode `deepseek-v4.1-flash-free`, 2026-10-27):** `kit review --base 11e497e28 --ticket …` at a706ff2f0 (PRs #209 and #210), run with today's kit (`KIT_HOME=<copy of dev's scripts/agents at 3f55c1ed2>`), since the kit at this commit predates the OpenCode path and sends `opencode/…` to Codex: `RESULT: ok review`, findings 10 (P2 2, P3 4, gap 4), evidence `.scratch/reviews/ke18-second-look/20261027T152625Z` in the main checkout. P2 → [ticket 35](35-follow-ups-line-endings-and-old-cuts.md): an old 160-unit cut that split a surrogate pair was written as U+FFFD, so the rebuilt cut never matches, the old bullet stays, a full one is added and a second comment is posted (`kit.d/pr:389`; Claude's P3 below); the ticket also takes the line-ending P3 (`kit.d/pr:430`, `:437`) and the four tests. P2 rejected: the range also holds fad500630 (the lead's mock-up approval docs, landed on `dev` between #209 and #210), which is not this slice's scope creep. P3s left: that commit's Tuesday-pack wording (`docs/work/tuesday/2026-11-03.md:15`, `:7`, outside this build); ticket 10's duplicate `KIT_COMMANDS_DIR` gap (`10-fixes-from-old-copies.md:58`, `:65`); this Done names no review evidence (Claude's rounds are in `.scratch/reviews/build/ke-18-full-follow-ups/` in the main checkout); the Follow-ups below cite rebased commits (5991f6749, adb62b580; landed as ffdaec54f and a427a4e2b).
- `kit pr` writes each non-blocking review finding into the ticket's `### Follow-ups` in full, one bullet per finding. The PR body, the PR comment and the console list keep a 160-character short form, counted in graphemes so an emoji, flag or skin-tone sign is never split; a cut line ends with `…`. A rerun compares full lines and adds nothing new. A ticket bullet written before this change (cut at 160 with no `…`, trailing spaces ignored) is swapped in place for the full text, each old bullet by one finding at most so findings that share their first 160 characters each keep their own line; new bullets follow the ticket's line endings; in the same follow-ups commit as any new bullet; a PR comment from before this change counts as posted, so no second comment appears.
- Ticket 10's 11 follow-ups are rewritten in full from the saved `findings.json` files; a note names the landed commits (ddbf77dc3, 3cb082ba5) in place of the rebased ones they cite and maps each old line number to today's (`review:120–133`, `doctor:185–195`, `doctor:228–248`). The untested default `KIT_COMMANDS_DIR` path is marked fixed in 498334975; the P2 doctor gate and its test point to ticket 19; the clipped-follow-ups bullet points here; the `--pr` wait gap is marked still open with no ticket; the repeated `try` finding says it is the same as the first. The Done line now says the default `KIT_COMMANDS_DIR` gap was fixed in 498334975.
- Tests: `tests/kit-pr.test.ts` has a new case with a P2 finding longer than 160 characters: the ticket holds the whole text, the PR body and comment show the cut line ending in `…`, and a second run changes neither the ticket nor HEAD and posts no second comment. Further cases: a 160-character finding shows bare and a 161-character one ends in `…`; a cut next to 😀, 👨‍👩‍👧, 🇳🇱 or 👍🏽 keeps it whole; a rerun on a ticket and PR that already hold pre-change cut bullets and comment swaps both bullets for the full text in one commit, posts no second comment, and patches the PR body with the new `…` summary once and no old one; a ticket with an old cut bullet for one finding and none for another gets the first upgraded in place and the second added in full, in one commit, keeping text between them, with LF and with CRLF line endings; two findings that share their first 160 characters upgrade two identical old bullets, each full line once. The seeded old PR comment is typed with `satisfies Call`. The existing console-cap case now expects the `…`.
- Validation: `RESULT: ok unit 97/97 (1 files)` (`kit unit --affected`); `npm run lint` exit 0; `tickets.mjs check` 759 tickets.
- Commits on dev: ffdaec54f "Follow-ups written in full", a427a4e2b "Review fixes round 1", 0787bf203 "Review fixes round 2", 07d272ecd "Review fixes round 3".
- `assignee` was written as the branch name: the `kit slice` brief asks for `assignee: ${kitOwner()}` (`scripts/agents/kit.d/slice:253`), and `kitOwner()` (`scripts/agents/kit-lib.mjs:89`) falls back to the branch when neither `ASE_OWNER` nor `.scratch/owner` is set, as in a T3 child thread set up with `git switch -c`. Set back to `ke-18` by hand after landing; `kit pr` does not touch it.
- Feature list: no change (agent kit only, nothing a site editor user sees).

### Follow-ups

- Spec (P2): 5991f6749:docs/wayfinder/kitchen-everywhere/build/tickets/18-full-follow-ups.md:46 — P2 ticket: The Done section names the branch commits as 481ac8ce1, beaf60df4 and 22ef3fae3. None of these is in this branch's history. commits.log has adb62b580 "Follow-ups written in full", c986b7f83 "Review fixes round 1" and d823f1500 "Review fixes round 2". The same stale SHA appears again at docs/wayfinder/kitchen-everywhere/build/tickets/10-fixes-from-old-copies.md:60 ("481ac8ce1 on its branch"). This is the same kind of fault the ticket was opened to repair: ticket 10's follow-ups cited 836c6ecc7, which was not on the branch. runner.md "Review and close" needs real commits in Done. Fix: cite the commits by subject only, or rewrite the SHAs to the landed ones after merge, the way the ticket 10 note already does for ddbf77dc3/3cb082ba5. Fixed after landing: Done and ticket 10 now cite the dev commits (ffdaec54f, a427a4e2b, 0787bf203, 07d272ecd).
- Spec (P3): 5991f6749:docs/wayfinder/kitchen-everywhere/build/tickets/18-full-follow-ups.md:40 — P3 ticket: runner.md:66-67 says Done must record "behaviour, commits, tests, review decisions, evidence". This Done section has no review decisions: it does not say which findings from rounds 1–3 were fixed or rejected, or why. It also names no review evidence folder (`.scratch/reviews/...`). Fix: add a "Review decisions" bullet with the round folders and what happened to each finding.
- Spec (P3): 5991f6749:docs/wayfinder/kitchen-everywhere/build/tickets/18-full-follow-ups.md:42 — P3 ticket: The Done section says "new bullets follow the ticket's line endings". That is only true when a `### Follow-ups` section already exists. The no-section branch at scripts/agents/kit.d/pr:437 still joins with `\n` and adds `\n\n### Follow-ups\n\n`. A CRLF ticket without a Follow-ups section therefore gets mixed line endings. Fix: work out `eol` from `original` (for example `original.includes("\r\n")`) and use it in both branches, or narrow the Done claim.
- Standards (P3): adb62b580:scripts/agents/kit.d/pr:430 — P3 fault: `eol` is taken only from the section's own lines (`raw.some(line => line.endsWith("\r"))`). Take a CRLF ticket whose Follow-ups section is the last thing in the file and has a single bullet with no trailing newline. That bullet has no `\r`, so appended bullets use `\n` and the file ends up with mixed endings. No CODING_STANDARDS.md section covers kit scripts; this is a plain correctness note. Fix: detect `eol` once from `original`.
- Standards (P3): adb62b580:scripts/agents/kit.d/pr:389 — P3 fault: `oldLines` copies the old cut with `item.text.slice(0, 160)` (UTF-16 units). When that cut split a surrogate pair, the old run wrote U+FFFD to the ticket and to the comment, because a lone surrogate encodes that way in UTF-8. The rebuilt `oldLines` and `oldSummary` still hold the lone surrogate. So the old bullet is not matched, the full line is appended as a duplicate, and a second comment is posted. No CODING_STANDARDS.md section applies. Fix: normalise both sides, for example `Buffer.from(item.text.slice(0, 160)).toString()`, before comparing.
- Validation gaps (gap): There is no case for a CRLF ticket that has no `### Follow-ups` section. Add a parametrised case next to the LF/CRLF test in tests/kit-pr.test.ts: `followupTicket([])` with `\r\n`, run with a long finding, and assert the result equals `followupTicket([full lines]).replaceAll("\n", "\r\n")`.
- Validation gaps (gap): There is no case for an old cut bullet when the full line is already in the section. That is the `!existing.includes(fullLines[at])` branch at pr:423. Add a case: seed a ticket with both the old cut bullet and the full bullet for the same finding, then assert the rerun leaves the file and HEAD unchanged and adds no third line.
- Validation gaps (gap): There is no case for an old cut that split a surrogate pair. Add a case: a finding with 🙂 straddling UTF-16 unit 160, a seeded ticket bullet and PR comment written through `writeFileSync` (so they carry U+FFFD), and assert one bullet in full and no second comment.

