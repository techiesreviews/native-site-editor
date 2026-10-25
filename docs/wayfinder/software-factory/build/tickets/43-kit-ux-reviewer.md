---
title: "kit ux, reviewer half; visible slices run it"
type: task (AFK)
status: closed
assignee: sf-43
builder: claude
blocked_by: [42-kit-ux-scripted, 21-kit-records-every-piece]
---

## Goal

The second half of `kit ux`: **Claude Opus 5.5 compares the bundle's screenshots with the rulebook and the approved mock-up** and reports per feature fine / looks off / broken ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) items 3–4, [ladder resolution](../../tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 3: UX review of every visible change before it reaches preview). Then visible slices run it as part of `kit slice`, so it is a gate and not "on request" (research 01: the one agent UX audit found 8 real problems, but ran once, after 82 slices).

## Decided behaviour

- `kit ux` (without `--no-review`) sends the bundle to one read-only reviewer: `ASE_UX_MODEL`, default `claude-opus-5-5`, effort `medium`, through `agent.sh review` with the bundle folder readable and nothing else needed (no repo-wide reading instructions: the brief says to judge only what is in the bundle).
- Reviewer output, per touched feature: `F-…: fine | looks off | broken — <one line> — <image file>`, and a short list of rulebook rules broken (by id). Rules for the reviewer brief: judge against the rulebook and the mock-up, not taste of its own; "looks off" needs a rule id or a mock-up difference; no suggestions of new text, hints or badges.
- Saved as `ux.md` and `ux.json` in the bundle folder; counts go into the piece's scoreboard record (slice 21) as `ux: { fine, off, broken, rules }`.
- **Gate in `kit slice`:** when `kit ux` finds touched features (a visible change), `kit slice` runs it after the code review gate and before `kit pr`. `broken` → one `kit fix --note` round with the UX report, then `kit ux` again; still broken → the slice stops with `decide: ux broken <feature>`. `looks off` → one fix round, then it proceeds and the remaining items become follow-ups in the ticket's Done (the lead weighs them, like a P2). No touched features → skipped with one line.
- **Whole list before Lex's end check:** `kit ux --all` is the step the kitchen's station 11 runs first; the lead sends Lex its summary with the what-to-test list.
- Kitchen stations 7, 8 and 11 lose their planned marks for the check and the UX review.

## Files

- `scripts/agents/kit.d/ux` (review step), `scripts/agents/kit.d/slice` (the gate)
- `scripts/agents/ux-brief.mjs` (new: reviewer brief and result parser)
- `tests/kit-ux.test.ts`, `tests/kit-slice.test.ts`
- `docs/agents/agent-scripts.md` (`kit ux`, `kit slice` lines), `docs/agents/runner.md` (Screenshots: `kit ux` for visible changes), `docs/agents/kitchen.md` (stations 7, 8, 11)

## Done when

- Tests with a fake reviewer prove: result parsing of fine / looks off / broken lines (and an unreadable answer fails with a clear line); the slice gate's three paths (broken twice stops; looks off proceeds with follow-ups; nothing touched skips); counts reach the scoreboard record.
- One real run: `scripts/agents/kit ux --features <two features from slice 42>` on `dev` gives a report; paste the per-feature lines and the reviewer's model from `run.log`. Note its token use from the Claude JSON.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; alone in `kit.d/slice`. Sol gives one second opinion on the final version (lead).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf43 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/43-kit-ux-reviewer.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf43 --timeout 2h`.
- Report: unit `RESULT:` lines, the real `kit ux` report lines and token use, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `kit ux` now ends with the reviewer step: `scripts/agents/ux-brief.mjs` writes the brief (touched feature ids,
  the first line of every rulebook rule, the mock-up link; judge the bundle alone, against the rulebook and the
  mock-up; "looks off" needs a rule id or a mock-up difference; no new text, hints or badges) and parses the
  answer. The reviewer (`ASE_UX_MODEL`, default `claude-opus-5-5`, effort `medium`) runs through `agent.sh review`
  on a copy of the bundle inside the worktree's `.scratch/agent/ux-review-*`, removed afterwards; with nothing
  committed past the base, `--commit HEAD` stands in as the diff scope `agent.sh review` needs.
