---
title: "`kit unit --red`: a new or changed test must fail on the old code, checked in every fix round"
type: task (AFK)
status: wontfix
assignee:
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the lexvd.nl retro: a builder's regression test passed on the old code too, so it could not catch the bug it was written for, and the review did not notice. Ticket 67 writes the rule (a new test fails on the old code); this ticket makes the kit check it.

## Check (ke-77, 2026-10-30): the rule goes into 67, the command waits

Verdict on the [retro check](../retro-check-2026-10-30.md): `wontfix` for now. The rule ("a regression test is shown failing on the old code, both runs quoted in Done") goes into [67](67-testing-and-review-rules.md). Why the command waits:

- One missed case (lexvd, 2026-10-30). The Claude review already finds tests that would still pass in about 36 of the editor's 536 review folders.
- Cost: a temporary base worktree and a second test run in every fix round. The editor's Playwright specs can't run on an old base without its build and server.
- Reopen with the same design when the weekly learning routine finds a second test that could not fail and still landed.

## Decided behaviour (kept for a later reopening)

- `kit unit --red [--base REF]` (base: the landing branch's merge base, as `--affected` uses) finds the test files the change added or changed, runs them against the base's source (the base's non-test files with the change's test files on top, in a temporary worktree), and expects them to fail. A test that passes there "can't fail": the run fails and names it (`RESULT: fail red <file>: passes on <base> too, so it can't catch the change`). A test that cannot run on the base (it imports something the change adds) counts as red and says so.
- A change with no new or changed tests: `RESULT: ok red no new tests` (ticket 67's rule and the review decide whether one was needed).
- `kit fix` rounds run `--red` after the builder's fix, and the builder's brief (`builderChecks` in `review-brief.mjs`) lists it, so a fix round's regression test is shown red before the round counts as done.
- The temporary worktree is always removed (the `test:kit-clean` check).

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/unit` (and `unit.sh` where it picks files), `kit.d/fix`, `review-brief.mjs` (`builderChecks`), `tests/kit-unit.test.ts`, `tests/kit-fix.test.ts`, `docs/kitchen.md` (station 7), the `kit unit --help` text.
- `blocked_by` 69: both change `review-brief.mjs`.

## Done when

- Tests: a new test that fails on the base passes `--red`; one that passes on the base fails it with the file named; an import of a new module counts as red; no new tests gives the ok line; the temporary worktree is gone after each run.
- A `kit fix` test shows the red check in a fix round.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass; this editor's `kit unit --affected` works as before.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit unit --red` on its own branch, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
