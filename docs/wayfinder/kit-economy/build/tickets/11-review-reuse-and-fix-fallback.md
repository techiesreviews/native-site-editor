---
title: "kit pr reuses a clean review on a moved base; kit fix without a builder record"
type: task (AFK)
status: ready-for-agent
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