- Saved beside `bundle.md`: `ux.md`, `ux.json` and the reviewer's `run.log`; the scoreboard record gets
  `ux: { fine, off, broken, rules }` (rule ids) and the review's cost. A failed try is broken whatever the reviewer
  says; a broken verdict fails `kit ux` with `broken: <feature,…>`; an answer missing a feature or giving one two
  verdicts fails with `review unreadable: no verdict for <feature> (<dir>/ux.md)`. `--no-review` skips the reviewer.
- `kit slice` has a `ux` phase after the code review gate and before `kit pr`: nothing touched skips with one line;
  broken or looks off gets one `kit fix --note <bundle>/ux.md` round, then `kit ux` again; still broken stops with
  `decide: ux broken <feature>`; looks off lands and its lines go under `### UX follow-ups` at the end of the
  ticket in one ticket-only commit. The fix loop and the UX round share one `fixRound` helper.
- Tests: `tests/kit-ux.test.ts` (parser: fine, looks off, broken, rules, unreadable answers; brief; a fake reviewer
  through `kit ux`: files, counts and cost on the scoreboard, broken, unreadable and failed reviewer, `--no-review`)
  and `tests/kit-slice.test.ts` (skip, broken twice stops, broken fixed lands, looks off lands with follow-ups).
- Docs: `kit ux` and `kit slice` in agent-scripts.md, runner.md Screenshots, kitchen stations 7, 8 and 11.
- Review round 1: the UX fix round's own review now gets the usual fix rounds before anything stops the slice;
  UX follow-up lines name the full image path; an answer's last part is the image only when it looks like one
  (`.webp`, `.png`, `.jpg`) or says none; the brief tells the reviewer not to open the diff files `agent.sh review`
  names. New tests: the review after the UX round, a resumed UX round, follow-ups under an existing heading,
  the `--base` scope, and a run through the real `agent.sh review` with a fake `claude` that reads the bundle copy.
- Review round 2: a review round after the UX round that failed half-way resumes before `kit ux` runs again;
  `kit ux` and the follow-ups commit both hold to the HEAD the check started on (and a clean tree before the
  ticket is written); UX follow-ups go in the ticket's last `## Done` section (made when missing), are matched
  by feature and note, and name images from the main root; only rulebook ids count as broken rules; a verdict
  line after the rules list is still read. New tests: the resumed review round, findings left after the UX
  round's fix rounds, a `kit ux` failure without a report, follow-ups in the last Done, made-up rule ids.
- Review round 3: a failed reviewer's RESULT names `run.log` beside the bundle, not the removed run folder;
  `kit ux` skips the scoreboard when HEAD or the branch moved during its run, and skips the paid review when a
  screens run failed with no broken try; `kit slice` saves the final UX report before the follow-ups commit and
  reuses it on a rerun, and matches follow-ups by feature id. New tests for each, plus a slice stop on a report
  with no broken feature.
- **Lead step, still open (Done when item 2):** run `scripts/agents/kit ux --features <two features from slice 42>`
  with the real reviewer and paste the per-feature lines, the reviewer's model from `run.log` and its token use.
  The builder brief forbids agent runs, so the builder could not do it.

### Follow-ups

- Spec (P2): 4b4a24e70:docs/wayfinder/software-factory/build/tickets/43-kit-ux-reviewer.md:4 — P2 ticket: the front matter is changed to `status: closed`, but the ticket's o
- Spec (P2): 4b4a24e70:scripts/agents/ux-brief.mjs:13 — P2 ticket: the Goal and factory 02/03 item 4 ask the reviewer to compare the screenshots with the approved mock-up. T
- Validation gaps (gap): `uxFollowups` inserts at `list.index + list[0].trimEnd().length` (scripts/agents/kit.d/slice:196). When the ticket's last Done has a `### UX follow-ups` heading
- Validation gaps (gap): No slice-level test covers HEAD moving while `kit ux` runs (the `assertHead(head)` after `execute` at slice:329). Make the fake kit's `ux` phase commit an empty
- Validation gaps (gap): No test covers the re-check after the UX fix round returning `RESULT: ok ux nothing visible touched`. For example, the fix removed the visible change: the slice

