---
title: "kit fix: send review findings back to the builder"
type: task (AFK)
status: ready-for-agent
assignee:
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
