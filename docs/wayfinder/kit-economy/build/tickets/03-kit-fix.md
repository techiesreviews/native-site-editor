---
title: "kit fix: send review findings back to the builder"
type: task (AFK)
status: closed
assignee: ke-03
blocked_by: [01-kit-pr-stops-on-findings]
builder: sol
---

## What

In the Durable Object build five runners used almost half the tokens because they fixed review
findings themselves (up to 36 hand edits each). The builder that wrote the code should fix them.
Today `agent.sh --resume <out-dir>` (`resumeRun()` in `scripts/agents/agent-run.mjs`) only continues
a stopped run with the fixed prompt "Continue where you stopped; the brief is unchanged.", and a run
whose `status.json` says `done` just prints its saved report.

- **`agent.sh --resume <out-dir> --brief <file>`**: continues the recorded session with a new prompt
  (the file's text), on the SAME model, CLI and effort from `status.json`, also when the run is
  `done`: Codex `codex exec resume <session> <prompt>` (the existing `adapter.resume(session)`
  args), Claude `--resume <session>`. Appends to `run.log` and `out.md` as resume does now, bumps
  `resumes`, and still waits on a live runner first. The old no-brief resume is unchanged. Usage
  text and `parseAgentArgs` accept exactly these two forms.
- **`kit fix [--review DIR] [--run DIR] [--ticket FILE]`** (new `scripts/agents/kit.d/fix`):
  1. Picks the newest review in the main root `.scratch/reviews/<owner>/` whose `refs.txt` HEAD is
     this HEAD (else `--review DIR`); none → `RESULT: fail fix no review covers HEAD`.
  2. Extracts its open findings with ticket 01's parser; zero → `RESULT: ok fix clean` without
     running anything.
  3. Writes a fix brief (`.scratch/kit-fix/round-N.md`): ticket path, the findings verbatim, and
     "Fix real defects within the ticket's Files. For a finding you reject, list it under
     `Declined:` with a one-line reason."
  4. Continues the latest builder run of this worktree (newest `.scratch/agent/build-*/status.json`
     with `kind: build` and this worktree, else `--run DIR`) with
     `agent.sh --resume <out-dir> --brief <fix brief>`.
  5. Commits the builder's unstaged work as "Review fixes round N" with the builder's
     Co-Authored-By line (from the model: Sol → `GPT-6.1-Sol <noreply@openai.com>`).
     No changes and no `Declined:` list → fail "builder made no changes".
  6. Runs `kit review --ticket <ticket>` again, passing the declined findings with their reasons
     into the review brief.
  7. Ends `RESULT: ok fix clean` or `RESULT: fail fix <n> open findings (<result.md path>)`.
  N is counted from `.scratch/kit-fix/` per branch. The runner never edits code for findings.
- **Review brief**: `reviewBrief()` / `ticketReviewBrief()` in `scripts/agents/review-brief.mjs` take
  an optional declined list and add a section "Declined by the author (with reasons): … Report a
  declined finding again only if the reason is wrong, and say why."
- Docs: one line for `kit fix` and the `--resume … --brief` form in
  `docs/agents/agent-scripts.md` (Kit list and Agent runner section).

## Files

- `scripts/agents/kit.d/fix` (new)
- `scripts/agents/agent.sh`
- `scripts/agents/agent-run.mjs`
- `scripts/agents/review-brief.mjs`
- `tests/kit-fix.test.ts` (new; fake `codex` CLI, fake kit review)
- `tests/agent-resume.test.ts` (resume with a brief)
- `tests/kit-review.test.ts` (review brief with a declined list)
- `docs/agents/agent-scripts.md`

## Done when

- `tests/agent-resume.test.ts`: `--resume DIR --brief FILE` on a `done` and on a `failed` run sends the
  new prompt to the recorded session with the same model/CLI/effort (Codex and Claude fakes), appends
  to `out.md`/`run.log`; the no-brief resume behaves as before; bad argument forms exit 2.
- `tests/kit-fix.test.ts` (temp repo, fake CLI, fake `kit review` writing result.md fixtures):
  picks the review covering HEAD (an older one for another HEAD is ignored), `--review` override,
  clean review → `ok fix clean` with no CLI call; findings → brief contains them verbatim, builder
  resumed, commit "Review fixes round 1" with the Sol co-author line, review rerun with the declined
  list in its brief; remaining findings → `fail fix <n> open findings (<path>)`; no builder run found
  → clear failure.
- A unit test for `reviewBrief` with a declined list.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-fix.test.ts tests/agent-resume.test.ts tests/kit-review.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.

## Done (2026-10-19)

- Added `kit fix`: selects the newest HEAD-covering review in the main-root owner folder,
  reuses `openFindings()` and kit root/owner helpers, resumes the newest matching builder,
  commits its fixes with model credit, and reviews again with declined findings and reasons.
  Clean reviews start nothing; missing/unreadable evidence, missing builders, unchanged builders
  without fresh declines, builder failures, and remaining findings fail clearly.
- Added `agent.sh --resume DIR --brief FILE` for completed and failed sessions, preserving
  CLI/model/effort and appending reports/logs after waiting for a live runner. The original
  no-brief resume behavior remains unchanged. Documented both commands.
- Focused validation: `scripts/agents/unit.sh tests/kit-fix.test.ts tests/agent-resume.test.ts
  tests/kit-review.test.ts` reports 62 passing tests, zero failures; the known
  unit-summary counts error is ignored as instructed. All fake CLI/review scratch artifacts
  live in temporary repositories and are removed by test cleanup.
- `npm run check` and `npm run lint` passed. Full `npm test` was intentionally excluded by this ticket's
  focused-unit instruction. Review, commit, `kit pr`, and CI confirmation remain with the runner;
  this build leaves all changes unstaged and performs no deployment.
- Branch-specific round briefs live under `.scratch/kit-fix/<encoded-branch>/round-N.md`.
  Declined reasons pass to the normal review brief via the child-only `ASE_REVIEW_DECLINED` list.
- Review follow-up: preserve the original branch/HEAD proof after the builder and every later
  await. Hold the real Git HEAD/index locks while staging in a private index and committing
  with temporary detached metadata (normal hooks still run). Publish only the captured branch
  with an expected-old-HEAD check; discard temporary metadata/indexes and release locks on
  failures. The next review must cover the commit produced by this round.
- Race coverage uses `forEachAwait` to hold the fake builder, switch branches or advance HEAD,
  then release it; both cases fail before staging/committing and start no review. Additional
  tests prove checkout is blocked during the validation hook, hook-induced HEAD changes fail
  without publishing fixes, and the private index/locks are cleaned up.
- Concurrent-resume follow-up: a brief-bearing caller that loses a generation claim waits for
  that generation, then retries its own prompt; plain resumes retain their existing deduplication.
  Codex and Claude regression tests force two different briefs to contend for generation 1 and
  verify both prompts reach the saved session serially, with two appended reports and resumes.
- Reviews (Sol gpt-6.1-sol, medium): 20261019T084039Z (1 standards defect, branch/HEAD race) → fix round 1;
  20261019T085003Z (1 spec defect, concurrent brief resumes) → fix round 2; 20261019T085329Z clean.
  Declined: none.
- Dogfood: the runner used its own `kit fix` for both review rounds (commits 19dd3d66, 1c36de24):
  each round resumed the Sol builder session, committed "Review fixes round N" with the Sol
  co-author line and re-reviewed in one command; no hand edits. `agent.sh --resume --brief` worked through it.
