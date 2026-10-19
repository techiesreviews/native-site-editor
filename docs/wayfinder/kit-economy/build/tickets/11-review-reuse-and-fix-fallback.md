---
title: "kit pr reuses a clean review on a moved base; kit fix without a builder record"
type: task (AFK)
status: closed
assignee: ke-11
blocked_by: [01-kit-pr-stops-on-findings, 03-kit-fix]
builder: sol
---

## What

Lead decisions, found while dogfooding on 2026-10-19.

### a. `kit pr` reuses a clean review when only the base moved

Today a saved review must cover the exact HEAD and merge base, so after every rebase onto a moved
`dev`, `kit pr` reviews again, and fresh reviews keep finding new small issues on unchanged code
(ticket 05: clean `kit review`, then `kit pr`'s re-review raised a new P2; the fix rounds were
used up).

- Rule: a saved review also covers HEAD when the PR's own patch is identical. Compare
  `git patch-id --stable` of `git diff <merge-base>..HEAD` for the reviewed refs (`refs.txt`) and
  for now.
- When it matches, print `review: reused (same patch on new base)` and skip the re-review.
- Re-review only when the patch changed.
- Put the comparison in a pure helper with tests:
  - same patch on a moved base → reuse;
  - changed patch → re-review;
  - a rebase that needed conflict resolution changes the patch → re-review.

### b. `kit fix` without a builder record, and for non-review failures

Today `kit fix` fails "no builder run found for this worktree" when the worktree was recreated,
and it only takes review findings (ticket 09's runner had to hand-roll
`agent.sh --resume --brief` for a CI failure).

- When no resumable builder run exists, start a fresh `agent.sh build` with the fix brief, using
  `--builder MODEL` (default: the builder from the latest `kit slice` state, else
  `gpt-6.1-sol`), and say so in the output.
- `kit fix --note FILE` sends a free-text failure (for example a CI digest) to the builder
  instead of review findings, then commits and re-reviews as usual.
- Tests for both: the fresh-build fallback (with and without a slice state) and `--note`.

## Files

- `scripts/agents/kit.d/pr`
- `scripts/agents/kit.d/fix`
- a helper in `scripts/agents/kit-lib.mjs` or `scripts/agents/review-findings.mjs`
- `tests/kit-pr.test.ts`
- `tests/kit-fix.test.ts`
- `docs/agents/agent-scripts.md` (the `pr` and `fix` lines only)
- this ticket

## Done when

- Tests for a and b pass (`kit unit --affected`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.

## Done (2026-10-19)

- Behaviour: `kit pr` compares stable patch IDs from saved refs and current refs. A clean,
  unchanged patch reuses its review after rebasing; changed patches, including changed conflict resolutions,
  require review. Missing refs, malformed/empty IDs and incomplete reviews cannot establish reuse.
- Behaviour: `kit fix` starts a fresh builder when no resumable builder record exists, announces
  the fallback and selects `--builder`, the latest matching slice model, or `gpt-6.1-sol`.
  `--note FILE` supplies verbatim failure evidence without requiring review findings. Saved rounds
  retain the note, builder session and commit/review phase for retries.
- Commits: none in this builder turn; changes remain unstaged for the runner, per the build contract.
- Tests: `scripts/agents/kit doctor` — `RESULT: ok doctor 7/7 checks passed`;
  `scripts/agents/kit unit --affected` — `RESULT: ok unit 77/77 (3 files)`
  (full log: `.scratch/unit/20261019T115849-31.log`). Covers patch equality, moved bases,
  conflict resolutions, fresh fallback with/without slice state, explicit model, notes and retry recovery.
- Checks: `npm run check` and `npm run lint` passed (417 tickets checked; export check had
  0 failures); `scripts/agents/kit specs --affected` — `RESULT: ok specs none affected`.
  `git diff --check` passed; the index is empty and HEAD remains `5ee9564e`.
- Review decisions: retained exact-ref finding enforcement; extended patch-based reuse only to
  clean completed reviews. An explicitly invalid `--run` remains an error.
  Independent Sol review, `kit pr --ticket`, merge and green CI remain runner acceptance steps:
  this turn's contract prohibits commits, pushes and spawning agents.
- Dogfood: `kit doctor` and `kit unit --affected` helped by checking the worktree and selecting
  both focused files plus the helper's parser tests. `kit slice` could not be executed under
  this turn's no-commit/no-agent contract; live slice dogfood remains for the runner.
